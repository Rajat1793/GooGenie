/**
 * OrgTreePage — clean visual org hierarchy: Anirudh (Big Boss) → Teachers → Students
 */
import { useEffect, useState } from "react";
import { authApi2, type DbUser } from "../api/client.ts";

type StudentNode = DbUser;
type TeacherNode = DbUser & { children: StudentNode[] };
type BossNode    = DbUser & { children: Array<TeacherNode> };

const ROLE_BG:   Record<string, string> = { super_admin: "#ffdad6", manager_admin: "#cbe6ff", user: "#c6e4f7" };
const ROLE_FG:   Record<string, string> = { super_admin: "#ba1a1a", manager_admin: "#0d4f74", user: "#466272" };
const ROLE_LABEL: Record<string, string> = { super_admin: "Big Boss", manager_admin: "Teacher", user: "Student" };

// ── Node card ─────────────────────────────────────────────────────────────────
function OrgCard({
  user,
  size = "md",
}: {
  user: DbUser;
  size?: "lg" | "md" | "sm";
}) {
  const bg = ROLE_BG[user.role] ?? "#e7e8eb";
  const fg = ROLE_FG[user.role] ?? "#41474e";
  const initial = user.displayName.charAt(0).toUpperCase();

  if (size === "lg") {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-5 rounded-2xl shadow-md min-w-[180px]"
        style={{ background: "var(--c-surface-container)", border: `2px solid ${fg}30` }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
          style={{ background: bg, color: fg }}>{initial}</div>
        <div className="text-center">
          <p className="font-bold text-sm" style={{ color: "var(--c-on-surface)" }}>{user.displayName}</p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--c-on-surface-variant)" }}>{user.email}</p>
          <span className="inline-flex items-center gap-1 mt-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: bg, color: fg }}>{ROLE_LABEL[user.role]}</span>
        </div>
      </div>
    );
  }

  if (size === "md") {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-4 rounded-xl shadow-sm min-w-[150px] max-w-[180px]"
        style={{ background: "var(--c-surface-container)", border: `1.5px solid ${fg}25` }}>
        <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold"
          style={{ background: bg, color: fg }}>{initial}</div>
        <div className="text-center">
          <p className="font-semibold text-xs" style={{ color: "var(--c-on-surface)" }}>{user.displayName}</p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--c-on-surface-variant)" }}>{user.email}</p>
          <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold"
            style={{ background: bg, color: fg }}>{ROLE_LABEL[user.role]}</span>
        </div>
      </div>
    );
  }

  // sm — compact student card
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl shadow-sm min-w-[160px]"
      style={{ background: "var(--c-surface-container)", border: `1px solid ${fg}20` }}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
        style={{ background: bg, color: fg }}>{initial}</div>
      <div className="min-w-0">
        <p className="text-xs font-semibold truncate" style={{ color: "var(--c-on-surface)" }}>{user.displayName}</p>
        <p className="text-[10px] truncate" style={{ color: "var(--c-on-surface-variant)" }}>{user.email}</p>
      </div>
    </div>
  );
}

// ── Vertical connector line ───────────────────────────────────────────────────
const LINE_COLOR = "var(--c-outline-variant)";

function VLine({ h = 32 }: { h?: number }) {
  return <div style={{ width: 2, height: h, background: LINE_COLOR, flexShrink: 0 }} />;
}

