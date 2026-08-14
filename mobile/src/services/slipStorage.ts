import { Directory, File, Paths } from 'expo-file-system';
import { uuid } from '../utils/uuid';

export interface PersistedSlip {
  localUri: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

const SLIP_DIR_NAME = 'slips';

/**
 * Copies a picked photo (expo-image-picker returns a cache URI that the OS
 * may evict) into the app's persistent Documents directory so slip images
 * survive app restarts and can be viewed fully offline from GR Details.
 * Falls back to the original URI if persistence is unavailable (e.g. web).
 */
export const persistSlipImage = async (sourceUri: string, mimeType: string = 'image/jpeg'): Promise<PersistedSlip> => {
  const ext = mimeType === 'image/png' ? '.png' : '.jpg';
  const fileName = `slip_${uuid()}${ext}`;
  try {
    const dir = new Directory(Paths.document, SLIP_DIR_NAME);
    if (!dir.exists) {
      dir.create({ idempotent: true, intermediates: true });
    }
    const source = new File(sourceUri);
    if (!source.exists) {
      return { localUri: sourceUri, fileName, mimeType, fileSizeBytes: 0 };
    }
    const dest = new File(dir, fileName);
    source.copy(dest);
    return { localUri: dest.uri, fileName, mimeType, fileSizeBytes: dest.exists ? dest.size : 0 };
  } catch {
    return { localUri: sourceUri, fileName, mimeType, fileSizeBytes: 0 };
  }
};