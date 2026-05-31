# Features

## Today

The default view shows a snapshot of any chosen day.

- **Arrow navigation** — step one day forward or back with ← Prev / Next → buttons; a text label shows the current date
- **Today button** — jumps back to the real current date in one click
- **Quick stats** — four stat tiles: classes that day, homework due that day, due next day, and total open assignments
- **Classes** — lists scheduled classes for the day's weekday, pulled from the weekly schedule
- **Homework due soon** — shows items due that day and the following day with completion toggle and edit/delete actions
- **Review tasks** — per-day study tasks with subject label, completion toggle, and inline add form

---

## This Week

A scrollable week view offset from the current week.

- **Week navigation** — ← Prev week / Next week → buttons with a date range label; "This week" resets to now
- **Per-day blocks** — each day shows its scheduled classes, homework due that day, and review tasks in a three-column layout
- **Review task toggles** — mark review tasks complete directly from the week view

---

## Month & Semester

A topic roadmap for planning what gets covered each month.

- **Month range** — auto-generated from your semester start/end dates set in Setup (defaults to current + 5 months if not set)
- **Add topics** — attach a subject and free-text topic or unit to any month
- **Current month highlight** — the current month is labelled "current month" in the header
- **Topic count** — each month block shows how many topics are logged

---

## Homework & Assignments

A full assignment tracker with filtering.

- **Add / edit / delete** — modal form with title, subject, due date, priority, and optional notes
- **Completion toggle** — checkbox marks an assignment done; completed items fade and strike through
- **Priority levels** — High / Medium / Low with colour-coded tags
- **Filters** — All · Open · Done · Overdue · This week

---

## Review Tasks

Study tasks tied to a specific date, separate from homework.

- **Add from Today** — inline form on the Today panel adds a task to the currently viewed date
- **Add from Homework tab** — modal form with date picker and subject selector
- **Full list** — the Homework tab shows all review tasks grouped by date with filters: All · Upcoming · Today · Past · Open · Done
- **Edit and reschedule** — the modal lets you change the date, moving the task to a new day
- **Subject tagging** — optionally link a task to a subject for colour coding

---

## Study Helper

Generates structured study content from your live planner data.

| Type | What it generates |
|---|---|
| Daily homework plan | Prioritised study blocks based on what's due that day and next |
| Weekly study schedule | Day-by-day plan for the current week using your schedule and due dates |
| Test prep checklist | Step-by-step revision checklist for a subject/topic |
| Break down a big project | Six-stage framework for essays, projects, or major assignments |
| Reading guide | Before / during / after reading strategy with tips |

All output is rendered as formatted HTML inside the panel — no external AI calls.

---

## Setup

### Basics
- Student name, grade (6 / 7 / 8), semester start and end dates

### Subjects
- Add subjects with an optional teacher name
- Colours are assigned cyclically from eight distinct palette values (`--c1` through `--c8`)
- Removing a subject also removes its associated classes, homework, topics, and review tasks

### Weekly schedule
- Add classes one by one (day, time, subject, optional room)
- Or paste a raw timetable and let the bulk parser extract it — format: `Mon 9:00 Math (Rm 12)`, one line per class; AM/PM time is accepted; unknown subjects are created automatically

### Storage status
- Live tiles showing each bucket's save state (idle / saving / saved / error) and size in KB

---

## Export & Import

Full data round-trip via Logseq-compatible Markdown.

### Export
- Clicking **↓ Export to Markdown** downloads `study-ledger-YYYY-MM-DD.md`
- All six buckets are serialised: Basics, Subjects, Schedule, Homework, Topics, Reviews
- Format uses `key:: value` block properties and `- [ ]` / `- [x]` task syntax — native to Logseq

### Example export (excerpt)

```markdown
## Subjects
- Mathematics
  - teacher:: Mr. Smith
  - color:: var(--c1)

## Homework
- [ ] Write essay
  - subject:: Mathematics
  - due:: 2026-05-25
  - priority:: high
  - notes:: 5 pages MLA format
- [x] Read chapter 5
  - subject:: Mathematics
  - due:: 2026-05-23

## Reviews
### 2026-05-23 — Sat, May 23
- [ ] Flashcards
  - subject:: Mathematics
```

### Import
- Clicking **↑ Import Markdown** opens a file picker
- A confirmation dialog shows a summary (subjects, homework items, review tasks) before replacing data
- Subjects are rebuilt from names; IDs are re-generated on import
- Invalid or missing fields are silently skipped; remaining data still loads

---

## Storage & persistence

State is split into six independent `localStorage` buckets so saving homework never re-serialises the schedule or subjects:

| Bucket | Contents |
|---|---|
| `planner-basics` | Name, grade, semester dates |
| `planner-subjects` | Subject list with colours and teachers |
| `planner-schedule` | Weekly class entries |
| `planner-homework` | Homework items |
| `planner-topics` | Monthly topic roadmap |
| `planner-reviews` | Per-date review tasks |

On first load, a one-time migration moves any legacy single-blob data (`planner-data`) into the new buckets.
