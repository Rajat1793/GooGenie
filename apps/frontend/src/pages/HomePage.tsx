import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "../context/AuthContext.tsx";

/** Redirect users to their default landing page based on role */
export function HomePage() {
  const { role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!role) { navigate("/login"); return; }
    if (role === "super_admin") navigate("/admin/users");
    else if (role === "manager_admin") navigate("/manager/team");
    else navigate("/inbox");
  }, [role, loading, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[60vh] text-on-surface-variant">
      <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
    </div>
  );
}
