import { settingsRepository } from "./repository";
import { assertPermission, requirePlatformAdmin } from "@/modules/auth/services/authorization-service";
import { recordAuditEvent } from "@/modules/audit/service";
import { AppError } from "@/shared/errors/app-error";
import { PermissionCode } from "@/shared/constants/permissions";
import type { ActorContext } from "@/shared/types/actor-context";

/**
 * Resolves a runtime-configurable value, falling back to the caller-supplied default
 * (normally the matching infrastructure/config/env.ts value) when no DB row exists yet
 * — so a missing/never-seeded setting never breaks the feature that reads it. No
 * permission check: reading a config value to drive normal application behavior is not
 * an admin action, the same way reading `env.X` isn't.
 */
export async function getSettingValue(key: string, fallback: number): Promise<number> {
  const row = await settingsRepository.findByKey(key);
  if (!row) return fallback;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function listSettingsForAdmin(actor: ActorContext) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SYSTEM_MANAGE);
  return settingsRepository.list();
}

export async function updateSetting(actor: ActorContext, key: string, value: string) {
  requirePlatformAdmin(actor);
  await assertPermission(actor, PermissionCode.SYSTEM_MANAGE);

  const existing = await settingsRepository.findByKey(key);
  if (!existing) throw AppError.notFound("Unknown setting key");

  const updated = await settingsRepository.update(key, value, actor.userId!);

  await recordAuditEvent({
    actor,
    action: "system.setting_updated",
    resourceType: "SystemSetting",
    resourceId: updated.id,
    metadata: { key, oldValue: existing.value, newValue: value },
  });

  return updated;
}
