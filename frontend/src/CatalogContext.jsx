import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

/**
 * The published catalog, fetched once per session.
 *
 * Replaces a `useCatalog` hook that was a bare useState+useEffect, so every
 * component calling it mounted its OWN fetch. `Shell` calls it and so does
 * every screen inside `Shell`, which meant each buyer page pulled the whole
 * catalog at least twice.
 *
 * It also returns real state. The old hook returned `events ?? []` and its
 * catch handler also set `[]`, so "still loading", "nothing published" and
 * "the request failed" were indistinguishable — Home and Explorer rendered
 * their empty state during the fetch, then popped into content.
 */

const CatalogContext = createContext(null);

export function CatalogProvider({ children }) {
  const [state, setState] = useState({ events: [], loading: true, error: null });

  /** Shared by the initial load and the retry button on ErrorState. */
  const fetchCatalog = useCallback(async (isAlive = () => true) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await api.get("/events");
      if (isAlive()) setState({ events: data.events ?? [], loading: false, error: null });
    } catch (err) {
      // Kept distinct from an empty catalog so the UI can offer a retry.
      if (isAlive()) setState({ events: [], loading: false, error: err });
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void fetchCatalog(() => alive);
    return () => {
      alive = false;
    };
  }, [fetchCatalog]);

  const value = useMemo(
    () => ({
      ...state,
      reload: () => fetchCatalog(),
      bySlug: (slug) => state.events.find((event) => event.slug === slug),
    }),
    [state, fetchCatalog],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  // Throwing beats silently refetching: a screen rendered outside the
  // provider is a wiring mistake, and a fallback would hide it.
  if (!ctx) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return ctx;
}
