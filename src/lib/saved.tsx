import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession } from "./session";

const FAVORITES_KEY = "ps.favorites";
const COMPARE_KEY = "ps.compare";

function readIds(key: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(raw) ? raw.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
  } catch {
    return [];
  }
}

function writeIds(key: string, ids: number[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* storage full or blocked: the session copy still holds the truth */
  }
}

type SavedValue = {
  /** Saved businesses, in the order they were saved. */
  ids: number[];
  isSaved: (id: number) => boolean;
  toggleSaved: (id: number) => Promise<void>;
  /** Selection for the compare page; a scratch list, so it stays in the browser. */
  compareIds: number[];
  isComparing: (id: number) => boolean;
  toggleCompare: (id: number) => void;
  clearCompare: () => void;
  /** True once the saved list has been reconciled with the server. */
  ready: boolean;
};

const SavedContext = createContext<SavedValue | null>(null);

async function serverIds(path: string, init?: RequestInit): Promise<number[] | null> {
  try {
    const res = await fetch(path, { cache: "no-store", ...init });
    if (!res.ok) return null;
    const data = (await res.json()) as { ids?: number[] };
    return Array.isArray(data.ids) ? data.ids : null;
  } catch {
    return null;
  }
}

export function SavedProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useSession();
  const [ids, setIds] = useState<number[]>([]);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const reconciled = useRef<number | null>(null);

  // Guests read from the browser immediately, so saving works logged out.
  useEffect(() => {
    setIds(readIds(FAVORITES_KEY));
    setCompareIds(readIds(COMPARE_KEY));
  }, []);

  /**
   * Once we know who is logged in: push anything saved as a guest up to the
   * account, then adopt the account's list as the truth.
   */
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setReady(true);
      reconciled.current = null;
      return;
    }
    if (reconciled.current === user.id) return;
    reconciled.current = user.id;

    let cancelled = false;
    async function reconcile() {
      const local = readIds(FAVORITES_KEY);
      const merged = local.length
        ? await serverIds("/api/favorites/merge", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ids: local }),
          })
        : await serverIds("/api/favorites");
      if (cancelled) return;
      if (merged) {
        setIds(merged);
        writeIds(FAVORITES_KEY, merged);
      }
      setReady(true);
    }
    void reconcile();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  const toggleSaved = useCallback(
    async (id: number) => {
      const wasSaved = ids.includes(id);
      const optimistic = wasSaved ? ids.filter((one) => one !== id) : [id, ...ids];
      setIds(optimistic);
      writeIds(FAVORITES_KEY, optimistic);

      if (!user) return;
      const next = wasSaved
        ? await serverIds(`/api/favorites/${id}`, { method: "DELETE" })
        : await serverIds("/api/favorites", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ listingId: id }),
          });
      // The server is authoritative when it answers; a failed call rolls back.
      const settled = next ?? (wasSaved ? [id, ...optimistic] : ids);
      setIds(settled);
      writeIds(FAVORITES_KEY, settled);
    },
    [ids, user],
  );

  const toggleCompare = useCallback((id: number) => {
    setCompareIds((current) => {
      const next = current.includes(id) ? current.filter((one) => one !== id) : [...current, id].slice(0, 4);
      writeIds(COMPARE_KEY, next);
      return next;
    });
  }, []);

  const clearCompare = useCallback(() => {
    setCompareIds([]);
    writeIds(COMPARE_KEY, []);
  }, []);

  const value = useMemo<SavedValue>(
    () => ({
      ids,
      isSaved: (id) => ids.includes(id),
      toggleSaved,
      compareIds,
      isComparing: (id) => compareIds.includes(id),
      toggleCompare,
      clearCompare,
      ready,
    }),
    [ids, toggleSaved, compareIds, toggleCompare, clearCompare, ready],
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved() {
  const value = useContext(SavedContext);
  if (!value) throw new Error("useSaved must be used inside <SavedProvider>");
  return value;
}
