# Study Helper × Gemma — Review & Plan

## 1. Current state (May 2026)

Two parallel systems already exist in `index.html`:

**Study Helper panel (`#panel-helper`, `generateHelper()` at line ~3165)** — five hand-written templates:

- Daily homework plan (pulls real homework, sorts by priority)
- Weekly study schedule (reads `state.schedule`)
- Test prep checklist (static text)
- Project breakdown (static text)
- Reading guide (static text)

Output: HTML written into `#helperOutput`. **No AI calls.**

**Gemma layer (`AI_DEFAULTS`, `aiGenerate()` at line ~1713)** — already wired to local Ollama:

- Settings card in Setup: URL, model, enable toggle, test-connection
- `aiBreakdownHw()` — homework → markdown checklist
- `aiExplainTopic()` — monthly topic → 3–5 sentence explainer
- `aiDraftReviews()` — suggested review tasks → JSON parsed → checkbox UI
- Floating chat sidebar (`aiChatSend()`) with planner-context system prompt

So Gemma is connected, but the **Study Helper panel itself ignores it**. That is the main gap.

## 2. Review findings

What works well today:

- `aiCfg()` / `aiGenerate()` is a clean choke-point — easy to extend.
- Each AI feature owns its own loading/error/dismiss state object — pattern is repeatable.
- The static Study Helper templates are still useful as **deterministic fallbacks** when Gemma is disabled or Ollama is down. Don't delete them.

What's missing or weak:

- Static templates ignore the student's actual subjects, semester dates, and grade beyond the bare minimum.
- No streaming — long Gemma outputs feel frozen (the UI just shows "thinking…" for 10–30s on `gemma2:2b`).
- No way to **save Study Helper output** back into Homework or Reviews (Project breakdown → homework sub-tasks would be high value).
- Chat history is session-only; reopening loses context. No persistence to a `planner-chat` bucket.
- No prompt-injection guard: user `details` text is concatenated into prompts without scrubbing. Low risk on a local model, still worth a one-line strip.
- No token/length cap — `gemma2:9b` users will hit slow responses with no warning.
- No "explain why" affordance on the static plans (e.g. "why is this block first?") — natural place to layer Gemma on top of deterministic output.

## 3. Helpful feature set (ranked)

Highest leverage first. Each one should fall back to a deterministic version when `state.ai.enabled === false`.

1. **AI-augment the existing 5 Helper types.** Each `generateHelper()` branch builds the same factual scaffold it does today, then — if Gemma is on — sends `{ scaffold, student context, user details }` to the model and shows the AI version with a "Show plain version" toggle.
2. **"Break into homework items" button on Project breakdown.** Take the 6-step framework, ask Gemma to specialise it for the entered project, then offer a checkbox list that creates real `state.homework` entries with staggered due dates leading to the project due date.
3. **Test prep → Review tasks generator.** For a test on date D in subject S, generate N review tasks distributed across the days leading up to D and insert into `state.reviews`.
4. **Streaming responses.** Switch `aiGenerate()` to `stream: true` and append tokens to the panel as they arrive. Removes the dead-air problem. Pattern: replace `fetch(...).then(json)` with an `eachLine` reader over the NDJSON stream.
5. **"Explain this assignment" inline button on homework rows** (separate from "Break down"). Short paragraph aimed at the student, not a checklist.
6. **Weekly digest (Sunday).** One-shot summary of next week: what's due, what tests are coming, suggested focus. Renderable into the Today panel header for the first day of the week.
7. **Persist chat history** to a new `planner-chat` bucket (capped at last ~30 turns) so the sidebar survives reloads.
8. **Subject-aware vocabulary list.** From a topic or reading title, generate a 5–10 word glossary the student can add to reviews.
9. **Self-quiz mode.** Given a topic, Gemma generates 5 Q&A flashcards rendered as click-to-flip cards. Optional save to a new `planner-flashcards` bucket.
10. **"Why this order?" button on the daily plan.** One paragraph from Gemma justifying the ordering — teaches study strategy, not just gives a list.

## 4. Implementation plan

### Phase 1 — Plumbing (small, no UI shift)

Goal: make Gemma a first-class option inside the Helper panel without changing behaviour for disabled users.

- **`aiGenerate(system, user, opts = {})`** — add `opts.stream` (default `false`), `opts.onToken(chunk)`, `opts.maxTokens` (passed as `options.num_predict`). Keep the non-streaming path for `aiExplainTopic` etc.
- **`aiAvailable()`** helper — returns `state.ai && state.ai.enabled` so call sites stop duplicating the check.
- **`sanitizeUserText(s)`** — collapse whitespace, drop control chars, cap at 1000 chars. Apply to `helperDetails`, homework titles, topic text before injecting into prompts.
- **Settings additions** to the Gemma card in `#panel-setup`:
  - Stream toggle (default on)
  - Max length slider (200 / 500 / 1000 tokens, default 500)
  - Persisted in `state.ai.stream`, `state.ai.maxTokens`

