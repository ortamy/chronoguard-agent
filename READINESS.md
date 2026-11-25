# ChronoGuard 2.0 — final readiness report

Evidence-based. Every verdict references something that was actually executed on
sprite `chronoguard-dev` on 2026-11-25.

## 1. Connector compliance

| Requirement | Verdict | Evidence |
|---|---|---|
| Official Sprites Connector configured | **PASS** | `GET /v1/gateway/list` → connection `FGKE6qpYITmb8rKxbqQyaw`, `provider=custom_api`, `connection_type=oauth`, `provider_info.base_api_url=https://api.machines.dev` (`evidence/connectors.json`) |
| `chronoguard-dev` authorized | **PASS** | access policy `name_prefix=chronoguard-dev`, `sprite_count=1`; a real gateway call from the sprite returned HTTP 200 (`evidence/connector-allowed-call.json`) |
| Request/response evidence preserved | **PASS** | `evidence/connector-allowed-call.json`, `connector-blocked-call.json`, `connectors.json`, `connections-list-after.json` |
| Narrowest practical permissions | **PASS** | replaced `allow_all:true` with `name_prefix=chronoguard-dev` + `allowed_endpoints=["/v1/apps*"]`; `/v1/volumes` now returns gateway **403 “endpoint is not in allowed list”** (`evidence/connector-policy-before.json`, `-after.json`, `connector-blocked-call.json`) |
| Documented why it satisfies Hacksgiving | **PASS** | README §1: it is an organization-level connector created through the Sprites connector flow, consumed through the official gateway with platform identity, no token in the sprite |

**Why this satisfies the rule:** Hacksgiving requires “an agent that runs on Fly.io Sprites using at
least one connector”. The Fly Machines connector is an officially configured Sprites connector
(`custom_api` type with a stored credential in the org, deny-by-default access policy), called only
through `https://api.sprites.dev/v1/gateway/...`, with the calling sprite identified by the platform.
ChronoGuard uses it for real environment inspection (Fly apps/machines). No provider token exists in
the sprite.

## 2. Live AI validation

| Requirement | Verdict | Evidence |
|---|---|---|
| One real autonomous task with Anthropic | **NOT VERIFIED** | no Anthropic connector exists (`/api/connectors` → `connections: [custom_api]`); no key is stored in the sprite by design |
| Honest setup state preserved | **PASS** | `GET /api/agent/mode` → `available:false`, `note`, `setup_url`; `POST /api/agent/run` returns `ok:false` with that reason (`evidence/agent-mode.json`); UI shows a setup card, never fake reasoning |
| Loop correctness (not production claim) | **PASS (test-level)** | 17 v2 tests exercise the real HTTP loop against a mock model: ALLOW → BLOCK → DEFER, unknown tool, step limit, connector tool read-only |

No claim is made that the autonomous LLM workflow is production-tested. It becomes live the moment an
Anthropic (or OpenAI-compatible) connector is added; no code change is needed.

## 3. Durable audit

| Requirement | Verdict | Evidence |
|---|---|---|
| Automatic export/import without manual steps | **PASS** | before restore the server writes the journal to `/tmp` (outside the checkpoint snapshot, verified empirically); on boot it auto-imports and records `audit_context_restored` with `mode=automatic`; there was **no manual import call** |
| IDs, timestamps, recovery results survive | **PASS** | incident `evt_876838d63405` (BLOCK, 2026-11-25T11:06:39Z) created **after** checkpoint `v17`; real restore; incident still present, marker `imported=2`; verification 5/5 |
| Service restart persistence | **PASS** | probe event `evt_bca02e56f283` survived `sprite-env services restart chronoguard`; API healthy, 24 checkpoints (`evidence/lifecycle-service-restart.txt`) |
| Disposable damage → native restore → integrity | **PASS** | 3 files hashed → checkpoint → corrupt/delete/rogue → restore → **identical hashes**, rogue removed, `b.txt` restored, verify 5/5 (`evidence/lifecycle-damage-restore.txt`, `evidence/demo-lifecycle-run.txt`) |
| Duplicate/missing event handling | **PASS** | duplicate journal lines collapse to one id; a deliberately removed event is restored by import (tests v3) |
| Old checkpoint restore | **PARTIALLY VERIFIED** | rolling back to `v13` (created before the auto-import hook) restores the environment in **6 s**, but the journal rewinds to 17 events because that code predates auto-import. After redeploying the current server, boot auto-import restored 48 events and the old incident id returned (`evidence/lifecycle-old-checkpoint.txt`). This is expected and documented — always rewind to a recent checkpoint. |
| Boundary documented | **PASS** | README §4: `/tmp` is local sprite storage excluded from the snapshot; a full sprite rebuild can clear it, so the UI still exports to the host as a second anchor. Journal is append-only in normal operation, not cryptographically immutable |

