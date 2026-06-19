# GooGenie — Hackathon Demo Script

> Target runtime: **3–5 minutes** · Track: **Command Center Builder**
> Deployed: <https://googenie-web.onrender.com>

## Demo Goal

Show that **GooGenie** removes friction from email and calendar workflows using
**Corsair integrations**, **agent automation**, and a modern focused UI — with
a true enterprise **RBAC + feature-gating** model layered on top.

---

## Submission Form Descriptions

### Short Description

GooGenie is an AI command center for Gmail and Google Calendar. It helps teams handle email and scheduling faster with smart inbox triage, one-click drafting, booking links, snippets, and follow-up tracking in one place.

### Medium Description

GooGenie solves a simple problem: people waste too much time jumping between email, calendar, and productivity tools.

With GooGenie, teams can do everything in one workflow: prioritize emails that need replies, draft and send responses quickly, schedule meetings from email context, share booking links, and reuse snippets for common messages.

It is also built for teams, not just individuals. Managers can control who gets premium features, teammates can request access when needed, and everyone works from the same clean, fast workspace.

### Long Description

GooGenie is a single command center for email and scheduling work. Instead of switching across multiple apps, users can triage inboxes, draft responses, book meetings, and track follow-ups in one focused interface.

Key features include:
- Reply-Needed inbox triage so urgent threads are easy to spot.
- Fast compose tools with improve/rewrite actions.
- Snippets for reusable messages.
- Booking Links so others can pick a time without back-and-forth.
- Drafts and Sent views for full email workflow coverage.
- Calendar scheduling with conflict-aware suggestions.

For team use, GooGenie includes role-based access controls and manager approvals for premium features. This means companies can roll out advanced AI features safely while giving each user the right level of access.

In short, GooGenie helps teams respond faster, schedule faster, and miss fewer commitments.

---

## 0:00 – 0:30 · Opening

**Say:**
> "GooGenie is an AI-first command center for Gmail and Google Calendar. Instead
> of clicking through multiple screens, users search, compose, schedule, and
> automate from one focused workflow — with manager-controlled access to every
> premium feature."

**Do:**
1. Open the landing page (`/`).
2. Call out the **"What's new"** pill — *Booking Links · Snippets · Drafts & Sent folders*.
3. Highlight the tier story: **13 free features · 14 manager-gated premium · Built on Corsair + Mistral**.
4. Click **Get GooGenie** → demo login.

---

## 0:30 – 1:15 · Smart Homepage → Gmail-like Workspace

**Say:**
> "The shell is intent-aware. Sidebar folders mirror Gmail, but on top we add
> a Reply-Needed triage queue powered by AI."

**Do:**
1. Land in `/inbox` — point out the folder rail: **All / Unread / Reply needed / Drafts / Sent / Primary / Social / Promotions / Updates / Forums**.
2. Click **Reply needed** — triage queue of threads the AI flagged as owing a response.
3. Switch to **Drafts** — inline **Send / Edit / Delete** on every Gmail draft.
4. Switch to **Sent** — last 20 sent threads, searchable.

---

## 1:15 – 2:00 · Fast Email Operations

**Say:**
> "Every common action is one keystroke away. Snippets and AI compose are
> first-class."

**Do:**
1. Open a thread, press **`r`** to reply.
2. Type `;intro` + **Tab** → the **Snippet** expands inline.
3. Run `/improve` in the compose toolbar → Mistral rewrites the draft.
4. **Send**, then show the search chips / instant filtering.

---

## 2:00 – 2:45 · Calendar + Booking Links

**Say:**
> "Scheduling is integrated directly with inbox context — and Booking Links let
> external visitors grab time without back-and-forth."

**Do:**
1. Open `/calendar` — create an event with an attendee.
2. Show **availability check** + conflict-aware suggestion.
3. Open `/booking-links`, copy a public URL → open `/book/{slug}` in a new tab.
4. Pick a slot as a "visitor" → event appears live on the calendar.

---

## 2:45 – 3:45 · Agent + Corsair MCP — the Wow Moment

**Say:**
> "Now the same flow in **one command** using Corsair MCP tools."

**Do:**
1. Press **⌘K** to open the agent panel.
2. Prompt:
   > *"Schedule a meeting with dev@corsair.dev next Thursday at 9 AM and email
   > them that I look forward to meeting."*
3. Show the **tool-execution trace** — Gmail + Calendar tool calls streamed inline.
4. Confirm: event created, email drafted/sent — both visible in the live shell.

---

## 3:45 – 4:30 · Real-Time, Safety & RBAC

**Say:**
> "GooGenie updates in real time and enforces enterprise-grade controls."

**Do:**
1. Show the **bell** lighting up via SSE + browser push + chime.
2. Switch to a **Member** account → premium feature is locked.
3. Click **Request access** → switch to **Manager** account → approve from `/manager/team`.
4. Member's UI unlocks instantly. Mention demo-mode one-call guard for AI usage.

---

## 4:30 – 5:00 · Close & Roadmap

**Say:**
> "V1 proves core workflows. V2 adds smart triage and scheduling intelligence.
> V3 brings explainable AI, commitment tracking, and enterprise governance.
> V4 introduces mission mode and a live meeting copilot. V5 scales GooGenie with
> compliance, reliability, and AI-quality guardrails for enterprise deployment."

**Do:**
1. **V4 Mission Mode** — user states a goal, GooGenie proposes multi-step email + calendar execution with approval gates.
2. **V4 Live Meeting Copilot** — pre-briefs, outcome capture, follow-up drafting.
3. **V5 Enterprise Readiness** — SSO/SCIM, retention + audit controls, resilient webhook/queue replay.
4. **V5 AI Quality Harness** — benchmark tasks, regression scoring, release gates.

---

## Judge Talking Points (if asked)

- **Differentiator:** intent-first workflow + per-user RBAC feature gating — not just another mail client clone.
- **Technical depth:** Corsair integrations, MCP tool execution, real-time SSE + webhook updates, persisted React Query cache for sub-second feel.
- **Trust & safety:** approval checkpoints, explainability, guarded demo AI usage.
- **Business potential:** extensible architecture for CRM, chat, and enterprise automation.
- **V4 value:** mission-driven workflows + predictive prioritization reduce decision load.
- **V5 value:** governance, reliability, and measurable AI quality make GooGenie enterprise-procurement ready.

---

## Backup Prompts for the Live Agent Demo

1. *"Find emails about contract renewal and summarize next actions."*
2. *"Draft a follow-up to all unread customer escalation threads."*
3. *"Move my 4 PM meeting to tomorrow 11 AM and notify attendees."*
4. *"Show me overdue follow-ups from last week and create reminders."*

---

## Contingency Plan (if API is slow)

1. Show preloaded mock thread and calendar artifacts (persisted React Query cache covers this automatically).
2. Continue with recorded tool-output screenshots.
3. Emphasize architecture + execution logs.
4. Return to live flow once the response arrives.


