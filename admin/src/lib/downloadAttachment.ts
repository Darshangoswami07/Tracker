import { getAuthToken } from './auth';

/**
 * Downloads an attachment that requires a bearer token. The backend streams
 * slip/photo files only to authenticated callers, so a plain `<a href>` opens
 * a new tab with no Authorization header and returns a 401. This fetches with
 * the token and opens the result as a blob object URL instead.
 */
export async function downloadAttachment(url: string, filename?: string): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Failed to download attachment (${response.status}).`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename || 'attachment';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