// ── Teacher branch (teacher + students) ──────────────────────────────────────
function TeacherBranch({ teacher }: { teacher: TeacherNode }) {
  const [open, setOpen] = useState(true);
  const count = teacher.children.length;

  return (
    <div className="flex flex-col items-center">
      {/* Teacher card */}
      <button onClick={() => setOpen(!open)} className="focus:outline-none transition-transform hover:scale-[1.02]">
        <OrgCard user={teacher} size="md" />
      </button>

      {/* Badge showing student count */}
      <div className="mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
        style={{ background: ROLE_BG.manager_admin, color: ROLE_FG.manager_admin }}>
        {count} student{count !== 1 ? "s" : ""}
        {" "}{open ? "▲" : "▼"}
      </div>

      {/* Students */}
      {open && count > 0 && (
        <>
          <VLine h={20} />
          {/* Horizontal bar */}
          <div className="relative flex gap-4 flex-wrap justify-center">
            {count > 1 && (
              <div className="absolute top-0 left-[8%] right-[8%]" style={{ height: 2, background: LINE_COLOR }} />
            )}
            {teacher.children.map((s) => (
              <div key={s.id} className="flex flex-col items-center">
                <VLine h={20} />
                <OrgCard user={s} size="sm" />
              </div>
            ))}
          </div>
        </>
      )}

      {open && count === 0 && (
        <>
          <VLine h={16} />
          <p className="text-[10px] px-3 py-1 rounded-full"
            style={{ color: "var(--c-on-surface-variant)", background: "var(--c-surface-container-high)" }}>
            No students yet
          </p>
        </>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function OrgTreePage() {
  const [tree, setTree]           = useState<BossNode[]>([]);
  const [unassigned, setUnassigned] = useState<DbUser[]>([]);
  const [stats, setStats]         = useState<{ bigBoss: number; teachers: number; students: number } | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    authApi2.orgTree()
      .then((r) => { setTree(r.tree as BossNode[]); setUnassigned(r.unassigned); setStats(r.stats); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <span className="material-symbols-outlined animate-spin text-3xl" style={{ color: "var(--c-primary)" }}>progress_activity</span>
    </div>
  );
  if (error) return <p className="text-sm py-8 text-center" style={{ color: "var(--c-error)" }}>{error}</p>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-headline text-3xl" style={{ color: "var(--c-on-surface)" }}>Organisation</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--c-on-surface-variant)" }}>GooGenie team hierarchy</p>
        </div>
        {stats && (
          <div className="flex gap-3">
            {[
              { label: "Big Boss",  count: stats.bigBoss,   role: "super_admin" },
              { label: "Teachers",  count: stats.teachers,  role: "manager_admin" },
              { label: "Students",  count: stats.students,  role: "user" },
            ].map((s) => (
              <div key={s.label} className="nimbus-card px-4 py-2.5 text-center min-w-[72px]">
                <p className="text-xl font-bold" style={{ color: ROLE_FG[s.role] }}>{s.count}</p>
                <p className="text-[11px]" style={{ color: "var(--c-on-surface-variant)" }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tree */}
      <div className="overflow-x-auto">
        {tree.map((boss) => (
          <div key={boss.id} className="flex flex-col items-center min-w-max mx-auto">

            {/* Big Boss */}
            <OrgCard user={boss} size="lg" />

            {boss.children.length > 0 && (
              <>
                <VLine h={28} />

                {/* "Reports to" label */}
                <div className="px-3 py-1 rounded-full mb-4 text-[11px]"
                  style={{ background: "var(--c-surface-container-high)", color: "var(--c-on-surface-variant)", border: "1px solid var(--c-outline-variant)" }}>
                  Teachers reporting to {boss.displayName}
                </div>

                {/* Teachers row */}
                <div className="relative flex gap-8 items-start flex-wrap justify-center">
                  {/* Horizontal span connector */}
                  {boss.children.length > 1 && (
                    <div className="absolute top-0 left-[12%] right-[12%]" style={{ height: 2, background: LINE_COLOR }} />
                  )}
                  {boss.children.map((teacher) => (
                    <TeacherBranch key={teacher.id} teacher={teacher} />
                  ))}
                </div>
              </>
            )}

            {boss.children.length === 0 && (
              <p className="text-sm mt-4" style={{ color: "var(--c-on-surface-variant)" }}>No teachers yet</p>
            )}
          </div>
        ))}
      </div>

      {/* Unassigned students */}
      {unassigned.length > 0 && (
        <div className="mt-12 pt-6" style={{ borderTop: "2px dashed var(--c-outline-variant)" }}>
          <p className="section-label mb-4 text-center">
            <span className="material-symbols-outlined text-sm mr-1" style={{ color: "var(--c-outline)" }}>person_off</span>
            Unassigned Students ({unassigned.length})
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {unassigned.map((s) => <OrgCard key={s.id} user={s} size="sm" />)}
          </div>
        </div>
      )}
    </div>
  );
}
