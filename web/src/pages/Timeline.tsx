import { useMemo, useState } from 'react'
import { AlertTriangle, Camera, CornerUpLeft, History, ShieldCheck } from 'lucide-react'
import { useData } from '../lib/data'
import type { CGEvent, Snapshot } from '../lib/api'
import { Badge, Button, Card, EmptyState, cn, useToast } from '../components/ui'
import { RewindModal } from '../components/RewindModal'
import { DecisionBadge, RiskPill, eventIcon, eventTitle } from '../components/bits'
import { fmtTime } from '../lib/util'

type Node =
  | { kind: 'event'; event: CGEvent; ts: string }
  | { kind: 'snapshot'; snapshot: Snapshot; ts: string }

type Filter = 'ALL' | 'SECURITY' | 'RECOVERY' | 'SNAPSHOTS'

export function Timeline() {
  const { events, snapshots, refresh } = useData()
  const [filter, setFilter] = useState<Filter>('ALL')
  const [selected, setSelected] = useState<Snapshot | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const toast = useToast()

  const nodes = useMemo<Node[]>(() => {
    const items: Node[] = []
    for (const e of events) {
      if (filter === 'SECURITY' && !(e.decision === 'BLOCK' || e.decision === 'DEFER')) continue
      if (filter === 'RECOVERY' && e.type !== 'recovery') continue
      if (filter === 'SNAPSHOTS') continue
      items.push({ kind: 'event', event: e, ts: e.ts })
    }
    if (filter === 'ALL' || filter === 'SNAPSHOTS' || filter === 'RECOVERY') {
      for (const s of snapshots) {
        items.push({ kind: 'snapshot', snapshot: s, ts: s.create_time || '' })
      }
    }
    return items.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
  }, [events, snapshots, filter])

  const groups = useMemo(() => {
    const map = new Map<string, Node[]>()
    for (const node of nodes) {
      const day = node.ts ? new Date(node.ts).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      }) : 'Unknown date'
      const list = map.get(day) || []
      list.push(node)
      map.set(day, list)
    }
    return [...map.entries()]
  }, [nodes])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-semibold tracking-tight text-ink">
            <History size={20} className="text-accent" /> Timeline &amp; Rewind
          </h1>
          <p className="mt-0.5 text-[13px] text-muted">
            The full history of the environment. Pick a checkpoint to rewind with verification.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
          {(['ALL', 'SECURITY', 'RECOVERY', 'SNAPSHOTS'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors focus-ring',
                filter === f ? 'bg-[#f4f4f5] text-ink' : 'text-muted hover:text-ink',
              )}
            >
              {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {nodes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<History size={16} />}
            title="Nothing on the timeline yet"
            description="Checkpoints and agent activity will appear here as they happen."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([day, items]) => (
            <div key={day}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{day}</span>
                <span className="h-px flex-1 bg-line" />
                <span className="font-mono text-[10.5px] text-[#a1a1aa]">{items.length}</span>
              </div>
              <ol className="relative ml-2 space-y-2 border-l border-line pl-4">
                {items.map((node) => {
                  const id = node.kind === 'snapshot' ? `snap-${node.snapshot.id}` : node.event.id
                  const expanded = openId === id
                  return (
                    <li key={id} className="relative">
                      <span
                        className={cn(
                          'absolute -left-[22px] top-2 flex h-4 w-4 items-center justify-center rounded-full border bg-surface',
                          node.kind === 'snapshot'
                            ? 'border-[#ddd6fe] text-accent'
                            : 'border-line text-[#71717a]',
                        )}
                      >
                        {node.kind === 'snapshot' ? <Camera size={9} /> : eventIcon(node.event)}
                      </span>

                      {node.kind === 'snapshot' ? (
                        <Card className="p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[12.5px] font-medium text-ink">Checkpoint {node.snapshot.id}</span>
                            <Badge tone={node.snapshot.is_auto ? 'neutral' : 'accent'}>
                              {node.snapshot.is_auto ? 'auto' : 'manual'}
                            </Badge>
                            <span className="ml-auto text-[11px] text-muted">{fmtTime(node.snapshot.create_time)}</span>
                          </div>
                          <p className="mt-1 truncate text-[11.5px] text-muted">
                            {node.snapshot.comment || 'No comment'}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <Button size="sm" onClick={() => setSelected(node.snapshot)}>
                              <CornerUpLeft size={12} /> Rewind to {node.snapshot.id}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                navigator.clipboard?.writeText(node.snapshot.id)
                                toast.push({ title: 'Copied checkpoint ID', tone: 'neutral' })
                              }}
                            >
                              Copy ID
                            </Button>
                          </div>
                        </Card>
                      ) : (
                        <Card className="p-3">
                          <button
                            onClick={() => setOpenId(expanded ? null : node.event.id)}
                            className="flex w-full flex-wrap items-center gap-2 text-left"
                          >
                            <span className="text-[12.5px] font-medium text-ink">{eventTitle(node.event)}</span>
                            {node.event.decision ? <DecisionBadge decision={node.event.decision} /> : null}
                            {node.event.risk ? <RiskPill risk={node.event.risk} /> : null}
                            <span className="ml-auto text-[11px] text-muted">{fmtTime(node.event.ts)}</span>
                          </button>
                          {expanded ? (
                            <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-line bg-[#fafafa] p-2 font-mono text-[11px] leading-5 text-[#3f3f46]">
{JSON.stringify(node.event, null, 2)}
                            </pre>
                          ) : node.event.risk?.reasons?.[0] ? (
                            <p className="mt-1 truncate text-[11.5px] text-muted">{node.event.risk.reasons[0]}</p>
                          ) : null}
                        </Card>
                      )}
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-start gap-2.5">
          {snapshots.length > 0 ? (
            <ShieldCheck size={15} className="mt-0.5 text-good" />
          ) : (
            <AlertTriangle size={15} className="mt-0.5 text-warn" />
          )}
          <div className="text-[12px] leading-5 text-muted">
            Rewind is a real <span className="font-mono text-[11px]">sprite-env checkpoints restore</span>: the
            environment restarts, the UI reconnects, and verification checks the filesystem and the API before
            declaring success.
          </div>
        </div>
      </Card>

      <RewindModal open={!!selected} snapshot={selected} onClose={() => setSelected(null)} onCompleted={refresh} />
    </div>
  )
}
