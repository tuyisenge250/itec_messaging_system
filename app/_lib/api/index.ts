import { apiFetch } from "../api-client";
import type * as T from "./types";

function qs(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][];
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}

// --- auth ---
export const authApi = {
  me: () => apiFetch<T.CurrentUser>("/api/auth/me"),
  login: (email: string, password: string) => apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string) =>
    apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) }),
  logout: () => apiFetch("/api/auth/logout", { method: "POST" }),
  sessions: () => apiFetch<{ sessions: T.Session[] }>("/api/auth/sessions"),
  revokeSession: (id: string) => apiFetch(`/api/auth/sessions/${id}`, { method: "DELETE" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
};

export const rolesApi = {
  list: () => apiFetch<{ roles: Array<{ id: string; name: string; description: string | null; permissions: string[] }> }>("/api/roles"),
};

// --- organizations ---
export const orgApi = {
  create: (legalName: string) => apiFetch<T.CreatedOrganization>("/api/organizations", { method: "POST", body: JSON.stringify({ legalName }) }),
  get: (id: string) => apiFetch<T.Organization>(`/api/organizations/${id}`),
  update: (id: string, data: Partial<T.Organization>) => apiFetch<T.Organization>(`/api/organizations/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  submit: (id: string) => apiFetch<T.Organization>(`/api/organizations/${id}/submit`, { method: "POST" }),
  members: (id: string) => apiFetch<{ members: T.Member[] }>(`/api/organizations/${id}/members`),
  createMember: (id: string, email: string, roleId: string, name?: string) =>
    apiFetch<{ membership: T.Member; temporaryPassword: string | null }>(`/api/organizations/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ email, roleId, name }),
    }),
  updateMemberRole: (id: string, membershipId: string, roleId: string) =>
    apiFetch(`/api/organizations/${id}/members/${membershipId}`, { method: "PATCH", body: JSON.stringify({ roleId }) }),
  removeMember: (id: string, membershipId: string) => apiFetch(`/api/organizations/${id}/members/${membershipId}`, { method: "DELETE" }),
  resetMemberPassword: (id: string, membershipId: string) =>
    apiFetch<{ temporaryPassword: string }>(`/api/organizations/${id}/members/${membershipId}/reset-password`, { method: "POST" }),
  auditLogs: (id: string, cursor?: string) => apiFetch<{ events: T.AuditEvent[] }>(`/api/organizations/${id}/audit-logs${qs({ cursor })}`),
  roles: (id: string) => apiFetch<T.OrgRolesResponse>(`/api/organizations/${id}/roles`),
  createRole: (id: string, data: { name: string; description?: string; permissionCodes: string[] }) =>
    apiFetch<T.OrgRole>(`/api/organizations/${id}/roles`, { method: "POST", body: JSON.stringify(data) }),
  updateRole: (id: string, roleId: string, data: { name?: string; description?: string; permissionCodes?: string[] }) =>
    apiFetch<T.OrgRole>(`/api/organizations/${id}/roles/${roleId}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteRole: (id: string, roleId: string) => apiFetch(`/api/organizations/${id}/roles/${roleId}`, { method: "DELETE" }),
  erase: (id: string, reason: string, confirmName: string) =>
    apiFetch<{ erased: boolean }>(`/api/organizations/${id}/erase`, { method: "POST", body: JSON.stringify({ reason, confirmName }) }),
};

// --- dashboard ---
export const dashboardApi = {
  summary: (environment: T.Environment) => apiFetch<T.DashboardSummary>(`/api/dashboard/summary${qs({ environment })}`),
};

// --- sandbox ---
export const sandboxApi = {
  testNumbers: () => apiFetch<T.SandboxInfo>("/api/sandbox/test-numbers"),
};

// --- messages ---
export const messagesApi = {
  list: (environment: T.Environment, status?: string, cursor?: string) =>
    apiFetch<{ messages: T.Message[] }>(`/api/messages${qs({ environment, status, cursor })}`),
  get: (id: string) => apiFetch<T.Message>(`/api/messages/${id}`),
  recipients: (id: string, cursor?: string) => apiFetch<{ recipients: T.MessageRecipient[] }>(`/api/messages/${id}/recipients${qs({ cursor })}`),
  recipientTransactions: (recipientId: string) =>
    apiFetch<{ transactions: Array<{ id: string; providerCode: string; status: string; attempt: number; providerMessageId: string | null; createdAt: string }> }>(
      `/api/recipients/${recipientId}/provider-transactions`,
    ),
  send: (
    environment: T.Environment,
    data: { senderIdId: string; recipients: string[]; content: string; clientReference?: string; scheduledAt?: string },
    idempotencyKey?: string,
  ) =>
    apiFetch<{ message: T.Message; acceptedRecipients: number; rejectedRecipients: number }>(`/api/messages${qs({ environment })}`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    }),
  cancel: (id: string) => apiFetch<T.Message>(`/api/messages/${id}/cancel`, { method: "POST" }),
  estimate: (environment: T.Environment, content: string, recipientCount: number) =>
    apiFetch<T.MessageEstimate>(`/api/messages/estimate${qs({ environment })}`, { method: "POST", body: JSON.stringify({ content, recipientCount }) }),
};

// --- sender ids ---
export const senderIdsApi = {
  listRequests: () => apiFetch<{ senderIdRequests: T.SenderIdRequest[] }>("/api/sender-ids"),
  getRequest: (id: string) => apiFetch<T.SenderIdRequest>(`/api/sender-ids/${id}`),
  createRequest: (data: { requestedValue: string; environment: T.Environment; purpose?: string; sampleMessageContent?: string }) =>
    apiFetch<T.SenderIdRequest>("/api/sender-ids", { method: "POST", body: JSON.stringify(data) }),
  updateRequest: (id: string, data: { purpose?: string; sampleMessageContent?: string }) =>
    apiFetch<T.SenderIdRequest>(`/api/sender-ids/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  submitRequest: (id: string) => apiFetch<T.SenderIdRequest>(`/api/sender-ids/${id}/submit`, { method: "POST" }),
  active: () => apiFetch<{ senderIds: T.SenderId[] }>("/api/sender-ids/active"),
};

