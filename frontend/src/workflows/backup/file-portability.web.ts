/**
 * M7.2 Patch 2 — WEB file portability. Uses the browser's native download +
 * <input type="file"> so the Export screen is fully usable in the web preview,
 * WITHOUT enabling any native-only destructive behavior. Raw SQLite export is
 * native-only (the web preview has no on-device SQLite file).
 */
import { BAPP_BACKUP_MIME } from '@/src/domain/backup';

export interface SaveResult {
  readonly cancelled: boolean;
  readonly uri: string | null;
}
export interface PickedFile {
  readonly name: string;
  readonly uri: string;
  readonly text: string;
}

export const rawSqliteExportSupported = false;
export const filePortabilityRuntime = 'web';

export async function saveTextFile(
  fileName: string,
  body: string,
  mime: string = BAPP_BACKUP_MIME,
): Promise<SaveResult> {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { cancelled: false, uri: null };
}

export async function saveBinaryFile(): Promise<SaveResult> {
  throw new Error('Raw SQLite export is available only on the native SQLite runtime.');
}

export async function pickTextFile(): Promise<PickedFile | null> {
  return new Promise<PickedFile | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.bappbackup,application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, uri: file.name, text: String(reader.result ?? '') });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}
