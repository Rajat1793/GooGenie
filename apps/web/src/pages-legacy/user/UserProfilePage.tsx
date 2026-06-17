"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth as useClerkAuth } from "@clerk/nextjs";
import { useAuth } from "../../contexts/AuthContext";
import { useFeatures } from "../../contexts/FeatureContext";
import {
  meApi,
  type AuditEvent,
  type FeatureToggleWithLabel,
  type FeatureCatalogEntry,
  type FeatureRequest,
} from "../../api/client";
import { getErrorMessage } from "../../lib/errors";import { PageHeader } from "../../components/PageHeader";
import { Card } from "../../components/Card";
import { BookingLinksPanel } from "../../components/BookingLinksPanel";
import { AutoCategorizePanel } from "../../components/AutoCategorizePanel";
import { ScheduledEmailsPanel } from "../../components/ScheduledEmailsPanel";
import { DigestPanel } from "../../components/DigestPanel";
import { SnippetsPanel } from "../../components/SnippetsPanel";
import { RoleBadge } from "../../components/RoleBadge";
import { DataState } from "../../components/DataState";
import { formatActivity, activityIcon } from "../../lib/formatActivity";
import { broadcastRequestUpdate } from "../../hooks/useNotifications";
import { playChime } from "../../lib/chime";
import { Icon } from "../../components/Icon";
import { FEATURE_CATALOG, getFeatureMeta, groupedFeatures } from "../../../app/api/v1/me/_catalog";

// Backwards-compatible icon lookup — falls back to the central catalog so any
// new feature key automatically picks up its icon without code changes here.
const FEATURE_ICONS: Record<string, string> = Object.fromEntries(
  FEATURE_CATALOG.map((f) => [f.key, f.icon]),
);

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Admin",
  manager_admin: "Manager",
  user: "Member",
};

interface PendingMap {
  [featureKey: string]: { id: number; createdAt: string };
}

interface DecidedMap {
  [featureKey: string]: { status: "approved" | "denied"; decidedAt: string | null };
}

function FeatureRow({
  toggle,
  pending,
  history,
  canRequest,
  onRequest,
  busy,
}: {
  toggle: FeatureToggleWithLabel;
  pending?: PendingMap[string];
  history?: DecidedMap[string];
  canRequest: boolean;
  onRequest: (featureKey: string) => void;
  busy: boolean;
}) {
  const icon = FEATURE_ICONS[toggle.featureKey] ?? "toggle_on";
  const label = toggle.label ?? toggle.featureKey.replace(/_/g, " ");

  let status: "enabled" | "pending" | "denied" | "disabled";
  if (toggle.isEnabled) status = "enabled";
  else if (pending) status = "pending";
  else if (history?.status === "denied") status = "denied";
  else status = "disabled";

  return (
    <div
      className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${
        status === "enabled"
          ? "bg-primary/5 border-primary/20"
          : status === "pending"
          ? "bg-tertiary/5 border-tertiary/30"
          : "bg-surface-container-low border-outline-variant/20"
      }`}
    >
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
          status === "enabled"
            ? "bg-secondary-container text-primary"
            : status === "pending"
            ? "bg-tertiary-container text-tertiary"
            : "bg-surface-container text-outline"
        }`}
      >
        <Icon name={icon} className="text-base" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-ink-text capitalize">{label}</p>
          {(() => {
            const meta = getFeatureMeta(toggle.featureKey);
            if (!meta) return null;
            if (meta.tier === "addon") {
              return (
                <span
                  className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                  style={{
                    background: "color-mix(in srgb, var(--c-tertiary) 15%, transparent)",
                    color: "var(--c-tertiary)",
                  }}
                  title="Premium AI feature — request access from your manager"
                >
                  Premium
                </span>
              );
            }
            return (
              <span
                className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                style={{
                  background: "color-mix(in srgb, var(--c-primary) 12%, transparent)",
                  color: "var(--c-primary)",
                }}
                title="Included for everyone — no approval needed"
              >
                Included
              </span>
            );
          })()}
        </div>
        {(() => {
          const meta = getFeatureMeta(toggle.featureKey);
          return meta?.description ? (
            <p className="text-[11px] text-on-surface-variant mt-0.5 truncate" title={meta.description}>
              {meta.description}
            </p>
          ) : null;
        })()}
        <p
          className={`text-xs mt-0.5 ${
            status === "enabled"
              ? "text-primary"
              : status === "pending"
              ? "text-tertiary"
              : status === "denied"
              ? "text-error"
              : "text-outline"
          }`}
        >
          {status === "enabled"
            ? "Enabled"
            : status === "pending"
            ? "Request pending"
            : status === "denied"
            ? "Previously denied"
            : "Not granted"}
        </p>
      </div>
      {(() => {
        // Basic-tier features should always be enabled — hide the Request CTA
        // and just show the status dot. If they're somehow disabled, the
        // backfill migration will re-enable them on next restart.
        const meta = getFeatureMeta(toggle.featureKey);
        const isBasic = meta?.tier === "basic";
        if (isBasic) {
          return (
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                status === "enabled" ? "bg-primary" : "bg-outline-variant"
              }`}
              title={status === "enabled" ? "Included" : "Restart will re-enable this basic feature"}
            />
          );
        }
        if (status === "disabled" && canRequest) {
          return (
            <button
              onClick={() => onRequest(toggle.featureKey)}
              disabled={busy}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
            >
              Request
            </button>
          );
        }
        if (status === "denied" && canRequest) {
          return (
            <button
              onClick={() => onRequest(toggle.featureKey)}
              disabled={busy}
              className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-50"
            >
              Request again
            </button>
          );
        }
        return (
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              status === "enabled" ? "bg-primary" : status === "pending" ? "bg-tertiary" : "bg-outline-variant"
            }`}
          />
        );
      })()}
    </div>
  );
}

