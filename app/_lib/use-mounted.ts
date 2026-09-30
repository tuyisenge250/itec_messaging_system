"use client";

import { useEffect, useState } from "react";

/**
 * True only after the client has mounted. Use this instead of checking
 * `typeof window !== "undefined"` / `typeof document !== "undefined"` directly
 * in a render body — that check is `false` during SSR but already `true` on
 * the client's very first render (browser globals exist before mount), so it
 * makes the server and client disagree on what to render and triggers a
 * hydration mismatch. Gating on a flag that's only ever flipped inside an
 * effect guarantees the first client render matches the server.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  // This is the one legitimate use of setState-in-effect: there is no derivable value that
  // could replace it, since the whole point is to distinguish "server / first client render"
  // from "after mount," which by definition can only be known once an effect has run.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  return mounted;
}