// --- documents ---
export const documentsApi = {
  requirements: (appliesTo?: "ORGANIZATION" | "SENDER_ID") =>
    apiFetch<{ requirements: T.DocumentRequirement[] }>(`/api/document-requirements${qs({ appliesTo })}`),
  list: (organizationId: string, senderIdRequestId?: string) =>
    apiFetch<{ documents: T.Document[] }>(`/api/organizations/${organizationId}/documents${qs({ senderIdRequestId })}`),
  upload: (organizationId: string, file: File, documentRequirementCode: string, senderIdRequestId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("documentRequirementCode", documentRequirementCode);
    if (senderIdRequestId) formData.append("senderIdRequestId", senderIdRequestId);
    return apiFetch<T.Document>(`/api/organizations/${organizationId}/documents`, { method: "POST", body: formData });
  },
  delete: (id: string) => apiFetch(`/api/documents/${id}`, { method: "DELETE" }),
};

// --- contacts ---
export const contactsApi = {
  list: (cursor?: string) => apiFetch<{ contacts: T.Contact[] }>(`/api/contacts${qs({ cursor })}`),
  create: (data: { phoneNumber: string; firstName?: string; lastName?: string; email?: string }) =>
    apiFetch<T.Contact>("/api/contacts", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ firstName: string; lastName: string; email: string; isSubscribed: boolean }>) =>
    apiFetch<T.Contact>(`/api/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/api/contacts/${id}`, { method: "DELETE" }),
  groups: () => apiFetch<{ groups: T.ContactGroup[] }>("/api/contact-groups"),
  createGroup: (name: string, description?: string) =>
    apiFetch<T.ContactGroup>("/api/contact-groups", { method: "POST", body: JSON.stringify({ name, description }) }),
  groupMembers: (groupId: string) => apiFetch<{ members: Array<{ contact: T.Contact }> }>(`/api/contact-groups/${groupId}/members`),
  addToGroup: (groupId: string, contactId: string) =>
    apiFetch(`/api/contact-groups/${groupId}/members`, { method: "POST", body: JSON.stringify({ contactId }) }),
  import: (file: File, groupId?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (groupId) formData.append("groupId", groupId);
    return apiFetch<T.ImportContactsResult>("/api/contacts/import", { method: "POST", body: formData });
  },
  removeFromGroup: (groupId: string, contactId: string) => apiFetch(`/api/contact-groups/${groupId}/members/${contactId}`, { method: "DELETE" }),
};

