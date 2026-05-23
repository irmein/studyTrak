# StudyTrak — AI Release & Architecture Plan

> A release-by-release plan for adding **local, on-device AI** (via WebLLM + **Gemma 4**) to StudyTrak without breaking its single-file, no-build, no-server character.

**Status:** Draft v0.2 — updated to Gemma 4
**Owner:** Rohith
**Last updated:** 2026-05-23

---

## 1. Purpose

StudyTrak today is a vanilla HTML + CSS + JS planner with six `localStorage`-backed buckets and a fully DOM-driven render loop. This document proposes how to layer in **agentic AI features powered by WebLLM** (browser-native LLM runtime) across a small number of releases, while keeping the project's core promises intact:

- No build step
- No backend
- No login
- No data leaves the device

Each proposed feature is scored on a small set of 0–10 axes so we can sequence work by value, not novelty alone.

---

## 2. Scoring legend (0–10)

Every feature in section 5 is scored against five axes. Scores are intentionally coarse — they exist to *rank*, not to *measure*.

| Axis | What 0 means | What 10 means |
|---|---|---|
| **Desirability** | A student would not notice if it were missing | A student would open the app *because* of this |
| **Novelty** | Standard feature found in every planner | Unique enough to be a talking point / demo moment |
| **Feasibility** | Months of work, new tech, fragile | Half a day inside the existing single-file model |
| **Privacy fit** | Requires a server or external API call | 100% in-browser, no network egress |
| **Local-model fit** | Needs a 70B-class model to work well | Runs acceptably on a 1–3B parameter model |

A **composite score** is reported per feature as a simple average, used for ordering within a release wave only.

---

## 3. Architectural principles

