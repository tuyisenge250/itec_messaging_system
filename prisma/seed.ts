/**
 * Development/demo seed data. Safe to re-run (idempotent via upserts on
 * natural unique keys). Never seeds real secrets — every credential here is
 * a placeholder clearly marked for local development only.
 *
 * Run with: npm run db:seed
 */
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import * as argon2 from "argon2";
import { PermissionCode, ALL_PERMISSION_CODES } from "../shared/constants/permissions";
import { RoleName } from "../shared/constants/roles";
import { generateRandomToken, sha256Hex } from "../shared/utils/crypto";
import { sandboxTestNumber } from "../shared/utils/sandbox";
import { env } from "../infrastructure/config/env";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const DEV_PASSWORD = "DevPassword123!"; // seed-only, never used outside local dev

async function seedPermissions() {
  for (const code of ALL_PERMISSION_CODES) {
    await prisma.permission.upsert({ where: { code }, create: { code }, update: {} });
  }
  console.log(`✓ ${ALL_PERMISSION_CODES.length} permissions`);
}

const BASE_MEMBER: PermissionCode[] = [
  PermissionCode.ORGANIZATION_READ,
  PermissionCode.SMS_READ,
  PermissionCode.CAMPAIGN_READ,
  PermissionCode.WALLET_READ,
  PermissionCode.DOCUMENTS_READ,
  PermissionCode.SENDER_ID_READ,
  PermissionCode.CONTACTS_READ,
];
const OPERATOR: PermissionCode[] = [
  ...BASE_MEMBER,
  PermissionCode.SMS_SEND,
  PermissionCode.SMS_CANCEL,
  PermissionCode.CAMPAIGN_CREATE,
  PermissionCode.CAMPAIGN_SEND,
  PermissionCode.CAMPAIGN_CANCEL,
  PermissionCode.CONTACTS_MANAGE,
  PermissionCode.TEMPLATES_MANAGE,
  PermissionCode.SENDER_ID_REQUEST,
  PermissionCode.SENDER_ID_UPDATE,
  PermissionCode.SENDER_ID_SUBMIT,
  PermissionCode.DOCUMENTS_UPLOAD,
];
const DEVELOPER: PermissionCode[] = [
  ...OPERATOR,
  PermissionCode.API_KEY_CREATE,
  PermissionCode.API_KEY_READ,
  PermissionCode.API_KEY_REVOKE,
  PermissionCode.WEBHOOK_MANAGE,
];
const FINANCE: PermissionCode[] = [...BASE_MEMBER, PermissionCode.WALLET_PURCHASE];
const COMPLIANCE_OFFICER: PermissionCode[] = [
  ...BASE_MEMBER,
  PermissionCode.DOCUMENTS_UPLOAD,
  PermissionCode.SENDER_ID_REQUEST,
  PermissionCode.SENDER_ID_UPDATE,
  PermissionCode.SENDER_ID_SUBMIT,
];
const ORG_ADMIN: PermissionCode[] = Array.from(
  new Set([
    ...DEVELOPER,
    ...FINANCE,
    ...COMPLIANCE_OFFICER,
    PermissionCode.ORGANIZATION_UPDATE,
    PermissionCode.MEMBERS_READ,
    PermissionCode.MEMBERS_CREATE,
    PermissionCode.MEMBERS_UPDATE,
    PermissionCode.MEMBERS_REMOVE,
    PermissionCode.ROLES_MANAGE,
    // Org admins can see their own organization's audit trail — AUDIT_READ is
    // otherwise a platform-only permission (see shared/constants/permissions.ts);
    // modules/audit/service.ts::listAuditEventsForOrganization still enforces
    // assertOrganizationAccess, so this never crosses tenants.
    PermissionCode.AUDIT_READ,
    // GDPR-style self-service data export / account erasure for the org's own
    // data — org-assignable since this is the org's own principal data, not a
    // cross-tenant action (a platform admin can already do this for any org
    // via the isPlatformAdmin bypass).
    PermissionCode.ORGANIZATION_EXPORT_DATA,
    PermissionCode.ORGANIZATION_DELETE,
  ]),
);