Tests to add (Playwright):

- `tests/ai-fallback.spec.js` — with `aiEnabled=false`, all Helper outputs render the deterministic version.
- `tests/ai-sanitize.spec.js` — pasting `<script>alert(1)</script>` into details produces escaped output (existing `escapeHtml` should cover, but assert).

### Phase 2 — AI-augment the Helper panel

In `generateHelper()`:

1. Refactor each branch into `buildXxxScaffold()` that returns `{ html, facts }`. `facts` is the structured data the prompt needs (homework list, subject, day, etc.).
2. New `renderHelperOutput(scaffold, mode)` where `mode ∈ {'plain', 'ai'}`. Plain mode renders today's HTML unchanged. AI mode renders the scaffold above a Gemma-generated section.
3. UI: when Gemma is enabled, default to AI mode and show a "Show plain version" link. When disabled, plain only.
4. Streaming: render scaffold immediately, then append the AI section token by token into a `<div id="helperAiStream">` element.

Prompts (system messages — keep concise, Gemma2:2b is sensitive to long preambles):

- **Daily**: "You are a study coach for a grade {G} student. Below is a draft plan. Rewrite it as 3–5 numbered blocks with a one-line rationale per block. Mention break placement. Plain text, no markdown headings."
- **Weekly**: "Given the week's classes and due work below, suggest one 20-minute evening focus per weekday plus a weekend strategy. Bullet list, one line each."
- **Test prep**: "For a test on {date} covering {topic}, produce a 7-day study plan working backward from the test. Each day: one sentence."
- **Project**: "Specialise the 6-stage framework below for the project: {details}. Estimate hours per stage. Keep total under 80 words."
- **Reading**: "Write a 5-sentence reading strategy specific to '{details}'. No bullet points."

### Phase 3 — Write-back actions

Add buttons under AI output that **mutate state** with confirmation:

