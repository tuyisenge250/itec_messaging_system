import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { createOrganization } from "@/modules/organizations/service";
import { importContacts, createContactGroup, listGroupMembers } from "@/modules/contacts/service";
import { authRepository } from "@/modules/auth/repository";
import { RoleName } from "@/shared/constants/roles";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `contacts-import-test-${label}-${runId}@example.test`;

async function setupOrg(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  const created = await createOrganization({ actorType: "USER", requestId: "test", userId: user.id }, { legalName: `Contacts Import Test Org ${label} ${runId}` });
  const adminRole = await authRepository.findRoleByName(RoleName.ADMIN);
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, organizationId: created.id, roleId: adminRole!.id };
  return { user, organization: created, actor };
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("importContacts", () => {
  it("imports valid rows and reports invalid ones without failing the whole upload", async () => {
    const { actor, organization } = await setupOrg("mixed");
    const csv = Buffer.from(
      ["phoneNumber,firstName,lastName", "+250788111111,Alice,A", "not-a-phone,Bob,B", "+250788111112,Carol,C"].join("\n"),
    );

    const result = await importContacts(actor, organization.id, { csv });
    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(3); // header is row 1, "not-a-phone" is row 3

    const contacts = await prisma.contact.findMany({ where: { organizationId: organization.id } });
    expect(contacts.map((c) => c.phoneNormalized).sort()).toEqual(["+250788111111", "+250788111112"]);
  });

  it("skips (does not error on) a phone number that already exists for the org", async () => {
    const { actor, organization } = await setupOrg("dedup");
    const csv1 = Buffer.from(["phoneNumber", "+250788222222"].join("\n"));
    const first = await importContacts(actor, organization.id, { csv: csv1 });
    expect(first.imported).toBe(1);

    const csv2 = Buffer.from(["phoneNumber", "+250788222222"].join("\n"));
    const second = await importContacts(actor, organization.id, { csv: csv2 });
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(1);
    expect(second.errors).toHaveLength(0);
  });

  it("assigns imported contacts to a group when groupId is given", async () => {
    const { actor, organization } = await setupOrg("group");
    const group = await createContactGroup(actor, organization.id, { name: "Imported batch" });
    const csv = Buffer.from(["phoneNumber", "+250788333333", "+250788333334"].join("\n"));

    await importContacts(actor, organization.id, { csv, groupId: group.id });

    const members = await listGroupMembers(actor, organization.id, group.id);
    expect(members).toHaveLength(2);
  });

  it("rejects a CSV with no phoneNumber column data at all", async () => {
    const { actor, organization } = await setupOrg("empty");
    const csv = Buffer.from("phoneNumber\n");
    await expect(importContacts(actor, organization.id, { csv })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("a non-member actor is forbidden from importing", async () => {
    const { organization } = await setupOrg("owner-only");
    const { user: outsider } = await registerUser({ email: testEmail("outsider"), password: "CorrectHorse123", name: "outsider" }, {});
    const outsiderActor: ActorContext = { actorType: "USER", requestId: "test", userId: outsider.id };
    const csv = Buffer.from(["phoneNumber", "+250788444444"].join("\n"));

    await expect(importContacts(outsiderActor, organization.id, { csv })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
