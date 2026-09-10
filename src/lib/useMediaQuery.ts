"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Matches a media query on the client.
 *
 * Uses useSyncExternalStore rather than useEffect + setState: matchMedia is an
 * external store, and this avoids the cascading render (and the lint error)
 * that reading it inside an effect causes.
 *
 * Returns `false` during SSR, so use it only to pick between two presentations
 * of the same content — never to decide whether content exists.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
