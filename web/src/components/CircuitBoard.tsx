import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  Bot,
  Camera,
  FileText,
  GitBranch,
  Radio,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from 'lucide-react'
import { api, type CGEvent, type ConnectorSummary, type Incident, type Metrics, type Snapshot } from '../lib/api'
import { Badge, Button, Card, cn, useToast } from '../components/ui'
import { eventTitle } from '../components/bits'
import { timeAgo } from '../lib/util'
import type { RouteId } from './Shell'

type NodeId =
  | 'llm'
  | 'agent'
  | 'guard'
  | 'executor'
  | 'workspace'
  | 'checkpoints'
  | 'journal'
  | 'machines'
  | 'github'

type Tone = 'good' | 'warn' | 'bad' | 'neutral'

interface Point {
  x: number
  y: number
}

const STORAGE_KEY = 'cg-board-positions-v2'

const DEFAULTS: Record<NodeId, Point> = {
  llm: { x: 12, y: 14 },
  agent: { x: 12, y: 48 },
  guard: { x: 36, y: 48 },
  executor: { x: 60, y: 48 },
  workspace: { x: 86, y: 18 },
  checkpoints: { x: 86, y: 48 },
  journal: { x: 86, y: 78 },
  machines: { x: 36, y: 84 },
  github: { x: 60, y: 84 },
}

const dotTone: Record<Tone, string> = {
  good: 'bg-good',
  warn: 'bg-warn',
  bad: 'bg-bad',
  neutral: 'bg-[#a1a1aa]',
}
const bgTone: Record<Tone, string> = {
  good: 'bg-[#f0fdf4] text-good',
  warn: 'bg-[#fffbeb] text-warn',
  bad: 'bg-[#fef2f2] text-bad',
  neutral: 'bg-[#f4f4f5] text-[#71717a]',
}
const badgeTone = (t: Tone) => (t === 'good' ? 'good' : t === 'warn' ? 'warn' : t === 'bad' ? 'bad' : 'neutral')

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

const isFileTool = (tool?: string) => ['read_file', 'write_file', 'list_dir', 'delete_path'].includes(tool || '')

interface EdgeDef {
  id: string
  from: NodeId
  to: NodeId
  flow: boolean
  label: string
  match: (e: CGEvent) => boolean
}

