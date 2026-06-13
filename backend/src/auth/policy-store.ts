import type { Role } from "./roles.js";

export interface PolicyUser {
  id: string;
  tenantId: string;
  role: Role;
  email?: string;
  displayName?: string;
  managerUserId?: string;
  isActive: boolean;
}

export interface RoleChangeRecord {
  changedByUserId: string;
  targetUserId: string;
  tenantId: string;
  oldRole: Role;
  newRole: Role;
  reason: string;
  changedAt: string;
}

export interface FeatureToggle {
  tenantId: string;
  userId: string;
  featureKey: string;
  isEnabled: boolean;
}

const users = new Map<string, PolicyUser>();
const featureToggles = new Map<string, FeatureToggle>();
const roleChanges: RoleChangeRecord[] = [];

const defaultSeed: { users: PolicyUser[]; featureToggles: FeatureToggle[] } = {
  users: [
    {
      id: "super-1",
      tenantId: "demo-tenant",
      role: "super_admin",
      email: "super@nimbus.dev",
      displayName: "Super Admin",
      isActive: true
    },
    {
      id: "manager-1",
      tenantId: "demo-tenant",
      role: "manager_admin",
      email: "manager1@nimbus.dev",
      displayName: "Manager One",
      isActive: true
    },
    {
      id: "manager-2",
      tenantId: "demo-tenant",
      role: "manager_admin",
      email: "manager2@nimbus.dev",
      displayName: "Manager Two",
      managerUserId: "super-1",
      isActive: true
    },
    {
      id: "user-1",
      tenantId: "demo-tenant",
      role: "user",
      email: "user1@nimbus.dev",
      displayName: "User One",
      managerUserId: "manager-1",
      isActive: true
    },
    {
      id: "user-2",
      tenantId: "demo-tenant",
      role: "user",
      email: "user2@nimbus.dev",
      displayName: "User Two",
      managerUserId: "manager-1",
      isActive: true
    },
    {
      id: "user-3",
      tenantId: "demo-tenant",
      role: "user",
      email: "user3@nimbus.dev",
      displayName: "User Three",
      managerUserId: "manager-2",
      isActive: true
    }
  ],
  featureToggles: [
    { tenantId: "demo-tenant", userId: "user-1", featureKey: "email_read", isEnabled: true },
    { tenantId: "demo-tenant", userId: "user-1", featureKey: "calendar_read", isEnabled: true },
    { tenantId: "demo-tenant", userId: "user-1", featureKey: "calendar_write", isEnabled: true },
    { tenantId: "demo-tenant", userId: "user-2", featureKey: "email_read", isEnabled: false },
    { tenantId: "demo-tenant", userId: "user-2", featureKey: "calendar_read", isEnabled: true },
    { tenantId: "demo-tenant", userId: "user-2", featureKey: "calendar_write", isEnabled: false },
    { tenantId: "demo-tenant", userId: "manager-1", featureKey: "email_read", isEnabled: true },
    { tenantId: "demo-tenant", userId: "manager-1", featureKey: "calendar_read", isEnabled: true },
    { tenantId: "demo-tenant", userId: "manager-1", featureKey: "calendar_write", isEnabled: true },
    { tenantId: "demo-tenant", userId: "super-1", featureKey: "email_read", isEnabled: true },
    { tenantId: "demo-tenant", userId: "super-1", featureKey: "calendar_read", isEnabled: true },
    { tenantId: "demo-tenant", userId: "super-1", featureKey: "calendar_write", isEnabled: true }
  ]
};

function featureKey(tenantId: string, userId: string, key: string): string {
  return `${tenantId}:${userId}:${key}`;
}

export function seedPolicyStore(seed: { users: PolicyUser[]; featureToggles: FeatureToggle[] }): void {
  users.clear();
  featureToggles.clear();
  roleChanges.length = 0;

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

export function listTenantUsers(tenantId: string): PolicyUser[] {
  return [...users.values()].filter((user) => user.tenantId === tenantId);
}

export function isFeatureEnabled(tenantId: string, userId: string, key: string): boolean {
  const toggle = featureToggles.get(featureKey(tenantId, userId, key));
  if (toggle) return toggle.isEnabled;
  // No record for this specific feature key.
  // If the user has NO feature toggles at all (e.g. a Clerk user not in the demo
  // seed), grant access by default so real users can use the product.
  const userHasAnyToggle = [...featureToggles.values()].some(
    (t) => t.tenantId === tenantId && t.userId === userId
  );
  return !userHasAnyToggle;
}

export function listFeatureTogglesForUser(tenantId: string, userId: string): FeatureToggle[] {
  return [...featureToggles.values()].filter(
    (toggle) => toggle.tenantId === tenantId && toggle.userId === userId
  );
}

export function setFeatureToggle(args: {
  tenantId: string;
  userId: string;
  featureKey: string;
  isEnabled: boolean;
}): FeatureToggle | undefined {
  const user = users.get(args.userId);
  if (!user || user.tenantId !== args.tenantId) {
    return undefined;
  }

  const key = featureKey(args.tenantId, args.userId, args.featureKey);
  const nextToggle: FeatureToggle = {
    tenantId: args.tenantId,
    userId: args.userId,
    featureKey: args.featureKey,
    isEnabled: args.isEnabled
  };

  featureToggles.set(key, nextToggle);
  return nextToggle;
}

export function updateUserRole(args: {
  tenantId: string;
  targetUserId: string;
  newRole: Role;
  changedByUserId: string;
  reason: string;
}): PolicyUser | undefined {
  const target = users.get(args.targetUserId);
  if (!target || target.tenantId !== args.tenantId) {
    return undefined;
  }

  const oldRole = target.role;
  target.role = args.newRole;
  users.set(target.id, target);

  roleChanges.push({
    changedByUserId: args.changedByUserId,
    targetUserId: target.id,
    tenantId: args.tenantId,
    oldRole,
    newRole: args.newRole,
    reason: args.reason,
    changedAt: new Date().toISOString()
  });

  return target;
}

export function assignManager(args: {
  tenantId: string;
  targetUserId: string;
  managerUserId?: string;
}): PolicyUser | undefined {
  const target = users.get(args.targetUserId);
  if (!target || target.tenantId !== args.tenantId) {
    return undefined;
  }

  if (args.managerUserId) {
    const manager = users.get(args.managerUserId);
    if (!manager || manager.tenantId !== args.tenantId) {
      return undefined;
    }
  }

  target.managerUserId = args.managerUserId;
  users.set(target.id, target);
  return target;
}

export function listRoleChanges(tenantId: string): RoleChangeRecord[] {
  return roleChanges.filter((entry) => entry.tenantId === tenantId);
}

export function resetPolicyStoreDefaults(): void {
  seedPolicyStore({
    users: defaultSeed.users.map((user) => ({ ...user })),
    featureToggles: defaultSeed.featureToggles.map((toggle) => ({ ...toggle }))
  });
}

resetPolicyStoreDefaults();