// --- templates ---
export const templatesApi = {
  list: () => apiFetch<{ templates: T.Template[] }>("/api/templates"),
  create: (data: { name: string; content: string; category?: string }) => apiFetch<T.Template>("/api/templates", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ name: string; content: string; category: string; isActive: boolean }>) =>
    apiFetch<T.Template>(`/api/templates/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/api/templates/${id}`, { method: "DELETE" }),
};

// --- campaigns ---
export const campaignsApi = {
  list: () => apiFetch<{ campaigns: T.Campaign[] }>("/api/campaigns"),
  get: (id: string) => apiFetch<T.Campaign>(`/api/campaigns/${id}`),
  create: (
    environment: T.Environment,
    data: {
      name: string;
      senderIdId: string;
      templateId: string;
      contactGroupId: string;
      batchSize?: number;
      scheduledAt?: string;
      isRecurring?: boolean;
      recurrenceInterval?: "DAILY" | "WEEKLY" | "MONTHLY";
      recurrenceEndAt?: string;
    },
  ) => apiFetch<T.Campaign>(`/api/campaigns${qs({ environment })}`, { method: "POST", body: JSON.stringify(data) }),
  send: (id: string) => apiFetch<T.Campaign>(`/api/campaigns/${id}/send`, { method: "POST" }),
  cancel: (id: string) => apiFetch<T.Campaign>(`/api/campaigns/${id}/cancel`, { method: "POST" }),
};

// --- wallet / billing ---
export const walletApi = {
  get: (environment: T.Environment) => apiFetch<T.Wallet>(`/api/wallet${qs({ environment })}`),
  transactions: (environment: T.Environment, cursor?: string) =>
    apiFetch<{ transactions: T.LedgerEntry[] }>(`/api/wallet/transactions${qs({ environment, cursor })}`),
  usage: (environment: T.Environment) => apiFetch<{ usage: T.LedgerEntry[]; totalSpentMinorUnits: number }>(`/api/wallet/usage${qs({ environment })}`),
  packages: () => apiFetch<{ packages: T.SmsPackage[] }>("/api/packages"),
  paymentIntents: (environment: T.Environment) => apiFetch<{ paymentIntents: T.PaymentIntent[] }>(`/api/payment-intents${qs({ environment })}`),
  buy: (environment: T.Environment, packageId: string, idempotencyKey: string) =>
    apiFetch<T.PaymentIntent>("/api/payment-intents", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ environment, packageId }),
    }),
};

// --- api keys ---
export const apiKeysApi = {
  list: () => apiFetch<{ apiKeys: T.ApiKey[] }>("/api/api-keys"),
  create: (data: { name: string; environment: T.Environment; scopes: string[] }) =>
    apiFetch<T.ApiKey & { token: string }>("/api/api-keys", { method: "POST", body: JSON.stringify(data) }),
  rotate: (id: string) => apiFetch<T.ApiKey & { token: string }>(`/api/api-keys/${id}/rotate`, { method: "POST" }),
  revoke: (id: string) => apiFetch(`/api/api-keys/${id}/revoke`, { method: "POST" }),
};

// --- webhooks ---
export const webhooksApi = {
  list: () => apiFetch<{ webhooks: T.Webhook[] }>("/api/webhook-endpoints"),
  create: (data: { environment: T.Environment; url: string; events: string[] }) =>
    apiFetch<T.Webhook & { secret: string }>("/api/webhook-endpoints", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<{ url: string; events: string[]; isActive: boolean }>) =>
    apiFetch<T.Webhook>(`/api/webhook-endpoints/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/api/webhook-endpoints/${id}`, { method: "DELETE" }),
  deliveries: (id: string) => apiFetch<{ deliveries: T.WebhookDelivery[] }>(`/api/webhook-endpoints/${id}/deliveries`),
};

