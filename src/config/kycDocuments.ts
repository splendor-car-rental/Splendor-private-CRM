import type { CustomerKycCategory, DocumentCategory } from '../types/index.js';

/**
 * Which document categories the KYC engine requires per customer
 * jurisdiction. A plain data constant shared by src/server/kycEngine.ts
 * (server-side eligibility checks) and KycManagerCard.tsx (client-side
 * review UI) -- kept here rather than re-exported from kycEngine.ts so the
 * client bundle never pulls in that file's Node-only `crypto` import
 * (used for intake-token signing, which only ever runs server-side).
 */
export const REQUIRED_DOCUMENTS_MAP: Record<CustomerKycCategory, DocumentCategory[]> = {
  UAE_RESIDENT: [
    'EMIRATES_ID_FRONT',
    'EMIRATES_ID_BACK',
    'DRIVING_LICENSE_FRONT',
    'DRIVING_LICENSE_BACK'
  ],
  GCC_NATIONAL: [
    'PASSPORT',
    'DRIVING_LICENSE_FRONT',
    'DRIVING_LICENSE_BACK'
  ],
  TOURIST: [
    'PASSPORT',
    'VISA_ENTRY_STAMP',
    'DRIVING_LICENSE_FRONT'
  ]
};