// Platform-only permissions (documents.review, sender_id.approve, fraud.*, audit.read,
// provider.manage, simulator.manage, pricing.manage, admin.*, wallet.adjust, ...) are
// intentionally NOT granted to any organization role — a platform admin (User.isPlatformAdmin)
// bypasses the RolePermission check entirely. See modules/auth/services/authorization-service.ts.
const ROLE_PERMISSIONS: Record<RoleName, PermissionCode[]> = {
  [RoleName.SUPER_ADMIN]: ORG_ADMIN,
  [RoleName.ADMIN]: ORG_ADMIN,
  [RoleName.COMPLIANCE_OFFICER]: COMPLIANCE_OFFICER,
  [RoleName.FINANCE]: FINANCE,
  [RoleName.DEVELOPER]: DEVELOPER,
  [RoleName.OPERATOR]: OPERATOR,
  [RoleName.MEMBER]: BASE_MEMBER,
};

async function seedRoles() {
  const roles: Record<string, { id: string }> = {};
  for (const name of Object.values(RoleName)) {
    // Global system roles always have organizationId: null — that pair isn't a single
    // DB-enforced unique key (Postgres treats every NULL as distinct), so dedup here is
    // done at the application level, same as authRepository.findRoleByName relies on.
    const role =
      (await prisma.role.findFirst({ where: { name, organizationId: null } })) ??
      (await prisma.role.create({ data: { name, isSystem: true, description: `${name} role (seeded)` } }));
    roles[name] = role;

    const permissions = await prisma.permission.findMany({ where: { code: { in: ROLE_PERMISSIONS[name as RoleName] } } });
    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }
  console.log(`✓ ${Object.keys(roles).length} roles + role-permission grants`);
  return roles;
}

async function seedUsers() {
  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });

  const platformAdmin = await prisma.user.upsert({
    where: { email: "admin@smsgateway.dev" },
    create: {
      email: "admin@smsgateway.dev",
      passwordHash,
      name: "Platform Admin",
      isPlatformAdmin: true,
    },
    update: {},
  });

  const businessOwner = await prisma.user.upsert({
    where: { email: "owner@acmeltd.dev" },
    create: {
      email: "owner@acmeltd.dev",
      passwordHash,
      name: "Acme Business Owner",
    },
    update: {},
  });

  const developerUser = await prisma.user.upsert({
    where: { email: "dev@acmeltd.dev" },
    create: {
      email: "dev@acmeltd.dev",
      passwordHash,
      name: "Acme Developer",
    },
    update: {},
  });

  console.log(`✓ users (dev password for all seeded users: ${DEV_PASSWORD})`);
  return { platformAdmin, businessOwner, developerUser };
}

async function seedPricingAndPackages() {
  const defaultPlan = await prisma.pricingPlan.findFirst({ where: { isDefault: true } });
  const plan =
    defaultPlan ??
    (await prisma.pricingPlan.create({
      data: { name: "Standard", pricePerSegmentMinorUnits: 15, currency: "RWF", isDefault: true, active: true },
    }));

  const packages = [
    { name: "Starter — 1,000 SMS", priceMinorUnits: 15000, creditAmountMinorUnits: 15000, bonusMinorUnits: 0 },
    { name: "Growth — 10,000 SMS", priceMinorUnits: 140000, creditAmountMinorUnits: 150000, bonusMinorUnits: 10000 },
    { name: "Scale — 50,000 SMS", priceMinorUnits: 650000, creditAmountMinorUnits: 750000, bonusMinorUnits: 100000 },
  ];
  for (const pkg of packages) {
    const existing = await prisma.smsPackage.findFirst({ where: { name: pkg.name } });
    if (!existing) await prisma.smsPackage.create({ data: { ...pkg, currency: "RWF" } });
  }

  console.log("✓ pricing plan + SMS packages");
  return plan;
}

