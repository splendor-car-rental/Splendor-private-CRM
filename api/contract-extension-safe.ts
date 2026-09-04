import type { Request, Response } from 'express';
import admin from 'firebase-admin';
import { getVerifiedActiveStaff } from '../src/server/activeStaffAuth.js';
import { executeContractExtensionTransaction, ContractExtensionRecoveryError } from '../src/server/contractExtensionRecovery.js';
import { issueNextNumber } from '../src/server/idGenerator.js';
import { recordDurableAudit } from '../src/server/durableAudit.js';
import { dispatchNotificationEvent } from '../src/server/notificationEngine.js';

const EXTENSION_ROLES = ['ceo', 'admin', 'operations', 'sales'] as const;

export default async function contractExtensionSafeHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (String(req.method || '').toUpperCase() !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const actor = await getVerifiedActiveStaff(req, res, EXTENSION_ROLES);
  if (!actor) return;

  const contractId = String(req.query.contractId || '').trim();
  const newEndDateTime = String(req.body?.newEndDateTime || '').trim();
  if (!contractId || !newEndDateTime) {
    return res.status(400).json({ error: 'contractId and newEndDateTime are required.' });
  }

  // Issue the addendum id before opening the contract transaction; nesting an
  // id-generator Firestore transaction inside the contract transaction is not
  // permitted and was another hidden fragility in the legacy route.
  const addendumId = await issueNextNumber('Addendum');
  const notes = String(req.body?.notes || '').trim().slice(0, 3000);

  try {
    const outcome = await executeContractExtensionTransaction(admin.firestore(), {
      contractId,
      newEndDateTime,
      customDailyRate: req.body?.dailyRate,
      currentOdometerKm: req.body?.currentOdometerKm,
      paymentMethod: req.body?.paymentMethod,
      paymentMethodLabel: req.body?.paymentMethodLabel,
      issueDate: req.body?.issueDate,
      notes,
      actor,
      addendumId
    });

    try {
      await recordDurableAudit({
        userId: actor.uid,
        userName: actor.name,
        userRole: actor.role as any,
        entityType: 'Contract',
        entityId: contractId,
        action: 'update',
        previousValue: `Contract ${outcome.contract.contractNumber || contractId} end date: ${outcome.addendum.currentEndDateTime}`,
        newValue: `Extended by ${outcome.extraDays} days until ${newEndDateTime}. Added Addendum #${outcome.addendum.addendumNumber} (+${outcome.extraAmount.toFixed(2)} AED).`,
        reason: notes || 'Formal Contract Extension Addendum Issued'
      });
    } catch (error) {
      console.error('[contract-extension] committed extension audit append failed', error);
    }

    try {
      await dispatchNotificationEvent(
        'contract_extended',
        `Contract ${outcome.contract.contractNumber || contractId} extended by ${outcome.extraDays} day(s) until ${newEndDateTime} (+${outcome.extraAmount.toFixed(2)} AED).`,
        `تم تمديد العقد رقم ${outcome.contract.contractNumber || contractId} لمدة ${outcome.extraDays} يوم حتى ${newEndDateTime} (إجمالي الإضافة ${outcome.extraAmount.toFixed(2)} درهم).`
      );
    } catch (error) {
      console.error('[contract-extension] notification dispatch failed', error);
    }

    return res.status(200).json({ success: true, ...outcome });
  } catch (error) {
    if (error instanceof ContractExtensionRecoveryError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('[contract-extension] atomic extension failed', error);
    return res.status(500).json({ error: 'Contract extension failed atomically.' });
  }
}
