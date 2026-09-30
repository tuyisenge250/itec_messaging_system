-- CreateEnum
CREATE TYPE "Environment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "StorageProvider" AS ENUM ('LOCAL', 'CLOUDINARY');

-- CreateEnum
CREATE TYPE "DocumentRequirementAppliesTo" AS ENUM ('ORGANIZATION', 'SENDER_ID');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SenderIdRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'DOCUMENTS_REQUIRED', 'UNDER_REVIEW', 'RURA_SUBMITTED', 'RURA_INFORMATION_REQUESTED', 'RURA_APPROVED', 'RURA_REJECTED', 'MNO_WHITELISTING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SenderIdStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('CREDIT', 'SMS_USAGE', 'REFUND', 'BONUS', 'ADJUSTMENT', 'RESERVATION', 'RESERVATION_RELEASE');

-- CreateEnum
CREATE TYPE "LedgerReferenceType" AS ENUM ('PAYMENT', 'MESSAGE_RECIPIENT', 'CAMPAIGN', 'MANUAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('RESERVED', 'CONSUMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'TIMEOUT', 'CANCELLED', 'INSUFFICIENT_FUNDS', 'PROVIDER_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "PaymentTransactionStatus" AS ENUM ('ACCEPTED', 'REJECTED', 'TIMEOUT', 'ERROR');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TRANSACTIONAL', 'BULK', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('SCHEDULED', 'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'PARTIALLY_DELIVERED', 'FAILED', 'EXPIRED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecipientStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'FAILED', 'EXPIRED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SmsEncoding" AS ENUM ('GSM_7', 'UCS_2');

-- CreateEnum
CREATE TYPE "ProviderCallStatus" AS ENUM ('ACCEPTED', 'REJECTED', 'TIMEOUT', 'ERROR', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ProviderKind" AS ENUM ('SMS', 'PAYMENT');

-- CreateEnum
CREATE TYPE "ProviderCredentialStatus" AS ENUM ('ACTIVE', 'ROTATED', 'REVOKED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "ProviderWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- CreateEnum
CREATE TYPE "SimulatorTriggerType" AS ENUM ('PHONE_NUMBER', 'SENDER_ID', 'ORGANIZATION', 'MESSAGE_ID', 'API_KEY', 'MESSAGE_CONTENT', 'RANDOM_PERCENTAGE');

-- CreateEnum
CREATE TYPE "SimulatorProviderStatus" AS ENUM ('ACCEPTED', 'REJECTED', 'TIMEOUT', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "SimulatorFinalStatus" AS ENUM ('DELIVERED', 'FAILED', 'EXPIRED', 'UNDELIVERED');

-- CreateEnum
CREATE TYPE "FraudRuleType" AS ENUM ('REQUESTS_PER_MINUTE', 'SMS_PER_MINUTE', 'SMS_PER_HOUR', 'SMS_PER_DAY', 'ORGANIZATION_QUOTA', 'API_KEY_QUOTA', 'IP_RATE_LIMIT', 'DESTINATION_VELOCITY', 'SPENDING_LIMIT');

-- CreateEnum
CREATE TYPE "FraudRuleAction" AS ENUM ('BLOCK', 'FLAG_FOR_REVIEW', 'THROTTLE');

-- CreateEnum
CREATE TYPE "FraudRuleScope" AS ENUM ('GLOBAL', 'ORGANIZATION', 'API_KEY');

-- CreateEnum
CREATE TYPE "FraudEventSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FraudEventStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'API_KEY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SENDER_ID', 'PAYMENT', 'WALLET', 'SECURITY', 'FRAUD', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradingName" TEXT,
    "registrationNumber" TEXT,
    "tin" TEXT,
    "businessType" TEXT,
    "industry" TEXT,
    "description" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'RW',
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "legalRepresentativeName" TEXT,
    "legalRepresentativeEmail" TEXT,
    "legalRepresentativePhone" TEXT,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'PENDING',
    "pricingPlanId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedAt" TIMESTAMPTZ(3),
    "joinedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentRequirement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "appliesTo" "DocumentRequirementAppliesTo" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allowedMimeTypes" TEXT[],
    "maxSizeBytes" INTEGER NOT NULL DEFAULT 10485760,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DocumentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "senderIdRequestId" TEXT,
    "documentRequirementId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storageProvider" "StorageProvider" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenderIdRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "requestedValue" TEXT NOT NULL,
    "purpose" TEXT,
    "sampleMessageContent" TEXT,
    "status" "SenderIdRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "internalReviewerUserId" TEXT,
    "internalReviewNotes" TEXT,
    "ruraReferenceNumber" TEXT,
    "ruraSubmittedAt" TIMESTAMPTZ(3),
    "ruraApprovedAt" TIMESTAMPTZ(3),
    "ruraRejectedAt" TIMESTAMPTZ(3),
    "ruraInformationRequestNotes" TEXT,
    "mnoWhitelistSubmittedAt" TIMESTAMPTZ(3),
    "mnoWhitelistCompletedAt" TIMESTAMPTZ(3),
    "approvedSenderIdId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SenderIdRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenderId" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "value" TEXT NOT NULL,
    "status" "SenderIdStatus" NOT NULL DEFAULT 'ACTIVE',
    "activatedAt" TIMESTAMPTZ(3),
    "suspendedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SenderId_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SenderIdRequestStatusHistory" (
    "id" TEXT NOT NULL,
    "senderIdRequestId" TEXT NOT NULL,
    "fromStatus" "SenderIdRequestStatus",
    "toStatus" "SenderIdRequestStatus" NOT NULL,
    "actorUserId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SenderIdRequestStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePerSegmentMinorUnits" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PricingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceMinorUnits" INTEGER NOT NULL,
    "creditAmountMinorUnits" INTEGER NOT NULL,
    "bonusMinorUnits" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SmsPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "availableBalanceMinorUnits" INTEGER NOT NULL DEFAULT 0,
    "reservedBalanceMinorUnits" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletLedgerEntry" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amountMinorUnits" INTEGER NOT NULL,
    "balanceAfterMinorUnits" INTEGER NOT NULL,
    "reservedAfterMinorUnits" INTEGER NOT NULL,
    "referenceType" "LedgerReferenceType",
    "referenceId" TEXT,
    "description" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletReservation" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "amountMinorUnits" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "status" "ReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "reservedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMPTZ(3),
    "releasedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentIntent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "packageId" TEXT,
    "amountMinorUnits" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "providerCode" TEXT NOT NULL,
    "providerReference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "initiatedByUserId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "status" "PaymentTransactionStatus" NOT NULL,
    "attempt" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phoneRaw" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "attributes" JSONB,
    "isSubscribed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContactGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactGroupMember" (
    "contactGroupId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactGroupMember_pkey" PRIMARY KEY ("contactGroupId","contactId")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "variables" TEXT[],
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT,
    "senderIdId" TEXT NOT NULL,
    "contactGroupId" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMPTZ(3),
    "batchSize" INTEGER NOT NULL DEFAULT 1000,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignBatch" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "batchNumber" INTEGER NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "campaignId" TEXT,
    "senderIdId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "type" "MessageType" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "content" TEXT NOT NULL,
    "clientReference" TEXT,
    "idempotencyKey" TEXT,
    "scheduledAt" TIMESTAMPTZ(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "queuedCount" INTEGER NOT NULL DEFAULT 0,
    "processingCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "totalCostMinorUnits" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageRecipient" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phoneRaw" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "status" "RecipientStatus" NOT NULL DEFAULT 'QUEUED',
    "encoding" "SmsEncoding" NOT NULL,
    "segmentCount" INTEGER NOT NULL,
    "costMinorUnits" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "providerCode" TEXT,
    "providerMessageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "queuedAt" TIMESTAMPTZ(3),
    "processingAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "deliveredAt" TIMESTAMPTZ(3),
    "failedAt" TIMESTAMPTZ(3),
    "lastAttemptAt" TIMESTAMPTZ(3),
    "nextAttemptAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MessageRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderTransaction" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "requestPayload" JSONB,
    "responsePayload" JSONB,
    "status" "ProviderCallStatus" NOT NULL,
    "attempt" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT,
    "responseSnapshot" JSONB,
    "statusCode" INTEGER,
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "name" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "hashedSecret" TEXT NOT NULL,
    "displayPrefix" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),
    "lastRotatedAt" TIMESTAMPTZ(3),
    "createdByUserId" TEXT NOT NULL,
    "rotatedFromId" TEXT,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "url" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "events" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "responseStatus" INTEGER,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "lastAttemptAt" TIMESTAMPTZ(3),
    "nextAttemptAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "deliveredAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderConfig" (
    "id" TEXT NOT NULL,
    "providerType" "ProviderKind" NOT NULL,
    "providerCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "rateLimitPerSecond" INTEGER,
    "maxConcurrency" INTEGER,
    "timeoutMs" INTEGER,
    "retryCount" INTEGER,
    "backoffBaseMs" INTEGER,
    "circuitBreakerFailureThreshold" INTEGER,
    "circuitBreakerCooldownMs" INTEGER,
    "settings" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCredential" (
    "id" TEXT NOT NULL,
    "providerConfigId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "encryptedValue" TEXT NOT NULL,
    "status" "ProviderCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMPTZ(3),
    "rotatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderWebhookEvent" (
    "id" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "externalEventId" TEXT,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureValid" BOOLEAN,
    "status" "ProviderWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulatorScenario" (
    "id" TEXT NOT NULL,
    "environment" "Environment" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "triggerType" "SimulatorTriggerType" NOT NULL,
    "triggerValue" TEXT,
    "initialProviderStatus" "SimulatorProviderStatus" NOT NULL,
    "finalDeliveryStatus" "SimulatorFinalStatus" NOT NULL,
    "delayMs" INTEGER NOT NULL DEFAULT 3000,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "probabilityPercent" DOUBLE PRECISION,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SimulatorScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulatorExecution" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT,
    "recipientId" TEXT NOT NULL,
    "matchedTriggerType" "SimulatorTriggerType",
    "initialStatus" "SimulatorProviderStatus" NOT NULL,
    "finalStatus" "SimulatorFinalStatus",
    "delayMsApplied" INTEGER NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "executedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "SimulatorExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ruleType" "FraudRuleType" NOT NULL,
    "thresholdValue" INTEGER NOT NULL,
    "windowSeconds" INTEGER,
    "action" "FraudRuleAction" NOT NULL,
    "scope" "FraudRuleScope" NOT NULL DEFAULT 'GLOBAL',
    "organizationId" TEXT,
    "apiKeyId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FraudRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "ruleId" TEXT,
    "reviewedByUserId" TEXT,
    "apiKeyId" TEXT,
    "messageId" TEXT,
    "eventType" TEXT NOT NULL,
    "severity" "FraudEventSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "phoneNumber" TEXT,
    "status" "FraudEventStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorType" "AuditActorType" NOT NULL,
    "actorUserId" TEXT,
    "actorApiKeyId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_isPlatformAdmin_idx" ON "User"("isPlatformAdmin");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE INDEX "Organization_tin_idx" ON "Organization"("tin");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_idx" ON "OrganizationMembership"("userId");

-- CreateIndex
CREATE INDEX "OrganizationMembership_roleId_idx" ON "OrganizationMembership"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentRequirement_code_key" ON "DocumentRequirement"("code");

-- CreateIndex
CREATE INDEX "DocumentRequirement_appliesTo_active_idx" ON "DocumentRequirement"("appliesTo", "active");

-- CreateIndex
CREATE INDEX "Document_organizationId_idx" ON "Document"("organizationId");

-- CreateIndex
CREATE INDEX "Document_senderIdRequestId_idx" ON "Document"("senderIdRequestId");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SenderIdRequest_approvedSenderIdId_key" ON "SenderIdRequest"("approvedSenderIdId");

-- CreateIndex
CREATE INDEX "SenderIdRequest_organizationId_status_idx" ON "SenderIdRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SenderIdRequest_environment_idx" ON "SenderIdRequest"("environment");

-- CreateIndex
CREATE INDEX "SenderIdRequest_requestedValue_idx" ON "SenderIdRequest"("requestedValue");

-- CreateIndex
CREATE INDEX "SenderId_organizationId_status_idx" ON "SenderId"("organizationId", "status");

-- CreateIndex
CREATE INDEX "SenderId_environment_status_idx" ON "SenderId"("environment", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SenderId_organizationId_value_environment_key" ON "SenderId"("organizationId", "value", "environment");

-- CreateIndex
CREATE INDEX "SenderIdRequestStatusHistory_senderIdRequestId_createdAt_idx" ON "SenderIdRequestStatusHistory"("senderIdRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "PricingPlan_active_isDefault_idx" ON "PricingPlan"("active", "isDefault");

-- CreateIndex
CREATE INDEX "SmsPackage_active_idx" ON "SmsPackage"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_organizationId_environment_key" ON "Wallet"("organizationId", "environment");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_walletId_createdAt_idx" ON "WalletLedgerEntry"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_organizationId_createdAt_idx" ON "WalletLedgerEntry"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletLedgerEntry_referenceType_referenceId_idx" ON "WalletLedgerEntry"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletReservation_recipientId_key" ON "WalletReservation"("recipientId");

-- CreateIndex
CREATE INDEX "WalletReservation_walletId_status_idx" ON "WalletReservation"("walletId", "status");

-- CreateIndex
CREATE INDEX "WalletReservation_organizationId_status_idx" ON "WalletReservation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "PaymentIntent_organizationId_environment_createdAt_idx" ON "PaymentIntent"("organizationId", "environment", "createdAt");

-- CreateIndex
CREATE INDEX "PaymentIntent_status_idx" ON "PaymentIntent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentIntent_organizationId_environment_idempotencyKey_key" ON "PaymentIntent"("organizationId", "environment", "idempotencyKey");

-- CreateIndex
CREATE INDEX "PaymentTransaction_paymentIntentId_createdAt_idx" ON "PaymentTransaction"("paymentIntentId", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_organizationId_idx" ON "Contact"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_organizationId_phoneNormalized_key" ON "Contact"("organizationId", "phoneNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "ContactGroup_organizationId_name_key" ON "ContactGroup"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ContactGroupMember_contactId_idx" ON "ContactGroupMember"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_organizationId_name_key" ON "Template"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Campaign_organizationId_environment_status_idx" ON "Campaign"("organizationId", "environment", "status");

-- CreateIndex
CREATE INDEX "Campaign_scheduledAt_idx" ON "Campaign"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignBatch_messageId_key" ON "CampaignBatch"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignBatch_campaignId_batchNumber_key" ON "CampaignBatch"("campaignId", "batchNumber");

-- CreateIndex
CREATE INDEX "Message_organizationId_environment_createdAt_idx" ON "Message"("organizationId", "environment", "createdAt");

-- CreateIndex
CREATE INDEX "Message_organizationId_environment_status_idx" ON "Message"("organizationId", "environment", "status");

-- CreateIndex
CREATE INDEX "Message_campaignId_idx" ON "Message"("campaignId");

-- CreateIndex
CREATE INDEX "Message_senderIdId_idx" ON "Message"("senderIdId");

-- CreateIndex
CREATE INDEX "Message_apiKeyId_idx" ON "Message"("apiKeyId");

-- CreateIndex
CREATE INDEX "Message_scheduledAt_idx" ON "Message"("scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_organizationId_environment_idempotencyKey_key" ON "Message"("organizationId", "environment", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MessageRecipient_organizationId_status_idx" ON "MessageRecipient"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MessageRecipient_messageId_status_idx" ON "MessageRecipient"("messageId", "status");

-- CreateIndex
CREATE INDEX "MessageRecipient_phoneNormalized_idx" ON "MessageRecipient"("phoneNormalized");

-- CreateIndex
CREATE INDEX "MessageRecipient_nextAttemptAt_idx" ON "MessageRecipient"("nextAttemptAt");

-- CreateIndex
CREATE INDEX "MessageRecipient_createdAt_idx" ON "MessageRecipient"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageRecipient_providerCode_providerMessageId_key" ON "MessageRecipient"("providerCode", "providerMessageId");

-- CreateIndex
CREATE INDEX "ProviderTransaction_recipientId_createdAt_idx" ON "ProviderTransaction"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderTransaction_providerCode_createdAt_idx" ON "ProviderTransaction"("providerCode", "createdAt");

-- CreateIndex
CREATE INDEX "ProviderTransaction_providerMessageId_idx" ON "ProviderTransaction"("providerMessageId");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_nextAttemptAt_idx" ON "OutboxEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "OutboxEvent_aggregateType_aggregateId_idx" ON "OutboxEvent"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "OutboxEvent_eventType_status_idx" ON "OutboxEvent"("eventType", "status");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_organizationId_environment_scope_key_key" ON "IdempotencyRecord"("organizationId", "environment", "scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_publicId_key" ON "ApiKey"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_rotatedFromId_key" ON "ApiKey"("rotatedFromId");

-- CreateIndex
CREATE INDEX "ApiKey_organizationId_environment_idx" ON "ApiKey"("organizationId", "environment");

-- CreateIndex
CREATE INDEX "ApiKey_status_idx" ON "ApiKey"("status");

-- CreateIndex
CREATE INDEX "Webhook_organizationId_environment_idx" ON "Webhook"("organizationId", "environment");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_status_idx" ON "WebhookDelivery"("webhookId", "status");

-- CreateIndex
CREATE INDEX "WebhookDelivery_status_nextAttemptAt_idx" ON "WebhookDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ProviderConfig_providerType_environment_isActive_idx" ON "ProviderConfig"("providerType", "environment", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderConfig_providerCode_environment_providerType_key" ON "ProviderConfig"("providerCode", "environment", "providerType");

-- CreateIndex
CREATE INDEX "ProviderCredential_providerConfigId_status_idx" ON "ProviderCredential"("providerConfigId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCredential_providerConfigId_key_key" ON "ProviderCredential"("providerConfigId", "key");

-- CreateIndex
CREATE INDEX "ProviderWebhookEvent_providerCode_environment_idx" ON "ProviderWebhookEvent"("providerCode", "environment");

-- CreateIndex
CREATE INDEX "ProviderWebhookEvent_status_idx" ON "ProviderWebhookEvent"("status");

-- CreateIndex
CREATE INDEX "ProviderWebhookEvent_receivedAt_idx" ON "ProviderWebhookEvent"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderWebhookEvent_providerCode_environment_externalEvent_key" ON "ProviderWebhookEvent"("providerCode", "environment", "externalEventId");

-- CreateIndex
CREATE INDEX "SimulatorScenario_environment_enabled_priority_idx" ON "SimulatorScenario"("environment", "enabled", "priority");

-- CreateIndex
CREATE INDEX "SimulatorScenario_triggerType_idx" ON "SimulatorScenario"("triggerType");

-- CreateIndex
CREATE INDEX "SimulatorExecution_recipientId_idx" ON "SimulatorExecution"("recipientId");

-- CreateIndex
CREATE INDEX "SimulatorExecution_scenarioId_idx" ON "SimulatorExecution"("scenarioId");

-- CreateIndex
CREATE INDEX "SimulatorExecution_executedAt_idx" ON "SimulatorExecution"("executedAt");

-- CreateIndex
CREATE INDEX "FraudRule_ruleType_enabled_idx" ON "FraudRule"("ruleType", "enabled");

-- CreateIndex
CREATE INDEX "FraudRule_organizationId_idx" ON "FraudRule"("organizationId");

-- CreateIndex
CREATE INDEX "FraudRule_apiKeyId_idx" ON "FraudRule"("apiKeyId");

-- CreateIndex
CREATE INDEX "FraudEvent_organizationId_createdAt_idx" ON "FraudEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "FraudEvent_status_idx" ON "FraudEvent"("status");

-- CreateIndex
CREATE INDEX "FraudEvent_severity_idx" ON "FraudEvent"("severity");

-- CreateIndex
CREATE INDEX "FraudEvent_apiKeyId_idx" ON "FraudEvent"("apiKeyId");

-- CreateIndex
CREATE INDEX "FraudEvent_messageId_idx" ON "FraudEvent"("messageId");

-- CreateIndex
CREATE INDEX "FraudEvent_ipAddress_idx" ON "FraudEvent"("ipAddress");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_createdAt_idx" ON "AuditEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_resourceType_resourceId_idx" ON "AuditEvent"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorApiKeyId_idx" ON "AuditEvent"("actorApiKeyId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_pricingPlanId_fkey" FOREIGN KEY ("pricingPlanId") REFERENCES "PricingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_senderIdRequestId_fkey" FOREIGN KEY ("senderIdRequestId") REFERENCES "SenderIdRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_documentRequirementId_fkey" FOREIGN KEY ("documentRequirementId") REFERENCES "DocumentRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenderIdRequest" ADD CONSTRAINT "SenderIdRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenderIdRequest" ADD CONSTRAINT "SenderIdRequest_internalReviewerUserId_fkey" FOREIGN KEY ("internalReviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenderIdRequest" ADD CONSTRAINT "SenderIdRequest_approvedSenderIdId_fkey" FOREIGN KEY ("approvedSenderIdId") REFERENCES "SenderId"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenderIdRequest" ADD CONSTRAINT "SenderIdRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenderId" ADD CONSTRAINT "SenderId_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenderIdRequestStatusHistory" ADD CONSTRAINT "SenderIdRequestStatusHistory_senderIdRequestId_fkey" FOREIGN KEY ("senderIdRequestId") REFERENCES "SenderIdRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SenderIdRequestStatusHistory" ADD CONSTRAINT "SenderIdRequestStatusHistory_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedgerEntry" ADD CONSTRAINT "WalletLedgerEntry_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletLedgerEntry" ADD CONSTRAINT "WalletLedgerEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletReservation" ADD CONSTRAINT "WalletReservation_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletReservation" ADD CONSTRAINT "WalletReservation_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "MessageRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SmsPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentIntent" ADD CONSTRAINT "PaymentIntent_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "PaymentIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroup" ADD CONSTRAINT "ContactGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroupMember" ADD CONSTRAINT "ContactGroupMember_contactGroupId_fkey" FOREIGN KEY ("contactGroupId") REFERENCES "ContactGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactGroupMember" ADD CONSTRAINT "ContactGroupMember_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_senderIdId_fkey" FOREIGN KEY ("senderIdId") REFERENCES "SenderId"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_contactGroupId_fkey" FOREIGN KEY ("contactGroupId") REFERENCES "ContactGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBatch" ADD CONSTRAINT "CampaignBatch_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignBatch" ADD CONSTRAINT "CampaignBatch_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderIdId_fkey" FOREIGN KEY ("senderIdId") REFERENCES "SenderId"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageRecipient" ADD CONSTRAINT "MessageRecipient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderTransaction" ADD CONSTRAINT "ProviderTransaction_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "MessageRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_rotatedFromId_fkey" FOREIGN KEY ("rotatedFromId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "ProviderConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulatorScenario" ADD CONSTRAINT "SimulatorScenario_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulatorExecution" ADD CONSTRAINT "SimulatorExecution_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "SimulatorScenario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulatorExecution" ADD CONSTRAINT "SimulatorExecution_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "MessageRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudRule" ADD CONSTRAINT "FraudRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudRule" ADD CONSTRAINT "FraudRule_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudEvent" ADD CONSTRAINT "FraudEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudEvent" ADD CONSTRAINT "FraudEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "FraudRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudEvent" ADD CONSTRAINT "FraudEvent_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FraudEvent" ADD CONSTRAINT "FraudEvent_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorApiKeyId_fkey" FOREIGN KEY ("actorApiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
