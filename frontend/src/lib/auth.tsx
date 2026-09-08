import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiRequest, storageKeys } from "./api/client";
import type { AuthSession, User } from "./api/types";

interface AuthContextValue {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKeys.USER_KEY);
      if (raw) setUser(JSON.parse(raw) as User);
    } catch {
      /* ignore corrupt storage */
    }
    setReady(true);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await apiRequest<AuthSession>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    window.localStorage.setItem(storageKeys.TOKEN_KEY, data.accessToken);
    window.localStorage.setItem(storageKeys.REFRESH_KEY, data.refreshToken);
    window.localStorage.setItem(storageKeys.USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = window.localStorage.getItem(storageKeys.REFRESH_KEY);
    try {
      await apiRequest("/auth/logout", { method: "POST", body: { refreshToken } });
    } catch {
      /* logging out locally regardless */
    }
    window.localStorage.removeItem(storageKeys.TOKEN_KEY);
    window.localStorage.removeItem(storageKeys.REFRESH_KEY);
    window.localStorage.removeItem(storageKeys.USER_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout }), [user, ready, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
