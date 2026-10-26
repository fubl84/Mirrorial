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

### Phase 3 design notes (decided before implementation)

- **The software computes, the model only phrases.** Facts (overlaps, tight transitions, medical, schedule change, missing
  location, early start, busy day, rain, birthdays, leave-by from route data) are computed in code and get refs `f1..fn`;
  events get refs `e1..en`. The model returns `{bullets:[{text, facts:[refs], urgency}]}`; there is no model headline.
- **Validation instead of fuzzy filtering.** A bullet survives only if it cites at least one real fact, has no link, is
  short, and every clock time / duration / temperature in it appears in the facts or events it cites. This replaces the
  English-token-overlap filter that deleted correct German bullets.
- **Important things can't be skipped.** Conflicts, schedule changes and tight transitions that no bullet cites get a
  deterministic bullet (en/de templates), so a model omission never hides them.
- **Time aware.** Window is today + tomorrow; focus moves to tomorrow in the evening. Later events appear only if the user
  configured context for them (hint rules, trips). Quiet days make no LLM call.
- **Untrusted text.** Titles/locations are flattened, capped, put in JSON data, and the system prompt says they are data.
  Descriptions are only sent in `full` privacy mode. Prep notes / household context / addresses are no longer sent in
  `cloud-redacted` mode (they were before).
- **Old pipeline stays** behind `services.llm.pipeline = "legacy"` for one release (default `dossier`).
- **Deliberately not in Phase 3:** fingerprint-based LLM caching and background refresh (Phase 5), provider
  structured-output upgrades and retries (Phase 4). Two small provider changes are done now because the new output needs
  them: a separate system message, and Anthropic `max_tokens` 500 -> 1200.

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
- [x] Phase 3 – `src/brief/{dossier,facts,schedule,clock,validate,composer,fallback,contextFacts,extraFacts,gate,result,run}.js`.
  New default engine `services.llm.pipeline = "dossier"` (old one: `"legacy"`). One model call instead of two, only when
  there are facts; facts are computed in code, the model cites them, `validate.js` checks every bullet (cited fact, no link,
  times/durations/temperatures must be in the cited facts), uncited conflicts / schedule changes / tight transitions are added
  deterministically in de/en, a provider outage degrades to those notes. `privacyMode: off` now really blocks the call;
  prep notes, household context and addresses are no longer sent in cloud-redacted mode. 181 backend tests green; end-to-end
  run against a mock provider (good, hallucinated time, empty, garbage, injection, HTTP 500) behaved as designed.
  Known limits / open:
  - NOT verified against a real Anthropic/OpenAI/Google endpoint (mock only). Anthropic `max_tokens` 500 -> 1200 and the
    separate system message are untested live.
  - Overlaps are detected between ALL events in the brief calendars. Two different family members' appointments at the same
    time are reported as a conflict. Needs a "same person" notion (household member <-> calendar) before it is reliable.
  - Leave-by times exist only for events matched by an event hint rule (with address), commute or trips; there is no generic
    "leave by" for any event with a location yet.
  - With `briefCalendarMode: include_selected` (current Pi config) newly added subscription calendars are NOT part of the
    brief until ticked in the brief calendar list: first e2e run had 0 eligible events for exactly this reason.
  - A hostile event title is still shown, inside quotation marks, by the deterministic notes.
  - (Resolved in Phase 5: the model is only called when its input changed.)
