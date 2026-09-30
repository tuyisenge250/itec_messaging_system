"use client";

import { useSyncExternalStore } from "react";

/**
 * Which organization a platform admin is currently "viewing as" (see
 * app/admin/organizations/[id]/page.tsx's "View as this organization" and
 * the exit banner in AppShell). Deliberately a plain module-level store, not
 * localStorage — mirrors app/_lib/environment-context.tsx's reasoning:
 * reading persisted state during the initial render would disagree with the
 * server-rendered HTML, and "not acting as anyone" is also the safer
 * fail-closed default for something with real write access to another
 * organization's data. Resets on every full page load; only ever set via an
 * explicit click, never restored automatically.
 */
let actingOrganizationId: string | null = null;
const listeners = new Set<() => void>();

export function getActingOrganizationId(): string | null {
  return actingOrganizationId;
}

export function setActingOrganizationId(id: string | null): void {
  actingOrganizationId = id;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string | null {
  return actingOrganizationId;
}

function getServerSnapshot(): string | null {
  return null;
}

export function useActingOrganizationId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
