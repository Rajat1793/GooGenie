import { SignIn } from "@clerk/react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { Navigate } from "react-router-dom";

export function LoginPage() {
  const { isSignedIn, isLoaded } = useClerkAuth();

  if (isLoaded && isSignedIn) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen flex">
      {/* Left hero panel (desktop) */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-primary px-14 py-16 text-white relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/5" />
          <div className="absolute top-1/2 -left-20 w-72 h-72 rounded-full bg-white/5" />
          <div className="absolute -bottom-20 right-20 w-64 h-64 rounded-full bg-white/5" />
        </div>

        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
            <span className="material-symbols-outlined text-white text-xl">cloud</span>
          </div>
          <span className="text-2xl font-bold tracking-tight">Googenie</span>
        </div>

        <div className="relative space-y-5">
          <h1 className="font-headline text-5xl leading-tight">
            AI-first workspace<br />for your whole team
          </h1>
          <p className="text-white/70 text-lg max-w-sm">
            Role-based access, intelligent email, and calendar.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            {["Smart inbox", "Calendar AI", "Team visibility", "Audit logs"].map((f) => (
              <span key={f} className="px-3 py-1.5 bg-white/10 rounded-full text-sm border border-white/20">{f}</span>
            ))}
          </div>
        </div>

        <div className="relative flex gap-4 text-white/40 text-xs">
          {["super admin", "manager", "user"].map((r) => (
            <div key={r} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
              {r}
            </div>
          ))}
        </div>
      </div>

      {/* Right: Clerk SignIn component */}
      <div className="flex-1 flex items-center justify-center bg-[#f0f4f8] px-4">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center">
            <span className="font-headline text-3xl text-primary tracking-tight">Googenie</span>
          </div>
          <SignIn
            routing="hash"
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "glass-panel rounded-2xl shadow-lg border-0 w-full",
                headerTitle: "font-headline text-2xl text-ink-text",
                headerSubtitle: "text-on-surface-variant text-sm",
                socialButtonsBlockButton: "border border-outline-variant rounded-xl hover:bg-surface-container transition-colors",
                formButtonPrimary: "btn-primary w-full justify-center",
                formFieldInput: "input-field",
                footerActionLink: "text-primary font-semibold hover:underline",
                identityPreviewText: "text-ink-text",
                identityPreviewEditButton: "text-primary"
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
