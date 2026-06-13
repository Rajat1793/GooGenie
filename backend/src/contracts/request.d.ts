// Global Express Request augmentation — no import needed, works everywhere
declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        tenantId: string;
        role: "super_admin" | "manager_admin" | "user";
      };
      traceId?: string;
    }
  }
}

export {};
