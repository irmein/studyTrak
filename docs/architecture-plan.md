# StudyTrak — AI Release & Architecture Plan

> A release-by-release plan for adding **local, on-device AI** (powered by **Gemma 4**) to StudyTrak without breaking its single-file, no-build, no-server character.

**Status:** Draft v0.3 — rewritten against the published Gemma 4 model card (April 2026)
**Owner:** Rohith
**Last updated:** 2026-05-23
**Supersedes:** v0.2 (drafted before Gemma 4 specifications were confirmed)

---

## 1. Purpose

StudyTrak today is a vanilla HTML + CSS + JS planner with six bucketed storage keys and a fully DOM-driven render loop. This document proposes how to layer in **agentic AI features powered by Gemma 4** across a small number of releases, while keeping the project's core promises intact:

- No build step
- No backend
- No login
- No data leaves the device

Gemma 4 (Google DeepMind, April 2026, Apache 2.0) materially changes the design space compared with the v0.2 assumptions:

- **Native multimodality on the small models** — E2B and E4B handle text, image, and audio inputs out of the box.
- **Native function calling** — agents can emit structured tool calls instead of JSON-in-prose that we then parse.
- **Configurable thinking** — reasoning is opt-in per call via a `<|think|>` system token.
- **128K context on the small tier** — the planner's entire `state` fits in context for almost every real user, postponing the need for RAG.

These four shifts collapse several v0.2 features into simpler surfaces and unlock features that v0.2 deferred to R5. Section 5 reflects that reshape.

Each proposed feature is scored on a small set of 0–10 axes so we can sequence work by value, not novelty alone.

---

## 2. Scoring legend (0–10)

Every feature in section 5 is scored against five axes. Scores are intentionally coarse — they exist to *rank*, not to *measure*.

| Axis | What 0 means | What 10 means |
|---|---|---|
| **Desirability** | A student would not notice if it were missing | A student would open the app *because* of this |
| **Novelty** | Standard feature found in every planner | Unique enough to be a talking point / demo moment |
| **Feasibility** | Months of work, new tech, fragile | Half a day inside the existing single-file model |
| **Privacy fit** | Requires a server or external API call | 100% on-device, no network egress after the one-time model download |
| **Local-model fit** | Needs a 30B-class model to work well | Runs acceptably on Gemma 4 E2B (the phone-class tier) |

A **composite score** is reported per feature as a simple average, used for ordering within a release wave only.

---

## 3. Architectural principles

1. **State stays the source of truth.** AI features read from `state` and propose mutations, but never silently mutate it. Every agent output flows through a *Suggestion → Accept / Reject → saveBucket* path.
2. **One bucket per domain.** New AI artefacts (briefings, embeddings, reflections, model cache metadata) get their own buckets so an LLM-generated briefing never re-serialises homework. This preserves the existing `saveBucket(name)` discipline.
3. **Function calling is the agent contract.** When the active model supports native tool use (Gemma 4 does), agents declare their mutations as named tools (`addHomework`, `proposeTimeBlock`, `addReviewTask`) and the model calls them. The `window.ai` adapter exposes a uniform `callTools()` interface; backends that don't support native tools fall back to a JSON-in-prose parser.
4. **Thinking is opt-in per agent.** Quick-add, classification, and subject auto-suggest run with thinking *off* (low latency, deterministic shape). Planners, tutors, and reflection coaches run with thinking *on*. Internal thoughts are never written into multi-turn history or persisted in user-visible buckets.
5. **Large context first, RAG second.** With 128K tokens on E2B/E4B, the relevant slice of `state` is passed directly. An embeddings/RAG path is introduced only when an individual user's archive grows past a measured threshold (provisionally ~30K tokens of topic + homework history).
6. **Modality order matches Gemma 4 guidance.** Images and audio go *before* text in multimodal prompts.
7. **Runtime is pluggable, with an explicit fallback chain.** A thin `window.ai` adapter wraps the active backend. As of May 2026 the chain is: WebLLM (when Gemma 4 lands — currently community-tracked, E2B text-only), then MediaPipe LLM Inference, then a user-supplied Ollama localhost endpoint, then the deterministic fallback. Feature code never imports a backend directly.
8. **Graceful degradation.** If no model is loaded — or the loaded model lacks a required modality — every AI feature degrades to a deterministic fallback. Today's `Study Helper` is the prototype for this pattern.
9. **No build step.** Backends are loaded from a CDN as ES modules. No bundler is introduced.
10. **Observable model state.** Mirror the existing storage-status pattern: model name, size, modalities available, load progress, last-used timestamp shown in Setup.