- [x] Phase 4 – new `backend/src/llm/` (`providers`, `openai`, `anthropic`, `google`, `schema`, `retry`, `http`, `diagnostics`, `models`, `text`).
  One interface `generateJson({provider, apiKey, model, baseUrl, system, prompt, schema, timeoutMs})` used by the dossier
  pipeline (the legacy pipeline goes through the same layer). One readable schema per task; `prepareSchema` reshapes it per
  provider (strict OpenAI: all properties required + `additionalProperties:false`; Anthropic: bounds removed; Gemini: upper
  case types). Structured output first, then steps down on 400/422 and remembers what worked (in memory): OpenAI
  `json_schema` strict -> `json_object` -> plain; Anthropic `output_config.format` -> plain; Gemini `responseSchema` -> plain.
  `temperature` is only sent to gpt-3/4 style models and self-hosted servers, dropped (and remembered) when a server rejects it,
  never sent to Anthropic. Anthropic `max_tokens` 1500; `max_tokens`/`length`/`MAX_TOKENS` and refusals are errors, not
  half-parsed answers. Retry with backoff (1 s, 2 s, 4 s, cap 8 s, honours `Retry-After`) on 408/429/5xx/529/timeouts, at most
  3 tries per request; timeout configurable (`services.llm.timeoutSeconds`, 10-180 s, default 45). Debug view has `call`
  (mode, token usage, requests, temperature). Provider errors reach the UI/debug view as short plain sentences, not raw bodies.
  `GET /api/llm/providers` (suggestions) and `POST /api/llm/test` (one tiny request, rate limited, saved key only used for the
  endpoint it was saved for). Remote UI: provider/model suggestions, timeout field, "Test connection" button.
  217 backend tests green; end to end against a local mock (structured, forced fallback, 401, 404, non-JSON answer, blocked
  address, no token -> 401, no key in the backend log).
  Known limits / open:
  - STILL NOT run against the real Anthropic/OpenAI/Google endpoints. The request shapes follow the providers' documentation
    as read on 2026-10-26 (Anthropic `output_config.format`, OpenAI `response_format.json_schema`, Gemini `responseSchema`).
    The fallback ladder is there so a wrong guess degrades to plain JSON instead of failing, but only the "Test connection"
    button on the Pi proves it.
  - Model suggestions (`src/llm/models.js`) come from the providers' model pages as of 2026-10-26 and go stale; typing any
    name still works. The default for new installs is still `gpt-5-mini` in the config template: not changed because it is
    unverified whether that name is still served.
  - The legacy pipeline now also gets structured output and retries; its selector/composer schemas are the old Gemini-style ones
    (converted per provider by `prepareSchema`).
  - `learned` capabilities live in memory only: a restart probes again (costs at most one extra failed request per model).
  - Not covered: streaming, prompt caching, the OpenAI Responses API (Chat Completions is used; it keeps custom/local servers working).
- [x] Phase 5 – reliability. 292 backend tests green; remote UI builds; live check against a local mock (30 display polls = 0 extra
  model calls, 5 polls answered in ~85 ms while a 4 s model call ran, 4 simultaneous rebuilds = 2 model calls, a dead feed keeps
  its events, no temp files left, `config.json` stays mode 600).
  - **Model calls** (`src/brief/freshness.js`): the dossier gets a fingerprint of exactly what the model is told (events, facts,
    language, focus, provider, model, privacy mode, prompt version). Same fingerprint -> the stored answer is reused, so display
    polls, restarts and syncs that change nothing cost nothing. "17 minutes until X" is deliberately not part of it. The answer is
    refreshed when the part of the day changes (morning/afternoon/evening) and after 12 h as a safety net. A failed or degraded
    answer is retried after 15 min, not on every poll and not after hours. `refreshMinutes` no longer controls model calls.
  - **One build at a time** (`src/runtime/coalesce.js`): context builds and calendar syncs each go through a runner that never
    overlaps itself; requests during a run share exactly one follow-up run (so a household saved mid-build is not lost).
    `GET /api/display/context` returns the cached context at once and refreshes in the background; only the very first start waits.
    A build that just failed is not retried by display polls for 2 min. The context remembers the calendar fingerprint it was
    built from (before, "synced after the context" stayed true forever and every poll rebuilt it).
  - **Sync decoupled:** calendars are fetched every `services.context.calendarSyncMinutes` (default 15, 5-180); the sync only
    starts a context refresh when something changed. A failing source keeps its last events for 48 h (`stale`, shown in the UI)
    instead of vanishing from the brief.
  - **Time** (`src/time/zone.js`): `resolveTimeZone` - empty/"auto" = the device's zone; the old default "UTC" on a device that is not
    on UTC also means the device's zone ("Etc/UTC" = really UTC). All `config.system.timezone || 'UTC'` reads and the remaining
    `toISOString().slice(0,10)` day comparisons use it (forecast days are cut in the forecast's own zone, flight dates keep the
    date written in the event). ICS: `DTSTART;TZID=...` is now converted (it was read as device-local time), all-day dates are
    local dates (not UTC midnight), recurrence is expanded on the wall clock of the event's own zone (`src/calendar/recurrence.js`:
    DST-safe, plus `BYDAY=2TU` / `-1FR` and `BYMONTHDAY`, which were wrong before: they repeated the first date's day-of-month).
  - **Same person** (`src/brief/people.js`): overlaps and tight transitions are only reported between calendars that can belong to
    the same person (same calendar, same household member, or a calendar nobody owns). No assignment at all = old behaviour.
    The household save now rebuilds the brief.
  - **Atomic writes** (`src/runtime/atomicWrite.js`): temp file in the same directory + fsync + `rename` over the target. The old
    helper (`fs.move` with `overwrite`) deleted the target first, so a reader could see no file. Used for config, secrets, household,
    calendar sources and the Google account too. The display needs no change: checked with the `watcher` package version from
    `pubspec.lock` (1.2.0) that 12 atomic replacements give 12 change events, no parse errors, no remove event.
  - **ICS library: evaluated, not switched.** `ical.js` 2.2.1 agrees with the own parser on 6 of 7 recurrence cases (the 7th is the
    yearly all-day birthday, where the own parser hides the event unless its title looks like a birthday - a deliberate rule).
    Before the fixes above the own parser was wrong on 2 (`2TU`, `-1FR`); after them there is no case where the library is right and
    the own code is wrong. `ical.js` is ESM-only (the backend is CommonJS), and the parser also carries the decline/ownership/alarm
    handling, so a switch would be a rewrite for no demonstrated gain.
  Known limits / open:
  - NOT verified on the Pi: its own time zone. The `config.json` on the development machine says "UTC" (the old default), and
    that now resolves to the device's zone (Europe/Berlin here). If the Pi itself runs on UTC, the brief uses UTC too ("today" is
    wrong between 22:00/23:00 and midnight local time). Fix: `timedatectl set-timezone Europe/Berlin` on the Pi, or put
    `Europe/Berlin` into `system.timezone`.
  - `services.context.calendarSyncMinutes` is read from the config but has no field in the remote UI yet (default 15 min).
  - The new context/sync runners in `index.js` are only covered by the live script, not by unit tests: the pieces they use are
    (coalescing, freshness, merge, atomic write), the wiring is not.
  - Check 8 of the live script only proves the debug view is readable; the zone logic itself is covered by unit tests, not by the live run.
  - The same-person rule needs calendars assigned to household members; with a shared family calendar it still treats everything as
    competing (on purpose: no information, no guessing).
  - `BYSETPOS`, `BYWEEKNO`, `BYYEARDAY`, and `BYMONTHDAY` with FREQ=YEARLY are still not expanded (the ical.js comparison did not
    cover them either). Windows zone names ("W. Europe Standard Time") are not mapped and keep the old behaviour.
  - Coalescing state is in memory: a restart forgets a queued follow-up (the next display poll starts a new one).
  - Forced refresh (`/api/debug/daily-brief/rebuild`) still calls the model by design.
