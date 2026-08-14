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
 * checked `POST /orders/{id}/attachments` endpoint.
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

  const response = await api.post(ENDPOINTS.orders.uploadAttachment(orderId), formData, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data.data;
};
