# ChronoGuard вЂ” Hacksgiving 2026 submission pack

This folder contains everything needed to submit, except the two actions that require the owner's
accounts: publishing the repository and recording the video.

## 1. Short description (for the form)

> **ChronoGuard вЂ” your AI's last line of defense.**
> An autonomous safety and recovery layer for AI agents on Fly.io Sprites. The agent has no shell:
> every action goes through one guarded executor with a deterministic risk and policy engine
> (ALLOW / DEFER / BLOCK), an append-only audit journal, and human approval for anything risky.
> Recovery is a native Sprite checkpoint restore that is verified after the environment reconnects,
> and the incident history survives the rollback. The Fly Machines connector is used through the
> official Sprites gateway, so no provider token ever enters the sprite.

## 2. Problem and solution

| Problem | ChronoGuard answer |
|---|---|
| Agents can run destructive commands with no second opinion | single guarded executor + deterministic policy engine |
| вЂњHuman in the loopвЂќ is usually a checkbox | DEFER creates a real pending approval; the model cannot approve itself |
| Recovery demos are fake | native `sprite-env checkpoints restore`, verified after reconnect (5/5 checks) |
| Incidents disappear after a rollback | automatic journal export to `/tmp` + import on boot, proven across a real restore |
| Connectors leak tokens into sandboxes | official gateway; credentials stay in the org, sprite sees only a connection id |

## 3. Fly.io Sprites + Connector integration

* Agent runs in sprite **chronoguard-dev** as the `chronoguard` service (`http_port 8090`).
* Connector: **`custom_api` в†’ Fly.io Machines** (`FGKE6qpYITmb8rKxbqQyaw`), created through the
  official connector flow, called only via `https://api.sprites.dev/v1/gateway/...`.
* Access policy narrowed: `name_prefix=chronoguard-dev`, `allowed_endpoints=["/v1/apps*"]`
  (was `allow_all`). `sprite_count: 1`.
* Verified: allowed path в†’ **200** (`total_apps: 1`); non-allowlisted path в†’ **403 endpoint is not in
  allowed list**.

## 4. Security guarantees

| Guarantee | Mechanism | Status |
|---|---|---|
| Deterministic decisions, no LLM override | risk engine (0вЂ“100) + policy engine; restricted ops checked first | VERIFIED (tests + live) |
| No shell / no unrestricted exec | one executor, `shell=False`, allowlist, `cwd=workspace` | VERIFIED (`shell=True`: 0) |
| Protected paths are absolute blocks | policy `protected_paths`; never approvable | VERIFIED (tests + live BLOCK) |
| Approval cannot bypass a later block | policy re-validated at approval time | VERIFIED (test) |
| Prompt injection cannot change policy | no policy tool exists; tool args guarded | VERIFIED (test) |
| Model cannot approve its own DEFER | no approve tool; approval is a separate human endpoint | VERIFIED (schema test) |
| Connector least privilege | org policy name prefix + endpoint allowlist | VERIFIED (200 / 403) |
| No provider credentials in the sprite | gateway identity only; journal/bundle scanned | VERIFIED (grep + bundle check) |
| Provider failure cannot bypass | error path returns without executing any tool | VERIFIED (tests) |
| Bounded loop | в‰¤12 steps, 60 s/call, 240 s total, output caps | VERIFIED (tests) |
| Durable audit across restore | pre-restore export to `/tmp` + boot import (`mode=automatic`) | VERIFIED (real restore) |
| OS-level sandbox | not implemented | **LIMITATION** |
| Live AI reasoning | Gemini 3.6 Flash via connector; real tool-call cycle verified | **VERIFIED** |
| GitHub issue reporting | real issue created + deduplicated | **VERIFIED** |

## 5. Test results

| Suite | Count | Result |
|---|---|---|
| `tests/test_guard.py` | 17 | PASS |
| `tests/test_v2.py` | 17 | PASS |
| `tests/test_v3.py` | 20 | PASS |
| **Total** | **59** | **PASS** |

Evidence: `evidence/tests-v1.txt`, `tests-v2.txt`, plus the v3 run in `evidence/` and the demo logs.

## 6. Reproduce the demo

```powershell
# one-time: sprite proxy -s chronoguard-dev 8090:8090
powershell -ExecutionPolicy Bypass -File .\scripts\demo.ps1           # guard + connector + restore
powershell -ExecutionPolicy Bypass -File .\scripts\demo-lifecycle.ps1 # damage + restore + hashes
```

Both scripts exit non-zero on failure and print PASS/FAIL lines. `DEMO.md` has the 90-second
narration and the UI path.

## 7. Hacksgiving checklist

- [x] Runs on a Fly.io Sprite (`chronoguard-dev`, service `chronoguard`, `:8090`)
- [x] Uses at least one official Sprites Connector (Fly Machines, narrowed policy, live 200)
- [x] Built during Hacksgiving week (all checkpoints created 2026-11-25)
- [ ] Public repository link вЂ” **owner action** (local repo ready)
- [ ] Demo video вЂ” **owner action** (script in `DEMO.md`)
- [ ] Social post tagging `@flydotio`
- [ ] Submit before **2026-11-29 23:59 PST** = **2026-11-30 12:00 Asia/Tbilisi**

## 8. Social post (X / Bluesky / LinkedIn)

> Built ChronoGuard for @flydotio Hacksgiving: an AI agent on a Sprite that can't destroy itself.
> Every tool call hits a deterministic guard (ALLOW/DEFER/BLOCK), risky ops need a human, and
> recovery is a native Sprite checkpoint restore вЂ” verified, with the incident history surviving the
> rollback. Connectors keep tokens out of the sandbox. #Hacksgiving

(в‰¤ 280 chars; adjust if the platform counts differently.)
