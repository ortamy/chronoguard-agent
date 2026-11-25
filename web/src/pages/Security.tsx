import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { AlertTriangle, Check, ChevronDown, ShieldAlert, ShieldX, X } from 'lucide-react'
import { api } from '../lib/api'
import { useData } from '../lib/data'
import { Badge, Button, Card, EmptyState, RiskBar, cn, useToast } from '../components/ui'
import { DecisionBadge, RiskPill, toolIcon } from '../components/bits'
import { decisionColor, fmtTime, riskColor, shortId } from '../lib/util'

type Filter = 'ALL' | 'BLOCK' | 'DEFER'

export function Security() {
  const { incidents, refresh } = useData()
  const [filter, setFilter] = useState<Filter>('ALL')
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [reporting, setReporting] = useState<string | null>(null)
  const [reports, setReports] = useState<Record<string, { ok: boolean; text: string; url?: string }>>({})
  const toast = useToast()

  const filtered = useMemo(
    () => (filter === 'ALL' ? incidents : incidents.filter((i) => i.decision === filter)),
    [incidents, filter],
  )

  const counts = {
    ALL: incidents.length,
    BLOCK: incidents.filter((i) => i.decision === 'BLOCK').length,
    DEFER: incidents.filter((i) => i.decision === 'DEFER').length,
  }

  const report = async (id: string) => {
    setReporting(id)
    try {
      const res = await api.githubReport(id)
      if (res.ok) {
        setReports((prev) => ({
          ...prev,
          [id]: { ok: true, text: res.deduped ? 'existing issue' : 'issue created', url: res.url },
        }))
        toast.push({ title: res.deduped ? 'Issue already exists' : 'GitHub issue created', tone: 'good' })
      } else {
        setReports((prev) => ({
          ...prev,
          [id]: { ok: false, text: res.error || 'failed', url: res.url },
        }))
        toast.push({
          title: 'GitHub report unavailable',
          description: res.error,
          tone: 'bad',
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setReports((prev) => ({ ...prev, [id]: { ok: false, text: message } }))
      toast.push({ title: 'GitHub report failed', description: message, tone: 'bad' })
    } finally {
      setReporting(null)
    }
  }

  const approve = async (id: string) => {
    setBusy(id)
    try {
      await api.approve(id)
      toast.push({ title: 'Operation approved and executed', tone: 'good' })
      await refresh()
    } catch (err) {
      toast.push({
        title: 'Approval failed',
        description: err instanceof Error ? err.message : String(err),
        tone: 'bad',
      })
    } finally {
      setBusy(null)
    }
  }

  const deny = async (id: string) => {
    setBusy(id)
    try {
      await api.deny(id)
      toast.push({ title: 'Operation denied', tone: 'neutral' })
      await refresh()
    } catch (err) {
      toast.push({
        title: 'Deny failed',
        description: err instanceof Error ? err.message : String(err),
        tone: 'bad',
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Security Center</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Blocked and deferred operations, with the exact policy path that produced the decision.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
          {(['ALL', 'BLOCK', 'DEFER'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors focus-ring',
                filter === f ? 'bg-[#f4f4f5] text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {f === 'ALL' ? 'All' : f === 'BLOCK' ? 'Blocked' : 'Deferred'}
              <span className="ml-1.5 font-mono text-[10.5px] text-[#a1a1aa]">{counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldAlert size={16} />}
            title="No incidents in this view"
            description="Every proposed operation is evaluated here. Run the demo to generate a blocked operation and an approval request."
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((inc) => {
            const expanded = open === inc.id
            const pending = inc.status === 'pending' && inc.decision === 'DEFER'
            return (
              <Card key={inc.id} className="overflow-hidden">
                <button
                  onClick={() => setOpen(expanded ? null : inc.id)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left"
                >
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background: inc.decision === 'BLOCK' ? '#fef2f2' : '#fffbeb',
                      color: inc.decision === 'BLOCK' ? '#b91c1c' : '#b45309',
                    }}
                  >
                    {inc.decision === 'BLOCK' ? <ShieldX size={14} /> : <AlertTriangle size={14} />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                        <span className="text-[#71717a]">{toolIcon(inc.tool)}</span>
                        {inc.tool?.replaceAll('_', ' ') || 'operation'}
                      </span>
                      <DecisionBadge decision={inc.decision} />
                      <RiskPill risk={inc.risk} />
                      {pending ? <Badge tone="warn">awaiting approval</Badge> : null}
                      {inc.status && inc.status !== 'pending' ? (
                        <Badge tone="neutral">{inc.status}</Badge>
                      ) : null}
                      <span className="ml-auto text-[11px] text-muted">{fmtTime(inc.ts)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="w-24">
                        <RiskBar score={inc.risk?.score ?? 0} color={riskColor(inc.risk?.level)} />
                      </div>
                      <span className="truncate text-[11.5px] text-muted">
                        {inc.risk?.reasons?.[0] || inc.policy_rules[0] || 'policy decision'}
                      </span>
                    </div>
                  </div>

                  <ChevronDown
                    size={15}
                    className={cn('mt-1 shrink-0 text-[#a1a1aa] transition-transform', expanded && 'rotate-180')}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {expanded ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden border-t border-line"
                    >
                      <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
                        <div className="space-y-3">
                          <Detail title="Proposed operation">
                            <pre className="overflow-x-auto rounded-md border border-line bg-[#fafafa] p-2 font-mono text-[11.5px] leading-5 text-[#3f3f46]">
{JSON.stringify({ tool: inc.tool, args: inc.args }, null, 2)}
                            </pre>
                          </Detail>

                          <Detail title="Risk analysis">
                            <div className="mb-2 flex items-center gap-2">
                              <span
                                className="font-mono text-[12px] font-semibold"
                                style={{ color: riskColor(inc.risk?.level) }}
                              >
                                {inc.risk?.score ?? 0}/100 · {inc.risk?.level ?? '—'}
                              </span>
                            </div>
                            <ul className="space-y-1">
                              {(inc.risk?.reasons || []).map((reason) => (
                                <li key={reason} className="flex items-start gap-1.5 text-[12px] text-[#3f3f46]">
                                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#a1a1aa]" />
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          </Detail>
                        </div>

                        <div className="space-y-3">
                          <Detail title="Policy path (deterministic)">
                            <ul className="space-y-1">
                              {(inc.policy_rules || []).map((rule) => (
                                <li key={rule} className="flex items-start gap-1.5 text-[12px] text-[#3f3f46]">
                                  <Check size={12} className="mt-0.5 shrink-0 text-[#71717a]" />
                                  {rule}
                                </li>
                              ))}
                            </ul>
                          </Detail>

                          <Detail title="Affected resources">
                            {(inc.risk?.resources || []).length === 0 ? (
                              <span className="text-[12px] text-muted">none recorded</span>
                            ) : (
                              <ul className="space-y-1">
                                {inc.risk?.resources.map((r) => (
                                  <li key={r} className="truncate font-mono text-[11.5px] text-[#3f3f46]">
                                    {r}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </Detail>

                          <Detail title="Event">
                            <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
                              <span className="font-mono">{shortId(inc.id)}</span>
                              <span>·</span>
                              <span>{fmtTime(inc.ts)}</span>
                              <span>·</span>
                              <span className="capitalize">{inc.status || 'recorded'}</span>
                            </div>
                          </Detail>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-[#fafafa] px-4 py-2.5">
                        {pending ? (
                          <>
                            <Button
                              size="sm"
                              variant="primary"
                              loading={busy === inc.id}
                              onClick={() => approve(inc.id)}
                            >
                              <Check size={12} /> Approve &amp; execute
                            </Button>
                            <Button size="sm" onClick={() => deny(inc.id)}>
                              <X size={12} /> Deny
                            </Button>
                            <span className="ml-auto text-[11px] text-muted">
                              Approval runs the operation through the same guarded executor.
                            </span>
                          </>
                        ) : inc.decision === 'BLOCK' ? (
                          <>
                            <span className="flex items-center gap-1.5 text-[11.5px] text-[#b91c1c]">
                              <ShieldX size={12} /> Absolute block — this operation cannot be approved.
                            </span>
                            <Button
                              size="sm"
                              variant="secondary"
                              className="ml-auto"
                              loading={reporting === inc.id}
                              onClick={() => report(inc.id)}
                            >
                              Report to GitHub
                            </Button>
                            {reports[inc.id] ? (
                              <span
                                className={`text-[11.5px] ${reports[inc.id].ok ? 'text-good' : 'text-bad'}`}
                              >
                                {reports[inc.id].url ? (
                                  <a href={reports[inc.id].url} target="_blank" rel="noreferrer" className="underline">
                                    {reports[inc.id].text}
                                  </a>
                                ) : (
                                  reports[inc.id].text
                                )}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-[11.5px] text-muted">
                            Decision recorded at <span style={{ color: decisionColor(inc.decision) }}>{inc.decision}</span>.
                          </span>
                        )}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Detail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-muted">{title}</div>
      {children}
    </div>
  )
}
