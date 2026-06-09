import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/admin/users", icon: "group", label: "Users" },
  { to: "/admin/activity", icon: "history", label: "Activity Log" }
];

export function AdminLayout() {
  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-2 pt-6 mb-0 border-b border-outline-variant/30">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`
            }
          >
            <span className="material-symbols-outlined text-base">{tab.icon}</span>
            {tab.label}
          </NavLink>
        ))}
      </div>
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}