- [x] Phase 6 – display app. `flutter analyze` clean, 29 Dart tests + 293 backend tests green. Live run of the real `BackendClient`
  against the real backend (mock calendar/model): without token on the local machine, with `MIRRORIAL_TRUST_LOCAL=false` no token and
  a wrong token -> auth error, right token -> ok; unreachable backend -> error in ~10 ms.
  - **`BackendClient`** (`lib/services/backend_client.dart`): one client for context, calendar, travel time and the status report.
    10 s timeout on every request, `Authorization: Bearer` when a token is set, UTF-8 decoding, one error type (`BackendException`,
    `isAuthError` for 401/403 with a message that says "token"). The base-URL function existed three times and is now one.
    Token only from `--dart-define=DISPLAY_ACCESS_TOKEN=...` or the `MIRRORIAL_ACCESS_TOKEN` environment variable, never from
    `config.json` (the remote UI can read it). The Pi display talks to 127.0.0.1 and needs none.
  - **Keep last good data** (`lib/services/polling.dart`): before, any failure (HTTP error, timeout, bad JSON) became an empty
    calendar / empty brief / no routes, so one hiccup blanked the card and the birthday overlay. Now a failed poll changes nothing.
    After 2 min of failures the last good data is shown again with a small "Data from 09:15" / "Stand 09:15" mark (top right,
    cloud-off icon); with no data ever loaded, "No connection". Retry after 15 s, then 30 s, 1 min ... up to 10 min; one success
    resets it. Works for calendar, brief and travel time.
  - **Travel module polled on every rebuild:** `StreamBuilder(stream: service.watchItems(items))` inside `build()` started a new loop
    and a new request per rebuild, and never stopped the old one. Now a keyed `autoDispose` provider: one loop per route list.
  - **Brief card** (6.3): the backend adds `brief.notes = [{text, urgency, time}]` (the same lines as `householdView` + `bullets`).
    The display colours the bullet (amber = high, dim = low) and prefixes the start time of the appointment the note is about
    ("11:00  ..."). Old backend / deterministic brief / trip line: no `notes`, rendering exactly as before (tested).
  Known limits / open:
  - NOT run on the Pi (flutter-pi) or on a real screen. The widgets compile and the logic is tested, but nobody has looked at how the
    stale mark and the time prefix sit in the real layout (the mark overlays the top-right corner of the module and could cover the
    first line of a very small module). No widget tests.
  - Weather (Open-Meteo/OpenWeather) and Home Assistant (WebSocket) still use their own HTTP code: they talk to third parties, not to
    the backend, and were left alone. They still turn failures into "nothing" (weather) - same pattern, not fixed here.
  - `notes` are matched to lines by their text. If the backend later rewrites a line (German headline translation does not touch
    bullets, but would), the line simply shows without urgency/time.
  - The access token for a display on another device has to be provided at build time or in the process environment; there is no
    UI for it.
