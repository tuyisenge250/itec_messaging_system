// Types mirroring the backend's API response shapes. Kept close to the
// Prisma models they represent but expressed as what actually crosses the
// wire (dates as ISO strings, no hashedSecret/tokenHash/etc.).

export type Environment = "SANDBOX" | "PRODUCTION";

export interface CurrentOrgMembership {
  organizationId: string;
  organizationName: string;
  organizationStatus: string;
  role: string;
  status: string;
  permissions: string[];
}

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
  organizations: CurrentOrgMembership[];
  /** Set only for a platform admin currently "viewing as" an organization they don't actually belong to. */
  actingOrganization: CurrentOrgMembership | null;
}

export interface Organization {
  id: string;
  legalName: string;
  tradingName: string | null;
  registrationNumber: string | null;
  tin: string | null;
  businessType: string | null;
  industry: string | null;
  description: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  legalRepresentativeName: string | null;
  legalRepresentativeEmail: string | null;
  legalRepresentativePhone: string | null;
  status: string;
  createdAt: string;
}

export interface SandboxOnboardingSummary {
  senderId: { id: string; value: string; status: string };
  initialCreditMinorUnits: number;
  apiKey: { id: string; name: string; plaintextToken: string };
}

/** Only present on the POST /api/organizations create response — a one-time reveal, never returned again. */
export interface CreatedOrganization extends Organization {
  sandboxOnboarding: SandboxOnboardingSummary | null;
}

export interface SandboxTestNumber {
  phoneNumber: string;
  name: string;
  description: string | null;
  initialProviderStatus: string;
  finalDeliveryStatus: string;
  delayMs: number;
}

export interface SandboxInfo {
  enabled: boolean;
  numberPrefix: string;
  initialCreditMinorUnits: number;
  defaultDeliveryDelayMs: number;
  senderPrefix: string;
  numbers: SandboxTestNumber[];
}

export interface Member {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  roleId: string;
  role: string;
  status: string;
  joinedAt: string | null;
}

export interface OrgRole {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissionCodes: string[];
}

export interface OrgRolesResponse {
  global: OrgRole[];
  custom: OrgRole[];
}

export interface OrganizationDetail extends Organization {
  wallets: Wallet[];
  pricingPlan: { id: string; name: string } | null;
  _count: { memberships: number; senderIds: number; apiKeys: number; documents: number };
}

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  status: string;
  isPlatformAdmin: boolean;
  createdAt: string;
  _count: { memberships: number };
}

export interface AdminUserDetail extends AdminUser {
  memberships: Array<{ organizationId: string; organizationName: string; role: string; status: string; joinedAt: string | null }>;
}

export interface Wallet {
  id: string;
  organizationId: string;
  environment: Environment;
  availableBalanceMinorUnits: number;
  reservedBalanceMinorUnits: number;
  currency: string;
  updatedAt: string;
}

export interface LedgerEntry {
  id: string;
  type: string;
  amountMinorUnits: number;
  balanceAfterMinorUnits: number;
  reservedAfterMinorUnits: number;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  createdAt: string;
}

