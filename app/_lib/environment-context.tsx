"use client";

import { createContext, useContext, useState } from "react";
import type { Environment } from "./api/types";

const EnvironmentContext = createContext<{ environment: Environment; setEnvironment: (e: Environment) => void } | null>(null);

/**
 * Deliberately not persisted to localStorage: reading browser storage during
 * the initial render would mismatch the server-rendered HTML (this provider
 * wraps Server-Component-rendered pages), and syncing it after mount via an
 * effect is exactly the setState-in-effect anti-pattern. Defaulting to
 * SANDBOX on every load is also the safer choice for a toggle that gates
 * production sends.
 */
export function EnvironmentProvider({ children }: { children: React.ReactNode }) {
  const [environment, setEnvironment] = useState<Environment>("SANDBOX");
  return <EnvironmentContext.Provider value={{ environment, setEnvironment }}>{children}</EnvironmentContext.Provider>;
}

export function useEnvironment() {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) throw new Error("useEnvironment must be used within EnvironmentProvider");
  return ctx;
}
