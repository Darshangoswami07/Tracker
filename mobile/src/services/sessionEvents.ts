type Listener = () => void;

/**
 * Lightweight event bus used to notify the navigation layer when the session
 * can no longer be refreshed (e.g. refresh token revoked). Keeps the axios
 * layer decoupled from React Navigation.
 */
const listeners = new Set<Listener>();

export const sessionEvents = {
  /** Called when the access token can no longer be refreshed. */
  emitExpired(): void {
    listeners.forEach((listener) => listener());
  },

  onExpired(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};