import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch seconds
}

interface AuthState {
  accessToken: string | undefined;
  refreshToken: string | undefined;
  expiresAt: number | undefined;
  userName: string | undefined;
  setTokens: (tokens: TokenSet) => void;
  setUserName: (userName: string) => void;
  clearTokens: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: undefined,
      refreshToken: undefined,
      expiresAt: undefined,
      userName: undefined,
      setTokens: (tokens) =>
        set({
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: tokens.expiresAt,
        }),
      setUserName: (userName) =>
        set({
          userName,
        }),
      clearTokens: () =>
        set({
          accessToken: undefined,
          refreshToken: undefined,
          expiresAt: undefined,
          userName: undefined,
        }),
    }),
    {
      name: 'wm_auth_storage',
    }
  )
);
