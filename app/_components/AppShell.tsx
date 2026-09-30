"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { MessageSquare, PanelLeftClose, PanelLeftOpen, Menu, X, LogOut, ArrowLeft, Bell } from "lucide-react";
import type { NavSection } from "./nav-config";
import { useCurrentUser, useCurrentOrg } from "../_lib/use-current-user";
import { useEnvironment } from "../_lib/environment-context";
import { setActingOrganizationId } from "../_lib/acting-organization";
import { authApi, adminApi } from "../_lib/api";
import { formatDateTime } from "../_lib/format";
import { IconButton } from "./ui/Button";

function hasPermission(permissions: string[] | undefined, isPlatformAdmin: boolean | undefined, required?: string): boolean {
  if (!required) return true;
  if (isPlatformAdmin) return true;
  return permissions?.includes(required) ?? false;
}

function initials(label: string): string {
  return label.trim().slice(0, 1).toUpperCase() || "?";
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "notifications"], queryFn: () => adminApi.notifications(), refetchInterval: 30_000 });

  const markRead = useMutation({
    mutationFn: (id: string) => adminApi.markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "notifications"] }),
  });

  const unreadCount = query.data?.unreadCount ?? 0;

  return (
    <div className="relative">
      <IconButton onClick={() => setOpen((o) => !o)} aria-label="Notifications" title="Notifications">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[9px] font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </IconButton>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-md border border-border bg-surface shadow-lg">
          <div className="max-h-96 overflow-y-auto">
            {!query.data || query.data.notifications.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-foreground-muted">No notifications</p>
            ) : (
              query.data.notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.readAt) markRead.mutate(n.id);
                  }}
                  className={clsx("block w-full border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-background", !n.readAt && "bg-brand-50")}
                >
                  <p className="text-xs font-medium text-foreground">{n.title}</p>
                  <p className="mt-0.5 text-xs text-foreground-muted">{n.message}</p>
                  <p className="mt-1 text-[10px] text-foreground-muted">{formatDateTime(n.createdAt)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Icon button styled for the dark brand-600 sidebar — the shared IconButton
 * assumes a light background. Also overrides the global brand-600
 * focus-visible outline (invisible against a brand-600 background) to white.
 */
function SidebarIconButton({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-white",
        className,
      )}
      {...props}
    />
  );
}

function UserFooter({
  collapsed,
  name,
  email,
  roleLabel,
  onLogout,
}: {
  collapsed: boolean;
  name: string | null;
  email: string;
  roleLabel: string;
  onLogout: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-t border-white/10 px-3 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-brand-600">
        {initials(name ?? email)}
      </div>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{name ?? email}</p>
          <p className="truncate text-xs text-white/60">{roleLabel}</p>
        </div>
      )}
      <SidebarIconButton onClick={onLogout} aria-label="Log out" title="Log out">
        <LogOut className="h-4 w-4" />
      </SidebarIconButton>
    </div>
  );
}

const SIDEBAR_COLLAPSED_STORAGE_KEY = "sms-gateway-sidebar-collapsed";

