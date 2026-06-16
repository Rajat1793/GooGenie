/**
 * Shared (de)serialisers for feature-request rows.
 */
export function serialiseRequest(r: {
  id: number;
  tenantId: string;
  requesterUserId: string;
  targetManagerUserId: string;
  featureKey: string;
  status: string;
  reason: string | null;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: r.id,
    tenant_id: r.tenantId,
    requester_user_id: r.requesterUserId,
    target_manager_user_id: r.targetManagerUserId,
    feature_key: r.featureKey,
    status: r.status,
    reason: r.reason,
    decided_by_user_id: r.decidedByUserId,
    decided_at: r.decidedAt,
    created_at: r.createdAt,
  };
}
