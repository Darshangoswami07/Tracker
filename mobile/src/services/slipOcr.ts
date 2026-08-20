import { Platform } from 'react-native';
import { api } from '../api/client';
import { unwrap } from '../api/envelope';
import { ENDPOINTS } from '../api/endpoints';

/** Fields the OCR endpoint may return, mirroring the mobile Create GR form. */
export interface SlipExtractedFields {
  grNumber?: string | null;
  transportCompany?: string | null;
  gstin?: string | null;
  grDate?: string | null;
  consignorName?: string | null;
  consigneeName?: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  deliveryAt?: string | null;
  particulars?: string | null;
  packageCount?: number | null;
  packageType?: string | null;
  weight?: number | null;
  ewbNumber?: string | null;
  billType?: string | null;
  rate?: number | null;
  goodsValue?: number | null;
  grCharge?: number | null;
  freight?: number | null;
  labour?: number | null;
  pf?: number | null;
  doorDelivery?: number | null;
  taxGst?: number | null;
  netAmount?: number | null;
  toPay?: number | null;
  specialService?: string | null;
  proprietor?: string | null;
  proprietorPhone?: string | null;
  /** The transport company's own contact number (letterhead phone),
   * distinct from `proprietorPhone` (the proprietor's personal number
   * printed next to their name/signature) — see `slip_parser.py`. */
  transportPhone?: string | null;
  phone?: string | null;
}

export class OcrError extends Error {
  readonly kind: 'no-image' | 'unsupported' | 'validation' | 'provider' | 'network';
  constructor(kind: OcrError['kind'], message: string) {
    super(message);
    this.name = 'OcrError';
    this.kind = kind;
  }
}

const mimeTypeFromUri = (uri: string): string => {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
};

/**
 * Builds a multipart FormData body that matches the FastAPI endpoint
 * (`file: UploadFile = File(...)` in `backend/app/api/v1/gr.py`). This is
 * deliberately platform-aware because React Native and Expo Web serialise
 * FormData file entries very differently:
 *
 *  - Native (Android/iOS): the image picker returns a `file://` (or
 *    `content://`) URI, and RN's XHR layer understands the `{ uri, type,
 *    name }` file-object convention, producing a correct multipart part.
 *  - Web: the picker returns a `blob://` URI and the *browser's* native
 *    FormData does NOT understand the `{ uri, type, name }` object — it would
 *    stringify it to "[object Object]" (a plain text field), so FastAPI never
 *    receives an actual file and validation fails with HTTP 422. On web we
 *    therefore fetch the blob and append a real `File`/`Blob` instead.
 */
const buildSlipFormData = async (imageUri: string): Promise<FormData> => {
  const mimeType = mimeTypeFromUri(imageUri);
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const blob = await (await fetch(imageUri)).blob();
    const file = new File([blob], `slip_${Date.now()}.${mimeType === 'image/png' ? 'png' : 'jpg'}`, { type: blob.type || mimeType });
    formData.append('file', file);
    return formData;
  }

  formData.append('file', {
    uri: imageUri,
    type: mimeType,
    name: `slip_${Date.now()}.${mimeType === 'image/png' ? 'png' : 'jpg'}`,
  } as any);
  return formData;
};

/** Maps an axios/network failure to a stable, user-friendly OcrError kind. */
const toOcrError = (err: any): OcrError => {
  const status = err?.response?.status;
  if (status === 422) {
    return new OcrError('validation', 'The slip image could not be read. Make sure the entire slip is visible and the image is clear.');
  }
  if (status && status >= 500) {
    return new OcrError('provider', "Couldn't extract the slip. Try a clearer image.");
  }
  if (status === 503) {
    return new OcrError('provider', 'The OCR service is not configured. Try a clearer image or contact support.');
  }
  if (!status || err?.request) {
    return new OcrError('network', 'Internet connection is required to extract this slip. Your existing local GR data is still available.');
  }
  return new OcrError('provider', "Couldn't extract the slip. Try a clearer image.");
};

/**
 * Sends a slip image to the backend OCR endpoint and returns the extracted
 * fields. The image bytes go to the API (which forwards them to the vision
 * model) only while this call is in flight — nothing about the GR itself is
 * read from or written to the server; all business data stays local. Throws an
 * `OcrError` with a stable `kind` so the UI can show a friendly message.
 */
export const extractSlipDetails = async (imageUri: string): Promise<SlipExtractedFields> => {
  const formData = await buildSlipFormData(imageUri);

  // See orderAttachments.ts: the shared axios instance defaults to
  // 'Content-Type: application/json', which would JSON.stringify the
  // FormData. Clearing the header lets the platform XHR layer build the real
  // multipart Content-Type (with boundary) that FastAPI can parse.
  const response = await api.post(ENDPOINTS.admin.orders.ocrExtract, formData, {
    headers: { 'Content-Type': undefined },
  });
  return unwrap<SlipExtractedFields>(response);
};

export { extractSlipDetails as extractSlipDetailsWithErrors };
export const isOcrError = (err: unknown): err is OcrError => err instanceof OcrError;
export { toOcrError as classifyOcrError };