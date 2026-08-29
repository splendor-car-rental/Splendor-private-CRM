import admin from 'firebase-admin';

// Replaces DataStore.getNextNumber() (src/server/dataStore.ts), which was a
// pure in-memory counter: safe within a single warm process (no `await`
// between read and increment), but never persisted back to Firestore on
// ordinary use -- only the admin data-reset endpoint ever wrote
// numbering_configs. Every Vercel cold start re-hydrated the counter from
// whatever was last durably saved there, which in practice meant it reset.
// Two entities created after two different cold starts could receive the
// same ID -- and since that ID becomes the literal Firestore document ID,
// the second write would silently overwrite the first record.
//
// This version reads and increments the counter inside a single Firestore
// transaction, so it is atomic and durable by construction: correct across
// concurrent requests on the same instance, across concurrent requests on
// DIFFERENT instances, and across cold starts, because there is no
// in-memory state to lose -- every call re-derives the next number from
// Firestore itself.

interface NumberingDefaults {
  prefix: string;
  digits: number;
  /** First number ever issued for this entity. Omit for the normal start-at-1 behavior. */
  startAt?: number;
}

// Mirrors DataStore.numberingConfigs' original seed values (dataStore.ts)
// plus every other entity in the repo that previously minted its own ID
// with a non-durable scheme (`VEH-${vehicles.length+1}`, `OPP-...`, etc.)
// -- see PHASE1_ID_SCHEMES.md-equivalent note in server.ts where each is
// wired in. Existing prefixes/digit-widths are preserved unchanged.
const NUMBERING_DEFAULTS: Record<string, NumberingDefaults> = {
  customer: { prefix: 'CUS-', digits: 6 },
  lead: { prefix: 'LEAD-', digits: 6 },
  quotation: { prefix: 'QT-', digits: 6 },
  reservation: { prefix: 'RES-', digits: 6 },
  contract: { prefix: 'CON-2026-', digits: 5 },
  invoice: { prefix: 'INV-', digits: 6 },
  payment: { prefix: 'PAY-', digits: 6 },
  receipt: { prefix: 'RCP-2026-', digits: 5 },
  deposit: { prefix: 'DEP-', digits: 6 },
  task: { prefix: 'TSK-', digits: 6 },
  tolltransaction: { prefix: 'TOL-', digits: 6 },
  // Previously non-durable `array.length + 1` / literal-string schemes,
  // brought under the same atomic mechanism as part of this remediation:
  vehicle: { prefix: 'VEH-', digits: 4 },
  opportunity: { prefix: 'OPP-', digits: 6 },
  charge: { prefix: 'CHG-', digits: 6 },
  communication: { prefix: 'COMM-', digits: 6 },
  document: { prefix: 'DOC-', digits: 6 },
  tollimportbatch: { prefix: 'TOLBATCH-', digits: 4 },
  plateassignment: { prefix: 'PLT-', digits: 6 },
  auditlog: { prefix: 'AUD-', digits: 6 },
  bankbatch: { prefix: '', digits: 2 },
  customreminder: { prefix: 'REM-', digits: 6 },
  customfield: { prefix: 'CF-', digits: 2 },

  // Procurement & Supplier Management (Splendor Procurement, Phase 1).
  // purchaseorder starts at 100 per the spec ("PO-SCR-100, PO-SCR-101, ...")
  // -- every other new entity here follows the normal start-at-1 behavior.
  supplier: { prefix: 'SUP-', digits: 6 },
  supplierquote: { prefix: 'QTV-', digits: 6 },
  purchaseorder: { prefix: 'PO-SCR-', digits: 3, startAt: 100 },
  purchaseorderamendmentrequest: { prefix: 'POAR-', digits: 6 },
  procurementoperation: { prefix: 'OPS-', digits: 6 },
  supplierpaymentrequest: { prefix: 'SPR-', digits: 6 },
  advancesettlement: { prefix: 'ADVS-', digits: 6 },
  partyopeningbalance: { prefix: 'OBAL-', digits: 6 },
  offsetrequest: { prefix: 'OFS-', digits: 6 },
  customerdisputedamount: { prefix: 'DISP-', digits: 6 },
  customercreditbalance: { prefix: 'CCB-', digits: 6 },
  customerrefundrequest: { prefix: 'CREF-', digits: 6 },
  debt: { prefix: 'DBT-', digits: 6 },
  employeecustody: { prefix: 'FLOAT-', digits: 6 },
  employeeexpense: { prefix: 'EEXP-', digits: 6 },
  supplierinvoice: { prefix: 'SINV-', digits: 6 },
  operationalexpense: { prefix: 'OPEXP-', digits: 6 },
  vehiclereceivingrecord: { prefix: 'RCV-', digits: 6 },
  newdamageatreturn: { prefix: 'DMGR-', digits: 6 },
  tarsrecord: { prefix: 'TARS-', digits: 6 },
  latefeewaiver: { prefix: 'LFW-', digits: 6 },
  procurementapproval: { prefix: 'PAPR-', digits: 6 },

  // Lease-to-Own (Splendor Private Mobility Operating System)
  ltoapplication: { prefix: 'LTOA-', digits: 6 },
  ltoinstallment: { prefix: 'LTOI-', digits: 6 },
  ltosettlementrequest: { prefix: 'LTOS-', digits: 6 }
};

