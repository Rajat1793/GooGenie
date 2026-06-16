export const ROLE = {
  SUPER_ADMIN: "super_admin",
  MANAGER_ADMIN: "manager_admin",
  USER: "user"
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

export const ALL_ROLES: Role[] = [
  ROLE.SUPER_ADMIN,
  ROLE.MANAGER_ADMIN,
  ROLE.USER
];
