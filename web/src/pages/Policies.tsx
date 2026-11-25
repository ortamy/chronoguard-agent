import { useEffect, useState } from 'react'
import { Check, Plus, Save, ShieldCheck, Trash2, X } from 'lucide-react'
import { api, type Policy } from '../lib/api'
import { useData } from '../lib/data'
import { Badge, Button, Card, CardBody, SectionTitle, Switch, useToast } from '../components/ui'
import { riskColor } from '../lib/util'

const APPROVALS = [
  { id: 'write_protected', label: 'Writes to protected paths', description: 'Agent modifications to the agent dir, /.sprite, /etc and credential folders.' },
  { id: 'delete_workspace', label: 'Deletions in the workspace', description: 'Every delete inside the guarded workspace waits for a human.' },
  { id: 'run_unknown', label: 'Unknown commands', description: 'Any command outside the allowlist needs explicit approval.' },
]

export function Policies() {
  const { policy, refresh, healthOk } = useData()
  const [draft, setDraft] = useState<Policy | null>(null)
  const [newPath, setNewPath] = useState('')
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (policy) setDraft(JSON.parse(JSON.stringify(policy)) as Policy)
  }, [policy])

  if (!draft) {
    return <div className="text-[13px] text-muted">Loading policy…</div>
  }

  const save = async () => {
    setSaving(true)
    try {
      await api.savePolicy({
        protected_paths: draft.protected_paths,
        approval_required_ops: draft.approval_required_ops,
        risk_threshold: draft.risk_threshold,
        snapshots_enabled: draft.snapshots_enabled,
        agent: draft.agent,
      })
      toast.push({ title: 'Policy saved', tone: 'good' })
      await refresh()
    } catch (err) {
      toast.push({
        title: 'Could not save policy',
        description: err instanceof Error ? err.message : String(err),
        tone: 'bad',
      })
    } finally {
      setSaving(false)
    }
  }

  const threshold = Number(draft.risk_threshold)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Policies</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Deterministic enforcement. A model can recommend, but only these rules decide.
          </p>
        </div>
        <Button variant="primary" onClick={save} loading={saving} disabled={!healthOk}>
          <Save size={14} /> Save changes
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardBody>
            <SectionTitle title="Risk threshold" description="Operations at or above this score require approval." />
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={20}
                max={95}
                step={5}
                value={threshold}
                onChange={(e) => setDraft({ ...draft, risk_threshold: Number(e.target.value) })}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-[#e4e4e7] accent-[#7c3aed]"
              />
              <span
                className="w-14 rounded-md border border-line px-2 py-1 text-center font-mono text-[12.5px] font-semibold"
                style={{ color: riskColor(threshold >= 90 ? 'CRITICAL' : threshold >= 70 ? 'HIGH' : 'MEDIUM') }}
              >
                {threshold}
              </span>
            </div>
            <div className="mt-3 space-y-1.5 text-[11.5px] text-muted">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-good" /> &lt; {threshold} → allowed automatically
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-warn" /> ≥ {threshold} → deferred to a human
              </div>
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-bad" /> restricted operations → absolute block
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <SectionTitle title="Approval requirements" description="What always stops for a human decision." />
            <div className="space-y-2.5">
              {APPROVALS.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[12.5px] font-medium text-ink">{item.label}</div>
                    <div className="mt-0.5 text-[11.5px] leading-4 text-muted">{item.description}</div>
                  </div>
                  <Switch
                    checked={draft.approval_required_ops.includes(item.id)}
                    label={item.label}
                    onChange={(checked) => {
                      const next = checked
                        ? [...draft.approval_required_ops, item.id]
                        : draft.approval_required_ops.filter((o) => o !== item.id)
                      setDraft({ ...draft, approval_required_ops: next })
                    }}
                  />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <SectionTitle
            title="Reasoning provider"
            description="Connector-backed model for the agent loop. Keys never enter the sprite."
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={draft.agent?.provider || 'auto'}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  agent: {
                    ...(draft.agent ?? { name: 'chronoguard-agent', id: 'agent-local-01', model: '' }),
                    provider: e.target.value,
                  },
                })
              }
              className="h-8 rounded-lg border border-line bg-surface px-2.5 text-[12px] outline-none focus:border-accent"
            >
              <option value="auto">auto (Gemini first)</option>
              <option value="gemini">Gemini (free tier)</option>
              <option value="anthropic">Anthropic</option>
              <option value="openrouter">OpenRouter</option>
              <option value="openai">OpenAI</option>
            </select>
            <input
              value={draft.agent?.model || ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  agent: {
                    ...(draft.agent ?? { name: 'chronoguard-agent', id: 'agent-local-01', model: '' }),
                    model: e.target.value,
                  },
                })
              }
              placeholder="model (empty = provider default, e.g. gemini-2.5-flash)"
              className="h-8 min-w-[240px] flex-1 rounded-lg border border-line bg-surface px-2.5 font-mono text-[11.5px] outline-none placeholder:text-[#a1a1aa] focus:border-accent"
            />
          </div>
          <p className="mt-2 text-[11.5px] leading-4 text-muted">
            <span className="font-medium text-ink">auto</span> prefers Gemini, then Anthropic, then any
            OpenAI-compatible connector. The free tier is enough for the demo; no subscription required.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SectionTitle
            title="Protected paths"
            description="Writes and deletes here are blocked or deferred, never silently allowed."
          />
          <ul className="space-y-1.5">
            {draft.protected_paths.map((path) => (
              <li
                key={path}
                className="flex items-center gap-2 rounded-lg border border-line bg-[#fafafa] px-2.5 py-1.5"
              >
                <ShieldCheck size={13} className="text-accent" />
                <span className="flex-1 truncate font-mono text-[12px] text-[#3f3f46]">{path}</span>
                <button
                  onClick={() =>
                    setDraft({ ...draft, protected_paths: draft.protected_paths.filter((p) => p !== path) })
                  }
                  className="rounded p-1 text-[#a1a1aa] transition-colors hover:bg-white hover:text-bad focus-ring"
                  aria-label={`Remove ${path}`}
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="/home/sprite/new-protected-path"
              className="h-8 flex-1 rounded-lg border border-line bg-surface px-2.5 font-mono text-[12px] outline-none placeholder:text-[#a1a1aa] focus:border-accent"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const value = newPath.trim()
                if (!value || draft.protected_paths.includes(value)) return
                setDraft({ ...draft, protected_paths: [...draft.protected_paths, value] })
                setNewPath('')
              }}
            />
            <Button
              size="sm"
              onClick={() => {
                const value = newPath.trim()
                if (!value || draft.protected_paths.includes(value)) return
                setDraft({ ...draft, protected_paths: [...draft.protected_paths, value] })
                setNewPath('')
              }}
            >
              <Plus size={12} /> Add path
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardBody>
            <SectionTitle title="Restricted operations" description="Always blocked by the engine — not configurable per call." />
            <div className="flex flex-wrap gap-1.5">
              {draft.restricted_ops.map((op) => (
                <Badge key={op} tone="bad">
                  <X size={10} /> {op}
                </Badge>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-5 text-muted">
              Restricted operations are checked before the risk score, so a high-risk score cannot be used to bypass
              them.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <SectionTitle title="Snapshot policy" description="Checkpoints are the recovery primitive." />
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[12.5px] font-medium text-ink">Enable checkpoint creation</div>
                <div className="mt-0.5 text-[11.5px] text-muted">
                  Required for the rewind workflow and demo recovery.
                </div>
              </div>
              <Switch
                checked={draft.snapshots_enabled}
                label="Enable checkpoint creation"
                onChange={(v) => setDraft({ ...draft, snapshots_enabled: v })}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {draft.allowed_ops.map((op) => (
                <Badge key={op} tone="good">
                  <Check size={10} /> {op}
                </Badge>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="text-[12px] leading-5 text-muted">
          <div className="mb-1 font-medium text-ink">Enforcement boundary (honest)</div>
          ChronoGuard enforces policy at the tool boundary: the agent can only act through{' '}
          <span className="font-mono text-[11px]">guarded_execute()</span>, and that path never uses a shell. This is
          application-level enforcement, not an OS sandbox — a process with raw filesystem access inside the sprite
          would not be constrained by it.
        </CardBody>
      </Card>
    </div>
  )
}
