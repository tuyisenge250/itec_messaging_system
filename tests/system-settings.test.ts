import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/database/prisma";
import { redis } from "@/infrastructure/redis/client";
import { registerUser } from "@/modules/auth/services/auth-service";
import { getSettingValue, updateSetting } from "@/modules/settings/service";
import type { ActorContext } from "@/shared/types/actor-context";

const runId = Date.now();
const testEmail = (label: string) => `system-settings-test-${label}-${runId}@example.test`;
const SETTING_KEY = "SANDBOX_INITIAL_CREDIT_MINOR_UNITS";

async function setupPlatformAdmin(label: string) {
  const { user } = await registerUser({ email: testEmail(label), password: "CorrectHorse123", name: label }, {});
  await prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: true } });
  const actor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id, isPlatformAdmin: true };
  return { user, actor };
}

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe("system settings", () => {
  it("updateSetting overrides the value getSettingValue resolves, then restores it", async () => {
    const { actor: admin } = await setupPlatformAdmin("update");
    const original = await prisma.systemSetting.findUniqueOrThrow({ where: { key: SETTING_KEY } });

    await updateSetting(admin, SETTING_KEY, "12345");
    await expect(getSettingValue(SETTING_KEY, -1)).resolves.toBe(12345);

    // Restore, since this setting drives real sandbox-onboarding behavior other tests rely on.
    await updateSetting(admin, SETTING_KEY, original.value);
    await expect(getSettingValue(SETTING_KEY, -1)).resolves.toBe(Number(original.value));
  });

  it("falls back to the given default when no row exists for the key", async () => {
    await expect(getSettingValue(`UNSEEDED_KEY_${runId}`, 777)).resolves.toBe(777);
  });

  it("rejects updating an unknown key", async () => {
    const { actor: admin } = await setupPlatformAdmin("unknown-key");
    await expect(updateSetting(admin, `NOT_A_REAL_KEY_${runId}`, "1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("a non-platform-admin actor is forbidden from reading or writing settings", async () => {
    const { user } = await registerUser({ email: testEmail("plain"), password: "CorrectHorse123", name: "plain" }, {});
    const plainActor: ActorContext = { actorType: "USER", requestId: "test", userId: user.id };

    const { listSettingsForAdmin } = await import("@/modules/settings/service");
    await expect(listSettingsForAdmin(plainActor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateSetting(plainActor, SETTING_KEY, "1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
