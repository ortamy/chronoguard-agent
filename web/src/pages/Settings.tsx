import { useEffect, useState } from 'react'
import { Activity, CheckCircle2, GitBranch, RefreshCw, Save, ShieldAlert, Terminal, Trash2, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import { useData } from '../lib/data'
import { Badge, Button, Card, CardBody, SectionTitle, useToast } from '../components/ui'
import { ConnectorsPanel } from '../components/ConnectorsPanel'
import { fmtTime } from '../lib/util'

const ENDPOINTS = [
  ['GET', '/api/state', 'Environment + agent state'],
  ['GET', '/api/health', 'Service health and uptime'],
  ['GET', '/api/events', 'Audit journal'],
  ['GET', '/api/incidents', 'Blocked and deferred operations'],
  ['GET', '/api/snapshots', 'Native sprite checkpoints'],
  ['GET', '/api/policies', 'Active deterministic policy'],
  ['GET', '/api/stream', 'Server-Sent Events'],
  ['POST', '/api/action/propose', 'Guarded execution proposal'],
  ['POST', '/api/action/approve', 'Approve a deferred operation'],
  ['POST', '/api/action/deny', 'Deny a deferred operation'],
  ['POST', '/api/action/checkpoint', 'Create a checkpoint'],
  ['POST', '/api/action/rollback', 'Restore a checkpoint'],
  ['POST', '/api/action/verify', 'Verify a recovered environment'],
  ['POST', '/api/action/task', 'Run the deterministic agent task'],
  ['POST', '/api/action/demo', 'Reproducible demo scenario'],
]

export function Settings() {
  const { state, healthOk, connected, refresh, policy } = useData()
  const [busy, setBusy] = useState<string | null>(null)
  const [repo, setRepo] = useState('')
  const [savingRepo, setSavingRepo] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (policy?.github_repo) setRepo(policy.github_repo)
  }, [policy?.github_repo])

  const saveRepo = async () => {
    setSavingRepo(true)
    try {
      await api.savePolicy({ github_repo: repo.trim() })
      toast.push({ title: 'GitHub repository saved', tone: 'good' })
      await refresh()
    } catch (err) {
      toast.push({ title: 'Could not save repository', description: String(err), tone: 'bad' })
    } finally {
      setSavingRepo(false)
    }
  }

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label)
    try {
      await fn()
      toast.push({ title: `${label} ok`, tone: 'good' })
      await refresh()
    } catch (err) {
      toast.push({
        title: `${label} failed`,
        description: err instanceof Error ? err.message : String(err),
        tone: 'bad',
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-0.5 text-[13px] text-muted">Connection, API surface and demo controls.</p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody>
            <SectionTitle title="Connection" description="Everything here is served by server.py inside the sprite." />
            <div className="grid gap-2 sm:grid-cols-2">
              <Row label="Sprite" value="chronoguard-dev" mono />
              <Row label="Endpoint" value="http://127.0.0.1:8090" mono />
              <Row label="Port" value={String(state?.server_port ?? 8090)} mono />
              <Row label="API" value={healthOk ? 'healthy' : 'unreachable'} />
              <Row label="Event stream" value={connected ? 'connected' : 'polling fallback'} />
              <Row label="Server time" value={fmtTime(state?.server_time)} />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={() => run('Refresh', refresh)} loading={busy === 'Refresh'}>
                <RefreshCw size={12} /> Refresh connection
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  run('Task run', () => api.task('inspect workspace and write a report'))
                }
                loading={busy === 'Task run'}
              >
                <Activity size={12} /> Run agent task
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <SectionTitle title="Demo controls" description="Reproducible, real, and clearly marked." />
            <div className="space-y-2">
              <Button
                size="sm"
                variant="secondary"
                className="w-full justify-start"
                onClick={() => run('Demo', api.demo)}
                loading={busy === 'Demo'}
              >
                <Terminal size={12} /> Run guarded demo
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="w-full justify-start"
                onClick={() => run('Simulate danger', api.simulateDanger)}
                loading={busy === 'Simulate danger'}
              >
                <ShieldAlert size={12} /> Simulate danger alert
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start text-bad hover:bg-[#fef2f2]"
                onClick={() => run('Clear log', api.clearLog)}
                loading={busy === 'Clear log'}
              >
                <Trash2 size={12} /> Clear agent.log
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>

      <ConnectorsPanel />

      <Card>
        <CardBody>
          <SectionTitle
            title="GitHub incident documentation"
            description="Serious incidents are opened as GitHub issues through the official connector (deduplicated by event id)."
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[240px] flex-1">
              <GitBranch size={13} className="absolute left-2.5 top-2.5 text-[#a1a1aa]" />
              <input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="owner/name"
                className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-2.5 font-mono text-[12px] outline-none placeholder:text-[#a1a1aa] focus:border-accent"
              />
            </div>
            <Button size="sm" onClick={saveRepo} loading={savingRepo}>
              <Save size={12} /> Save
            </Button>
          </div>
          <p className="mt-2 text-[11.5px] text-muted">
            Requires a GitHub connector with issue write scope. If the scope is read-only, ChronoGuard falls back to
            repository inspection and records that limitation instead of pretending an issue was filed.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SectionTitle title="API surface" description="The full contract between the UI and the custody layer." />
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full">
              <tbody>
                {ENDPOINTS.map(([method, path, desc], i) => (
                  <tr key={path} className={i !== ENDPOINTS.length - 1 ? 'border-b border-line' : ''}>
                    <td className="w-16 px-3 py-1.5">
                      <Badge tone={method === 'GET' ? 'neutral' : 'accent'}>{method}</Badge>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[11.5px] text-[#3f3f46]">{path}</td>
                    <td className="px-3 py-1.5 text-[11.5px] text-muted">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardBody>
            <SectionTitle title="What is real" />
            <ul className="space-y-1.5 text-[12px] text-[#3f3f46]">
              <li className="flex gap-2">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-good" /> Checkpoints and restores use{' '}
                <span className="font-mono text-[11px]">sprite-env</span>.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-good" /> Every agent tool call passes the risk
                and policy engines.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-good" /> The audit journal is persisted as
                JSONL and streamed over SSE.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-good" /> Recovery is reported only after
                filesystem and API verification.
              </li>
            </ul>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <SectionTitle title="What is not" />
            <ul className="space-y-1.5 text-[12px] text-[#3f3f46]">
              <li className="flex gap-2">
                <XCircle size={13} className="mt-0.5 shrink-0 text-bad" /> Not an OS sandbox — enforcement is at the
                tool boundary.
              </li>
              <li className="flex gap-2">
                <XCircle size={13} className="mt-0.5 shrink-0 text-bad" /> Connectors are organization-level; the Fly
                Machines connector is configured with a narrowed access policy.
              </li>
              <li className="flex gap-2">
                <XCircle size={13} className="mt-0.5 shrink-0 text-bad" /> No LLM connector is configured yet, so the
                agent loop reports "unavailable" instead of faking reasoning.
              </li>
              <li className="flex gap-2">
                <XCircle size={13} className="mt-0.5 shrink-0 text-bad" /> The journal survives restores via the
                automatic <span className="font-mono text-[11px]">/tmp</span> anchor, but it is not cryptographically
                immutable and a full sprite rebuild can clear it.
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-1.5">
      <span className="text-[11.5px] text-muted">{label}</span>
      <span className={`truncate text-[12px] font-medium text-ink ${mono ? 'font-mono text-[11.5px]' : ''}`}>
        {value}
      </span>
    </div>
  )
}
