import {
  LayoutDashboard,
  Send,
  MessageSquare,
  Megaphone,
  Users,
  UsersRound,
  FileText,
  BadgeCheck,
  ClipboardList,
  FolderOpen,
  Wallet,
  Package,
  CreditCard,
  Receipt,
  KeyRound,
  Webhook,
  BookOpen,
  FlaskConical,
  Monitor,
  ShieldCheck,
  Building2,
  UserCog,
  Lock,
  ScrollText,
  Building,
  Server,
  ShieldAlert,
  Activity,
  ListChecks,
  Inbox,
  HeartPulse,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permission code required to see this item — omit for "any authenticated user". */
  permission?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const CUSTOMER_NAV: NavSection[] = [
  { title: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    title: "Messaging",
    items: [
      { href: "/dashboard/messages/new", label: "Send SMS", icon: Send, permission: "sms.send" },
      { href: "/dashboard/messages", label: "Messages", icon: MessageSquare, permission: "sms.read" },
      { href: "/dashboard/campaigns", label: "Campaigns", icon: Megaphone, permission: "campaign.read" },
      { href: "/dashboard/contacts", label: "Contacts", icon: Users, permission: "contacts.read" },
      { href: "/dashboard/contacts/groups", label: "Contact Groups", icon: UsersRound, permission: "contacts.read" },
      { href: "/dashboard/templates", label: "Templates", icon: FileText, permission: "templates.manage" },
    ],
  },
  {
    title: "Sender IDs",
    items: [
      { href: "/dashboard/sender-ids", label: "Sender IDs", icon: BadgeCheck, permission: "sender_id.read" },
      { href: "/dashboard/sender-ids/requests", label: "Sender ID Requests", icon: ClipboardList, permission: "sender_id.read" },
      { href: "/dashboard/documents", label: "Documents", icon: FolderOpen, permission: "documents.read" },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/dashboard/wallet", label: "Wallet", icon: Wallet, permission: "wallet.read" },
      { href: "/dashboard/packages", label: "SMS Packages", icon: Package, permission: "wallet.read" },
      { href: "/dashboard/payments", label: "Payments", icon: CreditCard, permission: "wallet.read" },
      { href: "/dashboard/transactions", label: "Transactions", icon: Receipt, permission: "wallet.read" },
    ],
  },
  {
    title: "Developers",
    items: [
      { href: "/dashboard/api-keys", label: "API Keys", icon: KeyRound, permission: "api_key.read" },
      { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook, permission: "webhook.manage" },
      { href: "/dashboard/api-docs", label: "API Documentation", icon: BookOpen },
      { href: "/dashboard/sandbox", label: "Sandbox Guide", icon: FlaskConical },
    ],
  },
  {
    title: "Security",
    items: [
      { href: "/dashboard/security/sessions", label: "Sessions", icon: Monitor },
      { href: "/dashboard/security", label: "Security Settings", icon: ShieldCheck },
    ],
  },
  {
    title: "Organization",
    items: [
      { href: "/dashboard/organization", label: "Organization", icon: Building2, permission: "organization.read" },
      { href: "/dashboard/team", label: "Team Members", icon: UserCog, permission: "members.read" },
      { href: "/dashboard/roles", label: "Roles & Permissions", icon: Lock },
      { href: "/dashboard/audit", label: "Audit Logs", icon: ScrollText, permission: "audit.read" },
    ],
  },
];

export const ADMIN_NAV: NavSection[] = [
  { title: "Overview", items: [{ href: "/admin/overview", label: "Overview", icon: LayoutDashboard }] },
  {
    title: "Organizations",
    items: [
      { href: "/admin/organizations", label: "Organizations", icon: Building },
      { href: "/admin/sender-id-requests", label: "Sender ID Requests", icon: ClipboardList },
      { href: "/admin/users", label: "Users", icon: UserCog },
    ],
  },
  {
    title: "Messaging",
    items: [{ href: "/admin/messages", label: "Messages", icon: MessageSquare }],
  },
  {
    title: "Platform",
    items: [
      { href: "/admin/providers", label: "Providers", icon: Server },
      { href: "/admin/pricing", label: "Pricing Plans", icon: CreditCard },
      { href: "/admin/packages", label: "SMS Packages", icon: Package },
      { href: "/admin/roles", label: "Roles & Permissions", icon: Lock },
      { href: "/admin/fraud", label: "Fraud", icon: ShieldAlert },
      { href: "/admin/simulator", label: "Simulator", icon: FlaskConical },
      { href: "/admin/simulator/scenarios", label: "Simulator Scenarios", icon: FlaskConical },
      { href: "/admin/simulator/executions", label: "Simulator Executions", icon: Activity },
    ],
  },
  {
    title: "Compliance",
    items: [{ href: "/admin/audit-log", label: "System Audit Log", icon: ScrollText }],
  },
  {
    title: "System",
    items: [
      { href: "/admin/queues", label: "Queues", icon: ListChecks },
      { href: "/admin/outbox", label: "Outbox", icon: Inbox },
      { href: "/admin/system-health", label: "System Health", icon: HeartPulse },
      { href: "/admin/settings", label: "Settings", icon: SlidersHorizontal },
    ],
  },
];
