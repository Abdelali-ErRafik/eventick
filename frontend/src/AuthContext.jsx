"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, UNAUTHORIZED_EVENT } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const hydrate = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user: me } = await api.get("/auth/me");
      setUser(me);
    } catch (err) {
      if (err.status === 401 || err.status === 403) setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user: me } = await api.post("/auth/login", { email, password });
    setToken(token);
    setUser(me);
    return me;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const { token, user: me } = await api.post("/auth/register", { name, email, password });
    setToken(token);
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const { user: me } = await api.get("/auth/me");
    setUser(me);
    return me;
  }, []);

  // All derived from `user` — nowhere for these to drift from it, so plain
  // values computed each render beat memoising.
  //
  // `can(permission)` is the seam every call site should use: it reads the
  // permission list the server sends on /auth/me, so when a role's powers
  // change in the database no frontend code has to change with it. isAdmin
  // and canUsePro remain for the two cases that are genuinely about *who
  // you are* rather than *what you may do* — reaching the admin area at
  // all, and seeing the staff dashboard link.
  const permissions = user?.permissions ?? [];
  const can = useCallback(
    (permission) => permissions.includes(permission),
    // permissions is a fresh array each render; keying on the user identity
    // and the joined list avoids re-creating `can` when nothing changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user?.id, permissions.join(",")],
  );
  const isAdmin = user?.role === "ADMIN";
  const canUsePro = user?.role === "ORGANISER" || user?.role === "ADMIN";

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refresh, isAdmin, canUsePro, can, permissions }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
