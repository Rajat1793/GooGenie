import { useClerkReady } from "../../hooks/useClerkReady.ts";
import { useEffect, useState } from "react";
import { adminApi, type AuditEvent } from "../../api/client.ts";
import { PageHeader } from "../../components/PageHeader.tsx";
import { Card } from "../../components/Card.tsx";
import { DataState } from "../../components/DataState.tsx";
import { RoleBadge } from "../../components/RoleBadge.tsx";
import { formatActivity, activityIcon } from "../../lib/formatActivity.ts";
import { getErrorMessage } from "../../lib/errors.ts";

function EventCard({ event }: { event: AuditEvent }) {
  const icon = activityIcon(event.action);
  const text = formatActivity(event.action, event.metadata);
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-outline-variant/20 bg-surface-container-lowest card-hover">
      <div className="w-9 h-9 rounded-full bg-secondary-container/50 flex items-center justify-center flex-shrink-0">
        <span className="material-symbols-outlined text-base text-primary">{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-ink-text">{text}</span>
          <RoleBadge role={event.role} />
        </div>
        <p className="text-xs text-on-surface-variant mt-0.5">
          By {event.actor_user_id}
        </p>
      </div>
      <span className="text-xs text-outline flex-shrink-0">
        {new Date(event.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
      </span>
    </div>
  );
}

export function AdminActivityPage() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState("");
  const [filterUser, setFilterUser] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getActivity({
        action: filterAction || undefined,
        userId: filterUser || undefined
      });
      setEvents(res.activity.slice().reverse());
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  const clerkReady = useClerkReady(); useEffect(() => { if (clerkReady) load(); }, [clerkReady]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHeader
        title="Activity Log"
        subtitle="Audit trail for all privileged and monitored operations."
        action={
          <button onClick={load} className="btn-ghost flex items-center gap-1">
            <span className="material-symbols-outlined text-base">refresh</span>
            Refresh
          </button>
        }
      />

      {/* Filters */}
      <Card className="mb-6" padded>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">
              Action
            </label>
            <input
              type="text"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              placeholder="e.g. admin_user_role_update"
              className="input-field rounded-xl text-xs"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-widest mb-1.5">
              Actor User ID
            </label>
            <input
              type="text"
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              placeholder="e.g. super-1"
              className="input-field rounded-xl text-xs"
            />
          </div>
          <div className="flex items-end">
            <button onClick={load} className="btn-primary">Apply Filters</button>
          </div>
        </div>
      </Card>

      <DataState loading={loading} error={error} show={events.length > 0} empty="No activity events recorded yet. Interact with the workspace to generate logs.">
        <div className="space-y-3">
          {events.map((ev, i) => <EventCard key={i} event={ev} />)}
        </div>
      </DataState>
    </div>
  );
}