1. **State stays as the source of truth.** AI features read from `state` and propose mutations, but never silently mutate it. Every agent output flows through a *Suggestion → Accept/Reject → saveBucket* path.
2. **One bucket per domain.** New AI artefacts (briefings, embeddings, reflections, model cache metadata) get their own buckets so an LLM-generated briefing never re-serialises homework. This preserves the existing `saveBucket(name)` discipline.
3. **Model runtime is pluggable.** A thin `window.ai` adapter wraps the active backend (WebLLM by default; Ollama as an optional drop-in for power users). Feature code never imports WebLLM directly.
4. **Graceful degradation.** If no model is loaded, every AI feature degrades to a deterministic fallback (today's `Study Helper` is the prototype for this pattern).
5. **No build step.** WebLLM is loaded from a CDN as an ES module. No bundler is introduced.
6. **Observable model state.** Mirror the existing storage-status pattern: model name, size, load progress, last-used timestamp shown in Setup.

---

## 4. Runtime layer (the foundation for every release)

### 4.1 `window.ai` adapter

A single inline module added to `index.html`:

```js
window.ai = {
  async ensureLoaded(modelId) { /* lazy-load WebLLM, cache in IndexedDB */ },
  async chat(messages, opts) { /* returns string */ },
  async stream(messages, opts) { /* async iterator of tokens */ },
  async embed(texts) { /* returns Float32Array[] */ },
  status: { state: 'idle'|'loading'|'ready'|'error', model, progress }
};
```

### 4.2 New storage buckets

| Bucket | Purpose | Typical size |
|---|---|---|
| `planner-ai-config` | Selected model, runtime (WebLLM/Ollama), feature toggles | <1 KB |
| `planner-briefings` | `{ "YYYY-MM-DD": { text, generatedAt, modelId } }` | grows ~0.5 KB/day |
| `planner-suggestions` | Pending agent proposals awaiting Accept/Reject | bounded by UI |
| `planner-reflections` | Weekly reflection notes | grows slowly |
| `planner-embeddings` | Topic / homework embeddings (moved to IndexedDB if > 1 MB) | up to MBs |
| `planner-agent-log` | Last N agent runs for debugging — capped, ring buffer | ~50 KB cap |

### 4.3 Model selection defaults

All generative tiers use **Gemma 4** (Google, 2025). Gemma 4 is natively multimodal, so the same model family covers text, planning, and vision tasks — no separate vision model required.

| Tier | Model | Approx download (q4) | Use cases |
|---|---|---|---|
| **Tiny** | Gemma 4 1B (q4) | ~700 MB | Parsing, classification, quick-add, subject auto-suggest |
| **Small** | Gemma 4 4B (q4) | ~2.7 GB | Briefings, weekly planning, tutor chat, practice questions |
| **Vision** | Gemma 4 4B (q4, multimodal) | ~2.7 GB (same weights) | Photo → assignment, timetable import |
| **Embedding** | all-MiniLM-L6-v2 (Transformers.js) | ~25 MB | Topic / homework semantic search (RAG) |

Gemma 4's built-in vision support means R5 (multi-modal) shares the same model download as R2+. Users who opt into the Small tier unlock both planning *and* photo features with one download.

First-run UX: app suggests **Tiny** by default, prompts user before downloading anything.

---

## 5. Release waves

Each release is a self-contained, shippable increment. Earlier releases unblock later ones.

### R0 — Foundation (no user-visible AI yet)

| # | Feature | Desirability | Novelty | Feasibility | Privacy fit | Local-model fit | Composite |
|---|---|---:|---:|---:|---:|---:|---:|
| 0.1 | `window.ai` adapter + WebLLM CDN integration | 4 | 6 | 8 | 10 | 10 | **7.6** |
| 0.2 | AI Setup panel (model picker, download progress, on/off) | 6 | 5 | 9 | 10 | 10 | **8.0** |
| 0.3 | New buckets + migration (`ai-config`, `suggestions`, `agent-log`) | 3 | 2 | 10 | 10 | 10 | **7.0** |
| 0.4 | Deterministic fallback contract (every agent has a no-AI path) | 7 | 4 | 8 | 10 | 10 | **7.8** |

**Release goal:** A student can opt in to AI, pick a model, watch it download, and toggle it off — but no feature uses it yet. Ships even if every later release slips.

---

### R1 — Capture (natural-language and voice input)

| # | Feature | Desirability | Novelty | Feasibility | Privacy fit | Local-model fit | Composite |
|---|---|---:|---:|---:|---:|---:|---:|
| 1.1 | Natural-language quick-add → homework / review task | 9 | 7 | 7 | 10 | 9 | **8.4** |
| 1.2 | Voice quick-add (Web Speech API → 1.1 pipeline) | 8 | 6 | 7 | 9 | 9 | **7.8** |
| 1.3 | Paste-a-timetable improvements (LLM fallback when regex parser fails) | 6 | 4 | 8 | 10 | 9 | **7.4** |
| 1.4 | Subject auto-suggest when adding homework ("looks like Math?") | 5 | 5 | 9 | 10 | 10 | **7.8** |

**Release goal:** Capturing planner data feels closer to talking to a friend than filling a form. All features fall back to the current forms if the model is off.

---

### R2 — Daily/weekly agent (the headline release)

| # | Feature | Desirability | Novelty | Feasibility | Privacy fit | Local-model fit | Composite |
|---|---|---:|---:|---:|---:|---:|---:|
| 2.1 | Morning briefing agent (one-paragraph "here's your day") | 9 | 7 | 7 | 10 | 9 | **8.4** |
| 2.2 | Weekly study planner — proposes time-block suggestions | 9 | 8 | 6 | 10 | 8 | **8.2** |
| 2.3 | Workload early warning (cluster detection on save) | 8 | 6 | 8 | 10 | 9 | **8.2** |
| 2.4 | Suggestion strip in Today panel (Accept / Reject / Snooze) | 8 | 5 | 8 | 10 | 10 | **8.2** |

**Release goal:** Open the app, see something the AI thought about *for me* today. This is the release that justifies the WebLLM download in users' minds.

---

### R3 — Learning aids (tutor + practice)

| # | Feature | Desirability | Novelty | Feasibility | Privacy fit | Local-model fit | Composite |
|---|---|---:|---:|---:|---:|---:|---:|
| 3.1 | Per-subject chat tutor grounded in user's own topics (RAG) | 9 | 8 | 5 | 10 | 7 | **7.8** |
| 3.2 | Auto-generated practice questions from any topic | 8 | 7 | 7 | 10 | 8 | **8.0** |
| 3.3 | "Unstick me" hint button on stuck homework rows | 7 | 7 | 7 | 10 | 8 | **7.8** |
| 3.4 | Embedding index of topics + homework (Transformers.js) | 5 | 6 | 6 | 10 | 10 | **7.4** |

**Release goal:** Move beyond planning. The app starts to help with the *content* of school, not just its scheduling.

---

### R4 — Reflection & coaching

| # | Feature | Desirability | Novelty | Feasibility | Privacy fit | Local-model fit | Composite |
|---|---|---:|---:|---:|---:|---:|---:|
| 4.1 | End-of-week reflection coach with 3 prompts + summary | 7 | 8 | 7 | 10 | 9 | **8.2** |
| 4.2 | Spaced-repetition scheduler (FSRS) promoting topics → reviews | 8 | 7 | 6 | 10 | 10 | **8.2** |
| 4.3 | Adaptive Pomodoro / focus coach | 6 | 7 | 6 | 10 | 9 | **7.6** |
| 4.4 | Habit nudges in Today panel ("zero history topics this month") | 7 | 5 | 9 | 10 | 10 | **8.2** |

**Release goal:** The planner notices patterns the student wouldn't, and reflects them back kindly.

---

### R5 — Multi-modal (stretch)

| # | Feature | Desirability | Novelty | Feasibility | Privacy fit | Local-model fit | Composite |
|---|---|---:|---:|---:|---:|---:|---:|
| 5.1 | Photo → assignment (Gemma 4 multimodal, in browser) | 9 | 9 | 5 | 10 | 7 | **8.0** |
| 5.2 | Photo → timetable import (Gemma 4 multimodal) | 8 | 8 | 5 | 10 | 7 | **7.6** |
| 5.3 | Handwriting-to-text for review notes | 7 | 8 | 3 | 10 | 5 | **6.6** |
| 5.4 | Whiteboard OCR mode (live camera tab) | 6 | 9 | 2 | 10 | 5 | **6.4** |

**Release goal:** Eliminate typing for the highest-friction inputs. Gemma 4's multimodal support means vision features reuse the Small-tier model already downloaded for R2 — no extra download for users who are already on the 4B tier.

---

## 6. Cross-cutting concerns

### 6.1 Privacy & egress

There is exactly one HTTP egress point introduced by these releases: model weights download from a CDN (one-time per model, cached in IndexedDB via WebLLM's built-in caching). All inference is on-device. The Setup panel should expose a "Network used by AI" line that reflects this honestly.

### 6.2 Performance budgets

- First-token latency target on Tiny model: < 2s on a 2022-class laptop.
- Briefing generation: target < 8s end-to-end, run lazily on first open per day.
- Embedding index rebuild: incremental on save; full rebuild bounded to background idle time.

### 6.3 Agent loop contract

Every agent is an `async function(state) → { proposals: [...] }`. Proposals never mutate state directly; they render into a Suggestion strip. This preserves undoability and keeps agents debuggable.

### 6.4 Prompts as data

Prompt templates live in a single `PROMPTS` object near the top of the JS section, not scattered through agent functions. This lets us tune wording without hunting and makes it trivial to expose a "view what was sent to the model" debug toggle.

### 6.5 Telemetry

None. The project's privacy stance forbids it. The closest substitute is the local `planner-agent-log` ring buffer, viewable by the user in Setup.

### 6.6 Test strategy

Playwright tests already wait on `window.__plannerReady`. Add a `window.__aiReady` companion flag set when `window.ai.status.state === 'ready'`. AI features under test should run with a **deterministic stub adapter** (`window.ai = stubAi()`) so we never download a model in CI.

---

## 7. Risks & open questions

1. **Download size as a wall.** Even a 400 MB model is a hard sell on mobile data. Mitigation: explicit consent dialog, Wi-Fi-detect hint, postpone any auto-download.
2. **Quality of small models on planning tasks.** Gemma 4 1B handles parsing and classification well but may produce weak weekly plans; Gemma 4 4B is the intended tier for R2+. The user chooses their tier and can upgrade in-app.
3. **iOS browser memory limits.** Safari has historically capped tab memory aggressively. Validate on iPad before promising R2+ on phones.
4. **`localStorage` vs IndexedDB.** Embeddings will blow past `localStorage`'s ~5 MB ceiling. The `window.storage` abstraction already softens this; embeddings should move to IndexedDB explicitly in R3.
5. **Versioning of prompts.** If a stored briefing was generated by an older prompt, do we regenerate or annotate? Decision deferred to R2.
6. **What is "agent" vs "tool"?** This plan treats anything that *proposes a mutation* as an agent and anything that *transforms text in place* as a tool. Worth revisiting after R2 ships.

---

## 8. Sequencing summary

```
R0 Foundation   ──┐
                  ├──► R1 Capture ──► R2 Daily agent ──► R3 Learning aids ──► R4 Reflection ──► R5 Multi-modal
                  │
  (independent)   └──► R3.4 Embeddings prep can start in parallel with R2
```

R0 and R1 are low-risk and unlock everything else. R2 is the release worth marketing. R5 is genuinely a stretch and should not block earlier releases.

---

## 9. Appendix: aggregate ranking by composite score

Top 10 features across all releases, regardless of wave:

| Rank | Feature | Release | Composite |
|---:|---|:---:|---:|
| 1 | Natural-language quick-add | R1 | 8.4 |
| 2 | Morning briefing agent | R2 | 8.4 |
| 3 | Weekly study planner | R2 | 8.2 |
| 4 | Workload early warning | R2 | 8.2 |
| 5 | Suggestion strip in Today panel | R2 | 8.2 |
| 6 | End-of-week reflection coach | R4 | 8.2 |
| 7 | Spaced-repetition (FSRS) scheduler | R4 | 8.2 |
| 8 | Habit nudges | R4 | 8.2 |
| 9 | AI Setup panel | R0 | 8.0 |
| 10 | Auto-generated practice questions | R3 | 8.0 |

The fact that R2 dominates the top of the list is the strongest signal in the plan: if only one release ever ships, it should be R2.
