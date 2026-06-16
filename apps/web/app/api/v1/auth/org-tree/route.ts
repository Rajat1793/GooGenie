import { NextResponse } from "next/server";
import { withApiMiddleware } from "@googenie/server";
import { listTenantUsersFromDb } from "@googenie/db/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withApiMiddleware(async () => {
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
  const bigBoss = allUsers.filter((u) => u.role === "super_admin");
  const teachers = allUsers.filter((u) => u.role === "manager_admin");
  const students = allUsers.filter((u) => u.role === "user");

  const tree = bigBoss.map((boss) => ({
    ...boss,
    children: teachers
      .filter((t) => t.managerUserId === boss.id)
      .map((teacher) => ({ ...teacher, children: students.filter((s) => s.managerUserId === teacher.id) })),
  }));
  const unassignedTeachers = teachers.filter((t) => !t.managerUserId || !bigBoss.find((b) => b.id === t.managerUserId));
  const unassigned = students.filter((s) => !s.managerUserId || !teachers.find((t) => t.id === s.managerUserId));

  return NextResponse.json({
    tree,
    unassigned,
    unassigned_teachers: unassignedTeachers,
    stats: { bigBoss: bigBoss.length, teachers: teachers.length, students: students.length },
  });
});