export class IdGenerationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'IdGenerationError';
  }
}

/**
 * Atomically issues the next formatted ID for `entityName` (e.g.
 * "Customer" -> "CUS-000042"). Backed by a Firestore transaction against
 * numbering_configs/{entityKey}; safe under concurrent requests on the
 * same or different serverless instances, and safe across cold starts.
 *
 * Throws IdGenerationError if Firebase Admin isn't configured or the
 * transaction fails -- callers must treat this as a hard failure of the
 * whole mutation (do not fall back to a non-durable ID scheme).
 */
export async function issueNextNumber(entityName: string): Promise<string> {
  const key = entityName.toLowerCase();
  if (admin.apps.length === 0) {
    throw new IdGenerationError(
      `Cannot issue a durable ID for "${entityName}": Firebase Admin is not configured.`
    );
  }

  const defaults = NUMBERING_DEFAULTS[key];
  const db = admin.firestore();
  const ref = db.collection('numbering_configs').doc(key);

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? (snap.data() as any) : null;

      const prefix: string = data?.prefix ?? defaults?.prefix ?? `${entityName.toUpperCase().slice(0, 3)}-`;
      const digits: number = data?.digits ?? defaults?.digits ?? 6;
      const startAt: number = defaults?.startAt ?? 1;
      // nextNumber here means "the number about to be issued" -- matches
      // the original DataStore.numberingConfigs seed semantics (starts at 1,
      // or at `startAt` for an entity whose sequence must begin somewhere
      // else -- e.g. Purchase Orders start at 100 per the procurement spec).
      const current: number = typeof data?.nextNumber === 'number' && data.nextNumber >= startAt ? data.nextNumber : startAt;
      const next = current + 1;
      const formatted = `${prefix}${String(current).padStart(digits, '0')}`;

      tx.set(
        ref,
        {
          entity: entityName,
          prefix,
          digits,
          nextNumber: next,
          sample: `${prefix}${String(next).padStart(digits, '0')}`,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );

      return formatted;
    });
  } catch (err) {
    throw new IdGenerationError(`Failed to atomically issue the next ${entityName} ID.`, err);
  }
}

/**
 * Resets a single entity's counter back to 1 -- used only by the
 * admin data-reset endpoint (POST /api/admin/reset-transactional-data),
 * which already has its own confirm-phrase + role gate.
 */
export async function resetNumbering(entityName: string): Promise<void> {
  const key = entityName.toLowerCase();
  const defaults = NUMBERING_DEFAULTS[key];
  if (admin.apps.length === 0 || !defaults) return;
  await admin
    .firestore()
    .collection('numbering_configs')
    .doc(key)
    .set(
      {
        entity: entityName,
        prefix: defaults.prefix,
        digits: defaults.digits,
        nextNumber: 1,
        sample: `${defaults.prefix}${'1'.padStart(defaults.digits, '0')}`,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
}
