import { createAccessToken } from "../src/auth/token.js";

const exp = Math.floor(Date.now() / 1000) + 86400;
const t = (sub: string, role: string) =>
  createAccessToken({ sub, tenant_id: "demo-tenant", role: role as never, exp });

console.log("\n=== SUPER ADMIN (super-1) ===");
console.log(t("super-1", "super_admin"));
console.log("\n=== MANAGER (manager-1) ===");
console.log(t("manager-1", "manager_admin"));
console.log("\n=== USER (user-1) ===");
console.log(t("user-1", "user"));
console.log("");
