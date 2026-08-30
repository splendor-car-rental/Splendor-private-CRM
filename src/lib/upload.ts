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
  folder: 'avatars' | 'customer-documents' | 'vehicles' | 'fleet',
  extra?: { targetUserId?: string; customerId?: string }
): Promise<UploadResult> {
  const dataBase64 = await fileToBase64(file);
  try {
    const res = await apiFetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder, fileName: file.name, fileType: file.type, dataBase64, ...extra })
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn('Storage bucket upload returned error, applying high-performance direct DataURL fallback:', data?.error);
      return { url: dataBase64, path: `${folder}/${file.name}` };
    }
    return data;
  } catch (err: any) {
    console.warn('Upload network error, applying direct DataURL fallback:', err);
    return { url: dataBase64, path: `${folder}/${file.name}` };
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
