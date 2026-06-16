type Role = "super_admin" | "manager_admin" | "user";

const LABELS: Record<Role, string> = {
  super_admin: "Admin",
  manager_admin: "Manager",
  user: "Member"
};

const STYLES: Record<Role, string> = {
  super_admin: "bg-error-container text-on-error-container",
  manager_admin: "bg-tertiary-container/40 text-on-tertiary-container",
  user: "bg-secondary-container text-on-secondary-container"
};

interface Props {
  role: string;
}

export function RoleBadge({ role }: Props) {
  const r = role as Role;
  return (
    <span className={`badge ${STYLES[r] ?? "bg-surface-container text-on-surface-variant"}`}>
      {LABELS[r] ?? role}
    </span>
  );
}
