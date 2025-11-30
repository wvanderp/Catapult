import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch seconds
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  userName: string | null;
  setTokens: (tokens: TokenSet) => void;
  setUserName: (userName: string) => void;
  clearTokens: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      userName: null,
      setTokens: (tokens) =>
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || null,
          expiresAt: tokens.expiresAt,
        }),
      setUserName: (userName) =>
        set({
          userName,
        }),
      clearTokens: () =>
        set({
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          userName: null,
        }),
    }),
    {
      name: 'wm_auth_storage',
    }
  )
);
