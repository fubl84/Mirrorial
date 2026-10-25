# Mirrorial – Improvement Plan (agentic development)

Branch: `improvement/security-and-brief-quality`
Source: architecture/security review (2026-10-25) and analysis of a real `daily-brief-debug.json`
(52 events -> 4 passed the pre-filter -> 1 of 4 LLM bullets survived the output filter).

## 0. Working agreement for every phase (the agent loop)

1. **Explore** – read the touched code paths, list affected functions/endpoints.
2. **Design note** – a few lines on decisions and trade-offs.
3. **Test first (where practical)** – failing tests in `backend/test/`.
4. **Implement** – smallest change that satisfies the tests. New logic goes into new modules under
   `backend/src/`; `index.js` only wires things together.
5. **Verify** – `cd backend && npm test`; manual smoke test of touched endpoints;
   UI changes: `cd remote_ui && npm run build && npm run lint`.
6. **Review** – re-read the diff (security, backwards compatibility, existing Pi installs).
7. **Commit** – one commit per phase, no unrelated changes. Do not start the next phase while the current one is red.

Guard rails
- Existing installs must keep working after `scripts/update.sh`; breaking changes need a migration or a documented step.
- The Flutter display talks to the backend over loopback without credentials. This must keep working.
- Never log secrets or tokens. No new runtime dependency unless it replaces a lot of custom code.
- `config.json`, `secrets.json`, `household.json` stay backwards compatible.

## Phase 1 – Access control and hardening (security)

Goal: nothing on the LAN can read private data, spend API credits, reboot the Pi or exfiltrate keys without authorisation.

- 1.1 `backend/src/security.js`: access token (env `MIRRORIAL_ACCESS_TOKEN` or auto-generated
  `~/.config/mirrorial/access-token`, mode 0600), timing-safe comparison.
- 1.2 Auth middleware for `/api/*`: genuine loopback requests (no proxy headers) are trusted so the display keeps
  working; everything else needs `Authorization: Bearer <token>`. The Google OAuth callback stays public (one-time `state`).
- 1.3 Host-header allow-list (DNS rebinding) and Origin allow-list (CSRF); replaces `cors()`.
- 1.4 In-memory rate limiter for failed auth and expensive endpoints (rebuild, travel-time, HA discover, system commands).
- 1.5 Google OAuth: expiring `state`, escaped popup HTML, `postMessage` target origin, authenticated `init` endpoint.
- 1.6 Outbound URL guard (http/https only, no embedded credentials, block link-local/metadata addresses) and timeouts everywhere.
- 1.7 Key binding: changing the LLM base URL without entering a new key drops the stored key.
- 1.8 Gemini key via header instead of query string; no upstream `error.message` details to clients;
  `config.json` mode 0600; strip the HA token from `GET /api/config` (keep a `tokenConfigured` flag).
- 1.9 Remote UI: login screen, axios interceptor, token in `localStorage`.
- 1.10 `npm audit fix` for non-breaking updates; document the rest.

Exit: unauthenticated non-loopback request -> 401; wrong Origin -> 403; bad Host -> 421; loopback works without token;
rate limit trips; URL guard cases tested; display app and remote UI still work.

## Phase 2 – Fix the pre-filter (events the AI never sees)

- 2.1 Move personal rules (music school, `jmc \d+`, medical keywords, city list) into
  `config.services.context.rules` (`alwaysShow`, `neverShow`, `routineHints`) with defaults.
- 2.2 Rewrite `isLowValueRoutineEvent`: a name-like title is no longer "routine"; substitutes/cancellations/moves
  ("Ersatz", "entfällt", "verschoben", "cancelled", "moved") always show; medical items always show, even if recurring.
- 2.3 Parse `responseStatus` (declined), `eventType`, `transparency` and `status: cancelled` from Google; drop declined/cancelled.
- 2.4 Replace the hard "top 18 of 14 days" cut with time-bucketed selection (today, tomorrow, next 7 days, long-range highlights).
- 2.5 Tests with fixtures derived from the real debug snapshot.
- 2.6 **Subscription-first calendars** (decision 2026-10-25: Google OAuth is no longer the primary path, so non-technical
  users are not tied to one provider). Calendars are connected by pasting an iCal/webcal link or a CalDAV account.
  - `webcal://` / `webcals://` links work (they never did: axios cannot fetch them); https first, http fallback.
  - Friendly error when the link does not return a calendar; calendar name taken from `X-WR-CALNAME` when none is entered.
  - Redirects are re-checked by the URL guard; download size is capped.
  - "Test this link" endpoint + button: shows calendar name, event count and the next events before saving.
  - Declined events (`ATTENDEE;PARTSTAT=DECLINED`) are hidden when the user's own address is known (optional per source).
  - Google stays available but is no longer the default section; no Google-only fields are required by any rule.

## Phase 3 – New brief pipeline (single LLM call, structured, verifiable)

- 3.1 `backend/src/brief/dossier.js`: deterministic "day dossier" for today/tomorrow plus long-range items. Per event:
  id, local time, duration, location, travel time and leave-by, overlaps/conflicts, gaps, people, weather, hint rules.
  Times are pre-formatted in the display timezone; all-day events are handled in local time.
- 3.2 Conflict detection (overlaps, gap shorter than travel time).
- 3.3 `backend/src/brief/composer.js`: one LLM call, returns
  `{headline, priority, bullets:[{text, eventIds, factIds, urgency}], householdView}`.
