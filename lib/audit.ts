import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Append an audit record from trusted server code (after authorization was verified).
 * Failures are logged, not swallowed silently, but must not break the user's operation.
 */
export async function audit(actorId: string, action: string, entityType: string, entityId: string, metadata: Record<string, unknown> = {}) {
  const { error } = await createAdminClient().rpc("write_audit", {
    _actor: actorId, _action: action, _entity_type: entityType, _entity_id: entityId, _metadata: metadata,
  });
  if (error) console.error("audit write failed", action, error.message);
}
