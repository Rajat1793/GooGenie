import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext.tsx";
import { meApi, type FeatureToggle, type AuditEvent } from "../../api/client.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { Card } from "../../components/Card.tsx";
import { RoleBadge } from "../../components/RoleBadge.tsx";
import { DataState } from "../../components/DataState.tsx";

const FEATURE_ICONS: Record<string, string> = {
  email_read: "inbox",
  email_write: "edit",
  calendar_read: "calendar_month",
  calendar_write: "edit_calendar",
  ai_summary: "auto_awesome",
  ai_compose: "draw"
};

function FeatureChip({ toggle }: { toggle: FeatureToggle }) {
  const icon = FEATURE_ICONS[toggle.featureKey] ?? "toggle_on";
  return (
    <div
      className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${
        toggle.isEnabled
          ? "bg-primary/5 border-primary/20"
          : "bg-surface-container-low border-outline-variant/20 opacity-60"
      }`}
    >
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
          toggle.isEnabled ? "bg-secondary-container text-primary" : "bg-surface-container text-outline"
        }`}
      >
        <span className="material-symbols-outlined text-base">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-text capitalize">
          {toggle.featureKey.replace(/_/g, " ")}
        </p>
        <p className={`text-xs mt-0.5 ${toggle.isEnabled ? "text-primary" : "text-outline"}`}>
          {toggle.isEnabled ? "Enabled" : "Disabled"}
        </p>
      </div>
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          toggle.isEnabled ? "bg-primary" : "bg-outline-variant"
        }`}
      />
    </div>
  );
}

function ActivityRow({ event }: { event: AuditEvent }) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-outline-variant/20 last:border-0">
      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-text">{event.action.replace(/_/g, " ")}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">{event.method} {event.route}</p>
      </div>
      <span className="text-xs text-outline flex-shrink-0 whitespace-nowrap">
        {new Date(event.at).toLocaleTimeString()}
      </span>
    </div>
  );
}

export function UserProfilePage() {
  const { userId, tenantId, role } = useAuth();
  const [features, setFeatures] = useState<FeatureToggle[]>([]);
  const [activity, setActivity] = useState<AuditEvent[]>([]);
  const [loadingF, setLoadingF] = useState(true);
  const [loadingA, setLoadingA] = useState(true);
  const [errorF, setErrorF] = useState<string | null>(null);
  const [errorA, setErrorA] = useState<string | null>(null);

  useEffect(() => {
    meApi.getFeatures()
      .then((r) => setFeatures(r.features))
      .catch((e: Error) => setErrorF(e.message))
      .finally(() => setLoadingF(false));

    meApi.getActivity()
      .then((r) => setActivity(r.activity.slice().reverse()))
      .catch((e: Error) => setErrorA(e.message))
      .finally(() => setLoadingA(false));
  }, []);

  const enabledCount = features.filter((f) => f.isEnabled).length;

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Your access level, feature permissions, and recent activity." />

      {/* Identity card */}
      <div className="glass-panel rounded-2xl p-6 mb-8 flex items-center gap-6">
        <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-semibold text-2xl flex-shrink-0">
          {(userId ?? "?").charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-headline text-xl text-ink-text">{userId}</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">Tenant: {tenantId}</p>
          <div className="mt-2">
            <RoleBadge role={role ?? "user"} />
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-3xl font-headline text-primary">{enabledCount}</p>
          <p className="text-xs text-on-surface-variant uppercase tracking-widest">features on</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feature access */}
        <Card
          header={
            <span className="text-sm font-semibold text-ink-text flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-primary">toggle_on</span>
              My Feature Access
            </span>
          }
          padded={false}
        >
          <DataState loading={loadingF} error={errorF} show={features.length > 0} empty="No feature toggles assigned yet.">
            <div className="p-5 grid grid-cols-1 gap-3">
              {features.map((f) => (
                <FeatureChip key={f.featureKey} toggle={f} />
              ))}
            </div>
          </DataState>
        </Card>

        {/* Own activity */}
        <Card
          header={
            <span className="text-sm font-semibold text-ink-text flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-primary">history</span>
              My Recent Activity
            </span>
          }
          padded={false}
        >
          <DataState loading={loadingA} error={errorA} show={activity.length > 0} empty="No activity recorded yet. Use the workspace to generate events.">
            <div className="px-5 pb-4 pt-2 max-h-[480px] overflow-y-auto">
              {activity.map((ev, i) => (
                <ActivityRow key={i} event={ev} />
              ))}
            </div>
          </DataState>
        </Card>
      </div>
    </div>
  );
}
