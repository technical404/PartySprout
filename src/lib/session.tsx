import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: "parent" | "vendor" | "admin";
  listingId: number | null;
};

/**
 * The first page of a signed-in account: what the header shows behind the user's
 * name, and what the login form opens once it succeeds. Shared so the two cannot
 * drift apart — signing in on /login used to leave the visitor sitting on the form.
 */
export function workspacePath(user: Pick<SessionUser, "role"> | null | undefined): "/account" | "/admin" | "/vendor/dashboard" {
  return user?.role === "admin" ? "/admin" : user?.role === "vendor" ? "/vendor/dashboard" : "/account";
}

export type AuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; message: string; fields?: Record<string, string> | undefined };

/** Changing a password answers with ok alone, not a user row. */
export type PasswordResult = { ok: true } | { ok: false; message: string; fields?: Record<string, string> | undefined };

type SessionValue = {
  user: SessionUser | null;
  /** True until the first /api/auth/me answer arrives. */
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  signup: (input: { email: string; name: string; password: string; phone?: string; role?: "parent" | "vendor" }) => Promise<AuthResult>;
  logout: () => Promise<void>;
  updateProfile: (input: { name: string; phone?: string }) => Promise<AuthResult>;
  changePassword: (input: { currentPassword: string; password: string }) => Promise<PasswordResult>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

async function readAuth(res: Response): Promise<AuthResult> {
  const data = (await res.json().catch(() => ({}))) as {
    user?: SessionUser;
    error?: string;
    fields?: Record<string, string>;
  };
  if (!res.ok || !data.user) {
    return { ok: false, message: data.error || `That did not work (error ${res.status}).`, fields: data.fields };
  }
  return { ok: true, user: data.user };
}

async function readOk(res: Response): Promise<PasswordResult> {
  const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
  if (!res.ok) {
    return { ok: false, message: data.error || `That did not work (error ${res.status}).`, fields: data.fields };
  }
  return { ok: true };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { cache: "no-store" });
      const data = (await res.json()) as { user: SessionUser | null };
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback<SessionValue["login"]>(async (email, password) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const result = await readAuth(res);
    if (result.ok) setUser(result.user);
    return result;
  }, []);

  const signup = useCallback<SessionValue["signup"]>(async (input) => {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await readAuth(res);
    if (result.ok) setUser(result.user);
    return result;
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
  }, []);

  const updateProfile = useCallback<SessionValue["updateProfile"]>(async (input) => {
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await readAuth(res);
    if (result.ok) setUser(result.user);
    return result;
  }, []);

  const changePassword = useCallback<SessionValue["changePassword"]>(async (input) => {
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return readOk(res);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ user, loading, login, signup, logout, updateProfile, changePassword, refresh }),
    [user, loading, login, signup, logout, updateProfile, changePassword, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside <SessionProvider>");
  return value;
}
