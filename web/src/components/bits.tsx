import {
  Activity,
  Camera,
  FileText,
  FolderOpen,
  Globe,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  Wrench,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { CGEvent, Risk } from '../lib/api'
import { Badge, decisionTone } from './ui'
import { riskColor } from '../lib/util'

export function DecisionBadge({ decision }: { decision?: string }) {
  const d = (decision || '—').toUpperCase()
  return <Badge tone={decisionTone(d)}>{d}</Badge>
}

export function RiskPill({ risk }: { risk?: Risk }) {
  if (!risk) return <Badge tone="neutral">—</Badge>
  const tone = risk.level === 'LOW' ? 'good' : risk.level === 'MEDIUM' ? 'warn' : 'bad'
  return (
    <Badge tone={tone}>
      <span className="h-1 w-1 rounded-full" style={{ background: riskColor(risk.level) }} />
      {risk.level} · {risk.score}
    </Badge>
  )
}

export function toolIcon(tool?: string): ReactNode {
  switch (tool) {
    case 'read_file':
      return <FileText size={13} />
    case 'write_file':
      return <FileText size={13} />
    case 'list_dir':
      return <FolderOpen size={13} />
    case 'delete_path':
      return <Trash2 size={13} />
    case 'run_command':
      return <Terminal size={13} />
    case 'simulate_danger':
      return <ShieldAlert size={13} />
    default:
      return <Wrench size={13} />
  }
}

export function eventIcon(event: CGEvent): ReactNode {
  switch (event.type) {
    case 'snapshot':
      return <Camera size={13} />
    case 'recovery':
      return <ShieldCheck size={13} />
    case 'incident':
      return <ShieldAlert size={13} />
    case 'policy':
      return <ShieldCheck size={13} />
    case 'agent':
      return <Activity size={13} />
    default:
      if (event.tool === 'run_command') return <Globe size={13} />
      return toolIcon(event.tool)
  }
}

export function eventTitle(event: CGEvent): string {
  if (event.type === 'snapshot') return `Checkpoint ${event.action === 'checkpoint_failed' ? 'failed' : 'created'}`
  if (event.type === 'recovery') {
    if (event.action === 'rollback_initiated') return `Rollback initiated → ${event.checkpoint}`
    if (event.action === 'recovery_verified') return `Recovery verified → ${event.checkpoint}`
    return 'Recovery event'
  }
  if (event.type === 'policy') return 'Policy updated'
  if (event.type === 'agent') return event.goal ? `Agent task: ${event.goal}` : 'Agent event'
  if (event.type === 'incident') return 'Simulated incident'
  if (event.tool) return event.tool.replaceAll('_', ' ')
  return event.action || event.type
}
