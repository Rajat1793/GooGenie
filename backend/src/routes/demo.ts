import { Router, type Request, type Response } from "express";
import { env } from "../security/env.js";

export const demoRouter = Router();

// ── GET /v1/demo/tokens ───────────────────────────────────────────────────────
// Public — returns pre-generated demo tokens so any visitor can try roles.
// Only enabled when the tokens are set in env (dev/staging).
demoRouter.get("/demo/tokens", (_req: Request, res: Response) => {
  if (!env.DEMO_TOKEN_SUPER_ADMIN) {
    res.status(404).json({ error: "Demo tokens not configured" });
    return;
  }

  res.json({
    accounts: [
      {
        role: "super_admin",
        label: "Big Boss",
        description: "Full platform access: manage all teachers and students, audit logs, metrics.",
        email: "super@googenie.ai",
        token: env.DEMO_TOKEN_SUPER_ADMIN
      },
      {
        role: "manager_admin",
        label: "Teacher — Hitesh",
        description: "Teacher Hitesh Choudhary — view students, toggle features, team activity.",
        email: "hitesh@googenie.ai",
        token: env.DEMO_TOKEN_HITESH
      },
      {
        role: "manager_admin",
        label: "Teacher — Piyush",
        description: "Teacher Piyush Garg — view students, toggle features, team activity.",
        email: "piyush@googenie.ai",
        token: env.DEMO_TOKEN_PIYUSH
      },
      {
        role: "user",
        label: "Student",
        description: "Personal workspace: Gmail inbox, Google Calendar, compose & reply.",
        email: "student@googenie.ai",
        token: env.DEMO_TOKEN_USER
      }
    ]
  });
});
