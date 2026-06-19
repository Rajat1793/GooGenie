import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import {
  listTenantUsersFromDb,
  getUserById,
  getUserByClerkId,
  findRootAdminId,
} from "@googenie/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async (_req, { auth }) => {
  const [adminUsers, teacherUsers, studentUsers] = await Promise.all([
    listTenantUsersFromDb("dev-admin").catch(() => [] as Awaited<ReturnType<typeof listTenantUsersFromDb>>),
    listTenantUsersFromDb("dev-teachers").catch(() => [] as Awaited<ReturnType<typeof listTenantUsersFromDb>>),
    listTenantUsersFromDb("dev-students").catch(() => [] as Awaited<ReturnType<typeof listTenantUsersFromDb>>),
  ]);

  const ROLE_RANK: Record<string, number> = { super_admin: 3, manager_admin: 2, user: 1 };
  const byEmail = new Map<string, (typeof adminUsers)[number]>();
  for (const u of [...adminUsers, ...teacherUsers, ...studentUsers]) {
    const existing = byEmail.get(u.email);
    if (!existing || (ROLE_RANK[u.role] ?? 0) > (ROLE_RANK[existing.role] ?? 0)) byEmail.set(u.email, u);
  }
  const allUsers = Array.from(byEmail.values());
  let bigBoss = allUsers.filter((u) => u.role === "super_admin");
  const teachers = allUsers.filter((u) => u.role === "manager_admin");
  const students = allUsers.filter((u) => u.role === "user");

  // Per-admin isolation: each caller only sees their own admin branch.
  // Walk caller → root admin and prune the tree to just that admin.
  // Falls open (full tree) only if we can't resolve the caller — keeps the
  // endpoint debuggable when seed data is mid-migration.
  let scopedAdminId: string | null = null;
  if (auth) {
    const me =
      (await getUserById(auth.userId)) ?? (await getUserByClerkId(auth.userId));
    if (me) {
      scopedAdminId =
        me.role === "super_admin" ? me.id : await findRootAdminId(me.id);
    }
  }
  if (scopedAdminId) {
    bigBoss = bigBoss.filter((b) => b.id === scopedAdminId);
  }

  const tree = bigBoss.map((boss) => ({
    ...boss,
    children: teachers
      .filter((t) => t.managerUserId === boss.id)
      .map((teacher) => ({ ...teacher, children: students.filter((s) => s.managerUserId === teacher.id) })),
  }));

  let unassignedTeachers: typeof teachers;
  let unassigned: typeof students;
  if (scopedAdminId) {
    // Scoped view: only show true orphans (no manager). Users assigned to
    // OTHER admins' teachers stay hidden — they are not "unassigned", they
    // just belong to a different team.
    unassignedTeachers = teachers.filter((t) => !t.managerUserId);
    unassigned = students.filter((s) => !s.managerUserId);
  } else {
    // Unscoped fallback (caller couldn't be resolved): preserve the legacy
    // global view used by setup/seed tooling.
    unassignedTeachers = teachers.filter(
      (t) => !t.managerUserId || !bigBoss.find((b) => b.id === t.managerUserId),
    );
    unassigned = students.filter(
      (s) => !s.managerUserId || !teachers.find((t) => t.id === s.managerUserId),
    );
  }

  return NextResponse.json({
    tree,
    unassigned,
    unassigned_teachers: unassignedTeachers,
    stats: {
      bigBoss: bigBoss.length,
      teachers: tree.flatMap((b) => b.children).length,
      students: tree.flatMap((b) => b.children).flatMap((t) => t.children).length,
    },
  });
});
