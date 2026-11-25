# ChronoGuard

**Your AI's last line of defense.**

ChronoGuard is an autonomous safety and recovery layer for AI agents running inside a
[Fly.io Sprite](https://fly.io). An LLM proposes actions; a deterministic risk engine and policy
engine decide; every operation is journalled; recovery is a native sprite checkpoint restore that
is verified after the environment comes back.

Deployed on sprite **chronoguard-dev** (org `artem-909`):

```
http://127.0.0.1:8090        в†ђ UI via `sprite proxy -s chronoguard-dev 8090:8090`
```

---

## Status (verified in this session)

| Check | Result |
|---|---|
| Sprite service | `chronoguard` running, `http_port 8090`, auto-starts after restore |
| Official connector | `custom_api` в†’ **Fly.io Machines** (`FGKE6qpYITmb8rKxbqQyaw`), policy narrowed to `name_prefix=chronoguard-dev` + `allowed_endpoints=["/v1/apps*"]` |
| Live connector call | `GET /v1/apps?org_slug=artem-909` в†’ HTTP **200**, `total_apps: 1` (`mono--oa19w`); `/v1/volumes` в†’ gateway **403** (allow-list enforced) |
| Providers available | **57** discoverable via the gateway (github, anthropic, slack, вЂ¦) |
| Agent loop | **VERIFIED live**: Gemini 3.6 Flash (free tier) → list_dir ALLOW → write_file ALLOW → delete_path **BLOCK** → model summary (evidence/agent-live-gemini.json) |
| GitHub reporter | **VERIFIED live**: issue [#1](https://github.com/ortamy/chronoguard-agent/issues/1) created from a real BLOCK; repeat call deduped (evidence/github-live-summary.txt) |
| Durable audit | **automatic**: pre-restore export to `/tmp` (outside the snapshot) + import on boot; incident **survived a real restore** (`mode=automatic`) |
| Restore в†’ API healthy | **6 s** |
| Tests | **59/59** (17 guard + 17 v2 + 25 v3 hardening) |
| Frontend | Vite build served from `/home/sprite/agent/web` |

Evidence lives in [`evidence/`](<C:\Users\DELL\Desktop\chronoguard\evidence>):
`connectors.json`, `connector-call-machines.json`, `agent-mode.json`, `github-status.json`,
`tests-v1.txt`, `tests-v2.txt`.

---

## Architecture

```
                    host (operator browser)
                        в”‚  sprite proxy :8090
                        в–ј
в”Њв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ sprite: chronoguard-dev в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”ђ
в”‚  server.py (ThreadingHTTPServer, no external deps)                      в”‚
в”‚                                                                         в”‚
в”‚  /api/agent/run в”Ђв”Ђв–є bounded tool-calling loop в”Ђв”Ђв–є Sprites gateway в”Ђв”Ђв–є   в”‚
в”‚                        в”‚                          (Anthropic / OpenAI-  в”‚
в”‚                        в”‚                           compatible connector)в”‚
в”‚                        в–ј                                                в”‚
в”‚                   guarded_execute()  в—„в”Ђв”Ђ single control point           в”‚
в”‚                        в”‚                                                в”‚
в”‚              risk engine в”Ђв”Ђв–є policy engine в”Ђв”Ђв–є ALLOW / DEFER / BLOCK    в”‚
в”‚                        в”‚                                                в”‚
в”‚              execute (no shell)в”‚  journal (JSONL)  в”‚  checkpoints       в”‚
в”‚                        в–ј                        в–ј            в–ј          в”‚
в”‚                  /home/sprite/workspace   /home/sprite/audit   sprite-env в”‚
в”‚                                                                         в”‚
в”‚  /api/connectors в”Ђв”Ђв–є https://api.sprites.dev/v1/gateway/... (GitHub,     в”‚
в”‚                      Machines, any configured provider; no keys here)    в”‚
в””в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”
                        в”‚
        before rewind:  audit export в”Ђв”Ђв–є host copy (outside the sprite)
        after  restore: audit import  в”Ђв”Ђв–є journal restored, incident kept
```

---

## 1. Official Sprites Connectors

Connectors are **organization-level**; the sprite never holds a provider token. The gateway URL is
`https://api.sprites.dev/v1/gateway/<provider>/<connection_id>/<path>` and the platform identifies
the calling sprite.

Discovery is dynamic вЂ” `GET /api/connectors` proxies `GET /v1/gateway/list`:

```json
{ "connections": [{ "provider": "custom_api", "display_name": "Fly.io Machines",
                    "id": "FGKE6qpYITmb8rKxbqQyaw" }],
  "available":  [ { "provider": "github" }, { "provider": "anthropic" }, "вЂ¦57 total" ] }
```

A **real** call, from the running service:

```bash
curl -X POST localhost:8090/api/connectors/test \
  -d '{"provider":"custom_api","path":"/v1/apps?org_slug=artem-909"}'
# в†’ {"ok": true, "status": 200, "data": {"total_apps": 1, "apps": [{"name": "mono--oa19w", вЂ¦}]}}
```

The agent can also call connectors as a tool (`connector_call`, **GET only** вЂ” non-idempotent
methods are deferred to a human).

**Access policy (narrowed):** `allow_all` was replaced with
`{"name_prefix":"chronoguard-dev","allowed_endpoints":["/v1/apps*"]}`. Exactly one sprite is
authorized (`sprite_count: 1`), and paths outside the allow-list are rejected by the gateway
(`/v1/volumes` в†’ 403 *endpoint is not in allowed list*). Evidence:
`evidence/connector-policy-before.json`, `connector-policy-after.json`,
`connector-blocked-call.json`.

**Why this satisfies Hacksgiving:** it is an organization-level Sprites connector created through
the official connector flow, consumed only via `https://api.sprites.dev/v1/gateway/...`, with the
calling sprite authenticated by the platform and the credential stored in the org вЂ” never in the
sprite. That is exactly вЂњruns on a Sprite and uses at least one Sprites connectorвЂќ.

### Adding Anthropic / GitHub (one-time, in the dashboard)

1. Open <https://sprites.dev/account/artem-909/connectors>
2. **Add connection** в†’ **Anthropic** (bring your own key) or **GitHub** (OAuth consent)
3. Grant access to sprite `chronoguard-dev`

No code change is needed: `llm_mode()` and `github_status()` re-discover connectors at runtime.
Setup links surfaced in the UI:
`https://sprites.dev/account/artem-909/connect/anthropic` and `вЂ¦/connect/github`.

---

## 2. Autonomous agent loop

`POST /api/agent/run {"goal": "вЂ¦", "max_steps": 6}`

```
USER TASK в†’ model call (via connector) в†’ tool proposal
          в†’ guarded_execute в†’ risk в†’ policy в†’ ALLOW / DEFER / BLOCK
          в†’ tool result returned to the model в†’ repeat (bounded) в†’ final answer
```

* Bounded: `max_steps` в‰¤ 12, per-call timeout 60 s, total budget 240 s.
* The model cannot approve its own deferred operations; `DEFER` is reported back as data.
* Absolute `BLOCK`s stay absolute вЂ” retrying through another tool is also blocked.
* Unknown tools are rejected and journalled; malformed arguments are rejected.
* The system prompt tells the model to treat file contents as **data**, while enforcement itself is
  code-level (prompt injection cannot change the rules).

Provider resolution (connector-only, **no keys in the sprite**):

| Priority | Source |
|---|---|
| 1 | `anthropic` connector в†’ `/v1/messages` |
| 2 | any OpenAI-compatible connector (openrouter, openai, ollama, parasail, fireworks, вЂ¦) в†’ `/v1/chat/completions` |
| 3 | none в†’ `available: false` with a setup URL (the UI says so, it never pretends) |

---

## 3. GitHub incident documentation

`POST /api/github/report {"event_id": "evt_вЂ¦"}`

1. loads the incident from the journal,
2. builds title/body with decision, risk score, reasons, resources and policy path,
3. searches existing issues for the marker `chronoguard-incident:<event_id>` (dedupe),
4. creates the issue in `github_repo` (`owner/name`, set in **Settings**),
5. records `github_issue_created` with the issue URL in the journal.

If the token is read-only, it falls back to repository inspection and records
`github_readonly_fallback` instead of claiming an issue was filed.

---

## 4. Durable audit (survives a real restore)

The journal lives at `/home/sprite/audit/events.jsonl` вЂ” outside the guarded workspace and outside
the agent state directory. A checkpoint covers the whole rootfs, so durability needs a location that
is **not** in the snapshot. Verified empirically: `/tmp` is local sprite storage
(`/dev/vdb[/sprite/local-storage/tmp]`) and survives a native restore, while `/.sprite/*`, `/run`
and tmpfs paths are cleared.

```
POST /api/action/rollback  в†’ server writes /tmp/chronoguard_pre_restore.json
                           в†’ sprite-env checkpoints restore (environment restarts)
boot                       в†’ server auto-imports that bundle (mode=automatic),
                             appends audit_context_restored, renames it *.imported.json
```

Verified end-to-end: a blocked incident recorded **after** checkpoint `v17` survived a real rollback
to `v17` with **no manual import**, log line
`AUDIT auto-imported 2 events after restore`, journal marker `mode=automatic`, and verification 5/5.
The UI still exports to the host as a second anchor (idempotent import).

**Boundary:** `/tmp` is local disk, not an external service. A full sprite rebuild (new machine) can
clear it; the host-side export in the Rewind dialog is the fallback. The journal is append-only in
normal operation but not cryptographically immutable.

---

## 5. Guarded execution (unchanged core)

`guarded_execute(tool, args, actor)` вЂ” path confinement (`realpath` + `commonpath`), risk score
0вЂ“100, deterministic policy, append-only journal, human approval, then execution with
`shell=False` and an allowlist.

* Protected paths (`/home/sprite/agent`, `/.sprite`, `/etc`, `~/.ssh`, `~/.config`, `/home/sprite/audit`)
  are an **absolute block** вЂ” they are never вЂњapprovableвЂќ.
* Approval re-validates against the **current** policy, so a pending request cannot bypass a later block.
* Symlinks are resolved before the confinement check (escape attempts are blocked).

---

## 6. API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | liveness, uptime, checkpoint count |
| GET | `/api/state` | state + metrics + snapshots |
| GET | `/api/events` | collapsed journal (`?decision=&q=&limit=`) |
| GET | `/api/incidents` | blocked/deferred operations (incl. connector blocks) |
| GET | `/api/snapshots` | native checkpoints |
| GET/POST | `/api/policies` | active policy (`github_repo`, `agent`, threshold, paths) |
| GET | `/api/connectors` | gateway discovery + LLM mode |
| POST | `/api/connectors/test` | real gateway call |
| GET | `/api/agent/mode` | resolved reasoning provider |
| POST | `/api/agent/run` | autonomous tool-calling loop |
| GET | `/api/github/status` | connector + repo readiness |
| POST | `/api/github/report` | create/dedupe incident issue |
| GET | `/api/audit/export` | durable journal bundle |
| POST | `/api/audit/import` | idempotent restore of the bundle |
| POST | `/api/action/propose` В· `approve` В· `deny` | guarded execution + approvals |
| POST | `/api/action/checkpoint` В· `rollback` В· `verify` | snapshots + recovery verification |
| POST | `/api/action/demo` В· `task` | reproducible demos |
| GET | `/api/stream` | SSE |

---

## 7. Tests

```bash
sprite exec -s chronoguard-dev -- /.sprite/bin/python3 /home/sprite/agent/tests/test_guard.py -v
sprite exec -s chronoguard-dev -- /.sprite/bin/python3 /home/sprite/agent/tests/test_v2.py -v
sprite exec -s chronoguard-dev -- /.sprite/bin/python3 /home/sprite/agent/tests/test_v3.py -v
```

**54/54 passing.**

v3 hardening suite (20): prompt injection cannot change enforcement, non-dict/missing tool args,
unknown tool journalled, no policy-mutating tool exists, secret paths blocked, connector traversal
blocked, connector POST deferred, no credentials in the journal, provider error executes nothing,
provider timeout bounded, corrupt model response graceful, step budget after failures, approval
replay refused, duplicate journal lines collapsed, missing event restored from bundle, pre-restore
export written to `/tmp`, oversized request rejected, verify known/unknown checkpoint, health and
connector permissions (403 on non-allowlisted path).

Guard suite (17): safe read/write/list, protected write blocked, recursive delete blocked,
workspace-root delete blocked, command injection blocked, banned command blocked, unknown command
deferred, workspace delete deferred, approval executes, explicit denial, blocked event cannot be
approved, journal persistence, checkpoint metadata, HTTP API, static index.

v2 suite (17): connector path validation, missing connector + setup URL, connector call journalled,
agent loop runs tools through the guard (ALLOW/BLOCK/DEFER), unknown tool blocked, step limit
enforced, connector tool read-only, GitHub create+dedupe, read-only fallback, audit
export/import roundtrip + idempotency, bad bundle rejected, traversal, relative traversal, symlink
escape, approval race (exactly one execution), policy change during pending, model text cannot
change policy.

---

## 8. Demo (reproducible)

Scripted, real, 0 failures in ~17 s machine time (`evidence/demo-run.txt`):

```powershell
pwsh -File .\scripts\demo.ps1      # or: powershell -ExecutionPolicy Bypass -File .\scripts\demo.ps1
```

It runs: health в†’ real Machines connector call (200) в†’ allow-list probe (403) в†’ native checkpoint в†’
blocked recursive delete в†’ deferred unknown command в†’ native restore в†’ reconnect в†’ 5/5 verification в†’
persistent incident + automatic audit marker. See [`DEMO.md`](<C:\Users\DELL\Desktop\chronoguard\DEMO.md>)
for the 90-second narration and the UI path.

Lifecycle proof (disposable damage в†’ restore в†’ byte-identical files):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\demo-lifecycle.ps1
```


---

## 9. Honest limitations

* **Live Claude is not configured.** There is no Anthropic connector and no API key in this org;
  the loop reports `available: false` and the exact setup URL. Nothing is faked.
* **GitHub is not configured** either; the reporter is implemented and unit-tested, and returns
  `github connector not configured` with a setup link until OAuth is granted.
* **Enforcement is application-level.** The agent has no shell and can only call guarded tools; a
  process with raw filesystem access inside the sprite would not be constrained.
* **Durability is operator-anchored.** The journal survives restores only when the host-side export
  is imported back (the UI does this automatically). It is append-only in normal operation, not
  cryptographically immutable.
* **Hackathon timing.** All checkpoints were created on 2026-11-25, inside the Hacksgiving window;
  the official project-period rule still warrants a final check before submission.

---

## 10. Layout

```
server.py                custody layer, connectors, agent loop, GitHub, durable audit, HTTP+SSE
tests/test_guard.py      17 guard-engine tests
tests/test_v2.py         17 connector/agent/GitHub/audit/hardening tests
scripts/demo.ps1         reproducible end-to-end demo (0 failures)
DEMO.md                  60вЂ“90 s demo runbook (script + UI)
READINESS.md             PASS / FAIL / NOT VERIFIED evidence table + submission checklist
web/                     React control plane (Vite + TS + Tailwind + Motion)
evidence/                captured connector, audit, test and demo evidence
dashboard.html           legacy v1 dashboard (reference only, not served)
```

## 11. Submission

See [`READINESS.md`](<C:\Users\DELL\Desktop\chronoguard\READINESS.md>) for the requirement-by-requirement
verdict and the Hacksgiving checklist. Remaining external actions: push the prepared git repository
to a public GitHub repo, record the demo video, and post the demo tagging `@flydotio`.