- [x] Phase 7 – code health and CI. 329 backend tests (293 before), remote UI lint 0 errors / 6 warnings, build ok. A clean copy of
  the tree (no `config.json`, no `node_modules`, empty `HOME`) was run the way CI will: `npm ci`, tests, lint, build all pass, and
  the tests wrote nothing to `HOME` or to the repo root.
  - **HTTP-level tests** (`test/http*.test.js`, helper `test/helpers/server.js`): the real Express app on a random port with its own
    data directory and config file (new env var `MIRRORIAL_CONFIG_PATH`), so no test can touch the owner's `config.json` or
    `~/.config/mirrorial` (checked: unchanged). 35 tests over real sockets: every protected route refuses a request without a token
    (20 routes listed), wrong token, only 3 public paths, brute-force lockout (10 failures -> 429 + `Retry-After`, also for the right
    token), local trust only without proxy headers / DNS host / foreign origin (CSRF, DNS rebinding), CORS, secrets in the secrets
    file with mode 600 and never in an answer, HA token kept on empty save and dropped for a new host, key dropped when the
    endpoint changes, internal-address refusal on the calendar link test and the LLM test, one-time Google sign-in ticket bound to the
    caller's origin, rate limit on `/api/system/*`, display routes, oversized and malformed bodies.
  - **Bug found by these tests and fixed:** a request body that is not valid JSON (or is too large) got Express' default error page,
    which prints the stack trace with absolute file paths. Now a final error handler answers `{ "error": "The request could not be
    read." }` (400) / 413 / 500 without internals.
  - **CI** (`.github/workflows/ci.yml`, runs on push to main/master/`improvement/**` and on pull requests): backend `npm ci` + `npm test`,
    remote UI lint + build, display `flutter analyze` + `flutter test`. `npm audit --omit=dev` is reported, not enforced (3 moderate
    findings via `google-auth-library`, not fixable here). The workflow has NOT run on GitHub yet; it was only reproduced locally.
  - **Remote UI lint** works for the first time: `npm run lint` had no config. `.eslintrc.cjs` is a small rule set (real mistakes only).
    It found 7 errors, now fixed: `MirrorPreview` returned early BEFORE its hooks (React would see a different number of hooks once
    `config` arrived; hooks moved into an inner component), and 7 lines in `App.jsx` mixed tabs and spaces. Unused `React` imports and
    `GripVertical` removed. `--max-warnings 0` was dropped from the script: 6 warnings remain (3x missing `useEffect` dependencies in
    `App.jsx`, 1 in `MirrorPreview`, 2 unused functions). They are real but fixing them changes behaviour; not done blindly.
  - **Split of `index.js`** (8522 -> 8143 lines), only code touched by earlier phases: the ICS parser moved to
    `src/calendar/icsParser.js` (347 lines; its dead helpers from the old recurrence code were deleted) and the household keyword patterns
    to `src/brief/householdPatterns.js`. Done with a marker-based script that refuses to cut when a marker is not unique, then checked
    with ESLint `no-undef` (found the three `parseIcsEvents` call sites that still needed the import) and the full test run.
  Known limits / open:
  - `index.js` is still 8100 lines. The routes, the config/secrets code, the travel/transport code and the legacy brief pipeline were
    NOT moved: they were not touched by earlier phases, have no tests that pin their behaviour down, and moving 5000 lines
    on that footing is more likely to break the mirror than to help. Next candidates, in order of safety: the legacy brief pipeline
    (can be deleted once nobody uses `pipeline: "legacy"`), the calendar source fetchers (CalDAV/ICS), then the routes.
  - The new context/sync runners (Phase 5) are still only covered by the live script, not by an HTTP test with a fake calendar server.
  - CI uses Node 20 (what is installed here) and `flutter-action` with the stable channel; the Pi installer's Node version was not checked.
  - The `useEffect` dependency warnings can hide stale-closure bugs in the remote UI; nobody has reproduced one.
- [ ] Phase 8

