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

export async function uploadFile(
  file: File,
  folder: 'avatars' | 'customer-documents' | 'vehicles' | 'fleet' | 'vehicle-inspections',
  extra?: { targetUserId?: string; customerId?: string; inspectionId?: string; paymentId?: string; bankBatchId?: string }
): Promise<UploadResult> {
  const dataBase64 = await fileToBase64(file);
  try {
    const res = await apiFetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder, fileName: file.name, fileType: file.type, dataBase64, ...extra })
    });
    const data = await res.json();
    if (!res.ok) return { url: dataBase64, path: `${folder}/${file.name}` };
    return data;
  } catch {
    return { url: dataBase64, path: `${folder}/${file.name}` };
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
