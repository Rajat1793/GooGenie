"use client";

/**
 * SnippetsPanel — manage reusable text snippets on the Profile page.
 *
 * Snippets are expanded inline in ComposeModal: the user types `;hotkey`
 * followed by Tab or Space and the body inflates at the cursor.
 */
import { useEffect, useState } from "react";
import { snippetsApi, type SnippetRow } from "../api/client";
import { getErrorMessage } from "../lib/errors";
import { Icon } from "./Icon";

interface DraftSnippet {
  name: string;
  hotkey: string;
  body: string;
}

const EMPTY_DRAFT: DraftSnippet = { name: "", hotkey: "", body: "" };

export function SnippetsPanel() {
  const [snippets, setSnippets] = useState<SnippetRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<DraftSnippet>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<number | null>(null);

  async function refresh() {
    try {
      const r = await snippetsApi.list();
      setSnippets(r.snippets);
    } catch (e) {
      setErr(getErrorMessage(e, "Failed to load snippets"));
    }
  }

  useEffect(() => { void refresh(); }, []);

  function resetDraft() {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  }

  async function handleSave() {
    if (!draft.name.trim() || !draft.hotkey.trim() || !draft.body.trim()) {
      setErr("Name, hotkey and body are all required.");
      return;
    }
    if (!/^[a-z0-9_-]{1,32}$/i.test(draft.hotkey)) {
      setErr("Hotkey must be 1–32 chars: letters, digits, _ or -.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (editingId !== null) {
        await snippetsApi.update(editingId, {
          name: draft.name,
          hotkey: draft.hotkey,
          body: draft.body,
        });
      } else {
        await snippetsApi.create(draft);
      }
      resetDraft();
      await refresh();
    } catch (e) {
      setErr(getErrorMessage(e, "Failed to save snippet"));
    } finally {
      setBusy(false);
    }
  }

  function handleEdit(s: SnippetRow) {
    setDraft({ name: s.name, hotkey: s.hotkey, body: s.body });
    setEditingId(s.id);
  }

  async function handleDelete(s: SnippetRow) {
    if (!window.confirm(`Delete snippet "${s.name}"? This cannot be undone.`)) return;
    try {
      await snippetsApi.delete(s.id);
      if (editingId === s.id) resetDraft();
      await refresh();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  }

  return (
    <div className="nimbus-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="code_blocks" className="text-base" style={{ color: "var(--c-primary)" }} />
          <h3 className="text-sm font-semibold" style={{ color: "var(--c-on-surface)" }}>
            Snippets
          </h3>
        </div>
        {editingId !== null && (
          <button
            onClick={resetDraft}
            className="text-[11px] px-2 py-1 rounded-full"
            style={{ color: "var(--c-on-surface-variant)" }}
          >
            Cancel edit
          </button>
        )}
      </div>
      <p className="text-[11px]" style={{ color: "var(--c-on-surface-variant)" }}>
        Save reusable replies. In compose, type{" "}
        <code className="px-1 py-0.5 rounded" style={{ background: "var(--c-surface-container-high)" }}>
          ;hotkey
        </code>{" "}
        then press <strong>Tab</strong> or <strong>Space</strong> to expand.
      </p>

      {err && (
        <div className="text-xs px-3 py-2 rounded-lg" style={{ background: "var(--c-error-container)", color: "var(--c-error)" }}>
          {err}
        </div>
      )}

      {/* Editor form */}
      <div
        className="rounded-xl p-3 space-y-2"
        style={{
          background: "var(--c-surface-container)",
          border: "1px solid var(--c-outline-variant)",
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="Name (e.g. Thanks)"
            className="text-xs rounded-md px-2 py-1.5 w-full"
            style={{ background: "var(--c-surface)", border: "1px solid var(--c-outline-variant)", color: "var(--c-on-surface)" }}
          />
          <input
            value={draft.hotkey}
            onChange={(e) => setDraft({ ...draft, hotkey: e.target.value.replace(/\s+/g, "") })}
            placeholder="Hotkey (e.g. thx)"
            className="text-xs rounded-md px-2 py-1.5 w-full font-mono"
            style={{ background: "var(--c-surface)", border: "1px solid var(--c-outline-variant)", color: "var(--c-on-surface)" }}
          />
        </div>
        <textarea
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          placeholder={"Body text…\n\nThanks so much — talk soon,\n—Me"}
          rows={4}
          className="w-full text-xs rounded-md px-2 py-1.5 resize-y"
          style={{ background: "var(--c-surface)", border: "1px solid var(--c-outline-variant)", color: "var(--c-on-surface)" }}
        />
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1 disabled:opacity-50"
            style={{ background: "var(--c-primary)", color: "var(--c-on-primary)" }}
          >
            <Icon name={editingId !== null ? "save" : "add"} className="text-sm" />
            {editingId !== null ? "Save changes" : "Add snippet"}
          </button>
        </div>
      </div>

      {/* List */}
      {snippets === null ? (
        <div className="text-xs" style={{ color: "var(--c-on-surface-variant)" }}>Loading…</div>
      ) : snippets.length === 0 ? (
        <div className="text-xs text-center py-3" style={{ color: "var(--c-on-surface-variant)" }}>
          No snippets yet. Create your first one above.
        </div>
      ) : (
        <ul className="space-y-2">
          {snippets.map((s) => (
            <li
              key={s.id}
              className="rounded-xl p-3 flex flex-col gap-1"
              style={{
                background: "var(--c-surface-container)",
                border: "1px solid var(--c-outline-variant)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-xs font-semibold truncate" style={{ color: "var(--c-on-surface)" }}>
                    {s.name}
                  </span>
                  <code
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{
                      background: "var(--c-tertiary-container)",
                      color: "var(--c-on-tertiary-container)",
                    }}
                  >
                    ;{s.hotkey}
                  </code>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleEdit(s)}
                    className="btn-ghost p-1"
                    title="Edit snippet"
                  >
                    <Icon name="edit" className="text-sm" />
                  </button>
                  <button
                    onClick={() => handleDelete(s)}
                    className="btn-ghost p-1"
                    title="Delete snippet"
                    style={{ color: "var(--c-error)" }}
                  >
                    <Icon name="delete" className="text-sm" />
                  </button>
                </div>
              </div>
              <p
                className="text-[11px] whitespace-pre-wrap line-clamp-3"
                style={{ color: "var(--c-on-surface-variant)" }}
              >
                {s.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