async function seedDocumentRequirements() {
  const requirements = [
    {
      code: "BUSINESS_REGISTRATION_CERTIFICATE",
      label: "Business Registration Certificate",
      appliesTo: "ORGANIZATION" as const,
      allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
    },
    {
      code: "TIN_CERTIFICATE",
      label: "TIN Certificate",
      appliesTo: "ORGANIZATION" as const,
      allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
    },
    {
      code: "REPRESENTATIVE_ID",
      label: "Legal Representative National ID",
      appliesTo: "ORGANIZATION" as const,
      allowedMimeTypes: ["application/pdf", "image/jpeg", "image/png"],
    },
    {
      code: "SENDER_ID_AUTHORIZATION_LETTER",
      label: "Sender ID Authorization Letter",
      appliesTo: "SENDER_ID" as const,
      allowedMimeTypes: ["application/pdf"],
    },
  ];
  for (const req of requirements) {
    await prisma.documentRequirement.upsert({ where: { code: req.code }, create: req, update: {} });
  }
  console.log(`✓ ${requirements.length} document requirements`);
}

async function seedOrganization(ownerId: string, pricingPlanId: string) {
  let organization = await prisma.organization.findFirst({ where: { legalName: "Acme Rwanda Ltd" } });
  if (!organization) {
    organization = await prisma.organization.create({
      data: {
        legalName: "Acme Rwanda Ltd",
        tradingName: "Acme",
        registrationNumber: "RW-DEV-000123",
        tin: "100000000",
        businessType: "Private Limited Company",
        industry: "Retail",
        description: "Seeded demo organization for local development.",
        city: "Kigali",
        country: "RW",
        phone: "+250788000000",
        email: "hello@acmeltd.dev",
        status: "ACTIVE",
        pricingPlanId,
      },
    });
  }

  const adminRole = await prisma.role.findFirstOrThrow({ where: { name: RoleName.ADMIN, organizationId: null } });
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: ownerId } },
    create: { organizationId: organization.id, userId: ownerId, roleId: adminRole.id, status: "ACTIVE", joinedAt: new Date() },
    update: {},
  });

  for (const environment of ["SANDBOX", "PRODUCTION"] as const) {
    await prisma.wallet.upsert({
      where: { organizationId_environment: { organizationId: organization.id, environment } },
      create: { organizationId: organization.id, environment },
      update: {},
    });
  }

  // Ledger-backed, not a raw balance write — every balance change must have a
  // WalletLedgerEntry (see modules/wallets/service.ts). Idempotent per wallet
  // via the same referenceType/referenceId marker onboarding-service.ts uses.
  await grantSeedWalletCredit(organization.id, "SANDBOX", env.SANDBOX_INITIAL_CREDIT_MINOR_UNITS, "BONUS", "Initial sandbox testing credits");
  await grantSeedWalletCredit(organization.id, "PRODUCTION", 100_000, "CREDIT", "Seed data — demo production balance");

  console.log("✓ organization + membership + wallets");
  return organization;
}

async function grantSeedWalletCredit(
  organizationId: string,
  environment: "SANDBOX" | "PRODUCTION",
  amountMinorUnits: number,
  type: "BONUS" | "CREDIT",
  description: string,
) {
  if (amountMinorUnits <= 0) return;
  const referenceId = `seed-${environment.toLowerCase()}-initial`;

  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { organizationId_environment: { organizationId, environment } } });
  const alreadyGranted = await prisma.walletLedgerEntry.findFirst({ where: { walletId: wallet.id, referenceType: "SYSTEM", referenceId } });
  if (alreadyGranted) return;

  const updated = await prisma.wallet.update({ where: { id: wallet.id }, data: { availableBalanceMinorUnits: { increment: amountMinorUnits } } });
  await prisma.walletLedgerEntry.create({
    data: {
      walletId: wallet.id,
      organizationId,
      type,
      amountMinorUnits,
      balanceAfterMinorUnits: updated.availableBalanceMinorUnits,
      reservedAfterMinorUnits: updated.reservedBalanceMinorUnits,
      referenceType: "SYSTEM",
      referenceId,
      description,
    },
  });
}

