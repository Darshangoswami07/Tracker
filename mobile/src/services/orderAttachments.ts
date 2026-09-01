import { api } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';

export interface OrderAttachment {
  id: string;
  fileKind: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  createdAt: string;
  url: string;
}

/**
 * Uploads a slip/photo for a GR (order). Reused by every role's Order
 * Details screen that's allowed to upload (Admin/Staff/Driver — Customer is
 * blocked server-side, not just in the UI). Calls the shared, permission-
 * checked `POST /admin/orders/{id}/attachments` endpoint.
 */
export const uploadOrderAttachment = async (
  orderId: string,
  imageUri: string,
  accessToken: string,
  fileKind: string = 'generic'
): Promise<OrderAttachment> => {
  const formData = new FormData();
  formData.append('file', {
    uri: imageUri,
    type: 'image/jpeg',
    name: `slip_${orderId}_${Date.now()}.jpg`,
  } as any);
  formData.append('fileKind', fileKind);

  // The shared axios instance (`api/client.ts`) sets a default
  // 'Content-Type: application/json' header. Axios's transformRequest
  // special-cases FormData bodies ONLY when the effective content-type is
  // *not* application/json — otherwise it JSON.stringifies the FormData,
  // silently turning this into a broken JSON body. And hardcoding
  // 'multipart/form-data' here instead would send that header with no
  // boundary parameter, which FastAPI's multipart parser can't read either.
  // Explicitly clearing the header (not just omitting it) is what lets
  // React Native's XHR layer generate the real multipart Content-Type
  // (with boundary) itself when it sees the FormData body.
  const response = await api.post(ENDPOINTS.admin.orders.attachments(orderId), formData, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': undefined,
    },
  });
  return response.data.data;
};