- 3.4 `backend/src/brief/validate.js`: check ids against the dossier, enforce length limits, drop bullets that only
  restate title/time, deduplicate. Replaces the English-token-overlap filter that deleted correct German bullets.
- 3.5 Time-aware: morning = today; afternoon = rest of today + tomorrow morning; evening = tomorrow. Quiet days produce
  an empty LLM brief and the deterministic fallback.
- 3.6 Prompt rules: no "details missing" filler unless the event is within about 3 h; calendar text is untrusted data
  (delimited, injection-resistant); output in the display locale.
- 3.7 Remove the selector call. Keep the old pipeline behind `services.llm.pipeline = "legacy"` for one release.
- 3.8 Golden tests: dossier snapshots from real days; mocked LLM responses for validator tests.

## Phase 4 – LLM providers (OpenAI, Anthropic, Google, custom)

Status: all four already exist (`callOpenAiCompatible`, `callAnthropic`, `callGoogleGenerativeAi`, custom = OpenAI-compatible).
Gaps to close:
- 4.1 `backend/src/llm/providers.js` with one interface `generateJson({prompt, schema, ...})`.
- 4.2 OpenAI: `json_schema` strict mode with fallback to `json_object`; omit `temperature` for models that reject it.
- 4.3 Anthropic: forced tool use for schema-valid JSON, `max_tokens` 1500, handle `stop_reason: max_tokens`,
  system prompt separated from untrusted data, current default models.
- 4.4 Retry with backoff on 429/5xx/timeouts, configurable timeout, token usage in the debug file,
  per-provider model suggestions and a "Test connection" button in the remote UI.

## Phase 5 – Reliability: sync, caching, concurrency

- 5.1 Decouple calendar sync (default 10–15 min) from LLM refresh; the LLM re-runs only when the dossier fingerprint
  changes or at time-of-day bucket boundaries.
- 5.2 Single-flight lock for `buildContext`. `GET /api/display/context` never blocks on the LLM: serve cache, refresh in background.
- 5.3 One timezone helper for "local day" in `config.system.timezone`; remove `toISOString().slice(0,10)` comparisons.
- 5.4 Atomic `config.json` writes plus a display watcher that handles atomic replacement.
- 5.5 Evaluate a maintained ICS library; switch only if all existing parser tests stay green.

## Phase 6 – Display app (Flutter)

- 6.1 Shared `BackendClient` (base URL, timeouts, optional token) for context/calendar/travel services.
- 6.2 Keep last good data on error; subtle "stale since HH:MM" indicator; backoff on polling.
- 6.3 Brief card shows urgency and time; stays compatible with the old payload.

## Phase 7 – Code health and CI

- 7.1 Split `backend/index.js` incrementally (only code touched by earlier phases moves).
- 7.2 GitHub Actions: `node --test`, `npm audit --omit=dev` (report only), remote_ui lint and build.
- 7.3 HTTP-level tests for the routes touched in Phase 1.

## Phase 8 – Missing features and UI

- 8.1 Remote UI: rules editor, per-event pin/mute, "why is this shown?" view, "Preview brief now".
- 8.2 Leave-by time and conflict warnings on the mirror; rain warning for outdoor events.
- 8.3 Docs: security model, token handling, provider setup (OpenAI, Anthropic, Google, local/Ollama).

## Risk register

| Risk | Mitigation |
|---|---|
| Token auth locks the owner out of the remote UI | Token is stored in `~/.config/mirrorial/access-token` and printed on first start; README documents recovery; loopback stays open |
| Reverse proxy makes every request look like loopback | Requests carrying `X-Forwarded-*` headers are never treated as loopback |
| New pipeline is worse than the old one | `legacy` pipeline stays selectable for one release; golden tests from real data |
| Provider API changes | Per-provider adapters and defaults in one file; "Test connection" button |

## Progress log

- [x] Phase 1 – access token, Host/Origin checks, CORS allow-list, rate limits, OAuth hardening (expiring single-use state,
  escaped popup, targeted postMessage), URL guard, key/token binding, HA token no longer sent to the browser,
  Gemini key in header, no upstream error details to clients, remote UI login. 81 backend tests green, live smoke test done.
  Left for later: `npm audit` still reports 3 moderate (uuid via google-auth-library/gaxios, needs a breaking upgrade);
  the display app still reads the HA token from `config.json` on disk (by design, file is now mode 0600).
- [x] Phase 2 – new pure modules `src/brief/{rules,selection,horizon}.js`, `src/time/zone.js`, `src/calendar/{subscription,icsMeta}.js`.
  Medical appointments and schedule changes are always kept; hard-coded personal rules replaced by `services.context.rules`
  (always show / never show / routine hints, editable in the UI); recurring items only surface within 1 day; time-bucketed
  selection instead of "top 18 of 14 days"; declined/cancelled dropped (ICS `PARTSTAT` via own addresses, Google `self`).
  Subscription-first: `webcal://` works, "Test this link" endpoint + button, friendly errors, redirects re-checked, size cap,
  calendar name from `X-WR-CALNAME`, Calendars section is now the default. Bug fixed on the way: `VALARM` blocks overwrote
  the event description. 114 backend tests green; live check against a local feed server (redirects, 401, oversize, auth).
  Open: the routine pattern still hides any non-recurring title containing "lesson"/"unterricht" (e.g. "Online Lessons
  Monthly Performance & Achievement Update"); decide in Phase 3 whether that stays a hard rule.
- [ ] Phase 3
- [ ] Phase 4
- [ ] Phase 5
- [ ] Phase 6
- [ ] Phase 7
- [ ] Phase 8