async function addDeveloperMembership(organizationId: string, userId: string) {
  const developerRole = await prisma.role.findFirstOrThrow({ where: { name: RoleName.DEVELOPER, organizationId: null } });
  await prisma.organizationMembership.upsert({
    where: { organizationId_userId: { organizationId, userId } },
    create: { organizationId, userId, roleId: developerRole.id, status: "ACTIVE", joinedAt: new Date() },
    update: {},
  });
}

async function seedSenderId(organizationId: string) {
  for (const environment of ["SANDBOX", "PRODUCTION"] as const) {
    const value = environment === "SANDBOX" ? "ACMETEST" : "ACME";
    const existing = await prisma.senderId.findUnique({ where: { organizationId_value_environment: { organizationId, value, environment } } });
    if (!existing) {
      await prisma.senderId.create({
        data: { organizationId, environment, value, status: "ACTIVE", activatedAt: new Date() },
      });
    }
  }
  console.log("✓ sender IDs (ACMETEST/sandbox, ACME/production)");
}

async function seedContacts(organizationId: string) {
  const contacts = [
    { phoneRaw: "+250788000001", phoneNormalized: "+250788000001", firstName: "Alice", lastName: "Uwase" },
    { phoneRaw: "+250788000002", phoneNormalized: "+250788000002", firstName: "Bob", lastName: "Mugisha" },
    { phoneRaw: "+250788000003", phoneNormalized: "+250788000003", firstName: "Claire", lastName: "Ingabire" },
  ];
  const created = [];
  for (const c of contacts) {
    const contact = await prisma.contact.upsert({
      where: { organizationId_phoneNormalized: { organizationId, phoneNormalized: c.phoneNormalized } },
      create: { organizationId, ...c },
      update: {},
    });
    created.push(contact);
  }

  let group = await prisma.contactGroup.findFirst({ where: { organizationId, name: "All Demo Contacts" } });
  if (!group) {
    group = await prisma.contactGroup.create({ data: { organizationId, name: "All Demo Contacts", description: "Seeded demo group" } });
  }
  for (const contact of created) {
    await prisma.contactGroupMember.upsert({
      where: { contactGroupId_contactId: { contactGroupId: group.id, contactId: contact.id } },
      create: { contactGroupId: group.id, contactId: contact.id },
      update: {},
    });
  }
  console.log("✓ contacts + contact group");
}

async function seedTemplates(organizationId: string) {
  const templates = [
    { name: "OTP Code", content: "Your Acme verification code is {{code}}. It expires in 5 minutes.", category: "otp" },
    { name: "Order Confirmation", content: "Hi {{name}}, your order #{{orderId}} has been confirmed.", category: "transactional" },
    { name: "Promo Blast", content: "Acme Sale! Get 20% off this weekend only. Reply STOP to opt out.", category: "marketing" },
  ];
  for (const t of templates) {
    const existing = await prisma.template.findUnique({ where: { organizationId_name: { organizationId, name: t.name } } });
    if (!existing) {
      const variables = Array.from(t.content.matchAll(/\{\{(\w+)\}\}/g)).map((m) => m[1]);
      await prisma.template.create({ data: { organizationId, ...t, variables } });
    }
  }
  console.log("✓ templates");
}

async function seedProviderConfig() {
  for (const environment of ["SANDBOX", "PRODUCTION"] as const) {
    await prisma.providerConfig.upsert({
      where: { providerCode_environment_providerType: { providerCode: "simulator", environment, providerType: "SMS" } },
      create: {
        providerType: "SMS",
        providerCode: "simulator",
        displayName: "Simulated SMS Provider",
        environment,
        isActive: true,
        priority: 100,
        rateLimitPerSecond: 20,
        maxConcurrency: 10,
        timeoutMs: 10_000,
        retryCount: 3,
        backoffBaseMs: 2000,
        circuitBreakerFailureThreshold: 5,
        circuitBreakerCooldownMs: 30_000,
      },
      update: {},
    });
    await prisma.providerConfig.upsert({
      where: { providerCode_environment_providerType: { providerCode: "simulator", environment, providerType: "PAYMENT" } },
      create: {
        providerType: "PAYMENT",
        providerCode: "simulator",
        displayName: "Simulated Payment Provider",
        environment,
        isActive: true,
        priority: 100,
      },
      update: {},
    });
  }
  console.log("✓ provider configs (SMS + PAYMENT simulator, both environments)");
}

