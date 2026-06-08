import type { Role } from "./roles.js";

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: Role;
}

export interface AccessTokenPayload {
  sub: string;
  tenant_id: string;
  role: Role;
  exp: number;
}