---

## 4. Runtime layer (the foundation for every release)

### 4.1 `window.ai` adapter

A single inline module added to `index.html`:

```js
window.ai = {
  async ensureLoaded(modelId) { /* lazy-load backend, cache in IndexedDB */ },
  async chat(messages, opts) { /* text in, text out */ },
  async stream(messages, opts) { /* async iterator of tokens */ },
  async callTools(messages, tools, opts) { /* returns { toolCalls, text } */ },
  async embed(texts) { /* returns Float32Array[] */ },
  capabilities: { text, image, audio, video, tools, thinking, contextTokens },
  status: { state: 'idle'|'loading'|'ready'|'error', model, backend, progress }
};
```

The `opts` object accepts `{ thinking: true|false, images: [...], audio: [...], maxImageTokens: 70|140|280|560|1120 }`. The adapter is responsible for inserting the `<|think|>` system token, ordering modalities correctly (images/audio before text), and stripping internal thought from any multi-turn history it persists.

### 4.2 New storage buckets

| Bucket | Purpose | Typical size |
|---|---|---|
| `planner-ai-config` | Selected model, backend, modality preferences, feature toggles | <1 KB |
| `planner-briefings` | `{ "YYYY-MM-DD": { text, generatedAt, modelId } }` | grows ~0.5 KB/day |
| `planner-suggestions` | Pending agent proposals awaiting Accept / Reject | bounded by UI |
| `planner-reflections` | Weekly reflection notes + voice journal transcripts | grows slowly |
| `planner-embeddings` | Topic / homework embeddings (lives in IndexedDB, not localStorage) | up to MBs |
| `planner-agent-log` | Last N agent runs for debugging — capped, ring buffer | ~50 KB cap |
| `planner-tools-log` | Last N tool calls + outcomes (accepted / rejected) — capped | ~50 KB cap |

`planner-tools-log` is new in v0.3 and exists because function-calling makes audit easier than v0.2's "agent log" alone: each call has a structured input the user can re-render in the Suggestion strip if they want to "undo".

### 4.3 Model selection defaults

All generative tiers use **Gemma 4**. Sizes, modalities, and approximate q4 download footprints follow the published model card.

| Tier | Model | Approx download (q4) | Context | Modalities | Use cases |
|---|---|---|---|---|---|
| **Phone (Tiny)** | Gemma 4 E2B | ~1.5 GB | 128K | Text, Image, Audio | Quick-add, classification, subject auto-suggest, voice capture, short briefings |
| **Edge (Standard)** | Gemma 4 E4B | ~3 GB | 128K | Text, Image, Audio | Briefings, weekly planning, tutor, practice questions, photo-of-assignment, voice journaling |
| **Workstation (Power)** | Gemma 4 26B A4B (MoE, 3.8B active) | ~13 GB | 256K | Text, Image | Heavy reasoning over a full semester; **not yet in-browser** — Ollama-only path |
| **Embeddings (optional)** | EmbeddingGemma (preferred) or all-MiniLM-L6-v2 | ~80 MB / ~25 MB | — | Text | Optional RAG for users with multi-year archives |
| **Function-calling specialist (optional)** | FunctionGemma | ~1.5 GB | — | Text + tools | Companion model for power users who want tool-call latency lower than E4B |

First-run UX: app suggests **Phone (E2B)** by default, with a one-paragraph explanation of what each tier unlocks. The app prompts the user before downloading anything.

### 4.4 Runtime backends and the fallback chain

| Backend | Status as of May 2026 | Notes |
|---|---|---|
| **WebLLM** | Gemma 4 not yet built-in; community PRs landing E2B text-only. Multimodal in-browser is blocked on hybrid-attention and per-layer-embedding (PLE) WebGPU work. | Preferred long-term default; ships once upstream lands. |
| **MediaPipe LLM Inference (web)** | Google's first-party on-device path; tracks Gemma releases more directly. | Strong candidate for the in-browser text path until WebLLM stabilises Gemma 4. |
| **Ollama (localhost)** | Stable, supports `gemma4:e2b` and `gemma4:e4b` including multimodal. | Power-user opt-in; requires the user to run Ollama on the same machine. Only path with audio/image *today*. |
| **Deterministic fallback** | Always available. | Every feature has a no-AI path. |

