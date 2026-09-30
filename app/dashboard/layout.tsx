"use client";

import { AppShell } from "../_components/AppShell";
import { CUSTOMER_NAV } from "../_components/nav-config";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell nav={CUSTOMER_NAV} variant="customer">
      {children}
    </AppShell>
  );
}
