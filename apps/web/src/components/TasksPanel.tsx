/**
 * TasksPanel (Feature C1 — Email-to-task extractor).
 *
 * Surfaces AI-extracted tasks from recent inbox messages. Shows a "Scan now"
 * button that triggers extraction, then renders the open task list with
 * priority badges, deadlines, and one-click done/dismiss actions.
 */
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { aiApi, type TaskRecord } from "../api/client";
import { useFeatures } from "../contexts/FeatureContext";
import { Icon } from "./Icon";

export default function TasksPanel() {
  const router = useRouter();
  const { loading: featuresLoading } = useFeatures();
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ scanned: number; created: number; skipped: number } | null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await aiApi.listTasks();
      setTasks(r.tasks);
    } catch (e) {
      console.error("Tasks load error", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Wait until the FeatureContext has resolved so the parent's
    // hasFeature("ai_task_extractor") gate is authoritative. This avoids
    // a 403 on /me/tasks for users without the add-on while features load.
    if (featuresLoading) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featuresLoading]);

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const r = await aiApi.extractTasks();
      setScanResult({ scanned: r.scanned, created: r.created, skipped: r.skipped });
      await load();
    } catch (e) {
      console.error("Scan error", e);
    } finally {
      setScanning(false);
    }
  }

  async function handleStatusChange(taskId: number, status: "done" | "dismissed") {
    try {
      await aiApi.updateTask(taskId, status);
      setTasks((cur) => cur.filter((t) => t.id !== taskId));
    } catch (e) {
      console.error("Status update error", e);
    }
  }

  const highPriority = tasks.filter((t) => t.priority === "high");
  const others = tasks.filter((t) => t.priority !== "high");

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "var(--c-surface-container-low)",
        border: "1px solid var(--c-outline-variant)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon name="task_alt" className="text-base" style={{ color: "var(--c-tertiary)" }} />
          <h3 className="font-semibold text-sm" style={{ color: "var(--c-on-surface)" }}>
            What&rsquo;s on my plate
          </h3>
          {tasks.length > 0 && (
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold"
              style={{ background: "var(--c-tertiary)", color: "var(--c-on-tertiary)" }}
            >
              {tasks.length}
            </span>
          )}
        </div>
        <button
          onClick={() => void handleScan()}
          disabled={scanning}
          className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-50"
          style={{ color: "var(--c-tertiary)" }}
        >
          <Icon name={scanning ? "progress_activity" : "auto_awesome"} className="text-sm" />
          {scanning ? "Scanning…" : "Scan inbox"}
        </button>
      </div>

      {scanResult && (
        <p className="text-xs mb-3" style={{ color: "var(--c-on-surface-variant)" }}>
          Scanned {scanResult.scanned}, created {scanResult.created} new task{scanResult.created !== 1 && "s"}
          {scanResult.skipped > 0 && `, skipped ${scanResult.skipped} already-processed`}.
        </p>
      )}

      {loading && <p className="text-xs text-gray-500">Loading tasks…</p>}

      {!loading && tasks.length === 0 && (
        <div className="text-center py-6">
          <p className="text-sm" style={{ color: "var(--c-on-surface-variant)" }}>
            No open tasks. Click &ldquo;Scan inbox&rdquo; to extract action items from your recent emails.
          </p>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="space-y-2">
          {[...highPriority, ...others].map((t) => (
            <TaskCard
              key={t.id}
              task={t}
              onClick={() => router.push(`/inbox?thread=${t.threadId}`)}
              onDone={() => void handleStatusChange(t.id, "done")}
              onDismiss={() => void handleStatusChange(t.id, "dismissed")}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  onClick,
  onDone,
  onDismiss,
}: {
  task: TaskRecord;
  onClick: () => void;
  onDone: () => void;
  onDismiss: () => void;
}) {
  const priorityColor =
    task.priority === "high" ? "var(--c-error)" : task.priority === "low" ? "var(--c-on-surface-variant)" : "var(--c-primary)";

  const overdueOrSoon = (() => {
    if (!task.deadline) return null;
    const ms = new Date(task.deadline).getTime() - Date.now();
    if (ms < 0) return "overdue";
    if (ms < 24 * 3600 * 1000) return "today";
    if (ms < 3 * 24 * 3600 * 1000) return "soon";
    return null;
  })();

  const deadlineLabel = task.deadline
    ? new Date(task.deadline).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div
      className="rounded-xl px-3 py-2.5 flex items-start gap-3 group transition-all hover:shadow-sm cursor-pointer"
      style={{
        background: "var(--c-surface-container)",
        border: `1px solid ${overdueOrSoon === "overdue" ? "var(--c-error)" : "var(--c-outline-variant)"}`,
      }}
      onClick={onClick}
    >
      <span
        className="w-1 self-stretch rounded-full shrink-0 mt-1"
        style={{ background: priorityColor }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className="text-[10px] uppercase font-bold tracking-wider"
            style={{ color: priorityColor }}
          >
            {task.priority}
          </span>
          {deadlineLabel && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{
                background:
                  overdueOrSoon === "overdue"
                    ? "var(--c-error-container)"
                    : "var(--c-surface-container-high)",
                color:
                  overdueOrSoon === "overdue"
                    ? "var(--c-error)"
                    : "var(--c-on-surface-variant)",
              }}
            >
              {overdueOrSoon === "overdue" ? "⚠ " : ""}
              by {deadlineLabel}
            </span>
          )}
        </div>
        <p
          className="text-sm font-medium truncate"
          style={{ color: "var(--c-on-surface)" }}
        >
          {task.title}
        </p>
        {task.senderEmail && (
          <p className="text-xs truncate" style={{ color: "var(--c-on-surface-variant)" }}>
            from {task.senderEmail}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDone();
          }}
          className="btn-ghost p-1"
          title="Mark done"
          style={{ color: "var(--c-primary)" }}
        >
          <Icon name="check_circle" className="text-base" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="btn-ghost p-1"
          title="Dismiss"
          style={{ color: "var(--c-on-surface-variant)" }}
        >
          <Icon name="close" className="text-base" />
        </button>
      </div>
    </div>
  );
}