The Setup panel exposes the current backend and lets the user choose, with a clear note when a chosen backend lacks a modality a feature needs (e.g. "Voice quick-add is disabled because the current backend does not yet support audio input — switch to Ollama or wait for the WebLLM multimodal release").

---

## 5. Release waves

Each release is a self-contained, shippable increment. Earlier releases unblock later ones.

### R0 — Foundation (no user-visible AI yet)

| # | Feature | Desirability | Novelty | Feasibility | Privacy fit | Local-model fit | Composite |
|---|---|---:|---:|---:|---:|---:|---:|
| 0.1 | `window.ai` adapter with capabilities-based API | 4 | 6 | 7 | 10 | 10 | **7.4** |
| 0.2 | AI Setup panel (model picker, backend picker, download progress, on/off) | 6 | 5 | 9 | 10 | 10 | **8.0** |
| 0.3 | New buckets + migration (`ai-config`, `suggestions`, `agent-log`, `tools-log`) | 3 | 2 | 10 | 10 | 10 | **7.0** |
| 0.4 | Deterministic fallback contract (every agent has a no-AI path) | 7 | 4 | 8 | 10 | 10 | **7.8** |
| 0.5 | Runtime fallback chain — WebLLM → MediaPipe → Ollama → deterministic | 5 | 6 | 6 | 10 | 10 | **7.4** |
| 0.6 | Tool-call dispatch layer — registers planner mutations as named tools | 5 | 7 | 7 | 10 | 10 | **7.8** |

**Release goal:** A student can opt in to AI, pick a model and backend, watch it download, and toggle it off — but no feature uses it yet. Ships even if every later release slips. New in v0.3: features 0.5 and 0.6 reflect the multi-backend reality and the function-calling shift.

---

### R1 — Capture (text, voice, photo as one surface)

| # | Feature | Desirability | Novelty | Feasibility | Privacy fit | Local-model fit | Composite |
|---|---|---:|---:|---:|---:|---:|---:|
| 1.1 | Natural-language quick-add → tool call (`addHomework`, `addReviewTask`, `addScheduleEntry`) | 9 | 7 | 8 | 10 | 9 | **8.6** |
| 1.2 | Voice quick-add — native audio input on E2B/E4B, 30s clip → same tool calls as 1.1 | 9 | 8 | 7 | 9 | 8 | **8.2** |
| 1.3 | Photo-of-assignment / handout → `addHomework` tool call | 9 | 8 | 7 | 10 | 8 | **8.4** |
| 1.4 | Photo-of-timetable → batch of `addScheduleEntry` calls | 8 | 8 | 6 | 10 | 8 | **8.0** |
| 1.5 | Subject auto-suggest as a tool (`suggestSubject`) used by 1.1–1.3 | 5 | 5 | 9 | 10 | 10 | **7.8** |

**Release goal:** Capturing planner data feels closer to talking to a friend than filling a form. Critically, v0.2's R1 (text/voice) and R5 (photo) collapse here because Gemma 4 E4B handles all three input modalities natively in one model. Web Speech API remains as the fallback voice path when the active backend lacks audio support.

---

### R2 — Daily / weekly agent (the headline release)

| # | Feature | Desirability | Novelty | Feasibility | Privacy fit | Local-model fit | Composite |
|---|---|---:|---:|---:|---:|---:|---:|
| 2.1 | Morning briefing agent (one-paragraph "here's your day") — thinking on | 9 | 7 | 7 | 10 | 9 | **8.4** |
| 2.2 | Weekly study planner — thinking on, emits batch of `proposeTimeBlock` tool calls | 9 | 8 | 6 | 10 | 7 | **8.0** |
| 2.3 | Workload early warning (cluster detection on save) — thinking off, fast classification | 8 | 6 | 9 | 10 | 10 | **8.6** |
| 2.4 | Suggestion strip in Today panel (Accept / Reject / Snooze) | 8 | 5 | 8 | 10 | 10 | **8.2** |
| 2.5 | Briefing read-aloud — generated briefing → Web Speech TTS (output is browser-native; no model required for synthesis) | 7 | 6 | 9 | 10 | 10 | **8.4** |

