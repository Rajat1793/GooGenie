import type { Role } from "./roles.js";

export interface PolicyUser {
  id: string;
  tenantId: string;
  role: Role;
  managerUserId?: string;
  isActive: boolean;
}

export interface FeatureToggle {
  tenantId: string;
  userId: string;
  featureKey: string;
  isEnabled: boolean;
}

const users = new Map<string, PolicyUser>();
const featureToggles = new Map<string, FeatureToggle>();

function featureKey(tenantId: string, userId: string, key: string): string {
  return `${tenantId}:${userId}:${key}`;
}

export function seedPolicyStore(seed: { users: PolicyUser[]; featureToggles: FeatureToggle[] }): void {
  users.clear();
  featureToggles.clear();

  for (const user of seed.users) {
    users.set(user.id, user);
  }
  for (const toggle of seed.featureToggles) {
    featureToggles.set(featureKey(toggle.tenantId, toggle.userId, toggle.featureKey), toggle);
  }
}

export function getUser(userId: string): PolicyUser | undefined {
  return users.get(userId);
}

export function getTenantUsers(tenantId: string): PolicyUser[] {
  return [...users.values()].filter((user) => user.tenantId === tenantId && user.isActive);
}

export function isFeatureEnabled(tenantId: string, userId: string, key: string): boolean {
  const toggle = featureToggles.get(featureKey(tenantId, userId, key));
  return Boolean(toggle?.isEnabled);
}

seedPolicyStore({
  users: [
    { id: "super-1", tenantId: "demo-tenant", role: "super_admin", isActive: true },
    { id: "manager-1", tenantId: "demo-tenant", role: "manager_admin", isActive: true },
    {
      id: "manager-2",
      tenantId: "demo-tenant",
      role: "manager_admin",
      managerUserId: "super-1",
      isActive: true
    },
    { id: "user-1", tenantId: "demo-tenant", role: "user", managerUserId: "manager-1", isActive: true },
    { id: "user-2", tenantId: "demo-tenant", role: "user", managerUserId: "manager-1", isActive: true },
    { id: "user-3", tenantId: "demo-tenant", role: "user", managerUserId: "manager-2", isActive: true }
  ],
  featureToggles: [
    { tenantId: "demo-tenant", userId: "user-1", featureKey: "email_read", isEnabled: true },
    { tenantId: "demo-tenant", userId: "user-2", featureKey: "email_read", isEnabled: false },
    { tenantId: "demo-tenant", userId: "manager-1", featureKey: "email_read", isEnabled: true },
    { tenantId: "demo-tenant", userId: "super-1", featureKey: "email_read", isEnabled: true }
  ]
});
