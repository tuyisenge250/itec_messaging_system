import { parse } from "csv-parse/sync";
import { contactRepository } from "./repository";
import { assertPermission, assertOrganizationAccess, assertResourceBelongsToOrganization } from "@/modules/auth/services/authorization-service";
import { normalizeRwandaPhoneNumber } from "@/shared/utils/phone";
import { checkRateLimit } from "@/infrastructure/redis/rate-limiter";
import { AppError } from "@/shared/errors/app-error";
import { ErrorCode } from "@/shared/errors/error-codes";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";
import type { z } from "zod";
import type { createContactSchema, updateContactSchema, createContactGroupSchema } from "./validation";
import type { Prisma } from "@/generated/prisma/client";

const MAX_IMPORT_ROWS = 5000;

export async function createContact(actor: ActorContext, organizationId: string, input: z.infer<typeof createContactSchema>) {
  await assertPermission(actor, PermissionCode.CONTACTS_MANAGE);
  assertOrganizationAccess(actor, organizationId);

  const normalized = normalizeRwandaPhoneNumber(input.phoneNumber);
  if (!normalized.valid) throw AppError.of(ErrorCode.INVALID_RECIPIENT, normalized.reason!, 400);

  return contactRepository.create({
    organization: { connect: { id: organizationId } },
    phoneRaw: input.phoneNumber,
    phoneNormalized: normalized.e164!,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    attributes: input.attributes as Prisma.InputJsonValue,
    isSubscribed: input.isSubscribed ?? true,
  });
}

export async function listContacts(actor: ActorContext, organizationId: string, cursor?: string) {
  await assertPermission(actor, PermissionCode.CONTACTS_READ);
  assertOrganizationAccess(actor, organizationId);
  return contactRepository.list(organizationId, { take: 50, cursor });
}

export async function updateContact(
  actor: ActorContext,
  organizationId: string,
  contactId: string,
  input: z.infer<typeof updateContactSchema>,
) {
  await assertPermission(actor, PermissionCode.CONTACTS_MANAGE);
  assertOrganizationAccess(actor, organizationId);

  const existing = await contactRepository.findById(contactId);
  assertResourceBelongsToOrganization(existing?.organizationId, organizationId);

  return contactRepository.update(contactId, { ...input, attributes: input.attributes as Prisma.InputJsonValue });
}

export async function deleteContact(actor: ActorContext, organizationId: string, contactId: string) {
  await assertPermission(actor, PermissionCode.CONTACTS_MANAGE);
  assertOrganizationAccess(actor, organizationId);

  const existing = await contactRepository.findById(contactId);
  assertResourceBelongsToOrganization(existing?.organizationId, organizationId);

  await contactRepository.delete(contactId);
}

export interface ImportContactsResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

/**
 * Expects a CSV with a `phoneNumber` header (case-insensitive) and optional
 * `firstName`/`lastName`/`email` headers — the same fields `createContact`
 * accepts. Invalid phone numbers are collected as per-row errors rather than
 * failing the whole upload; valid rows are bulk-inserted with
 * `skipDuplicates`, so a number the org already has is silently skipped, not
 * an error.
 */