**Release goal:** Open the app, see something the AI thought about *for me* today, and optionally hear it read aloud on the way out the door. This is the release that justifies the model download in users' minds. Thinking mode is the main lever for quality on 2.1 and 2.2; 2.3 stays fast by leaving thinking off.

---

### R3 — Learning aids (tutor + practice)

| # | Feature | Desirability | Novelty | Feasibility | Privacy fit | Local-model fit | Composite |
|---|---|---:|---:|---:|---:|---:|---:|
| 3.1 | Per-subject chat tutor, grounded by passing subject's topics + recent homework into the 128K context | 9 | 8 | 7 | 10 | 7 | **8.2** |
| 3.2 | Auto-generated practice questions — thinking on, emits `addReviewTask` tool calls | 8 | 7 | 7 | 10 | 8 | **8.0** |
| 3.3 | "Unstick me" hint button on stuck homework rows — thinking on | 7 | 7 | 7 | 10 | 8 | **7.8** |
| 3.4 | Voice tutor — spoken question (audio in) → spoken answer (TTS out) | 8 | 9 | 6 | 9 | 7 | **7.8** |
| 3.5 | Optional embeddings index for users with multi-year archives (EmbeddingGemma) | 4 | 5 | 6 | 10 | 10 | **7.0** |

**Release goal:** Move beyond planning. The app starts to help with the *content* of school, not just its scheduling. Embeddings are demoted to optional because 128K context covers the typical user without them.

---

### R4 — Reflection & coaching

| # | Feature | Desirability | Novelty | Feasibility | Privacy fit | Local-model fit | Composite |
|---|---|---:|---:|---:|---:|---:|---:|
| 4.1 | End-of-week reflection coach with 3 prompts + summary — thinking on | 7 | 8 | 7 | 10 | 9 | **8.2** |
| 4.2 | Spaced-repetition scheduler (FSRS, deterministic) — AI proposes which topics enter review queue | 8 | 7 | 6 | 10 | 10 | **8.2** |
| 4.3 | Adaptive Pomodoro / focus coach | 6 | 7 | 6 | 10 | 9 | **7.6** |
| 4.4 | Habit nudges in Today panel ("zero history topics this month") | 7 | 5 | 9 | 10 | 10 | **8.2** |
| 4.5 | Voice journaling — 30s audio reflection → transcribed + summarised → stored in reviews | 7 | 8 | 7 | 9 | 8 | **7.8** |

**Release goal:** The planner notices patterns the student wouldn't, and reflects them back kindly. Voice journaling (4.5) is new in v0.3 and is essentially free given the audio plumbing built for R1.2 and R3.4.

---

### R5 — Advanced multimodal (genuinely stretch)

The features v0.2 sketched for R5 — photo-of-assignment and photo-of-timetable — moved into R1 because they share the same one-shot capture surface. What remains in R5 is the genuinely harder work: streaming and multi-page inputs that don't fit Gemma 4's per-call limits (30s audio, 60s video at 1 fps).

| # | Feature | Desirability | Novelty | Feasibility | Privacy fit | Local-model fit | Composite |
|---|---|---:|---:|---:|---:|---:|---:|
| 5.1 | Video walkthrough → notes (60s clip, frame-by-frame) | 7 | 9 | 5 | 10 | 7 | **7.6** |
| 5.2 | Live whiteboard OCR mode (camera tab streaming sampled frames; high token budget for OCR) | 6 | 9 | 3 | 10 | 6 | **6.8** |
| 5.3 | Multi-page PDF / handout parse (chunked, high `maxImageTokens`) | 7 | 7 | 5 | 10 | 7 | **7.2** |
| 5.4 | Long-lecture audio capture — chunked into 30s windows, stitched transcript | 6 | 8 | 4 | 9 | 6 | **6.6** |

**Release goal:** Handle the inputs that exceed Gemma 4's per-call modality limits. These features all require app-side chunking or streaming wrappers around the model's native multimodal calls.

---

## 6. Cross-cutting concerns

### 6.1 Privacy & egress