/**
 * Documented sandbox test-number table (docs/sandbox.md, GET
 * /api/sandbox/test-numbers) — deterministic PHONE_NUMBER-triggered
 * scenarios so a developer can reliably exercise every recipient outcome
 * without waiting on random chance. #008 (retry-then-delivered) is not
 * listed here: its "timeout twice, then succeed" behaviour depends on
 * attempt count, which a static scenario row can't express — it's
 * implemented directly in modules/simulator/simulator-sms-provider.ts, and
 * falls through to a plain ACCEPTED/DELIVERED scenario row here once it
 * reaches its final attempt, so it still gets its own SimulatorExecution
 * history like every other number.
 */
async function seedSandboxTestNumberScenarios(adminUserId: string) {
  const rows: Array<{ suffix: string; name: string; description: string; scenario: Partial<Parameters<typeof prisma.simulatorScenario.create>[0]["data"]> }> = [
    {
      suffix: "001",
      name: "Sandbox test number — delivered",
      description: "Always accepted and delivered.",
      scenario: { initialProviderStatus: "ACCEPTED", finalDeliveryStatus: "DELIVERED", delayMs: env.SANDBOX_DEFAULT_DELIVERY_DELAY_MS },
    },
    {
      suffix: "002",
      name: "Sandbox test number — failed",
      description: "Accepted by the provider, then fails at delivery.",
      scenario: {
        initialProviderStatus: "ACCEPTED",
        finalDeliveryStatus: "FAILED",
        errorCode: "DEST_UNREACHABLE",
        errorMessage: "Simulated: destination handset unreachable",
        delayMs: 1500,
      },
    },
    {
      suffix: "003",
      name: "Sandbox test number — expired",
      description: "Accepted, but the delivery attempt expires before confirmation.",
      scenario: { initialProviderStatus: "ACCEPTED", finalDeliveryStatus: "EXPIRED", errorCode: "VALIDITY_EXPIRED", errorMessage: "Simulated: message validity period expired", delayMs: 2000 },
    },
    {
      suffix: "004",
      name: "Sandbox test number — undelivered",
      description: "Rejected immediately by the simulated provider.",
      scenario: {
        initialProviderStatus: "REJECTED",
        finalDeliveryStatus: "UNDELIVERED",
        errorCode: "INVALID_DESTINATION",
        errorMessage: "Simulated: provider rejected the destination",
        delayMs: 0,
      },
    },
    {
      suffix: "005",
      name: "Sandbox test number — delayed delivery",
      description: "Delivered, but only after a long delay — useful for testing UI polling/loading states.",
      scenario: { initialProviderStatus: "ACCEPTED", finalDeliveryStatus: "DELIVERED", delayMs: 15_000 },
    },
    {
      suffix: "006",
      name: "Sandbox test number — provider timeout",
      description: "The simulated provider call times out.",
      scenario: { initialProviderStatus: "TIMEOUT", finalDeliveryStatus: "UNDELIVERED", errorMessage: "Simulated: provider call timed out", delayMs: 0 },
    },
    {
      suffix: "007",
      name: "Sandbox test number — provider unavailable",
      description: "The simulated provider is unavailable.",
      scenario: { initialProviderStatus: "UNAVAILABLE", finalDeliveryStatus: "UNDELIVERED", errorCode: "PROVIDER_UNAVAILABLE", errorMessage: "Simulated: provider unavailable", delayMs: 0 },
    },
    {
      suffix: "008",
      name: "Sandbox test number — retry then delivered",
      description: "Times out twice, then is accepted and delivered on the 3rd attempt (exercises modules/messaging/send-processor.ts retry handling).",
      scenario: { initialProviderStatus: "ACCEPTED", finalDeliveryStatus: "DELIVERED", delayMs: env.SANDBOX_DEFAULT_DELIVERY_DELAY_MS },
    },
  ];

  for (const row of rows) {
    const triggerValue = sandboxTestNumber(row.suffix);
    const existing = await prisma.simulatorScenario.findFirst({ where: { name: row.name, environment: "SANDBOX" } });
    if (!existing) {
      await prisma.simulatorScenario.create({
        data: {
          environment: "SANDBOX",
          name: row.name,
          description: row.description,
          triggerType: "PHONE_NUMBER",
          triggerValue,
          enabled: true,
          priority: 100,
          createdByUserId: adminUserId,
          ...row.scenario,
        } as Parameters<typeof prisma.simulatorScenario.create>[0]["data"],
      });
    }
  }
  console.log(`✓ ${rows.length} sandbox test-number scenarios (${sandboxTestNumber("001")}..${sandboxTestNumber("008")})`);
}

