# The Study Ledger

> A single-file student planner — no build step, no login, no cloud.

Track your weekly schedule, homework, review tasks, and semester roadmap all in one place. Data lives entirely in your browser and can be exported to [Logseq](https://logseq.com)-compatible Markdown at any time.

---

## Getting started

```bash
npm start          # serves on http://localhost:3000 and opens the browser
```

Or just open `index.html` directly in any browser — no server required.

### Run tests

```bash
npm test           # Playwright end-to-end tests (requires the dev server on port 3000)
npm run test:ui    # Playwright UI mode
```

---

## Tech stack

| Layer | Choice |
|---|---|
| UI | Vanilla HTML + CSS + JS (single file) |
| Fonts | Fraunces · Manrope (Google Fonts) |
| Storage | `localStorage` (with `window.storage` API fallback) |
| Tests | Playwright |
| Dev server | `http-server` |

No framework, no bundler, no dependencies at runtime.

---

## Features at a glance

- **Today** — day-by-day navigation, classes, homework due, review tasks, and quick stats
- **This Week** — week-offset view of schedule, due assignments, and review tasks per day
- **Month & Semester** — topic roadmap organised by subject and month
- **Homework** — add, edit, complete, and filter assignments by status or due date
- **Review Tasks** — per-day study tasks with subject tagging and completion tracking
- **Study Helper** — generates daily plans, weekly schedules, test-prep checklists, project breakdowns, and reading guides from your live data
- **Setup** — manage subjects, paste-to-parse timetables, view storage bucket status
- **Export / Import** — full data round-trip as Logseq-compatible Markdown

See [FEATURES.md](FEATURES.md) for a detailed breakdown.

---

## Data & privacy

Everything is stored locally in your browser (`localStorage`). Nothing is sent to any server. Use the **Export** button in Setup to back up your data as a Markdown file.

---

## License

MIT
