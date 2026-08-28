# Document Storage Architecture

Produced by the Repository Audit & Architecture Cleanup phase. Part 1
documents what exists today, verified against the actual code. Part 2 is
a proposed extension pattern for modules that don't have document upload
yet — a plan to build from later, not something this checkpoint builds.
Per this phase's own scope rule, nothing here creates new storage folders,
new document categories, or new upload routes that nothing currently
calls.

## Part 1 — the current architecture (as it exists today)

### Principle already in place: application source is separate from user uploads

Source code lives in this git repository. Every user-uploaded file lives
in **Firebase Storage**, in its own bucket, addressed by a server-generated
path — never inside the git repository, never named or placed by the
client. This separation already exists; this audit did not need to
introduce it.

### Storage layout today

```
Firebase Storage bucket
├── avatars/
│   └── {uid}-{timestamp}-{sanitizedFileName}
└── customer-documents/
    └── {customerId}/{timestamp}-{sanitizedFileName}
```

Both path segments are built entirely server-side in `POST /api/upload`
(`server.ts`) — the client sends a `folder` name (`'avatars'` or
`'customer-documents'`), a file name, and the file's base64 content; it
never sends or chooses the storage path itself.

### The database record

Every non-avatar upload has a matching `CRMDocument` record
(`src/types/index.ts`), which is exactly the "never rely on filename/
location alone" requirement this phase's own rules ask for:

```ts
interface CRMDocument {
  id: string;                 // DOC-000001 -- issued by idGenerator.ts
  title: string;
  category: 'contract' | 'quotation' | 'invoice' | 'receipt'
          | 'customer_id' | 'driving_license' | 'vehicle_reg'
          | 'vehicle_insurance' | 'inspection_sheet' | 'statement' | 'other';
  fileName: string;
  fileSize: string;
  fileType: string;
  fileUrl: string;             // the authenticated proxy URL, never a raw Storage URL
  relatedEntityType: 'customer' | 'vehicle' | 'contract' | 'reservation' | 'quotation' | 'invoice';
  relatedEntityId: string;
  relatedEntityName?: string;
  expiryDate?: string;
  version: number;
  uploadedBy: string;
  uploadedAt: string;
}
```

This already satisfies every requirement this phase's rules set for future
uploads: linked to a database record, linked to the correct entity,
carries a document type, an upload date, an uploader, and (via
`recordAudit`, called on every upload) a full audit trail entry.

### Access control today

- `POST /api/upload` requires authentication and restricts `folder` to an
  explicit allowlist (`'avatars' | 'customer-documents'`) — a client
  cannot invent a third folder.
- Every read goes through `GET /api/documents/file`, which requires a
  valid session on **every** access (not just at upload time), validates
  the requested `path` against a server-side allowlist
  (`ALLOWED_DOCUMENT_PATH_PREFIXES`), rejects any path containing `..`,
  and streams the file from Storage directly rather than ever handing out
  a Storage-level credential or a long-lived signed URL.
- The frontend never renders a bare `<img src="https://storage.googleapis.com/...">`
  — `AuthenticatedImage.tsx` fetches the proxy path with the caller's
  Bearer token attached, which a plain `<img>` tag cannot do.

This is already a sound, sensitive-document-safe design. Nothing in Part 1
needed to change.

## Part 2 — proposed extension pattern (not built in this checkpoint)

Several modules built in Splendor Procurement, Phase 1 already have a
`documentIds` / `mediaDocumentIds` / `evidenceIds` field reserved on their
type (`Supplier`, `PurchaseOrder`, `ProcurementOperation`,
`EmployeeExpense`, `VehicleReceivingRecord`, `SupplierInvoice`, `Debt`,
`TarsRecord`) — but no upload route or Storage folder exists for any of
them yet, because no feature phase has asked for one. The pattern below
is the **recommended shape** for whichever future phase adds that upload
UI, so it slots into the existing architecture instead of inventing a
second one:

```
avatars/                                   -- exists today
customer-documents/{customerId}/           -- exists today
suppliers/{supplierId}/                    -- proposed: trade license, tax registration, bank details, agreements
procurement/{purchaseOrderIdOrOperationId}/ -- proposed: quotations, receipts, supporting documents
vehicles/{vehicleId}/                      -- proposed: registration, insurance, inspection, handover, return, damage
contracts/{contractId}/                    -- proposed: customer contracts, supplier contracts, extensions
financial/{invoiceOrPaymentOrDepositId}/   -- proposed: invoices, payments, deposits, expenses, refunds
tars/{tarsRecordId}/                       -- proposed: handover proof, return documentation
employees/{employeeId}/                    -- proposed: identity documents, expense receipts
```

To add one of these when a real feature needs it:

1. Add the new prefix to `POST /api/upload`'s folder allowlist and to
   `ALLOWED_DOCUMENT_PATH_PREFIXES` in the same commit — never one without
   the other, or reads and writes disagree on what's valid.
2. Extend `CRMDocument.relatedEntityType` and `.category` with the new
   entity/document types actually needed — not the full list above
   speculatively, only what the feature at hand requires.
3. Reuse `GET /api/documents/file` as-is; it already generalizes to any
   allowlisted prefix.
4. Reuse `src/lib/upload.ts`'s `uploadFile()` signature (add the new
   folder name to its union type) rather than writing a second upload
   helper.

This keeps every future document-upload feature — supplier documents,
vehicle inspection photos, TARS handover proof, whatever comes next — a
small, additive change to one already-proven, already-audited pipeline,
instead of a new one per module.
