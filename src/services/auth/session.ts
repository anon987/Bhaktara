export type GuestSession = { uid: string; isAnonymous: boolean };
export interface SessionService {
  ensureSession(): Promise<GuestSession | null>;
}

export interface AuthDriver {
  ready(): Promise<void>;
  current(): GuestSession | null;
  createAnonymous(): Promise<GuestSession>;
}

// Wait for persisted auth before creating a guest. Share concurrent attempts,
// but clear failures so a retry can recover without a second guest being created.
export function createSessionService(driver: AuthDriver): SessionService {
  let pending: Promise<GuestSession> | null = null;
  return {
    ensureSession() {
      if (!pending) {
        pending = (async () => {
          await driver.ready();
          return driver.current() ?? (await driver.createAnonymous());
        })().finally(() => {
          pending = null;
        });
      }
      return pending;
    },
  };
}