export function CircuitBoard({
  metrics,
  snapshots,
  events,
  healthOk,
  agentName,
  agentModel,
  onNavigate,
  onRefresh,
}: {
  metrics?: Metrics
  snapshots: Snapshot[]
  incidents: Incident[]
  events: CGEvent[]
  healthOk: boolean
  agentName?: string
  agentModel?: string
  onNavigate: (r: RouteId) => void
  onRefresh: () => void | Promise<void>
}) {
  const toast = useToast()
  const [conn, setConn] = useState<ConnectorSummary | null>(null)
  const [selected, setSelected] = useState<NodeId>('agent')
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [probe, setProbe] = useState<string | null>(null)
  const [positions, setPositions] = useState<Record<NodeId, Point>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<NodeId, Point>>
        const merged = { ...DEFAULTS }
        for (const key of Object.keys(DEFAULTS) as NodeId[]) {
          const p = parsed[key]
          if (p && typeof p.x === 'number' && typeof p.y === 'number') merged[key] = p
        }
        return merged
      }
    } catch {
      /* ignore malformed storage */
    }
    return { ...DEFAULTS }
  })
  const boardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: NodeId; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)

  useEffect(() => {
    api
      .connectors()
      .then(setConn)
      .catch(() => setConn(null))
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
    } catch {
      /* storage may be unavailable */
    }
  }, [positions])

  const llm = conn?.llm
  const machines = conn?.connections.find((c) => c.provider === 'custom_api')
  const github = conn?.connections.find((c) => c.provider === 'github')

  const lastBlock = events.find((e) => e.decision === 'BLOCK')
  const freshBlock = !!lastBlock && Date.now() - new Date(lastBlock.ts).getTime() < 10 * 60 * 1000

  const edges: EdgeDef[] = useMemo(
    () => [
      {
        id: 'agent-llm',
        from: 'agent',
        to: 'llm',
        flow: !!llm?.available,
        label: 'model call',
        match: (e) => e.type === 'agent',
      },
      {
        id: 'agent-guard',
        from: 'agent',
        to: 'guard',
        flow: true,
        label: 'tool proposal',
        match: (e) => e.type === 'action' && isFileTool(e.tool) === false && !!e.tool,
      },
      {
        id: 'guard-executor',
        from: 'guard',
        to: 'executor',
        flow: true,
        label: 'ALLOW → execute',
        match: (e) => e.type === 'action' && e.decision === 'ALLOW',
      },
      {
        id: 'executor-workspace',
        from: 'executor',
        to: 'workspace',
        flow: true,
        label: 'file operation',
        match: (e) => e.type === 'action' && isFileTool(e.tool),
      },
      {
        id: 'executor-checkpoints',
        from: 'executor',
        to: 'checkpoints',
        flow: true,
        label: 'snapshot',
        match: (e) => e.type === 'snapshot' || e.action === 'checkpoint_created',
      },
      {
        id: 'guard-journal',
        from: 'guard',
        to: 'journal',
        flow: false,
        label: 'audit record',
        match: (e) => e.type === 'action' || e.type === 'connector',
      },
      {
        id: 'executor-machines',
        from: 'executor',
        to: 'machines',
        flow: !!machines,
        label: 'connector call',
        match: (e) => e.type === 'connector' && (e.provider === 'custom_api' || e.action === 'connector_call'),
      },
      {
        id: 'executor-github',
        from: 'executor',
        to: 'github',
        flow: !!github,
        label: 'issue report',
        match: (e) => e.type === 'connector' && String(e.action || '').startsWith('github_'),
      },
    ],
    [llm?.available, machines, github],
  )

  const nodes = useMemo(
    () => [
      {
        id: 'llm' as NodeId,
        label: 'Reasoning',
        icon: <Sparkles size={12} />,
        tone: (llm?.available ? 'good' : 'warn') as Tone,
        detail: llm?.available ? `${llm.provider} · ${llm.model}` : 'not connected',
        title: 'Reasoning provider',
        body: llm?.available
          ? `The agent reasons through ${llm.provider} (${llm.model}) via the Sprites gateway. No key is stored in the sprite.`
          : 'No LLM connector yet. Gemini has a free tier — add the connector and the loop goes live without code changes.',
      },
      {
        id: 'agent' as NodeId,
        label: 'Agent',
        icon: <Bot size={12} />,
        tone: 'good' as Tone,
        detail: agentModel || 'deterministic-runner',
        title: agentName || 'chronoguard-agent',
        body: 'Bounded tool-calling loop. The model proposes tools; nothing executes without passing the guard.',
      },
      {
        id: 'guard' as NodeId,
        label: 'Guard',
        icon: <Shield size={12} />,
        tone: (freshBlock ? 'bad' : 'good') as Tone,
        detail: `${metrics?.blocked ?? 0} blocked · ${metrics?.deferred ?? 0} deferred`,
        title: 'Risk + policy engine',
        body: freshBlock && lastBlock
          ? `Recent BLOCK: ${lastBlock.tool?.replaceAll('_', ' ')} (risk ${lastBlock.risk?.score ?? '—'}, ${timeAgo(lastBlock.ts)}). Absolute blocks cannot be approved.`
          : 'Deterministic scoring and policy. Restricted operations are absolute blocks; the model cannot override or approve them.',
      },
      {
        id: 'executor' as NodeId,
        label: 'Executor',
        icon: <Zap size={12} />,
        tone: 'good' as Tone,
        detail: `${metrics?.executed ?? 0} executed`,
        title: 'guarded_execute()',
        body: 'Single control point: path validation, policy re-check at execution, no shell, allowlisted commands only.',
      },
      {
        id: 'workspace' as NodeId,
        label: 'Workspace',
        icon: <FileText size={12} />,
        tone: (healthOk ? 'good' : 'warn') as Tone,
        detail: '/home/sprite/workspace',
        title: 'Guarded workspace',
        body: 'The only place the agent can read or write. Paths are resolved with realpath and confined with commonpath.',
      },
      {
        id: 'checkpoints' as NodeId,
        label: 'Checkpoints',
        icon: <Camera size={12} />,
        tone: (snapshots.length > 0 ? 'good' : 'warn') as Tone,
        detail: `${snapshots.length} native`,
        title: 'Native Sprite checkpoints',
        body: 'Real sprite-env snapshots. Rewind restores the environment and is verified before success is reported.',
      },
      {
        id: 'journal' as NodeId,
        label: 'Audit journal',
        icon: <Radio size={12} />,
        tone: 'good' as Tone,
        detail: `${events.length} events`,
        title: 'Append-only journal',
        body: 'Every proposal, decision and result is recorded. A restore rewinds it, so the pre-restore copy is re-imported automatically.',
      },
      {
        id: 'machines' as NodeId,
        label: 'Machines connector',
        icon: <Terminal size={12} />,
        tone: (machines ? 'good' : 'warn') as Tone,
        detail: machines ? 'Fly.io · allowed' : 'not configured',
        title: 'Sprites connector: Fly Machines',
        body: machines
          ? 'Called through the official gateway with a narrowed access policy (name prefix + endpoint allowlist). No token in the sprite.'
          : 'Add the Fly Machines connector in the Sprites dashboard to let the agent inspect the host environment.',
      },
      {
        id: 'github' as NodeId,
        label: 'GitHub',
        icon: <GitBranch size={12} />,
        tone: (github ? 'good' : 'neutral') as Tone,
        detail: github ? 'issues enabled' : 'optional',
        title: 'GitHub incident reporting',
        body: github
          ? 'Blocked incidents can be filed as deduplicated GitHub issues with risk, resources and checkpoint id.'
          : 'Optional: connect GitHub to file real incident issues. The reporter is implemented and tested; it just reports that no connector exists.',
      },
    ],
    [llm, machines, github, metrics, snapshots.length, events.length, healthOk, agentModel, agentName, freshBlock, lastBlock],
  )

  const nodeById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])) as Record<NodeId, (typeof nodes)[number]>, [nodes])
  const current = nodeById[selected]
  const currentEdge = selectedEdge ? edges.find((e) => e.id === selectedEdge) : null
  const edgeEvent = currentEdge ? events.find((e) => currentEdge.match(e)) : null

  const path = (e: EdgeDef) => {
    const a = positions[e.from]
    const b = positions[e.to]
    return `M${a.x},${a.y} L${b.x},${b.y}`
  }

  const edgeTone = (e: EdgeDef): string => {
    if (!e.flow) return '#d4d4d8'
    if (e.id === 'agent-llm') return llm?.available ? '#a78bfa' : '#fcd34d'
    if (e.id === 'guard-journal') return '#d4d4d8'
    return '#c4b5fd'
  }

  /* ---------------- dragging ---------------- */
  const onPointerDown = (ev: React.PointerEvent<HTMLButtonElement>, id: NodeId) => {
    const rect = boardRef.current?.getBoundingClientRect()
    if (!rect) return
    ev.currentTarget.setPointerCapture(ev.pointerId)
    dragRef.current = {
      id,
      sx: ev.clientX,
      sy: ev.clientY,
      ox: positions[id].x,
      oy: positions[id].y,
      moved: false,
    }
  }

  const onPointerMove = (ev: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    const rect = boardRef.current?.getBoundingClientRect()
    if (!d || !rect) return
    const dx = ((ev.clientX - d.sx) / rect.width) * 100
    const dy = ((ev.clientY - d.sy) / rect.height) * 100
    if (Math.abs(ev.clientX - d.sx) + Math.abs(ev.clientY - d.sy) > 4) d.moved = true
    if (!d.moved) return
    setPositions((prev) => ({
      ...prev,
      [d.id]: { x: clamp(d.ox + dx, 6, 94), y: clamp(d.oy + dy, 8, 92) },
    }))
  }

  const onPointerUp = (ev: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current
    dragRef.current = null
    if (!d) return
    try {
      ev.currentTarget.releasePointerCapture(ev.pointerId)
    } catch {
      /* pointer may already be released */
    }
    if (!d.moved) {
      setSelected(d.id)
      setSelectedEdge(null)
    }
  }

  const resetLayout = () => {
    setPositions({ ...DEFAULTS })
    setSelectedEdge(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  const isCustomLayout = (Object.keys(DEFAULTS) as NodeId[]).some(
    (k) => positions[k].x !== DEFAULTS[k].x || positions[k].y !== DEFAULTS[k].y,
  )

  const act = async () => {
    if (currentEdge) {
      onNavigate('activity')
      return
    }
    setProbe(null)
    if (selected === 'llm') {
      if (llm?.available) onNavigate('agent')
      else if (llm?.setup_url) window.open(llm.setup_url, '_blank', 'noreferrer')
      else onNavigate('settings')
      return
    }
    if (selected === 'machines') {
      setBusy(true)
      try {
        const res = await api.connectorTest('custom_api', '/v1/apps?org_slug=artem-909')
        const apps = (res.data as { total_apps?: number })?.total_apps
        setProbe(res.ok ? `HTTP ${res.status} · ${apps ?? '?'} apps returned` : res.error || `HTTP ${res.status}`)
      } catch (err) {
        setProbe(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
      return
    }
    if (selected === 'checkpoints') {
      setBusy(true)
      try {
        const res = await api.createCheckpoint()
        toast.push({ title: `Checkpoint ${res.checkpoint ?? 'created'}`, tone: 'good' })
        await onRefresh()
      } catch (err) {
        toast.push({ title: 'Checkpoint failed', description: String(err), tone: 'bad' })
      } finally {
        setBusy(false)
      }
      return
    }
    if (selected === 'github') {
      if (github) onNavigate('settings')
      else window.open(conn?.available.find((p) => p.provider === 'github')?.setup_url || 'https://sprites.dev', '_blank', 'noreferrer')
      return
    }
    const routes: Partial<Record<NodeId, RouteId>> = {
      agent: 'agent',
      guard: 'security',
      executor: 'activity',
      workspace: 'activity',
      journal: 'activity',
    }
    onNavigate(routes[selected] ?? 'overview')
  }

  const actionLabel = (): string => {
    if (currentEdge) return 'Open activity'
    switch (selected) {
      case 'llm':
        return llm?.available ? 'Run agent' : 'Add Gemini (free)'
      case 'machines':
        return 'Test connector'
      case 'checkpoints':
        return 'Create checkpoint'
      case 'github':
        return github ? 'Configure repo' : 'Add GitHub'
      case 'guard':
        return 'Security Center'
      case 'journal':
        return 'Open journal'
      case 'executor':
      case 'workspace':
        return 'Open activity'
      default:
        return 'Open Agent'
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          <ShieldCheck size={11} /> Request flow
        </span>
        <div className="flex items-center gap-3 text-[10px] text-muted">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-good" /> healthy
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-warn" /> needs setup
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-bad" /> recent block
          </span>
          {isCustomLayout ? (
            <button onClick={resetLayout} className="flex items-center gap-1 text-accent hover:underline">
              <RotateCcw size={10} /> reset layout
            </button>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div ref={boardRef} className="relative h-[340px] min-w-[760px] cg-grid">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {edges.map((e) => (
              <path
                key={e.id}
                d={path(e)}
                fill="none"
                stroke={edgeTone(e)}
                strokeWidth={selectedEdge === e.id ? 2.2 : 1.3}
                strokeDasharray={e.flow ? '5 7' : '4 6'}
                vectorEffect="non-scaling-stroke"
                className={e.flow ? 'cg-flow' : 'cg-flow-slow'}
                opacity={e.flow ? 0.95 : 0.55}
              />
            ))}
            {edges.map((e) => (
              <path
                key={`hit-${e.id}`}
                d={path(e)}
                fill="none"
                stroke="transparent"
                strokeWidth={14}
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                onClick={() => {
                  setSelectedEdge(e.id)
                  setProbe(null)
                }}
              />
            ))}
          </svg>

          {nodes.map((node, i) => (
            <button
              key={node.id}
              onPointerDown={(ev) => onPointerDown(ev, node.id)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => {
                dragRef.current = null
              }}
              className={cn(
                'cg-node fade-in absolute z-10 w-[152px] cursor-grab touch-none rounded-xl border bg-surface px-2.5 py-2 text-left shadow-sm active:cursor-grabbing focus-ring',
                selected === node.id && !selectedEdge ? 'border-accent ring-2 ring-accent/15' : 'border-line',
              )}
              style={{
                left: `${positions[node.id].x}%`,
                top: `${positions[node.id].y}%`,
                transform: 'translate(-50%, -50%)',
                animationDelay: `${i * 40}ms`,
              }}
              aria-pressed={selected === node.id && !selectedEdge}
              title="Drag to rearrange · click for details"
            >
              <div className="flex items-center gap-1.5">
                <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', bgTone[node.tone])}>
                  {node.icon}
                </span>
                <span className="truncate text-[11.5px] font-semibold text-ink">{node.label}</span>
                <span
                  className={cn(
                    'ml-auto h-1.5 w-1.5 shrink-0 rounded-full',
                    dotTone[node.tone],
                    node.tone === 'good' && 'dot-live',
                  )}
                />
              </div>
              <div className="mt-1 truncate font-mono text-[9.5px] text-muted">{node.detail}</div>
            </button>
          ))}
        </div>
      </div>

      {/* detail panel: edge or node */}
      <div className="flex flex-wrap items-center gap-3 border-t border-line bg-[#fafafa] px-3.5 py-2.5">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
            currentEdge ? 'bg-[#f5f3ff] text-accent' : bgTone[current.tone],
          )}
        >
          {currentEdge ? <ArrowUpRight size={12} /> : current.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {currentEdge ? (
              <>
                <span className="text-[12px] font-semibold text-ink">
                  {currentEdge.label}: {currentEdge.from} → {currentEdge.to}
                </span>
                <Badge tone={currentEdge.flow ? 'good' : 'neutral'}>
                  {currentEdge.flow ? 'active' : 'idle'}
                </Badge>
                {edgeEvent ? (
                  <>
                    <Badge tone={edgeEvent.decision === 'BLOCK' ? 'bad' : edgeEvent.decision === 'DEFER' ? 'warn' : 'good'}>
                      {eventTitle(edgeEvent)}
                    </Badge>
                    <span className="font-mono text-[10px] text-muted">{timeAgo(edgeEvent.ts)}</span>
                  </>
                ) : (
                  <span className="text-[10.5px] text-muted">no traffic on this path yet</span>
                )}
              </>
            ) : (
              <>
                <span className="text-[12px] font-semibold text-ink">{current.title}</span>
                <Badge tone={badgeTone(current.tone)}>
                  {current.tone === 'good' ? 'ok' : current.tone === 'warn' ? 'needs setup' : current.tone === 'bad' ? 'recent block' : 'optional'}
                </Badge>
                {probe ? <span className="truncate font-mono text-[10px] text-muted">{probe}</span> : null}
              </>
            )}
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted">
            {currentEdge
              ? edgeEvent
                ? `${eventTitle(edgeEvent)} · ${edgeEvent.actor} · ${timeAgo(edgeEvent.ts)}. Click "View all" in Activity to inspect the full payload.`
                : 'Nothing has travelled this path yet. The dashes stop animating while the path is inactive.'
              : current.body}
          </p>
        </div>
        <Button
          size="sm"
          variant={!currentEdge && current.tone === 'warn' ? 'primary' : 'secondary'}
          loading={busy}
          onClick={act}
        >
          {actionLabel()} <ArrowUpRight size={11} />
        </Button>
      </div>
    </Card>
  )
}