function IncomingRequestRow({
  request,
  busyId,
  onDecide,
}: {
  request: FeatureRequest;
  busyId: number | null;
  onDecide: (id: number, decision: "approved" | "denied") => void;
}) {
  const requesterName = request.requester?.displayName ?? request.requester?.email ?? request.requester_user_id;
  const featureLabel = request.feature_key.replace(/_/g, " ");
  const isPending = request.status === "pending";
  const busy = busyId === request.id;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-outline-variant/20 last:border-0">
      <div className="w-9 h-9 rounded-full bg-tertiary-container/40 flex items-center justify-center flex-shrink-0">
        <Icon name="request_quote" className="text-sm text-tertiary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink-text">
          <span className="font-medium">{requesterName}</span>
          <span className="text-on-surface-variant"> requests </span>
          <span className="font-medium capitalize">{featureLabel}</span>
        </p>
        <p className="text-xs text-on-surface-variant mt-0.5">
          {new Date(request.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          {request.requester?.role ? ` · ${ROLE_LABEL[request.requester.role] ?? request.requester.role}` : ""}
        </p>
      </div>
      {isPending ? (
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => onDecide(request.id, "approved")}
            disabled={busy}
            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => onDecide(request.id, "denied")}
            disabled={busy}
            className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-50"
          >
            Deny
          </button>
        </div>
      ) : (
        <span
          className={`badge text-xs ${
            request.status === "approved" ? "badge-success" : "bg-error/10 text-error"
          }`}
        >
          {request.status}
        </span>
      )}
    </div>
  );
}