export async function importContacts(
  actor: ActorContext,
  organizationId: string,
  input: { csv: Buffer; groupId?: string },
): Promise<ImportContactsResult> {
  await assertPermission(actor, PermissionCode.CONTACTS_MANAGE);
  assertOrganizationAccess(actor, organizationId);

  const limit = await checkRateLimit(`contacts-import:org:${organizationId}`, 10, 60 * 60);
  if (!limit.allowed) throw AppError.rateLimited("Too many CSV imports for this organization. Try again later.");

  if (input.groupId) {
    const group = await contactRepository.findGroupById(input.groupId);
    assertResourceBelongsToOrganization(group?.organizationId, organizationId);
  }

  let records: Record<string, string>[];
  try {
    records = parse(input.csv, { columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()), skip_empty_lines: true, trim: true });
  } catch {
    throw AppError.validation("Could not parse CSV file");
  }

  if (records.length === 0) {
    throw AppError.validation("CSV file has no data rows");
  }
  if (records.length > MAX_IMPORT_ROWS) {
    throw AppError.validation(`CSV file has too many rows (max ${MAX_IMPORT_ROWS} per upload)`);
  }

  const errors: ImportContactsResult["errors"] = [];
  const toCreate: Prisma.ContactCreateManyInput[] = [];
  const validPhoneNumbers: string[] = [];

  records.forEach((record, index) => {
    const rowNumber = index + 2; // +1 for 0-index, +1 for the header row
    const phoneNumber = record.phonenumber;
    if (!phoneNumber) {
      errors.push({ row: rowNumber, reason: "Missing phoneNumber" });
      return;
    }

    const normalized = normalizeRwandaPhoneNumber(phoneNumber);
    if (!normalized.valid) {
      errors.push({ row: rowNumber, reason: normalized.reason! });
      return;
    }

    toCreate.push({
      organizationId,
      phoneRaw: phoneNumber,
      phoneNormalized: normalized.e164!,
      firstName: record.firstname || undefined,
      lastName: record.lastname || undefined,
      email: record.email || undefined,
      isSubscribed: true,
    });
    validPhoneNumbers.push(normalized.e164!);
  });

  const result = toCreate.length > 0 ? await contactRepository.createManyIgnoringDuplicates(toCreate) : { count: 0 };

  if (input.groupId && validPhoneNumbers.length > 0) {
    const createdContacts = await contactRepository.findByPhoneNumbers(organizationId, validPhoneNumbers);
    await Promise.all(createdContacts.map((c) => contactRepository.addToGroup(input.groupId!, c.id)));
  }

  return {
    imported: result.count,
    skipped: toCreate.length - result.count,
    errors,
  };
}

// --- Groups ---

export async function createContactGroup(actor: ActorContext, organizationId: string, input: z.infer<typeof createContactGroupSchema>) {
  await assertPermission(actor, PermissionCode.CONTACTS_MANAGE);
  assertOrganizationAccess(actor, organizationId);

  return contactRepository.createGroup({
    organization: { connect: { id: organizationId } },
    name: input.name,
    description: input.description,
  });
}

export async function listContactGroups(actor: ActorContext, organizationId: string) {
  await assertPermission(actor, PermissionCode.CONTACTS_READ);
  assertOrganizationAccess(actor, organizationId);
  return contactRepository.listGroups(organizationId);
}

export async function addContactToGroup(actor: ActorContext, organizationId: string, groupId: string, contactId: string) {
  await assertPermission(actor, PermissionCode.CONTACTS_MANAGE);
  assertOrganizationAccess(actor, organizationId);

  const group = await contactRepository.findGroupById(groupId);
  assertResourceBelongsToOrganization(group?.organizationId, organizationId);
  const contact = await contactRepository.findById(contactId);
  assertResourceBelongsToOrganization(contact?.organizationId, organizationId);

  return contactRepository.addToGroup(groupId, contactId);
}

export async function removeContactFromGroup(actor: ActorContext, organizationId: string, groupId: string, contactId: string) {
  await assertPermission(actor, PermissionCode.CONTACTS_MANAGE);
  assertOrganizationAccess(actor, organizationId);

  const group = await contactRepository.findGroupById(groupId);
  assertResourceBelongsToOrganization(group?.organizationId, organizationId);

  await contactRepository.removeFromGroup(groupId, contactId);
}

export async function listGroupMembers(actor: ActorContext, organizationId: string, groupId: string) {
  await assertPermission(actor, PermissionCode.CONTACTS_READ);
  assertOrganizationAccess(actor, organizationId);

  const group = await contactRepository.findGroupById(groupId);
  assertResourceBelongsToOrganization(group?.organizationId, organizationId);

  return contactRepository.listGroupMembers(groupId);
}
