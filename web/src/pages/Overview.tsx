import {
  CheckCircle2,
  Clock3,
  Info,
  ScanSearch,
  ShieldCheck,
  ShieldX,
  Zap,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useData } from '../lib/data'
import { AnimatedNumber, Card, Skeleton, cn } from '../components/ui'
import { CircuitBoard } from '../components/CircuitBoard'
import { fmtTime } from '../lib/util'
import type { RouteId } from '../components/Shell'

function Kpi({
  icon,
  label,
  value,
  hint,
  tone,
  delay,
}: {
  icon: React.ReactNode
  label: string
  value: number
  hint: string
  tone?: 'bad' | 'warn' | 'good'
  delay: number
}) {
  const color =
    tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'good' ? 'text-good' : 'text-ink'
  const bg =
    tone === 'bad'
      ? 'bg-[#fef2f2] text-bad'
      : tone === 'warn'
        ? 'bg-[#fffbeb] text-warn'
        : tone === 'good'
          ? 'bg-[#f0fdf4] text-good'
          : 'bg-[#f4f4f5] text-[#71717a]'
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay }}>
      <Card className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:border-[#d4d4d8]">
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', bg)}>{icon}</span>
        <div className="min-w-0">
          <div className={cn('text-[21px] font-semibold leading-6 tracking-tight', color)}>
            <AnimatedNumber value={value} />
          </div>
          <div className="truncate text-[10.5px] font-medium uppercase tracking-wide text-muted">{label}</div>
        </div>
        <span className="ml-auto hidden text-right text-[10.5px] leading-4 text-[#a1a1aa] sm:block">{hint}</span>
      </Card>
    </motion.div>
  )
}

export function Overview({ navigate }: { navigate: (r: RouteId) => void }) {
  const { state, snapshots, incidents, events, healthOk, loading, refresh } = useData()
  const metrics = state?.metrics

  if (loading && !state) {
    return (
      <div className="space-y-2.5">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[68px]" />
          ))}
        </div>
        <Skeleton className="h-[430px]" />
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight text-ink">
            <ShieldCheck size={18} className="text-accent" />
            Overview
          </h1>
          <p className="mt-0.5 text-[12px] text-muted">
            Protection status for <span className="font-mono text-[11px]">chronoguard-dev</span>
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className={cn('h-1.5 w-1.5 rounded-full', healthOk ? 'bg-good dot-live' : 'bg-bad')} />
          {healthOk ? 'Live' : 'Offline'}
          <span className="text-[#d4d4d8]">·</span>
          <span className="font-mono">:8090</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Kpi
          icon={<ScanSearch size={15} />}
          label="Inspected"
          value={metrics?.actions_inspected ?? 0}
          hint="through the guard"
          delay={0}
        />
        <Kpi
          icon={<ShieldX size={15} />}
          label="Blocked"
          value={metrics?.threats_blocked ?? 0}
          hint="absolute blocks"
          tone={(metrics?.threats_blocked ?? 0) > 0 ? 'bad' : undefined}
          delay={0.04}
        />
        <Kpi
          icon={<Clock3 size={15} />}
          label="Pending"
          value={metrics?.pending_approvals ?? 0}
          hint="waiting for a human"
          tone={(metrics?.pending_approvals ?? 0) > 0 ? 'warn' : undefined}
          delay={0.08}
        />
        <Kpi
          icon={<CheckCircle2 size={15} />}
          label="Executed"
          value={metrics?.executed ?? 0}
          hint="approved operations"
          tone="good"
          delay={0.12}
        />
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }}>
        <CircuitBoard
          metrics={metrics}
          snapshots={snapshots}
          incidents={incidents}
          events={events}
          healthOk={healthOk}
          agentName={state?.agent?.name}
          agentModel={state?.agent?.model}
          onNavigate={navigate}
          onRefresh={refresh}
        />
      </motion.div>

      <div
        className="flex items-center gap-1.5 px-1 text-[10px] text-[#a1a1aa]"
        title="Enforcement is application-level (the agent has no shell). The audit journal survives rewinds via the /tmp anchor, but this is not an OS sandbox and a full sprite rebuild can clear it."
      >
        <Info size={10} />
        <span className="truncate">Application-level enforcement · audit anchored in /tmp · not an OS sandbox</span>
        <span className="ml-auto hidden shrink-0 items-center gap-1 sm:flex">
          <Zap size={9} /> {fmtTime(state?.server_time)}
        </span>
      </div>
    </div>
  )
}