- Project plan → "Create homework items": opens a date-distribution modal (start date, due date, # of items), generates `state.homework` entries.
- Test prep → "Add review tasks for the week": writes into `state.reviews` per day, similar to existing `aiReviewDraftAccept()` flow.
- Daily plan → "Save as today's reviews": same path as existing review draft, just from a different source.

Reuse `aiReviewDraftAccept()` pattern. Each mutation hits a single `saveBucket()` plus the matching `render*()` calls.

### Phase 4 — Polish

- Persist chat (`planner-chat` bucket, FIFO cap 30 messages, scrub on subject delete).
- Sunday digest in the Today panel header.
- Self-quiz panel under Study Helper (new `quiz` helper type).
- Status pill in the header showing Ollama connection state — green when last call succeeded, amber on degraded, red on fail. Updates from any `aiGenerate()` call.

## 5. File-level change list

All work happens in `index.html`. No new files except tests.

| Area | Lines (current) | Change |
|---|---|---|
| `AI_DEFAULTS` | ~1713 | Add `stream`, `maxTokens` |
| `aiGenerate()` | 1717 | Add streaming branch + token callback |
| Setup AI card | 1285 | Add stream toggle + length slider |
| `generateHelper()` | 3165 | Refactor to `buildXxxScaffold` + AI overlay |
| New `aiHelperStream()` | — | Thin wrapper around streaming `aiGenerate` |
| New write-back handlers | — | `helperToHomework()`, `helperToReviews()` |
| `state.ai` shape | 1521, 3708 | Extend defaults |
| `tests/ai-fallback.spec.js` | — | New |
| `tests/ai-helper.spec.js` | — | New, mocks `/api/chat` |
| `docs/features.md` | — | Document new buttons |
| `CLAUDE.md` | — | Note streaming + sanitize convention |

## 6. Risks & mitigations

- **Slow first token on `gemma2:2b`** — show scaffold immediately; streaming hides latency.
- **Model not pulled / Ollama off** — already handled by `aiTestConnection`; the new code must surface the error inline in the Helper panel, not just toast.
- **JSON parsing failures** (already seen in `aiDraftReviews`) — keep the existing line-fallback pattern for any structured-output prompt.
- **CORS regressions** — existing `docs/ollama-setup.md` covers this; link to it from any error message that looks like a CORS failure (`TypeError: Failed to fetch`).
- **User-text injection** — `sanitizeUserText()` + the fact that Gemma runs locally on the user's own data keeps blast radius small.

## 7. Suggested rollout order

1. Phase 1 plumbing + tests. Single PR, no visible feature change.
2. Phase 2 daily + weekly only. Get the AI-overlay pattern right on the two with real data.
3. Phase 2 remaining three types.
4. Phase 3 write-backs (project → homework first, highest payoff).
5. Phase 4 polish in any order.

---

## 8. Section-by-section AI opportunity audit

Beyond the Study Helper panel, every section in `index.html` was reviewed. Existing AI features (`aiBreakdownHw`, `aiExplainTopic`, `aiDraftReviews`, chat sidebar) are marked **(shipped)**; everything else is a proposal.

### Today panel
- **(shipped)** ✨ Draft reviews — `aiDraftReviews()`
- **Day-summary header** — one-sentence "How today is shaping up" (classes + due count + tone)
- **Why-this-order rationale** — short justification under the existing static order
- **Overdue triage** — when ≥3 overdue items, suggest a recovery order

### This Week
- **Weekly theme** — Sunday-rendered "this week, focus on X" derived from due-date density per subject
- **Workload heatmap caption** — one line calling out the heaviest day

### Month & Semester
- **(shipped)** ✨ Explain topic — `aiExplainTopic()`
- **Topic suggester** — given a subject + grade + month, suggest 3–5 standard-curriculum topics to add
- **Cross-subject link** — "this topic ties into …" pulled from other subjects' topics that month

### Homework & Assignments
- **(shipped)** ✨ Break down — `aiBreakdownHw()`
- **Smart filter / "what should I do now?"** — picks the next 1–2 items given energy/time budget
- **Auto-priority** — when a new item is added without priority, infer from title + due date
- **Similar-to-last-time** — for recurring assignment names, surface the previous breakdown
- **Reschedule helper** — when item is overdue, propose a realistic new due date

### Review Tasks
- Already covered by `aiDraftReviews` and the chat
- **Spaced-repetition nudge** — for completed reviews, propose a re-review 3/7/14 days later
- **Convert chat answer → review task** — button inside chat replies

### Setup → Bulk timetable parser (`parseBulk()`)
- **AI fallback** — when the regex matches < 50% of lines, hand the raw paste to Gemma with a "extract to JSON array of `{day,time,subject,room}`" prompt
- **Photo timetable** — out of scope until a vision model is wired in

### Setup → Subjects
- **Subject autosuggest from grade** — when zero subjects, propose a starter set for grade 6/7/8
- **Teacher-name typo guard** — low value; skip

### Class actuals / notes
- **Note summarizer** — if a per-class `note` exceeds N chars, offer a 1-line summary chip
- **Note → review task** — "turn today's note into a flashcard" button

### Chat sidebar
- **(shipped)** Chat — `aiChatSend()`
- **Persist history** — to `planner-chat` bucket
- **Slash-commands** — `/plan`, `/quiz`, `/explain` to trigger structured Helper outputs without leaving chat

### Export / Import
- **Markdown auto-repair** — when import skips rows, send the unparsed block to Gemma for a best-effort fix-up, preview before applying
- **Natural-language export** — "summarize my semester so far" as a non-Logseq text export

### Study Helper (covered in §3)
- **(proposed)** AI-augment all 5 types, streaming, write-backs, self-quiz

---

## 9. Feature rating matrix

Each feature scored 0–10 on five axes. **Composite priority** = weighted average using:
`U × 0.35 + R × 0.20 + E × 0.20 + X × 0.15 + P × 0.10`

| Axis | Meaning | High score means |
|---|---|---|
| **U** Usability | Does the student actually benefit? | More benefit |
| **R** Reliability | Will `gemma2:2b` produce useful output consistently? | More reliable |
| **E** Build ease | Implementation effort | Easier to build |
| **X** UX fit | Latency, screen real estate, interruption cost | Better fit |
| **P** Privacy/safety | Risk surface (data sensitivity, injection) | Lower risk |

Sorted by composite, high to low.

| # | Feature | Section | U | R | E | X | P | **Score** |
|---|---|---|---|---|---|---|---|---|
| 1 | Streaming `aiGenerate()` (foundation) | Plumbing | 9 | 10 | 9 | 10 | 10 | **9.45** |
| 2 | AI-augment Daily Helper | Helper | 10 | 8 | 8 | 9 | 10 | **9.05** |
| 3 | Project plan → real homework items | Helper write-back | 10 | 7 | 7 | 9 | 10 | **8.65** |
| 4 | Day-summary header on Today | Today | 9 | 9 | 9 | 9 | 10 | **9.10** |
| 5 | AI-augment Weekly Helper | Helper | 9 | 8 | 8 | 9 | 10 | **8.70** |
| 6 | Test prep → review tasks across week | Helper write-back | 9 | 8 | 7 | 9 | 10 | **8.50** |
| 7 | Bulk timetable AI fallback | Setup | 9 | 7 | 8 | 8 | 9 | **8.25** |
| 8 | Smart "what should I do now?" | Homework | 10 | 7 | 7 | 9 | 10 | **8.65** |
| 9 | AI-augment Test prep Helper | Helper | 8 | 8 | 8 | 9 | 10 | **8.35** |
| 10 | Self-quiz mode (flashcards) | Helper | 9 | 7 | 6 | 8 | 10 | **8.05** |
| 11 | Weekly theme on This Week | Week | 7 | 8 | 9 | 9 | 10 | **8.20** |
| 12 | Persist chat history | Chat | 7 | 10 | 9 | 9 | 9 | **8.30** |
| 13 | Auto-priority on new homework | Homework | 7 | 7 | 9 | 9 | 10 | **8.00** |
| 14 | AI-augment Project Helper | Helper | 8 | 8 | 8 | 9 | 10 | **8.35** |
| 15 | AI-augment Reading Helper | Helper | 7 | 8 | 8 | 9 | 10 | **8.00** |
| 16 | Why-this-order rationale (Today) | Today | 7 | 9 | 9 | 8 | 10 | **8.20** |
| 17 | Topic suggester (Month) | Month | 8 | 7 | 8 | 8 | 9 | **7.85** |
| 18 | Overdue triage (Today) | Today | 8 | 8 | 8 | 8 | 10 | **8.20** |
| 19 | Reschedule helper (Homework) | Homework | 8 | 7 | 7 | 8 | 10 | **7.75** |
| 20 | Slash-commands in chat | Chat | 7 | 8 | 8 | 8 | 9 | **7.65** |
| 21 | Class-note summarizer | Actuals | 6 | 8 | 9 | 8 | 10 | **7.70** |
| 22 | Note → review task | Actuals | 7 | 8 | 8 | 8 | 10 | **7.85** |
| 23 | Spaced-repetition nudge | Reviews | 8 | 9 | 6 | 7 | 10 | **7.85** |
| 24 | Subject autosuggest by grade | Setup | 6 | 8 | 9 | 8 | 9 | **7.55** |
| 25 | Sunday weekly digest | Today/Week | 8 | 8 | 7 | 8 | 10 | **8.00** |
| 26 | Cross-subject topic link | Month | 6 | 6 | 6 | 7 | 9 | **6.45** |
| 27 | Markdown import auto-repair | Import | 5 | 6 | 5 | 7 | 8 | **5.80** |
| 28 | Workload heatmap caption | Week | 5 | 8 | 8 | 8 | 10 | **7.15** |
| 29 | Similar-to-last-time on homework | Homework | 6 | 7 | 5 | 7 | 9 | **6.40** |
| 30 | Natural-language export | Export | 5 | 7 | 7 | 6 | 8 | **6.20** |

### Quick reads from the matrix

- **Streaming is the unlock.** It's the highest-scoring item because every other AI feature inherits its UX win.
- **Today + Helper dominate the top 10.** Anything that surfaces inside the default-loaded panel beats features the student has to navigate to.
- **Write-back features score high on usability but lower on reliability** — Gemma occasionally produces unusable JSON, so each write-back must keep the existing checkbox-preview confirmation pattern from `aiReviewDraftAccept()`.
- **Privacy is 9–10 across the board** because everything runs against local Ollama on the user's own planner data — no external calls.
- **Avoid for now (composite < 7):** cross-subject topic link, markdown import auto-repair, similar-to-last-time, natural-language export. Low payoff or shaky output, defer until Phase 5.

### Revised rollout (replaces §7)

- **Sprint 1 — Foundation.** #1 streaming + sanitize plumbing, tests.
- **Sprint 2 — Top-of-funnel wins.** #4 day-summary, #2 AI Daily Helper, #5 AI Weekly Helper.
- **Sprint 3 — Write-backs.** #3 Project → homework, #6 Test prep → reviews, #8 "What now?" picker.
- **Sprint 4 — Setup & retention.** #7 bulk-parser AI fallback, #12 persist chat, #13 auto-priority.
- **Sprint 5 — Depth.** #10 self-quiz, #18 overdue triage, #11 weekly theme, #25 Sunday digest, #17 topic suggester.
- **Backlog.** Everything scoring 6.0–7.7; revisit once usage data shows which sections users actually live in.
