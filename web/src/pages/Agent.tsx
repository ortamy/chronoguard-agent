import { useEffect, useState } from 'react'
import { ArrowUpRight, Bot, Check, CircleSlash, Loader2, Play, ShieldOff, Sparkles, Terminal } from 'lucide-react'
import { motion } from 'motion/react'
import { api, type AgentRun, type LlmMode } from '../lib/api'
import { useData } from '../lib/data'
import { Badge, Button, Card, CardBody, EmptyState, SectionTitle, cn, useToast } from '../components/ui'
import { DecisionBadge } from '../components/bits'
import { timeAgo } from '../lib/util'

const EXAMPLES = [
  'Inspect the workspace and summarize what is there',
  'Create a checkpoint and write a short status report',
  'Check the Fly.io app inventory through the Machines connector',
]

export function Agent() {
  const { refresh, events } = useData()
  const [mode, setMode] = useState<LlmMode | null>(null)
  const [goal, setGoal] = useState(EXAMPLES[0])
  const [run, setRun] = useState<AgentRun | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  useEffect(() => {
    api
      .agentMode()
      .then((res) => setMode(res.mode))
      .catch(() => setMode(null))
  }, [])

  const recent = events
    .filter((e) => e.type === 'agent' && (e.action === 'agent_started' || e.action === 'agent_finished'))
    .slice(0, 6)

  const execute = async () => {
    if (!goal.trim()) return
    setBusy(true)
    setRun(null)
    try {
      const res = await api.runAgent(goal.trim(), 6)
      setRun(res)
      if (res.ok) {
        toast.push({ title: 'Agent run finished', description: `${res.steps?.length ?? 0} tool calls`, tone: 'good' })
      } else {
        toast.push({ title: 'Agent unavailable', description: res.error, tone: 'bad' })
      }
      await refresh()
    } catch (err) {
      toast.push({
        title: 'Agent run failed',
        description: err instanceof Error ? err.message : String(err),
        tone: 'bad',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Agent</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Bounded tool-calling loop. The model proposes, ChronoGuard decides and executes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={mode?.available ? 'good' : 'warn'}>
            {mode?.available ? `model: ${mode.provider}` : 'model: not configured'}
          </Badge>
          {mode?.tier === 'free' ? <Badge tone="good">free tier</Badge> : null}
          {mode?.model ? <Badge tone="neutral">{mode.model}</Badge> : null}
        </div>
      </div>

      {mode && !mode.available ? (
        <Card className="border-[#fef3c7] bg-[#fffbeb]">
          <CardBody className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <ShieldOff size={16} className="mt-0.5 text-warn" />
              <div>
                <div className="text-[13px] font-medium text-ink">No LLM connector configured</div>
                <p className="mt-0.5 max-w-[560px] text-[12px] leading-5 text-muted">
                  The loop is implemented and enforced, but no reasoning provider is connected yet. Gemini has
                  a free tier: add the Gemini connector in the Sprites dashboard, and ChronoGuard picks it up
                  automatically — no key is ever stored in the sprite. Anthropic and OpenRouter also work.
                </p>
              </div>
            </div>
            {mode.setup_url ? (
              <a
                href={mode.setup_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#fef3c7] bg-white px-2.5 py-1.5 text-[12px] font-medium text-[#b45309] hover:bg-[#fffbeb]"
              >
                Add Gemini (free) <ArrowUpRight size={12} />
              </a>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody>
          <SectionTitle
            title="Give the agent a task"
            description="Every tool call is validated by the risk engine and the deterministic policy engine."
          />
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            placeholder="e.g. inspect the workspace, write a short report, and checkpoint before risky work"
            className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] leading-5 outline-none placeholder:text-[#a1a1aa] focus:border-accent"
          />
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setGoal(ex)}
                className="rounded-md border border-line bg-[#fafafa] px-2 py-1 text-[11.5px] text-[#52525b] transition-colors hover:bg-white focus-ring"
              >
                {ex}
              </button>
            ))}
            <Button variant="primary" size="sm" className="ml-auto" onClick={execute} loading={busy}>
              <Play size={12} /> Run agent
            </Button>
          </div>
        </CardBody>
      </Card>

      {busy ? (
        <Card>
          <CardBody className="flex items-center gap-2 text-[12.5px] text-muted">
            <Loader2 size={14} className="animate-spin text-accent" />
            Reasoning loop running — model call, tool proposals, guard decisions…
          </CardBody>
        </Card>
      ) : null}

      {run ? (
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#f5f3ff] text-accent">
              <Bot size={13} />
            </span>
            <span className="text-[13px] font-medium text-ink">Run {run.run_id}</span>
            <Badge tone={run.ok ? 'good' : 'warn'}>
              {run.ok ? `${run.steps?.length ?? 0} tool calls` : 'blocked'}
            </Badge>
            {run.duration_ms ? <span className="text-[11.5px] text-muted">{run.duration_ms} ms</span> : null}
            <span className="ml-auto font-mono text-[11px] text-muted">{run.mode?.provider || run.mode?.kind}</span>
          </div>

          {run.error ? (
            <CardBody>
              <div className="flex items-start gap-2 text-[12.5px] leading-5 text-[#b45309]">
                <CircleSlash size={14} className="mt-0.5 shrink-0" />
                <div>
                  {run.error}
                  {run.setup_url ? (
                    <div className="mt-1">
                      <a href={run.setup_url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                        Open connector setup
                      </a>
                    </div>
                  ) : null}
                </div>
              </div>
            </CardBody>
          ) : (
            <>
              <ol className="divide-y divide-line">
                {(run.steps || []).map((step, i) => (
                  <motion.li
                    key={`${step.event_id || i}`}
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 px-5 py-2.5"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-md border border-line bg-[#fafafa] text-[11px] font-medium text-[#71717a]">
                      {i + 1}
                    </span>
                    <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
                      <Terminal size={12} className="text-[#a1a1aa]" />
                      {step.tool}
                    </span>
                    {step.decision ? <DecisionBadge decision={step.decision} /> : null}
                    {step.error ? (
                      <span className="ml-2 truncate text-[11.5px] text-muted">{step.error}</span>
                    ) : step.ok ? (
                      <Check size={12} className="text-good" />
                    ) : null}
                  </motion.li>
                ))}
              </ol>
              {run.final ? (
                <CardBody className="border-t border-line">
                  <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-muted">
                    <Sparkles size={11} /> Final response
                  </div>
                  <p className="whitespace-pre-wrap text-[12.5px] leading-5 text-[#3f3f46]">{run.final}</p>
                </CardBody>
              ) : null}
            </>
          )}
        </Card>
      ) : null}

      <div>
        <SectionTitle title="Recent runs" description="From the audit journal." />
        <Card>
          {recent.length === 0 ? (
            <EmptyState
              icon={<Bot size={16} />}
              title="No agent runs yet"
              description="Run a task above; every tool call and decision is recorded in the journal."
            />
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center gap-2 px-5 py-2.5 text-[12.5px]">
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      e.action === 'agent_finished' ? 'bg-good' : 'bg-[#a1a1aa]',
                    )}
                  />
                  <span className="truncate text-ink">{e.goal || e.action}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(e.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
