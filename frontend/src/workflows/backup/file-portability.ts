/**
 * M7.2 Patch 2 — NATIVE file portability using ONLY the already-installed
 * `expo-file-system` (>=19). NO new native dependency (no expo-document-picker,
 * no expo-sharing).
 *
 *   - saveTextFile / saveBinaryFile: user picks a destination folder via the
 *     system Storage Access Framework (Directory.pickDirectoryAsync) and the
 *     file is created + written there — the OS decides Downloads/Drive/etc.
 *   - pickTextFile: File.pickFileAsync opens the system single-file picker and
 *     the selected file is read immediately.
 *
 * Metro resolves `.web.ts` on web, so `expo-file-system`'s native File/Directory
 * classes never break the web bundle.
 */
import { File, Directory } from 'expo-file-system';
import { BAPP_BACKUP_MIME, BAPP_RAW_SQLITE_MIME } from '@/src/domain/backup';

export interface SaveResult {
  readonly cancelled: boolean;
  readonly uri: string | null;
}
export interface PickedFile {
  readonly name: string;
  readonly uri: string;
  readonly text: string;
}

/** Raw SQLite export is a real native feature on this runtime. */
export const rawSqliteExportSupported = true;
export const filePortabilityRuntime = 'native';

const fileNameFromUri = (uri: string): string => {
  const decoded = (() => {
    try {
      return decodeURIComponent(uri);
    } catch {
      return uri;
    }
  })();
  const parts = decoded.split(/[/\\]/);
  return parts[parts.length - 1] || decoded;
};

/** True when a picker error indicates the user cancelled (best-effort). */
const isCancellation = (e: unknown): boolean => {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes('cancel') || msg.includes('dismiss') || msg.includes('no directory');
};

export async function saveTextFile(
  fileName: string,
  body: string,
  mime: string = BAPP_BACKUP_MIME,
): Promise<SaveResult> {
  try {
    const dir = await Directory.pickDirectoryAsync();
    const file = dir.createFile(fileName, mime);
    file.write(body);
    return { cancelled: false, uri: file.uri };
  } catch (e) {
    if (isCancellation(e)) return { cancelled: true, uri: null };
    throw e;
  }
}

export async function saveBinaryFile(
  fileName: string,
  bytes: Uint8Array,
  mime: string = BAPP_RAW_SQLITE_MIME,
): Promise<SaveResult> {
  try {
    const dir = await Directory.pickDirectoryAsync();
    const file = dir.createFile(fileName, mime);
    file.write(bytes);
    return { cancelled: false, uri: file.uri };
  } catch (e) {
    if (isCancellation(e)) return { cancelled: true, uri: null };
    throw e;
  }
}

export async function pickTextFile(mime: string = BAPP_BACKUP_MIME): Promise<PickedFile | null> {
  try {
    const picked = await File.pickFileAsync(undefined, mime);
    const f = Array.isArray(picked) ? picked[0] : picked;
    if (!f) return null;
    const text = await f.text();
    return { name: fileNameFromUri(f.uri), uri: f.uri, text };
  } catch (e) {
    if (isCancellation(e)) return null;
    throw e;
  }
}