export function AppShell({ nav, children, variant = "customer" }: { nav: NavSection[]; children: React.ReactNode; variant?: "customer" | "admin" }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Starts false (matching SSR) and syncs from localStorage post-mount — reading it
  // directly during render would disagree with the server here, the same hydration
  // mismatch class fixed in Toast.tsx (see app/_lib/use-mounted.ts).
  useEffect(() => {
    try {
      // Justified exception — syncing from an external system (localStorage) on mount,
      // same as app/_lib/use-mounted.ts, not deriving state that could be computed inline.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true") setCollapsed(true);
    } catch {
      // Private browsing / blocked storage — fall back to the default expanded state.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
    } catch {
      // Nothing to persist to — the toggle still works for this session.
    }
  }, [collapsed]);
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useCurrentUser();
  const org = useCurrentOrg();
  const { environment, setEnvironment } = useEnvironment();
  const isActingAsOrg = Boolean(user?.isPlatformAdmin && user.actingOrganization && org?.organizationId === user.actingOrganization.organizationId);

  function exitActingAs() {
    setActingOrganizationId(null);
    queryClient.invalidateQueries();
    router.push("/admin");
  }

  async function logout() {
    await authApi.logout();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate full reload: clears all client cache/state on logout.
    window.location.href = "/login";
  }

  if (isLoading) return null;
  if (!user) {
    if (typeof window !== "undefined") router.replace("/login");
    return null;
  }
  if (variant === "admin" && !user.isPlatformAdmin) {
    return (
      <div className="mx-auto max-w-md py-16 text-center text-sm text-foreground-muted">
        You don&apos;t have permission to view this area.
      </div>
    );
  }

  const visibleSections = nav
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => hasPermission(org?.permissions, user.isPlatformAdmin, item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  const roleLabel = variant === "admin" ? "Platform Administrator" : org?.role ? `${org.role} · ${org.organizationName}` : "No organization";

  function renderNav(onNavigate: () => void) {
    return (
      <nav className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
        {visibleSections.map((section, i) => (
          <div key={section.title} className={clsx(i > 0 && "mt-5 border-t border-white/10 pt-5")}>
            {!collapsed && <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">{section.title}</p>}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || (item.href !== "/dashboard" && item.href !== "/admin/overview" && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    className={clsx(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-white",
                      active ? "bg-white text-brand-700" : "text-white/75 hover:bg-white/10 hover:text-white",
                      collapsed && "justify-center",
                    )}
                  >
                    <Icon className={clsx("h-4 w-4 shrink-0", active ? "text-brand-600" : "text-white/60")} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className={clsx("hidden shrink-0 flex-col bg-brand-600 md:flex", collapsed ? "w-16" : "w-64")}>
        <div className="flex h-14 items-center justify-between border-b border-white/10 px-3">
          <Link href={variant === "admin" ? "/admin" : "/dashboard"} className="flex min-w-0 items-center gap-2 rounded focus-visible:outline-white">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-brand-600">
              <MessageSquare className="h-4 w-4" />
            </span>
            {!collapsed && <span className="truncate text-sm font-semibold text-white">SMS Gateway</span>}
          </Link>
          <SidebarIconButton onClick={() => setCollapsed((c) => !c)} aria-label="Toggle sidebar" title="Toggle sidebar">
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </SidebarIconButton>
        </div>
        {renderNav(() => undefined)}
        <UserFooter collapsed={collapsed} name={user.name} email={user.email} roleLabel={roleLabel} onLogout={logout} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative flex h-full w-72 flex-col bg-brand-600 shadow-lg">
            <div className="flex h-14 items-center justify-between border-b border-white/10 px-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-brand-600">
                  <MessageSquare className="h-4 w-4" />
                </span>
                SMS Gateway
              </span>
              <SidebarIconButton onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="h-4 w-4" />
              </SidebarIconButton>
            </div>
            {renderNav(() => setMobileOpen(false))}
            <UserFooter collapsed={false} name={user.name} email={user.email} roleLabel={roleLabel} onLogout={logout} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-surface px-4">
          <IconButton className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="h-4 w-4" />
          </IconButton>

          <div className="flex-1" />

          {variant === "customer" && isActingAsOrg && (
            <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning-bg px-2.5 py-1 text-xs font-medium text-warning">
              <span>Viewing as: {user!.actingOrganization!.organizationName}</span>
              <button onClick={exitActingAs} className="underline hover:no-underline">
                Exit
              </button>
            </div>
          )}

          {variant === "customer" && (
            <div className="flex items-center gap-1 rounded-md border border-border p-0.5 text-xs">
              <button
                onClick={() => setEnvironment("SANDBOX")}
                className={clsx("rounded px-2 py-1 font-medium", environment === "SANDBOX" ? "bg-brand-600 text-white" : "text-foreground-muted")}
              >
                Sandbox
              </button>
              <button
                onClick={() => setEnvironment("PRODUCTION")}
                className={clsx("rounded px-2 py-1 font-medium", environment === "PRODUCTION" ? "bg-brand-600 text-white" : "text-foreground-muted")}
              >
                Production
              </button>
            </div>
          )}

          {variant === "admin" && (
            <div className="flex items-center gap-3">
              <NotificationBell />
              <Link href="/dashboard" className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline">
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to dashboard
              </Link>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