Reproduce: `pwsh -File scripts/demo.ps1` → step 8 prints the surviving incident and the automatic marker.

## 4. Final security

| Requirement | Verdict | Evidence |
|---|---|---|
| All tests | **PASS** | `test_guard.py` 17/17, `test_v2.py` 17/17, `test_v3.py` 20/20 → **54/54** (`evidence/tests-v1.txt`, `tests-v2.txt`, v3 run in session logs) |
| Connector permissions | **PASS** | allowed path 200, non-allowlisted path 403 (gateway enforcement, not app-side only) |
| No model operation bypasses `guarded_execute` | **PASS** | model tools are an explicit allowlist routed through `_run_tool` → `guarded_execute`; unknown tools → BLOCK; connector tool GET-only (POST → DEFER); `shell=True`: 0, `os.system`: 0; only two `subprocess.run` sites (sprite-env wrapper; executor with `shell=False`, allowlist, cwd=workspace) (`evidence/security-no-bypass.txt`) |
| Service healthy after restore | **PASS** | API healthy again in **6 s**, service auto-started, verification 5/5 (`evidence/demo-run.txt`) |

## 5. Final demo

Reproducible script: `scripts/demo.ps1` — **PASS**, 0 failures, ~17 s machine time
(`evidence/demo-run.txt`):

| Demo step | Verdict |
|---|---|
| Real Fly Machines connector request (200, app `mono--oa19w`) | PASS |
| Endpoint allow-list enforcement (403 on `/v1/volumes`) | PASS |
| Agent task and reasoning | NOT VERIFIED (no LLM connector; honest setup state) |
| Checkpoint creation (native `sprite-env`) | PASS |
| Dangerous operation blocked (risk 97/100) | PASS |
| Actual native Sprite restore | PASS |
| Integrity verification (5/5) | PASS |
| Persistent incident history (automatic import) | PASS |
| Recorded video | NOT VERIFIED (no recorder in this environment; runbook in `DEMO.md`) |

## 6. Submission

| Artifact | Verdict | Notes |
|---|---|---|
| Public GitHub repository | **NOT VERIFIED** | `gh` is not installed and no GitHub credentials are available here; a local git repository with the full history is prepared (see below) |
| Updated README | **PASS** | `README.md`: architecture, connectors, agent loop, GitHub, durable audit, API, tests, demo, limitations |
| Architecture diagram | **PASS** | ASCII diagram in README §Architecture |
| Submission pack | **PASS** | `SUBMISSION.md`: problem/solution, connector facts, security table, test results, demo instructions, submission text, social post |
| Demo recording | **NOT VERIFIED** | needs a screen recorder; `DEMO.md` gives the 90-second script |
| Short project description | **PASS** | in `SUBMISSION.md` §1 |
| Hacksgiving submission checklist | **PASS** | in `SUBMISSION.md` §7 |

### Short description (for the submission form)

> ChronoGuard is an autonomous safety and recovery layer for AI agents on Fly.io Sprites.
> The agent has no shell: every action goes through one guarded executor with a deterministic risk
> and policy engine (ALLOW / DEFER / BLOCK), an append-only audit journal, and human approval for
> anything risky. Recovery is a native Sprite checkpoint restore that is verified after the
> environment reconnects, and the incident history survives the rollback. The Fly Machines connector
> is used through the official Sprites gateway, so no provider token lives in the sprite.

### Publish the repository

```powershell
# after creating an empty PUBLIC repo on github.com (no README/license), push:
git remote add origin https://github.com/<you>/chronoguard.git
git branch -M main
git push -u origin main
```

### Hacksgiving checklist

- [x] Runs on a Fly.io Sprite (`chronoguard-dev`, service `chronoguard`, `:8090`)
- [x] Uses at least one official Sprites Connector (Fly Machines via `custom_api`, narrowed policy)
- [x] Built during Hacksgiving week (all checkpoints created 2026-11-25)
- [ ] Public code link (push the prepared repo)
- [ ] Demo video (record with `DEMO.md` script)
- [ ] Social post tagging `@flydotio` (X / Bluesky / LinkedIn / Reddit)
- [ ] Submit before **2026-11-29 23:59 PST** = **2026-11-30 12:00 Asia/Tbilisi**

## Summary

* Core product and connector requirement: **PASS**
* Two external actions remain: **publish repo**, **record demo**; plus optional **Anthropic connector**
  to turn the LLM loop from “implemented and tested” into “verified live”.
