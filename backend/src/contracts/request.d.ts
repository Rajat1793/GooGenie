import type { AuthContext } from "../auth/context.js";

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
    traceId?: string;
  }
}
