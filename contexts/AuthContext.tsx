"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ChutesUser } from "@/lib/auth/types";

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: ChutesUser | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  fetchAccessToken: (args: {
    forceRefreshToken: boolean;
  }) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<ChutesUser | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/chutes/session", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        isSignedIn: boolean;
        user: ChutesUser | null;
      };
      setUser(data.isSignedIn ? data.user : null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);
  useEffect(() => {
    // Initial session resolution synchronizes this provider with HttpOnly cookies.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const fetchAccessToken = useCallback(async () => {
    const response = await fetch("/api/auth/convex-token", {
      cache: "no-store",
    });
    if (!response.ok) {
      setUser(null);
      return null;
    }
    const data = (await response.json()) as { token: string };
    return data.token;
  }, []);
  const logout = useCallback(async () => {
    const response = await fetch("/api/auth/chutes/logout", { method: "POST" });
    if (!response.ok) throw new Error("Sign out failed");
    setUser(null);
    window.location.assign("/");
  }, []);
  const value = useMemo(
    () => ({
      isLoading,
      isAuthenticated: user !== null,
      user,
      refresh,
      logout,
      fetchAccessToken,
    }),
    [fetchAccessToken, isLoading, logout, refresh, user],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useChutesAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useChutesAuth must be used inside AuthProvider");
  return value;
}
