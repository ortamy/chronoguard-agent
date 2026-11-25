import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, Radio, Search } from 'lucide-react'
import { useData } from '../lib/data'
import { Badge, Card, cn } from '../components/ui'
import { DecisionBadge, RiskPill, eventIcon, eventTitle } from '../components/bits'
import { fmtTime, shortId } from '../lib/util'

type Filter = 'ALL' | 'ALLOW' | 'DEFER' | 'BLOCK' | 'RECOVER'

export function Activity() {
  const { events, connected } = useData()
  const [filter, setFilter] = useState<Filter>('ALL')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const filtered = useMemo(() => {
    let list = events
    if (filter === 'RECOVER') list = list.filter((e) => e.type === 'recovery' || e.type === 'snapshot')
    else if (filter !== 'ALL') list = list.filter((e) => (e.decision || '').toUpperCase() === filter)
    const q = query.trim().toLowerCase()
    if (q) list = list.filter((e) => JSON.stringify(e).toLowerCase().includes(q))
    return list
  }, [events, filter, query])

  const counts = useMemo(() => {
    const c = { ALL: events.length, ALLOW: 0, DEFER: 0, BLOCK: 0, RECOVER: 0 }
    for (const e of events) {
      if (e.type === 'recovery' || e.type === 'snapshot') c.RECOVER += 1
      const d = (e.decision || '').toUpperCase()
      if (d === 'ALLOW') c.ALLOW += 1
      if (d === 'DEFER') c.DEFER += 1
      if (d === 'BLOCK') c.BLOCK += 1
    }
    return c
  }, [events])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Agent Activity</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Append-only audit journal of every inspected operation.
          </p>
        </div>
        <span
          className={cn(
            'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] font-medium',
            connected
              ? 'border-[#dcfce7] bg-[#f0fdf4] text-[#15803d]'
              : 'border-line bg-surface text-muted',
          )}
        >
          <Radio size={12} className={connected ? 'text-good' : 'text-[#a1a1aa]'} />
          {connected ? 'streaming' : 'polling'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
          {(['ALL', 'ALLOW', 'DEFER', 'BLOCK', 'RECOVER'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors focus-ring',
                filter === f ? 'bg-[#f4f4f5] text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {f.charAt(0) + f.slice(1).toLowerCase()}
              <span className="ml-1.5 font-mono text-[10.5px] text-[#a1a1aa]">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-[260px]">
          <Search size={13} className="absolute left-2.5 top-2.5 text-[#a1a1aa]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events, paths, commands…"
            className="h-8 w-full rounded-lg border border-line bg-surface pl-8 pr-2.5 text-[12.5px] outline-none placeholder:text-[#a1a1aa] focus:border-accent"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line text-left text-[10.5px] uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-medium">Time</th>
              <th className="px-3 py-2.5 font-medium">Event</th>
              <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Actor</th>
              <th className="px-3 py-2.5 font-medium">Risk</th>
              <th className="px-3 py-2.5 font-medium">Decision</th>
              <th className="px-4 py-2.5 font-medium text-right">State</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[12.5px] text-muted">
                  No events match this filter.
                </td>
              </tr>
            ) : (
              filtered.map((event) => {
                const expanded = open === event.id
                return (
                  <FragmentRow
                    key={event.id}
                    event={event}
                    expanded={expanded}
                    onToggle={() => setOpen(expanded ? null : event.id)}
                  />
                )
              })
            )}
          </tbody>
        </table>
      </Card>

      <p className="text-[11px] text-muted">
        Journal entries are appended as JSONL inside the sprite and streamed over SSE. A checkpoint restore rewinds
        the journal together with the filesystem.
      </p>
    </div>
  )
}

function FragmentRow({
  event,
  expanded,
  onToggle,
}: {
  event: import('../lib/api').CGEvent
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={cn(
          'cursor-pointer border-b border-line text-[12.5px] transition-colors hover:bg-[#fafafa]',
          expanded && 'bg-[#fafafa]',
        )}
      >
        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-muted">{fmtTime(event.ts)}</td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[#a1a1aa]">{eventIcon(event)}</span>
            <span className="font-medium text-ink">{eventTitle(event)}</span>
            <ChevronDown
              size={12}
              className={cn('text-[#a1a1aa] transition-transform', expanded && 'rotate-180')}
            />
          </div>
        </td>
        <td className="hidden px-3 py-2.5 text-muted sm:table-cell">{event.actor}</td>
        <td className="px-3 py-2.5">{event.risk ? <RiskPill risk={event.risk} /> : <span className="text-[#a1a1aa]">—</span>}</td>
        <td className="px-3 py-2.5">
          {event.decision ? <DecisionBadge decision={event.decision} /> : <span className="text-[#a1a1aa]">—</span>}
        </td>
        <td className="px-4 py-2.5 text-right">
          <Badge tone={event.status === 'failed' ? 'bad' : event.status === 'pending' ? 'warn' : 'neutral'}>
            {event.status || event.verification || 'recorded'}
          </Badge>
        </td>
      </tr>
      <AnimatePresence initial={false}>
        {expanded ? (
          <tr>
            <td colSpan={6} className="border-b border-line bg-[#fafafa] p-0">
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="grid gap-4 px-4 py-3 lg:grid-cols-2">
                  <div>
                    <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-muted">
                      Event payload
                    </div>
                    <pre className="max-h-56 overflow-auto rounded-md border border-line bg-white p-2 font-mono text-[11px] leading-5 text-[#3f3f46]">
{JSON.stringify(event, null, 2)}
                    </pre>
                  </div>
                  <div className="space-y-2 text-[12px]">
                    <Meta label="Event ID" value={shortId(event.id)} mono />
                    <Meta label="Type" value={event.type} />
                    <Meta label="Timestamp" value={fmtTime(event.ts)} />
                    {event.policy_rules?.length ? (
                      <Meta label="Policy rules" value={event.policy_rules.join('; ')} />
                    ) : null}
                    {event.risk?.reasons?.length ? (
                      <Meta label="Risk reasons" value={event.risk.reasons.join('; ')} />
                    ) : null}
                    {event.risk?.resources?.length ? (
                      <Meta label="Resources" value={event.risk.resources.join(', ')} />
                    ) : null}
                    {event.checks?.length ? (
                      <Meta
                        label="Verification"
                        value={event.checks.map((c) => `${c.name}:${c.ok ? 'ok' : 'fail'}`).join(', ')}
                      />
                    ) : null}
                  </div>
                </div>
              </motion.div>
            </td>
          </tr>
        ) : null}
      </AnimatePresence>
    </>
  )
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-muted">{label}</span>
      <span className={cn('min-w-0 break-words text-[#3f3f46]', mono && 'font-mono text-[11px]')}>{value}</span>
    </div>
  )
}