async function seedSimulatorScenarios(adminUserId: string) {
  const scenarios: Array<Parameters<typeof prisma.simulatorScenario.create>[0]["data"]> = [
    {
      environment: "SANDBOX",
      name: "Successful delivery (default)",
      description: "Catch-all: everything not matched by a more specific scenario is accepted and delivered.",
      triggerType: "RANDOM_PERCENTAGE",
      probabilityPercent: 100,
      initialProviderStatus: "ACCEPTED",
      finalDeliveryStatus: "DELIVERED",
      delayMs: env.SANDBOX_DEFAULT_DELIVERY_DELAY_MS,
      enabled: true,
      priority: 0,
      createdByUserId: adminUserId,
    },
    {
      environment: "SANDBOX",
      name: "Known failing test number",
      description: "+250788000099 always fails delivery — for testing failure handling.",
      triggerType: "PHONE_NUMBER",
      triggerValue: "+250788000099",
      initialProviderStatus: "ACCEPTED",
      finalDeliveryStatus: "FAILED",
      errorCode: "DEST_UNREACHABLE",
      errorMessage: "Simulated: destination handset unreachable",
      delayMs: 1500,
      enabled: true,
      priority: 50,
      createdByUserId: adminUserId,
    },
    {
      environment: "SANDBOX",
      name: "Rejected test number",
      description: "+250788000098 is rejected immediately by the simulated provider.",
      triggerType: "PHONE_NUMBER",
      triggerValue: "+250788000098",
      initialProviderStatus: "REJECTED",
      finalDeliveryStatus: "UNDELIVERED",
      errorCode: "INVALID_DESTINATION",
      errorMessage: "Simulated: provider rejected the destination",
      delayMs: 0,
      enabled: true,
      priority: 50,
      createdByUserId: adminUserId,
    },
    {
      environment: "SANDBOX",
      name: "Provider timeout test number",
      description: "+250788000097 simulates a provider call timeout.",
      triggerType: "PHONE_NUMBER",
      triggerValue: "+250788000097",
      initialProviderStatus: "TIMEOUT",
      finalDeliveryStatus: "UNDELIVERED",
      errorMessage: "Simulated: provider call timed out",
      delayMs: 0,
      enabled: true,
      priority: 50,
      createdByUserId: adminUserId,
    },
    {
      environment: "SANDBOX",
      name: "Random 10% delivery failure",
      description: "Applies a 10% random failure rate for realistic testing at scale.",
      triggerType: "RANDOM_PERCENTAGE",
      probabilityPercent: 10,
      initialProviderStatus: "ACCEPTED",
      finalDeliveryStatus: "FAILED",
      errorCode: "NETWORK_ERROR",
      errorMessage: "Simulated: random network-level delivery failure",
      delayMs: 3000,
      enabled: true,
      priority: 10,
      createdByUserId: adminUserId,
    },
    {
      environment: "PRODUCTION",
      name: "Successful delivery (default)",
      triggerType: "RANDOM_PERCENTAGE",
      probabilityPercent: 100,
      initialProviderStatus: "ACCEPTED",
      finalDeliveryStatus: "DELIVERED",
      delayMs: 3000,
      enabled: true,
      priority: 0,
      createdByUserId: adminUserId,
    },
  ];

  for (const scenario of scenarios) {
    const existing = await prisma.simulatorScenario.findFirst({
      where: { name: scenario.name, environment: scenario.environment },
    });
    if (!existing) await prisma.simulatorScenario.create({ data: scenario });
  }
  console.log(`✓ ${scenarios.length} simulator scenarios`);
}

