/**
 * Keys used to persist data in the local AsyncStorage container. JWT access and
 * refresh tokens are NOT stored here — they live in the OS secure store via the
 * token storage service.
 */
export const StorageKeys = {
  /** JWT access token (SecureStore). */
  accessToken: 'auth.access_token',
  /** JWT refresh token (SecureStore). */
  refreshToken: 'auth.refresh_token',
  /** Email remembered by the "Remember Me" option on the login screen. */
  rememberedEmail: 'auth.remembered_email',
  /** Preferred theme mode. */
  themeMode: 'app.theme_mode',
  /** App settings preferences (notifications, privacy, data). */
  settingsPreferences: 'app.settings',
  /** In-flight registration request so a restart resumes the pending screen. */
  registration: 'registration.active_request',
} as const;