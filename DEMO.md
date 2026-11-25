# ChronoGuard — 60–90 second demo

Two ways to run it: the scripted run (`scripts/demo.ps1`) or the UI run. Both use the real sprite.

Prerequisites: `sprite proxy -s chronoguard-dev 8090:8090` is running, UI answers on
`http://127.0.0.1:8090`.

## A. Scripted run (~30 s of machine time, ~90 s with narration)

```powershell
pwsh -File .\scripts\demo.ps1
```

It performs, in order:

1. **Health** — `GET /api/health` (service alive).
2. **Real connector** — discovery + `POST /api/connectors/test` → Fly Machines
   `GET /v1/apps?org_slug=artem-909` through the official gateway; prints the app name.
3. **Checkpoint** — real `sprite-env checkpoints create` → prints the new id (`vN`).
4. **Danger blocked** — proposes recursive delete of `/home/sprite/agent` → `BLOCK`, prints the event id.
5. **Deferred operation** — proposes an unknown command → `DEFER` (a human must approve; the model cannot).
6. **Native restore** — `POST /api/action/rollback {checkpoint}` → environment restarts (API drops).
7. **Reconnect + verify** — polls health, then `POST /api/action/verify` → 5/5 checks.
8. **Durable history** — reads `/api/events` and proves the blocked incident recorded in step 4 is still
   present, with the `audit_context_restored` marker (`mode=automatic`).

## B. UI run (what to show on screen)

1. **Agent** → task: *“Inspect the workspace and summarize what is there.”*
   *If an Anthropic/OpenAI connector exists*, the model reasons, proposes tools, the guard decides, and the
   final response is shown. If not, the page shows the honest setup state (no fake reasoning).
2. **Settings → Sprites Connectors** → **Test Machines connector** → real `200` + Fly app count.
3. **Agent / Settings** → **Create checkpoint** → new `vN` appears in **Snapshots**.
4. **Security Center** → the blocked `delete_path` incident → expand → risk 97/100, absolute block,
   **Report to GitHub** (if a GitHub connector is configured).
5. **Timeline & Rewind** → newest checkpoint → **Rewind** → watch the real steps: restore → reconnect →
   verify → audit restored.
6. **Agent Activity** → the blocked incident and the recovery are still in the journal.

## What is intentionally not claimed

* No live Claude response is shown unless an LLM connector exists. The UI never fakes model output.
* No GitHub issue is created unless a GitHub connector exists; the button reports the exact setup URL.
* The restore is a native sprite restore and takes ~6 s; if the target checkpoint predates the current
  server code, the service will not come back — always rewind to the newest checkpoint.

## Suggested 90-second script

> “ChronoGuard is an autonomous safety layer for AI agents on Fly.io Sprites. The agent has no shell —
> every action goes through one guarded executor with a deterministic risk and policy engine.
> Here is a real connector call through the Sprites gateway … here is a blocked destructive operation …
> and here is a native Sprite restore, verified after the environment reconnects, with the incident
> history still intact.”
