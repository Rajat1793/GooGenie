import { NextResponse } from "next/server";
import { withApiMiddleware, env } from "@googenie/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(
  async () => {
    if (!env.DEMO_TOKEN_SUPER_ADMIN) {
      return NextResponse.json({ error: "Demo tokens not configured" }, { status: 404 });
    }
    return NextResponse.json({
      accounts: [
        {
          role: "super_admin",
          label: "Big Boss",
          description: "Full platform access: manage all teachers and students, audit logs, metrics.",
          email: "super@googenie.ai",
          token: env.DEMO_TOKEN_SUPER_ADMIN,
        },
        {
          role: "manager_admin",
          label: "Teacher — Hitesh",
          description: "Teacher Hitesh Choudhary — view students, toggle features, team activity.",
          email: "hitesh@googenie.ai",
          token: env.DEMO_TOKEN_HITESH,
        },
        {
          role: "manager_admin",
          label: "Teacher — Piyush",
          description: "Teacher Piyush Garg — view students, toggle features, team activity.",
          email: "piyush@googenie.ai",
          token: env.DEMO_TOKEN_PIYUSH,
        },
        {
          role: "user",
          label: "Student",
          description: "Personal workspace: Gmail inbox, Google Calendar, compose & reply.",
          email: "student@googenie.ai",
          token: env.DEMO_TOKEN_USER,
        },
      ],
    });
  },
  { auth: false, rateLimit: false }
);
