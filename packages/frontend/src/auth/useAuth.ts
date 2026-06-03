import { useCallback, useEffect, useState } from "react";

const TOKEN_STORAGE_KEY = "aio-editor.token";
const EXPIRES_STORAGE_KEY = "aio-editor.expiresAt";

export interface AuthState {
  token: string | null;
  expiresAt: string | null;
}

function readFromStorage(): AuthState {
  return {
    token: localStorage.getItem(TOKEN_STORAGE_KEY),
    expiresAt: localStorage.getItem(EXPIRES_STORAGE_KEY),
  };
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(readFromStorage);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOKEN_STORAGE_KEY || e.key === EXPIRES_STORAGE_KEY) {
        setState(readFromStorage());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const login = useCallback((token: string, expiresAt: string) => {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(EXPIRES_STORAGE_KEY, expiresAt);
    setState({ token, expiresAt });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(EXPIRES_STORAGE_KEY);
    setState({ token: null, expiresAt: null });
  }, []);

  return { ...state, login, logout, isAuthenticated: state.token !== null };
}