export interface SmsPackage {
  id: string;
  name: string;
  description: string | null;
  priceMinorUnits: number;
  creditAmountMinorUnits: number;
  bonusMinorUnits: number;
  currency: string;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  pricePerSegmentMinorUnits: number;
  currency: string;
  isDefault: boolean;
  active: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentIntent {
  id: string;
  status: string;
  amountMinorUnits: number;
  currency: string;
  providerReference: string | null;
  createdAt: string;
  completedAt: string | null;
  package?: { name: string } | null;
}

export interface Message {
  id: string;
  organizationId: string;
  environment: Environment;
  senderIdId: string;
  type: string;
  status: string;
  content: string;
  clientReference: string | null;
  totalRecipients: number;
  queuedCount: number;
  processingCount: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  totalCostMinorUnits: number;
  currency: string;
  createdAt: string;
  recipients?: MessageRecipient[];
}

export interface MessageRecipient {
  id: string;
  messageId: string;
  phoneRaw: string;
  phoneNormalized: string;
  status: string;
  encoding: string;
  segmentCount: number;
  costMinorUnits: number;
  currency: string;
  providerMessageId: string | null;
  attempts: number;
  failureCode: string | null;
  failureReason: string | null;
  queuedAt: string | null;
  processingAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
}

export interface MessageEstimate {
  characterCount: number;
  encoding: string;
  segmentCount: number;
  costPerRecipientMinorUnits: number;
  totalEstimatedCostMinorUnits: number;
  currency: string;
  availableBalanceMinorUnits: number | null;
}

export interface SenderIdRequest {
  id: string;
  organizationId: string;
  environment: Environment;
  requestedValue: string;
  purpose: string | null;
  sampleMessageContent: string | null;
  status: string;
  internalReviewNotes: string | null;
  ruraReferenceNumber: string | null;
  createdAt: string;
  statusHistory?: Array<{ id: string; fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }>;
  documents?: Document[];
  organization?: { id: string; legalName: string };
}

export interface SenderId {
  id: string;
  organizationId: string;
  environment: Environment;
  value: string;
  status: string;
  activatedAt: string | null;
  suspendedAt: string | null;
  expiresAt: string | null;
}

export interface DocumentRequirement {
  id: string;
  code: string;
  label: string;
  description: string | null;
  appliesTo: "ORGANIZATION" | "SENDER_ID";
  required: boolean;
  allowedMimeTypes: string[];
  maxSizeBytes: number;
}

export interface Document {
  id: string;
  organizationId: string;
  senderIdRequestId: string | null;
  documentRequirementId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  reviewNotes: string | null;
  createdAt: string;
}

export interface Contact {
  id: string;
  organizationId: string;
  phoneRaw: string;
  phoneNormalized: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  isSubscribed: boolean;
  createdAt: string;
}

export interface ContactGroup {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface ImportContactsResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

export interface Template {
  id: string;
  organizationId: string;
  name: string;
  content: string;
  variables: string[];
  category: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface Campaign {
  id: string;
  organizationId: string;
  environment: Environment;
  name: string;
  templateId: string | null;
  senderIdId: string;
  contactGroupId: string | null;
  status: string;
  scheduledAt: string | null;
  isRecurring: boolean;
  recurrenceInterval: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  recurrenceEndAt: string | null;
  nextRunAt: string | null;
  batchSize: number;
  totalRecipients: number;
  createdAt: string;
  stats?: { queued: number; processing: number; sent: number; delivered: number; failed: number; totalCostMinorUnits: number };
}

export interface ApiKey {
  id: string;
  organizationId: string;
  environment: Environment;
  name: string;
  publicId: string;
  displayPrefix: string;
  scopes: string[];
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface Webhook {
  id: string;
  organizationId: string;
  environment: Environment;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  responseStatus: number | null;
  attempts: number;
  status: string;
  lastAttemptAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface FraudEvent {
  id: string;
  organizationId: string | null;
  eventType: string;
  severity: string;
  description: string;
  status: string;
  createdAt: string;
}

export interface FraudRule {
  id: string;
  name: string;
  description: string | null;
  ruleType: string;
  thresholdValue: number;
  windowSeconds: number | null;
  action: string;
  scope: string;
  organizationId: string | null;
  apiKeyId: string | null;
  enabled: boolean;
}

export interface ProviderConfig {
  id: string;
  providerType: string;
  providerCode: string;
  displayName: string;
  environment: Environment;
  isActive: boolean;
  priority: number;
  rateLimitPerSecond: number | null;
  maxConcurrency: number | null;
  timeoutMs: number | null;
  retryCount: number | null;
  backoffBaseMs: number | null;
  circuitBreakerFailureThreshold: number | null;
  circuitBreakerCooldownMs: number | null;
  settings: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderCredential {
  id: string;
  providerConfigId: string;
  key: string;
  status: string;
  expiresAt: string | null;
  rotatedAt: string | null;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  organizationId: string | null;
  actorType: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface SimulatorScenario {
  id: string;
  name: string;
  description: string | null;
  environment: Environment;
  triggerType: string;
  triggerValue: string | null;
  initialProviderStatus: string;
  finalDeliveryStatus: string;
  delayMs: number;
  probabilityPercent: number | null;
  enabled: boolean;
  priority: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface SimulatorExecution {
  id: string;
  scenario: { id: string; name: string } | null;
  recipientId: string;
  initialStatus: string;
  finalStatus: string | null;
  delayMsApplied: number;
  errorCode: string | null;
  executedAt: string;
}

export interface DashboardSummary {
  wallet: { availableBalanceMinorUnits: number; reservedBalanceMinorUnits: number; currency: string } | null;
  windowDays: number;
  totals: {
    messagesSent: number;
    messagesDelivered: number;
    messagesFailed: number;
    totalRecipients: number;
    deliveryRatePercent: number | null;
  };
  activeCampaigns: number;
  activeSenderIds: number;
  recentMessages: Array<Pick<Message, "id" | "content" | "status" | "totalRecipients" | "deliveredCount" | "failedCount"> & { createdAt: string }>;
  recentPayments: Array<Pick<PaymentIntent, "id" | "status" | "amountMinorUnits" | "currency" | "createdAt"> & { package: { name: string } | null }>;
  timeSeries: Array<{ date: string; sent: number; delivered: number; failed: number }>;
}

export interface PlatformSummary {
  date: string;
  messagesToday: {
    count: number;
    recipients: number;
    delivered: number;
    failed: number;
    deliveryRatePercent: number | null;
    costMinorUnits: number;
  };
  organizations: { total: number; active: number; pendingReview: number };
  senderIdRequestsPending: number;
  openFraudEvents: number;
}

export interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  isPaused: boolean;
}

export interface QueueJob {
  id: string | undefined;
  name: string;
  data: unknown;
  attemptsMade: number;
  failedReason: string;
  timestamp: number;
  processedOn: number | undefined;
  finishedOn: number | undefined;
}

export interface AdminOutboxEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  status: string;
  attempts: number;
  nextAttemptAt: string;
  publishedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface SystemHealthCheck {
  status: "HEALTHY" | "DEGRADED" | "DOWN";
  latencyMs: number;
  error?: string;
}

export interface SystemHealth {
  postgres: SystemHealthCheck;
  redis: SystemHealthCheck;
  queues: Array<QueueStats & { status: "HEALTHY" | "DEGRADED" }>;
  queuesError?: string;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

export interface AdminNotification {
  id: string;
  organizationId: string | null;
  type: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
}
