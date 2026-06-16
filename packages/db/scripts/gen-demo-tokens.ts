import { createAccessToken } from "../src/auth/token.js";

const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year

const tokens = {
  super_admin: createAccessToken({ sub: "demo-super", tenant_id: "dev", role: "super_admin", exp }),
  manager_admin: createAccessToken({ sub: "demo-manager", tenant_id: "dev", role: "manager_admin", exp }),
  user: createAccessToken({ sub: "demo-user", tenant_id: "dev", role: "user", exp }),
};

console.log(JSON.stringify(tokens, null, 2));
process.exit(0);