async function seedFraudRules() {
  const rules = [
    { name: "Global SMS/minute limit", ruleType: "SMS_PER_MINUTE" as const, thresholdValue: 200, windowSeconds: 60, action: "THROTTLE" as const },
    { name: "Global SMS/hour limit", ruleType: "SMS_PER_HOUR" as const, thresholdValue: 5000, windowSeconds: 3600, action: "FLAG_FOR_REVIEW" as const },
    { name: "Global SMS/day limit", ruleType: "SMS_PER_DAY" as const, thresholdValue: 20000, windowSeconds: 86400, action: "BLOCK" as const },
  ];
  for (const rule of rules) {
    const existing = await prisma.fraudRule.findFirst({ where: { name: rule.name } });
    if (!existing) await prisma.fraudRule.create({ data: { ...rule, scope: "GLOBAL" } });
  }
  console.log(`✓ ${rules.length} fraud rules`);
}

async function seedSystemSettings() {
  const settings = [
    {
      key: "SANDBOX_INITIAL_CREDIT_MINOR_UNITS",
      value: String(env.SANDBOX_INITIAL_CREDIT_MINOR_UNITS),
      description: "Sandbox starting wallet credit (minor units) granted to a new organization. Overrides the SANDBOX_INITIAL_CREDIT_MINOR_UNITS env default when present.",
    },
  ];
  for (const setting of settings) {
    const existing = await prisma.systemSetting.findUnique({ where: { key: setting.key } });
    if (!existing) await prisma.systemSetting.create({ data: setting });
  }
  console.log(`✓ ${settings.length} system settings`);
}

async function seedApiKey(organizationId: string, createdByUserId: string) {
  const publicId = "devseedtest";
  const existing = await prisma.apiKey.findUnique({ where: { publicId } });
  if (existing) {
    console.log("✓ sandbox API key already seeded (unchanged)");
    return;
  }

  const secret = generateRandomToken(24);
  const token = `sk_test.${publicId}.${secret}`;

  await prisma.apiKey.create({
    data: {
      organizationId,
      environment: "SANDBOX",
      name: "Seed Development Key",
      publicId,
      hashedSecret: sha256Hex(secret),
      displayPrefix: `sk_test.${publicId.slice(0, 6)}…`,
      scopes: [PermissionCode.SMS_SEND, PermissionCode.SMS_READ, PermissionCode.CAMPAIGN_READ, PermissionCode.WALLET_READ],
      createdByUserId,
    },
  });

  console.log(`✓ sandbox API key created — dev-only token: ${token}`);
}

async function main() {
  console.log("Seeding development data...\n");

  await seedPermissions();
  await seedRoles();
  const { platformAdmin, businessOwner, developerUser } = await seedUsers();
  const pricingPlan = await seedPricingAndPackages();
  await seedDocumentRequirements();
  const organization = await seedOrganization(businessOwner.id, pricingPlan.id);
  await addDeveloperMembership(organization.id, developerUser.id);
  await seedSenderId(organization.id);
  await seedContacts(organization.id);
  await seedTemplates(organization.id);
  await seedProviderConfig();
  await seedSimulatorScenarios(platformAdmin.id);
  await seedSandboxTestNumberScenarios(platformAdmin.id);
  await seedFraudRules();
  await seedSystemSettings();
  await seedApiKey(organization.id, developerUser.id);

  console.log("\nSeed complete.");
  console.log(`Platform admin: admin@smsgateway.dev / ${DEV_PASSWORD}`);
  console.log(`Business owner (org admin): owner@acmeltd.dev / ${DEV_PASSWORD}`);
  console.log(`Developer (org member): dev@acmeltd.dev / ${DEV_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