// --- admin ---
export const adminApi = {
  summary: () => apiFetch<T.PlatformSummary>("/api/admin/summary"),
  organizations: (status?: string) => apiFetch<{ organizations: T.Organization[] }>(`/api/admin/organizations${qs({ status })}`),
  organization: (id: string) => apiFetch<T.OrganizationDetail>(`/api/admin/organizations/${id}`),
  orgAction: (id: string, action: "approve" | "reject" | "activate" | "suspend") =>
    apiFetch<T.Organization>(`/api/admin/organizations/${id}/${action}`, { method: "POST" }),
  actAsOrganization: (id: string) =>
    apiFetch<{ organizationId: string; organizationName: string }>(`/api/admin/organizations/${id}/act-as`, { method: "POST" }),
  orgMembers: (id: string) => apiFetch<{ members: T.Member[] }>(`/api/admin/organizations/${id}/members`),
  orgDocuments: (id: string) => apiFetch<{ documents: T.Document[] }>(`/api/admin/organizations/${id}/documents`),
  orgSenderIds: (id: string) => apiFetch<{ requests: T.SenderIdRequest[]; active: T.SenderId[] }>(`/api/admin/organizations/${id}/sender-ids`),
  suspendSenderId: (senderId: string) => apiFetch<T.SenderId>(`/api/admin/sender-ids/${senderId}/suspend`, { method: "POST" }),
  activateSenderId: (senderId: string) => apiFetch<T.SenderId>(`/api/admin/sender-ids/${senderId}/activate`, { method: "POST" }),
  orgWalletTransactions: (id: string, environment: T.Environment, cursor?: string) =>
    apiFetch<{ transactions: T.LedgerEntry[] }>(`/api/admin/organizations/${id}/wallet-transactions${qs({ environment, cursor })}`),
  orgMessages: (id: string, status?: string, cursor?: string) =>
    apiFetch<{ messages: T.Message[] }>(`/api/admin/organizations/${id}/messages${qs({ status, cursor })}`),
  orgCampaigns: (id: string) => apiFetch<{ campaigns: T.Campaign[] }>(`/api/admin/organizations/${id}/campaigns`),
  orgApiKeys: (id: string) => apiFetch<{ apiKeys: T.ApiKey[] }>(`/api/admin/organizations/${id}/api-keys`),
  orgWebhooks: (id: string) => apiFetch<{ webhooks: T.Webhook[] }>(`/api/admin/organizations/${id}/webhooks`),
  orgPayments: (id: string, environment?: T.Environment) =>
    apiFetch<{ paymentIntents: T.PaymentIntent[] }>(`/api/admin/organizations/${id}/payments${qs({ environment })}`),
  senderIdRequests: (status?: string) => apiFetch<{ senderIdRequests: T.SenderIdRequest[] }>(`/api/admin/sender-id-requests${qs({ status })}`),
  review: (id: string, toStatus: string, notes?: string) =>
    apiFetch<T.SenderIdRequest>(`/api/sender-ids/${id}/review`, { method: "POST", body: JSON.stringify({ toStatus, notes }) }),
  approveSenderId: (id: string) => apiFetch(`/api/admin/sender-id-requests/${id}/approve`, { method: "POST" }),
  rejectSenderId: (id: string) => apiFetch(`/api/admin/sender-id-requests/${id}/reject`, { method: "POST" }),
  reviewDocument: (id: string, decision: "approve" | "reject") => apiFetch(`/api/admin/documents/${id}/${decision}`, { method: "POST" }),
  messages: (status?: string) => apiFetch<{ messages: T.Message[] }>(`/api/admin/messages${qs({ status })}`),
  fraudEvents: (status?: string, organizationId?: string) => apiFetch<{ events: T.FraudEvent[] }>(`/api/admin/fraud-events${qs({ status, organizationId })}`),
  reviewFraudEvent: (id: string, decision: "RESOLVED" | "DISMISSED") =>
    apiFetch(`/api/admin/fraud-events/${id}/review`, { method: "POST", body: JSON.stringify({ decision }) }),
  fraudRules: () => apiFetch<{ rules: T.FraudRule[] }>("/api/admin/fraud-rules"),
  auditLogs: (cursor?: string, organizationId?: string) => apiFetch<{ events: T.AuditEvent[] }>(`/api/admin/audit-logs${qs({ cursor, organizationId })}`),
  walletAdjust: (organizationId: string, environment: T.Environment, amountMinorUnits: number, description: string) =>
    apiFetch(`/api/admin/organizations/${organizationId}/wallet/adjust`, {
      method: "POST",
      body: JSON.stringify({ environment, amountMinorUnits, description }),
    }),
  resetUserPassword: (userId: string, password: string) =>
    apiFetch(`/api/admin/users/${userId}/reset-password`, { method: "POST", body: JSON.stringify({ password }) }),
  users: (search?: string, status?: string, isPlatformAdmin?: boolean, cursor?: string) =>
    apiFetch<{ users: T.AdminUser[] }>(`/api/admin/users${qs({ search, status, isPlatformAdmin: isPlatformAdmin === undefined ? undefined : String(isPlatformAdmin), cursor })}`),
  user: (id: string) => apiFetch<T.AdminUserDetail>(`/api/admin/users/${id}`),
  createUser: (email: string, name: string | undefined, isPlatformAdmin: boolean) =>
    apiFetch<{ user: T.AdminUser; temporaryPassword: string }>("/api/admin/users", { method: "POST", body: JSON.stringify({ email, name, isPlatformAdmin }) }),
  setUserStatus: (id: string, status: "ACTIVE" | "DISABLED") =>
    apiFetch<T.AdminUser>(`/api/admin/users/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }),
  setPlatformAdmin: (id: string, isPlatformAdmin: boolean) =>
    apiFetch<T.AdminUser>(`/api/admin/users/${id}/platform-admin`, { method: "POST", body: JSON.stringify({ isPlatformAdmin }) }),
  userSessions: (id: string) => apiFetch<{ sessions: T.Session[] }>(`/api/admin/users/${id}/sessions`),
  revokeUserSession: (id: string, sessionId: string) => apiFetch(`/api/admin/users/${id}/sessions/${sessionId}`, { method: "DELETE" }),
  userActivity: (id: string, cursor?: string) => apiFetch<{ events: T.AuditEvent[] }>(`/api/admin/users/${id}/activity${qs({ cursor })}`),
  providers: () => apiFetch<{ providers: T.ProviderConfig[] }>("/api/admin/providers"),
  createProvider: (data: Partial<T.ProviderConfig> & { providerType: string; providerCode: string; displayName: string; environment: T.Environment }) =>
    apiFetch<T.ProviderConfig>("/api/admin/providers", { method: "POST", body: JSON.stringify(data) }),
  updateProvider: (id: string, data: Partial<T.ProviderConfig>) =>
    apiFetch<T.ProviderConfig>(`/api/admin/providers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  providerCredentials: (id: string) => apiFetch<{ credentials: T.ProviderCredential[] }>(`/api/admin/providers/${id}/credentials`),
  createProviderCredential: (id: string, key: string, value: string, expiresAt?: string) =>
    apiFetch<T.ProviderCredential>(`/api/admin/providers/${id}/credentials`, { method: "POST", body: JSON.stringify({ key, value, expiresAt }) }),
  rotateProviderCredential: (id: string, credId: string, value: string) =>
    apiFetch<T.ProviderCredential>(`/api/admin/providers/${id}/credentials/${credId}/rotate`, { method: "POST", body: JSON.stringify({ value }) }),
  revokeProviderCredential: (id: string, credId: string) =>
    apiFetch<T.ProviderCredential>(`/api/admin/providers/${id}/credentials/${credId}/revoke`, { method: "POST" }),

  pricingPlans: () => apiFetch<{ plans: T.PricingPlan[] }>("/api/admin/pricing-plans"),
  createPricingPlan: (data: Partial<T.PricingPlan> & { name: string; pricePerSegmentMinorUnits: number }) =>
    apiFetch<T.PricingPlan>("/api/admin/pricing-plans", { method: "POST", body: JSON.stringify(data) }),
  updatePricingPlan: (id: string, data: Partial<T.PricingPlan>) =>
    apiFetch<T.PricingPlan>(`/api/admin/pricing-plans/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  packages: () => apiFetch<{ packages: T.SmsPackage[] }>("/api/admin/packages"),
  createPackage: (data: Partial<T.SmsPackage> & { name: string; priceMinorUnits: number; creditAmountMinorUnits: number }) =>
    apiFetch<T.SmsPackage>("/api/admin/packages", { method: "POST", body: JSON.stringify(data) }),
  updatePackage: (id: string, data: Partial<T.SmsPackage>) =>
    apiFetch<T.SmsPackage>(`/api/admin/packages/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  simulator: {
    scenarios: () => apiFetch<{ scenarios: T.SimulatorScenario[] }>("/api/admin/simulator/scenarios"),
    createScenario: (data: Partial<T.SimulatorScenario> & { name: string; environment: T.Environment; triggerType: string; initialProviderStatus: string; finalDeliveryStatus: string }) =>
      apiFetch<T.SimulatorScenario>("/api/admin/simulator/scenarios", { method: "POST", body: JSON.stringify(data) }),
    updateScenario: (id: string, data: Partial<T.SimulatorScenario>) =>
      apiFetch<T.SimulatorScenario>(`/api/admin/simulator/scenarios/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    deleteScenario: (id: string) => apiFetch(`/api/admin/simulator/scenarios/${id}`, { method: "DELETE" }),
    executions: () => apiFetch<{ executions: T.SimulatorExecution[] }>("/api/admin/simulator/executions"),
  },

  queues: () => apiFetch<{ queues: T.QueueStats[] }>("/api/admin/queues"),
  failedJobs: (queueName: string) => apiFetch<{ jobs: T.QueueJob[] }>(`/api/admin/queues/${queueName}/failed`),
  retryJob: (queueName: string, jobId: string) => apiFetch(`/api/admin/queues/${queueName}/jobs/${jobId}/retry`, { method: "POST" }),
  removeJob: (queueName: string, jobId: string) => apiFetch(`/api/admin/queues/${queueName}/jobs/${jobId}`, { method: "DELETE" }),
  pauseQueue: (queueName: string) => apiFetch(`/api/admin/queues/${queueName}/pause`, { method: "POST" }),
  resumeQueue: (queueName: string) => apiFetch(`/api/admin/queues/${queueName}/resume`, { method: "POST" }),

  outboxEvents: (status?: string, cursor?: string) => apiFetch<{ events: T.AdminOutboxEvent[] }>(`/api/admin/outbox${qs({ status, cursor })}`),
  retryOutboxEvent: (id: string) => apiFetch<T.AdminOutboxEvent>(`/api/admin/outbox/${id}/retry`, { method: "POST" }),

  systemHealth: () => apiFetch<T.SystemHealth>("/api/admin/system/health"),

  settings: () => apiFetch<{ settings: T.SystemSetting[] }>("/api/admin/settings"),
  updateSetting: (key: string, value: string) => apiFetch<T.SystemSetting>(`/api/admin/settings/${key}`, { method: "PATCH", body: JSON.stringify({ value }) }),

  notifications: (unreadOnly?: boolean, cursor?: string) =>
    apiFetch<{ notifications: T.AdminNotification[]; unreadCount: number }>(`/api/admin/notifications${qs({ unreadOnly: unreadOnly ? "true" : undefined, cursor })}`),
  markNotificationRead: (id: string) => apiFetch<T.AdminNotification>(`/api/admin/notifications/${id}/read`, { method: "POST" }),

  globalRoles: () => apiFetch<{ roles: T.OrgRole[] }>("/api/admin/roles"),
  updateGlobalRole: (id: string, permissionCodes: string[]) =>
    apiFetch<T.OrgRole>(`/api/admin/roles/${id}`, { method: "PATCH", body: JSON.stringify({ permissionCodes }) }),
};