There is exactly one HTTP egress point introduced by these releases: model weights download (one-time per model, cached in IndexedDB by the backend). All inference is on-device. The Setup panel should expose a "Network used by AI" line that reflects this honestly, and should distinguish between the WebLLM/MediaPipe in-browser backends (which fetch weights from a CDN) and the Ollama backend (which fetches them from the user's localhost).

### 6.2 Performance budgets

- First-token latency target on E2B (text, thinking off): < 2s on a 2022-class laptop.
- Briefing generation (E4B, thinking on): target < 12s end-to-end, run lazily on first open per day. Higher than v0.2's 8s because thinking is on.
- Voice quick-add (E4B, 30s audio in, tool call out): target < 4s after recording stops.
- Photo-of-assignment (E4B, image in, tool call out): target < 5s at `maxImageTokens=280`; up to 10s at `560` for OCR-heavy handouts.
- Embedding index rebuild: incremental on save; full rebuild bounded to background idle time.

### 6.3 Agent loop contract

Every agent is an `async function(state, ctx) → { proposals: [...] }`. Proposals are produced by the model emitting tool calls; the agent translates each call into a Suggestion. Proposals never mutate state directly — they render into the Suggestion strip. This preserves undoability and keeps agents debuggable. When the active backend lacks native tool calling, the adapter prompts for JSON output and parses it; agent code is identical either way.

### 6.4 Prompts and tools as data

Prompt templates and tool schemas both live in single `PROMPTS` and `TOOLS` objects near the top of the JS section, not scattered through agent functions. This lets us tune wording or schema without hunting, and makes it trivial to expose a "view what was sent to the model" debug toggle. Tool schemas are JSON Schema fragments so they translate directly to either Gemma 4's native tool format or a JSON-in-prose fallback prompt.

### 6.5 Thinking-mode discipline

Thinking is opt-in per call, set via the `opts.thinking` flag on the `window.ai` adapter. Two hard rules:

1. **Thoughts never enter persisted history.** When an agent stores conversation turns (tutor, reflection), only the final answer is saved.
2. **Thoughts may be shown in the debug log,** but never in the user-visible Suggestion strip.

### 6.6 Telemetry

None. The project's privacy stance forbids it. The closest substitutes are the local `planner-agent-log` and `planner-tools-log` ring buffers, viewable by the user in Setup.

### 6.7 Test strategy

Playwright tests already wait on `window.__plannerReady`. Add a `window.__aiReady` companion flag set when `window.ai.status.state === 'ready'`. AI features under test should run with a **deterministic stub adapter** (`window.ai = stubAi()`) so we never download a model in CI. The stub also exposes a `stubAi.queueToolCalls([...])` helper so each test can assert on the exact tool-call sequence an agent emits without prompt drift.

---

## 7. Risks & open questions

1. **WebLLM Gemma 4 support is still landing.** As of May 2026 the community is tracking E2B text-only; multimodal in-browser is blocked on hybrid-attention and per-layer-embedding work. *Mitigation:* the runtime fallback chain (R0.5) ships Ollama as a first-class option from day one, so the multimodal features in R1–R3 are demoable even before WebLLM stabilises. If both in-browser backends remain text-only at launch, audio and image features ship as "Ollama-only" and the in-browser default is text-only quick-add.
2. **Download size as a wall.** E2B at ~1.5 GB is still a hard sell on mobile data; E4B at ~3 GB is a no-go. *Mitigation:* explicit consent dialog, Wi-Fi-detect hint, postpone any auto-download, and lead the user toward E2B first.
3. **Per-call audio cap of 30 seconds.** Voice quick-add (R1.2) and voice journaling (R4.5) fit comfortably; long-lecture capture (R5.4) does not. *Mitigation:* app-side chunking for R5.4 only.
4. **Per-call video cap of 60 seconds.** R5.1 fits within the cap; longer walkthroughs need chunking. Acceptable for R5.
5. **Thinking-on latency on E2B.** E2B's reasoning is weaker than E4B's and slower per token. Briefings (R2.1) and weekly planning (R2.2) should be E4B-or-better; on E2B these should either run with thinking off (degraded quality) or be disabled. The Setup panel surfaces this trade-off honestly.
6. **iOS browser memory limits.** Safari has historically capped tab memory aggressively. Validate on iPad before promising R2+ on phones — even E2B may not fit.
7. **`localStorage` vs IndexedDB.** Embeddings and the tools log will blow past `localStorage`'s ~5 MB ceiling. The `window.storage` abstraction already softens this; both buckets should be IndexedDB-backed explicitly in R3.
8. **Versioning of prompts and tool schemas.** If a stored briefing was generated by an older prompt, do we regenerate or annotate? If a tool schema changes, do we replay old tool-call logs? Decision deferred to R2.
9. **"Agent" vs "tool" vocabulary.** v0.2 introduced the distinction loosely. v0.3 sharpens it: an **agent** is the loop that builds a prompt, calls the model, and translates returned tool calls into Suggestions; a **tool** is a named, schema-typed mutation the model can invoke. Worth revisiting after R2 ships.
10. **Companion-model proliferation.** EmbeddingGemma (R3.5) and FunctionGemma (optional) are tempting additions, but each is another download the user has to consent to. Default behaviour should be: one model covers the use case; companions are opt-in.

---

## 8. Sequencing summary

```
R0 Foundation ─┐
               ├─► R1 Capture ─► R2 Daily agent ─► R3 Learning aids ─► R4 Reflection ─► R5 Advanced multimodal
               │
 (parallel)    └─► R3.5 Embeddings prep can start in parallel with R2, but only ships if user-archive measurements justify it
```

R0 is foundational and must ship first. R1 is bigger in v0.3 than in v0.2 because it absorbs the photo features v0.2 had parked in R5. R2 remains the release worth marketing. R5 is genuinely a stretch and should not block earlier releases.

---

## 9. Appendix: aggregate ranking by composite score

Top 10 features across all releases, regardless of wave:

| Rank | Feature | Release | Composite |
|---:|---|:---:|---:|
| 1 | Natural-language quick-add (tool calls) | R1 | 8.6 |
| 2 | Workload early warning | R2 | 8.6 |
| 3 | Morning briefing agent | R2 | 8.4 |
| 4 | Photo-of-assignment → homework | R1 | 8.4 |
| 5 | Briefing read-aloud | R2 | 8.4 |
| 6 | Voice quick-add | R1 | 8.2 |
| 7 | Suggestion strip in Today panel | R2 | 8.2 |
| 8 | Per-subject chat tutor | R3 | 8.2 |
| 9 | End-of-week reflection coach | R4 | 8.2 |
| 10 | FSRS spaced-repetition scheduler | R4 | 8.2 |

Compared with v0.2, R1 and R2 have both moved up the ranking — R1 because Gemma 4's native multimodality makes capture features genuinely easy, and R2 because thinking mode raises the quality ceiling on briefings and planning without hurting the workload-warning classifier (which runs with thinking off). The fact that R1 and R2 dominate the top of the list is the strongest signal in the plan: if only one release ever ships, R2 is still the answer, but R1 is now close behind.

---

## 10. Changelog

- **v0.3 (2026-05-23)** — Rewritten against the published Gemma 4 model card. Tier table updated to real sizes (E2B / E4B / 26B A4B / 31B). Added principles for function calling, thinking mode, modality order, and large-context-first. New foundation features for runtime fallback chain and tool-call dispatch. R1 now absorbs the photo features v0.2 placed in R5. Added voice quick-add, voice tutor, voice journaling, and briefing read-aloud. Demoted embeddings/RAG to optional. New risk note covering WebLLM Gemma 4 status as of May 2026.
- **v0.2** — Initial Gemma 4 mention, but with incorrect tier sizes and missing function-calling, thinking-mode, audio, and large-context implications.
- **v0.1** — Pre-Gemma 4 draft.

## 11. References

- [Gemma 4 model card — Google AI for Developers](https://ai.google.dev/gemma/docs/core/model_card_4)
- [Gemma 4 overview](https://ai.google.dev/gemma/docs/core)
- [Gemma 4 launch blog](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)
- [Gemma 4 function calling](https://ai.google.dev/gemma/docs/capabilities/text/function-calling-gemma4)
- [Gemma 4 thinking](https://ai.google.dev/gemma/docs/capabilities/thinking)
- [Gemma 4 audio](https://ai.google.dev/gemma/docs/capabilities/audio)
- [Gemma 4 vision](https://ai.google.dev/gemma/docs/capabilities/vision)
- [FunctionGemma overview](https://ai.google.dev/gemma/docs/functiongemma)
- [EmbeddingGemma overview](https://ai.google.dev/gemma/docs/embeddinggemma)
- [WebLLM Gemma 4 model request (mlc-ai/web-llm#810)](https://github.com/mlc-ai/web-llm/issues/810)
- [MediaPipe LLM Inference API](https://ai.google.dev/edge/mediapipe/solutions/genai/llm_inference)
- [Ollama Gemma 4](https://ollama.com/library/gemma4)
