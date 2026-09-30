"use client";

import { AppShell } from "../_components/AppShell";
import { ADMIN_NAV } from "../_components/nav-config";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell nav={ADMIN_NAV} variant="admin">
      {children}
    </AppShell>
  );
}
