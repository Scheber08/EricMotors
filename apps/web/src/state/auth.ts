import { create } from 'zustand';
import { ApiError, type PublicUser, api } from '../api/client';
import { deriveClientKey } from '../lib/auth';

/**
 * Anmeldestatus. `/api/me` wird einmal pro Seitenaufruf abgefragt; schlägt die Cloud fehl, bleibt
 * die App voll lokal nutzbar (status = 'offline').
 */
interface AuthState {
  user: PublicUser | null;
  status: 'unknown' | 'ready' | 'offline' | 'unavailable';
  init: () => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  setDesignCount: (n: number) => void;
}

let initPromise: Promise<void> | undefined;

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  status: 'unknown',
  init: () => {
    initPromise ??= api
      .me()
      .then((r) => set({ user: r.user, status: r.authAvailable ? 'ready' : 'unavailable' }))
      .catch((e: unknown) =>
        set({ status: e instanceof ApiError && e.code === 'offline' ? 'offline' : 'unavailable' }),
      );
    return initPromise;
  },
  register: async (username, password) => {
    const key = await deriveClientKey(username, password);
    const { user } = await api.register(username.trim(), key);
    set({ user, status: 'ready' });
  },
  login: async (username, password) => {
    const key = await deriveClientKey(username, password);
    const { user } = await api.login(username.trim(), key);
    set({ user, status: 'ready' });
  },
  logout: async () => {
    await api.logout().catch(() => undefined);
    set({ user: null });
  },
  changePassword: async (oldPassword, newPassword) => {
    const user = get().user;
    if (!user) throw new ApiError('unauthorized', 401);
    const [oldKey, newKey] = await Promise.all([
      deriveClientKey(user.username, oldPassword),
      deriveClientKey(user.username, newPassword),
    ]);
    await api.changePassword(oldKey, newKey);
  },
  deleteAccount: async () => {
    await api.deleteAccount();
    set({ user: null });
  },
  setDesignCount: (n) => {
    const user = get().user;
    if (user) set({ user: { ...user, designCount: n } });
  },
}));
