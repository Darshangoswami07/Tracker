import { Directory, File, Paths } from 'expo-file-system';
import { uuid } from '../utils/uuid';

export interface PersistedSlip {
  localUri: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
}

const SLIP_DIR_NAME = 'slips';
const AVATAR_DIR_NAME = 'avatars';

/**
 * Copies a picked photo (expo-image-picker returns a cache URI that the OS
 * may evict) into the app's persistent Documents directory, under `subdir`,
 * so it survives app restarts and can be viewed fully offline. Falls back to
 * the original URI if persistence is unavailable (e.g. web).
 */
const persistPickedImage = async (
  sourceUri: string,
  mimeType: string,
  subdir: string,
  filePrefix: string,
): Promise<PersistedSlip> => {
  const ext = mimeType === 'image/png' ? '.png' : '.jpg';
  const fileName = `${filePrefix}_${uuid()}${ext}`;
  try {
    const dir = new Directory(Paths.document, subdir);
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

/** GR/transport slip photos — see `AdminGRDetailsScreen`/`StaffGRPanelScreen`. */
export const persistSlipImage = async (sourceUri: string, mimeType: string = 'image/jpeg'): Promise<PersistedSlip> =>
  persistPickedImage(sourceUri, mimeType, SLIP_DIR_NAME, 'slip');

/** User profile avatar photo — local-only, see `ProfileScreen`. */
export const persistAvatarImage = async (sourceUri: string, mimeType: string = 'image/jpeg'): Promise<PersistedSlip> =>
  persistPickedImage(sourceUri, mimeType, AVATAR_DIR_NAME, 'avatar');