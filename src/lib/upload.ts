import { apiFetch } from './apiFetch';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export interface UploadResult {
  url: string;
  path: string;
}

/**
 * Uploads a file to the server (which stores it in Firebase Storage via
 * firebase-admin) and returns a URL to read it back. For 'avatars' this is
 * a Storage signed URL (low-sensitivity profile photos, rendered via plain
 * <img src> across the app); for 'customer-documents' (KYC scans) and
 * 'vehicle-inspections' (inspection photo evidence) it's a relative path
 * to the authenticated GET /api/documents/file proxy, which requires the
 * caller's session on every access -- see /api/upload in server.ts for why
 * the folders are treated differently.
 */
export async function uploadFile(
  file: File,
  folder: 'avatars' | 'customer-documents' | 'vehicle-inspections' | 'payment-proofs' | 'bank-statements',
  extra?: { targetUserId?: string; customerId?: string; inspectionId?: string; paymentId?: string; bankBatchId?: string }
): Promise<UploadResult> {
  const dataBase64 = await fileToBase64(file);
  const res = await apiFetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder,
      fileName: file.name,
      fileType: file.type,
      dataBase64,
      ...extra
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Upload failed.');
  }
  return data;
}

/** Human-readable file size, e.g. "2.4 MB" -- matches CRMDocument.fileSize's format. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