function ActivityRow({ event }: { event: AuditEvent }) {
  const text = formatActivity(event.action, event.metadata);
  const icon = activityIcon(event.action);
  return (
    <div className="flex items-start gap-3 py-3 border-b border-outline-variant/20 last:border-0">
      <div className="w-7 h-7 rounded-full bg-secondary-container/40 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon name={icon} className="text-sm text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink-text">{text}</p>
        <p className="text-xs text-on-surface-variant mt-0.5">
          {new Date(event.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </div>
    </div>
  );
}

export function UserProfilePage() {
  const { userId, tenantId, role, fullName, email, imageUrl } = useAuth();
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { hasFeature } = useFeatures();

  const [features, setFeatures] = useState<FeatureToggleWithLabel[]>([]);
  const [catalog, setCatalog] = useState<FeatureCatalogEntry[]>([]);
  const [pending, setPending] = useState<PendingMap>({});
  const [history, setHistory] = useState<DecidedMap>({});
  const [activity, setActivity] = useState<AuditEvent[]>([]);
  const [incoming, setIncoming] = useState<FeatureRequest[]>([]);

  const [loadingF, setLoadingF] = useState(true);
  const [loadingA, setLoadingA] = useState(true);
  const [loadingI, setLoadingI] = useState(true);
  const [errorF, setErrorF] = useState<string | null>(null);
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorI, setErrorI] = useState<string | null>(null);

  const [requestBusy, setRequestBusy] = useState<string | null>(null);
  const [decideBusy, setDecideBusy] = useState<number | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; message: string } | null>(null);

  // Track previous pending keys so we can detect when a request gets decided
  const prevPendingKeys = useRef<Set<string>>(new Set());

  // Roles that can submit a request (anyone with a manager). Big bosses are
  // top-of-chain so they don't have anyone to request from.
  const canRequest = role === "user" || role === "manager_admin";
  // Roles that receive requests from below them.
  const isManager = role === "manager_admin" || role === "super_admin";

  const loadFeatures = useCallback(async () => {
    setLoadingF(true);
    setErrorF(null);
    try {
      const r = await meApi.getFeatures();
      setFeatures(r.features);
      setCatalog(r.catalog);

      const p: PendingMap = {};
      for (const req of r.pending_requests) {
        p[req.feature_key] = { id: req.id, createdAt: req.created_at };
      }

      // Detect requests that just moved from pending → decided
      const newPendingKeys = new Set(Object.keys(p));
      const justDecided = [...prevPendingKeys.current].filter(
        (k) => !newPendingKeys.has(k)
      );
      if (justDecided.length > 0 && prevPendingKeys.current.size > 0) {
        // Find the decision from history
        const decidedApproved = r.history
          .filter((h) => justDecided.includes(h.feature_key) && h.status === "approved")
          .map((h) => h.feature_key.replace(/_/g, " "));
        const decidedDenied = r.history
          .filter((h) => justDecided.includes(h.feature_key) && h.status === "denied")
          .map((h) => h.feature_key.replace(/_/g, " "));

        if (decidedApproved.length > 0) {
          playChime("out");
          setToast({
            kind: "success",
            message: `✓ Access granted: ${decidedApproved.join(", ")}`,
          });
          // Browser notification
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("GooGenie — Request Approved", {
              body: `You now have access to: ${decidedApproved.join(", ")}`,
              icon: "/favicon.svg",
            });
          }
        } else if (decidedDenied.length > 0) {
          playChime("out");
          setToast({
            kind: "error",
            message: `Request denied: ${decidedDenied.join(", ")}`,
          });
        }
      }
      prevPendingKeys.current = newPendingKeys;

      setPending(p);
      const h: DecidedMap = {};
      for (const req of r.history) {
        h[req.feature_key] = {
          status: req.status as "approved" | "denied",
          decidedAt: req.decided_at,
        };
      }
      setHistory(h);
    } catch (e) {
      setErrorF(getErrorMessage(e));
    } finally {
      setLoadingF(false);
    }
  }, []);

  const loadIncoming = useCallback(async () => {
    setLoadingI(true);
    setErrorI(null);
    try {
      const r = await meApi.getIncomingFeatureRequests();
      setIncoming(r.requests);
    } catch (e) {
      setErrorI(getErrorMessage(e));
    } finally {
      setLoadingI(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    const doFetch = async () => {
      const token = await getToken();
      if (!token || cancelled) return;

      loadFeatures();

      meApi
        .getActivity()
        .then((r) => setActivity(r.activity.slice().reverse()))
        .catch((e: Error) => setErrorA(e.message))
        .finally(() => setLoadingA(false));

      if (isManager) {
        loadIncoming();
      } else {
        setLoadingI(false);
      }
    };
    doFetch();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, getToken, isManager, loadFeatures, loadIncoming]);

  // Re-fetch features when a request is decided (e.g. manager approved from bell)
  useEffect(() => {
    function onUpdate() {
      loadFeatures();
      if (isManager) loadIncoming();
    }
    window.addEventListener("googenie:feature-request-updated", onUpdate);
    return () => window.removeEventListener("googenie:feature-request-updated", onUpdate);
  }, [loadFeatures, loadIncoming, isManager]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleRequest(featureKey: string) {
    setRequestBusy(featureKey);
    try {
      await meApi.createFeatureRequest(featureKey);
      const target =
        role === "user" ? "your manager" : role === "manager_admin" ? "the admin" : "your manager";
      setToast({
        kind: "success",
        message: `Request sent to ${target}. You'll be notified when it's reviewed.`,
      });
      // Broadcast so the manager's notification bell badge updates immediately
      broadcastRequestUpdate();
      await loadFeatures();
    } catch (e) {
      setToast({ kind: "error", message: getErrorMessage(e) });
    } finally {
      setRequestBusy(null);
    }
  }

  async function handleDecide(id: number, decision: "approved" | "denied") {
    setDecideBusy(id);
    try {
      await meApi.decideFeatureRequest(id, decision);
      setToast({
        kind: "success",
        message: decision === "approved" ? "Request approved." : "Request denied.",
      });
      // Broadcast so both the requester's feature list and the notification bell refresh
      broadcastRequestUpdate();
      await loadIncoming();
    } catch (e) {
      setToast({ kind: "error", message: getErrorMessage(e) });
    } finally {
      setDecideBusy(null);
    }
  }

  const enabledCount = features.filter((f) => f.isEnabled).length;
  // If the catalog wasn't returned yet, fall back to features (server populates it on first call)
  const featureRows: FeatureToggleWithLabel[] =
    features.length > 0
      ? features
      : catalog.map((c) => ({
          tenantId: tenantId ?? "",
          userId: userId ?? "",
          featureKey: c.key,
          label: c.label,
          isEnabled: false,
        }));

  const pendingIncomingCount = incoming.filter((r) => r.status === "pending").length;
  const displayName = fullName ?? email ?? userId ?? "—";
  const initials = displayName.charAt(0).toUpperCase();

  const requestTargetLabel =
    role === "user" ? "your manager" : role === "manager_admin" ? "the admin" : "your manager";

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Your access level, feature permissions, and recent activity." />

      {/* Toast */}
      {toast && (
        <div
          className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
            toast.kind === "success"
              ? "bg-primary/10 text-primary border border-primary/30"
              : "bg-error/10 text-error border border-error/30"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Identity card */}
      <div className="glass-panel rounded-2xl p-6 mb-8 flex items-center gap-6">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={displayName}
            className="w-16 h-16 rounded-full object-cover border-2 border-primary/20 flex-shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container font-semibold text-2xl flex-shrink-0">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="font-headline text-xl text-ink-text">{displayName}</h2>
          {email && <p className="text-sm text-on-surface-variant mt-0.5">{email}</p>}
          <p className="text-xs text-outline mt-0.5">Tenant: {tenantId}</p>
          <div className="mt-2">
            <RoleBadge role={role ?? "user"} />
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-3xl font-headline text-primary">{enabledCount}</p>
          <p className="text-xs text-on-surface-variant uppercase tracking-widest">features on</p>
        </div>
      </div>

      {/* Incoming requests banner (managers + big bosses) */}
      {isManager && pendingIncomingCount > 0 && (
        <div className="mb-6 px-4 py-3 rounded-xl bg-tertiary/10 border border-tertiary/30 flex items-center gap-3">
          <Icon name="notifications_active" className="text-tertiary" />
          <p className="text-sm text-ink-text">
            You have <span className="font-semibold">{pendingIncomingCount}</span> pending feature
            request{pendingIncomingCount === 1 ? "" : "s"} waiting for your review below.
          </p>
        </div>
      )}

      {/* Feature: daily_digest — "what's on my plate" widget */}
      {hasFeature("daily_digest") && (
        <div className="mb-6">
          <DigestPanel />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feature access */}
        <Card
          header={
            <span className="text-sm font-semibold text-ink-text flex items-center gap-2">
              <Icon name="toggle_on" className="text-base text-primary" />
              My Feature Access
            </span>
          }
          padded={false}
        >
          <DataState loading={loadingF} error={errorF} show={featureRows.length > 0} empty="No features available.">
            <div className="p-5 space-y-3 max-h-[480px] overflow-y-auto">
              {canRequest && enabledCount === 0 && (
                <p className="text-xs text-on-surface-variant px-1 mb-1">
                  You don&rsquo;t have any features enabled yet. Tap{" "}
                  <span className="font-semibold text-primary">Request</span> to ask {requestTargetLabel} for access.
                </p>
              )}
              {/* Group rows by catalog `group` so 19 keys stay scannable. */}
              {groupedFeatures().map(({ group, features }) => {
                const groupRows = features
                  .map((meta) => featureRows.find((r) => r.featureKey === meta.key))
                  .filter((r): r is FeatureToggleWithLabel => Boolean(r));
                if (groupRows.length === 0) return null;
                return (
                  <div key={group} className="space-y-2 pt-2 first:pt-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant px-1">
                      {group}
                    </p>
                    {groupRows.map((f) => (
                      <FeatureRow
                        key={f.featureKey}
                        toggle={f}
                        pending={pending[f.featureKey]}
                        history={history[f.featureKey]}
                        canRequest={canRequest}
                        onRequest={handleRequest}
                        busy={requestBusy === f.featureKey}
                      />
                    ))}
                  </div>
                );
              })}
              {/* Render any uncategorised rows last (defensive — shouldn't happen). */}
              {(() => {
                const knownKeys = new Set(FEATURE_CATALOG.map((f) => f.key));
                const uncategorised = featureRows.filter((r) => !knownKeys.has(r.featureKey));
                return uncategorised.map((f) => (
                  <FeatureRow
                    key={f.featureKey}
                    toggle={f}
                    pending={pending[f.featureKey]}
                    history={history[f.featureKey]}
                    canRequest={canRequest}
                    onRequest={handleRequest}
                    busy={requestBusy === f.featureKey}
                  />
                ));
              })()}
            </div>
          </DataState>
        </Card>

        {/* Own activity */}
        <Card
          header={
            <span className="text-sm font-semibold text-ink-text flex items-center gap-2">
              <Icon name="history" className="text-base text-primary" />
              My Recent Activity
            </span>
          }
          padded={false}
        >
          <DataState
            loading={loadingA}
            error={errorA}
            show={activity.length > 0}
            empty="No activity recorded yet. Use the workspace to generate events."
          >
            <div className="px-5 pb-4 pt-2 max-h-[480px] overflow-y-auto">
              {activity.map((ev, i) => (
                <ActivityRow key={i} event={ev} />
              ))}
            </div>
          </DataState>
        </Card>
      </div>

      {/* Booking links — Calendly-style public scheduler */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BookingLinksPanel />
        {hasFeature("snippets") && <SnippetsPanel />}
        {hasFeature("ai_auto_categorize") && <AutoCategorizePanel />}
        {hasFeature("schedule_send") && <ScheduledEmailsPanel />}
      </div>

      {/* Incoming feature requests (managers + super admins) */}
      {isManager && (
        <div className="mt-6">
          <Card
            header={
              <span className="text-sm font-semibold text-ink-text flex items-center gap-2">
                <Icon name="inbox" className="text-base text-tertiary" />
                Feature Requests From My Team
                {pendingIncomingCount > 0 && (
                  <span className="badge badge-success text-xs">{pendingIncomingCount} pending</span>
                )}
              </span>
            }
            padded={false}
          >
            <DataState
              loading={loadingI}
              error={errorI}
              show={incoming.length > 0}
              empty="No feature requests from your team yet."
            >
              <div className="px-5 pb-4 pt-2 max-h-[480px] overflow-y-auto">
                {incoming.map((req) => (
                  <IncomingRequestRow key={req.id} request={req} busyId={decideBusy} onDecide={handleDecide} />
                ))}
              </div>
            </DataState>
          </Card>
        </div>
      )}
    </div>
  );
}
