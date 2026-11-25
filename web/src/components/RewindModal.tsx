import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, CornerUpLeft, Loader2, RefreshCw } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { api, type Snapshot } from '../lib/api'
import { Badge, Button, Modal, cn, useToast } from './ui'
import { fmtTime } from '../lib/util'

type StepState = 'idle' | 'active' | 'done' | 'failed'

interface Step {
  id: string
  label: string
  detail?: string
  state: StepState
}

const BASE_STEPS: Step[] = [
  { id: 'select', label: 'Checkpoint selected', state: 'idle' },
  { id: 'init', label: 'Recovery initialized', state: 'idle' },
  { id: 'restore', label: 'Sprite state being restored', state: 'idle' },
  { id: 'reconnect', label: 'Environment reconnected', state: 'idle' },
  { id: 'fs', label: 'Filesystem verification', state: 'idle' },
  { id: 'app', label: 'Application health verification', state: 'idle' },
  { id: 'done', label: 'Recovery completed', state: 'idle' },
]

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function RewindModal({
  open,
  snapshot,
  onClose,
  onCompleted,
}: {
  open: boolean
  snapshot: Snapshot | null
  onClose: () => void
  onCompleted: () => void
}) {
  const [steps, setSteps] = useState<Step[]>(BASE_STEPS)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checks, setChecks] = useState<{ name: string; ok: boolean; detail: string }[]>([])
  const [finished, setFinished] = useState(false)
  const [auditNote, setAuditNote] = useState<string | null>(null)
  const toast = useToast()
  const abort = useRef(false)

  useEffect(() => {
    if (!open) {
      setSteps(BASE_STEPS)
      setRunning(false)
      setError(null)
      setChecks([])
      setFinished(false)
      abort.current = false
    }
  }, [open])

  const patch = useCallback((id: string, state: StepState, detail?: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, state, detail: detail ?? s.detail } : s)))
  }, [])

  const waitForHealth = useCallback(async (timeoutMs: number): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs
    // Give the environment a moment to actually restart.
    await sleep(1500)
    while (Date.now() < deadline) {
      if (abort.current) return false
      try {
        const h = await api.health()
        if (h.ok) return true
      } catch {
        /* expected while the environment restarts */
      }
      await sleep(1500)
    }
    return false
  }, [])

  const run = useCallback(async () => {
    if (!snapshot) return
    abort.current = false
    setRunning(true)
    setError(null)
    setChecks([])
    setFinished(false)
    setSteps(BASE_STEPS.map((s) => ({ ...s, state: s.id === 'select' ? 'done' : 'idle' })))

    try {
      // Durable audit: keep a copy of the journal on the host (outside the
      // sprite) so the restore cannot erase the incident that triggered it.
      let bundle: Awaited<ReturnType<typeof api.auditExport>> | null = null
      try {
        bundle = await api.auditExport()
        setAuditNote(`exported ${bundle.events.length} journal events to the host`)
      } catch {
        setAuditNote(null)
      }

      patch('init', 'active')
      const rb = await api.rollback(snapshot.id)
      if (!rb.ok) throw new Error(rb.message || 'restore failed')
      patch('init', 'done', rb.message)

      patch('restore', 'active')
      const alive = await waitForHealth(150_000)
      if (!alive) {
        patch('restore', 'failed')
        throw new Error(
          'The environment did not come back within 150s. If the checkpoint predates server.py, restart the service manually.',
        )
      }
      patch('restore', 'done')
      patch('reconnect', 'done', 'API responding')

      patch('fs', 'active')
      const verify = await api.verify(snapshot.id)
      setChecks(verify.checks || [])
      const fsChecks = (verify.checks || []).filter((c) =>
        ['checkpoint_present', 'agent_dir', 'server_script', 'workspace'].includes(c.name),
      )
      const fsOk = fsChecks.length > 0 && fsChecks.every((c) => c.ok)
      patch('fs', fsOk ? 'done' : 'failed', fsOk ? 'filesystem matches checkpoint' : 'verification failed')

      patch('app', 'active')
      let healthOk = false
      try {
        const h = await api.health()
        healthOk = h.ok
      } catch {
        healthOk = false
      }
      patch('app', healthOk ? 'done' : 'failed', healthOk ? 'API healthy' : 'API unhealthy')

      if (!fsOk || !healthOk) throw new Error('Recovery finished but verification did not pass.')

      if (bundle) {
        try {
          const restored = await api.auditImport(bundle)
          setAuditNote(`restored ${restored.imported} journal events that the rollback had rewound`)
        } catch {
          setAuditNote('journal re-import failed; the host copy is still available')
        }
      }

      patch('done', 'done', fmtTime(new Date().toISOString()))
      setFinished(true)
      toast.push({
        title: 'Recovery verified',
        description: `Environment restored to ${snapshot.id}`,
        tone: 'good',
      })
      onCompleted()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setSteps((prev) => prev.map((s) => (s.state === 'active' ? { ...s, state: 'failed' } : s)))
      toast.push({ title: 'Recovery incomplete', description: msg, tone: 'bad' })
    } finally {
      setRunning(false)
    }
  }, [snapshot, patch, waitForHealth, toast, onCompleted])

  const doneCount = steps.filter((s) => s.state === 'done').length

  return (
    <Modal
      open={open}
      onClose={() => {
        if (running) return
        abort.current = true
        onClose()
      }}
      wide
      title={
        <span className="flex items-center gap-2">
          <CornerUpLeft size={15} className="text-accent" />
          Rewind environment
        </span>
      }
      description={
        snapshot
          ? `Restore the sprite to ${snapshot.id} — real checkpoint, verified after reconnect.`
          : 'Select a checkpoint'
      }
      footer={
        running ? (
          <span className="text-[12px] text-muted">Do not close this window during recovery…</span>
        ) : finished ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={run} disabled={!snapshot}>
              <CornerUpLeft size={14} /> Rewind to {snapshot?.id ?? '—'}
            </Button>
          </>
        )
      }
    >
      {snapshot ? (
        <div className="mb-4 rounded-lg border border-line bg-[#fafafa] p-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[13px] font-semibold text-ink">{snapshot.id}</span>
            <Badge tone={snapshot.is_auto ? 'neutral' : 'accent'}>{snapshot.is_auto ? 'auto' : 'manual'}</Badge>
            <span className="ml-auto text-[11.5px] text-muted">{fmtTime(snapshot.create_time)}</span>
          </div>
          <div className="mt-1 text-[12px] leading-5 text-muted">{snapshot.comment || 'No comment'}</div>
        </div>
      ) : null}

      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={13} className="text-warn" />
        <span className="text-[12px] text-muted">
          Restoring rewinds files written after this checkpoint and restarts the environment.
        </span>
      </div>

      <div className="rounded-xl border border-line">
        {steps.map((step, i) => (
          <div
            key={step.id}
            className={cn(
              'flex items-start gap-3 px-3.5 py-2.5',
              i !== steps.length - 1 && 'border-b border-line',
            )}
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line">
              {step.state === 'done' ? (
                <Check size={12} className="text-good" />
              ) : step.state === 'active' ? (
                <Loader2 size={12} className="animate-spin text-accent" />
              ) : step.state === 'failed' ? (
                <span className="h-1.5 w-1.5 rounded-full bg-bad" />
              ) : (
                <span className="h-1 w-1 rounded-full bg-[#d4d4d8]" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  'text-[12.5px]',
                  step.state === 'idle' ? 'text-[#a1a1aa]' : 'font-medium text-ink',
                )}
              >
                {step.label}
              </div>
              {step.detail ? (
                <div className="mt-0.5 truncate font-mono text-[11px] text-muted">{step.detail}</div>
              ) : null}
            </div>
            {step.state === 'failed' ? <span className="text-[11px] text-bad">failed</span> : null}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11.5px] text-muted">
        <span>
          {doneCount}/{steps.length} steps
        </span>
        {running ? <span>recovering…</span> : null}
      </div>

      {auditNote ? (
        <div className="mt-2 rounded-lg border border-line bg-[#fafafa] px-2.5 py-1.5 text-[11.5px] text-muted">
          Audit: {auditNote}
        </div>
      ) : null}

      <AnimatePresence>
        {error ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-lg border border-[#fee2e2] bg-[#fef2f2] p-3 text-[12px] leading-5 text-[#b91c1c]"
          >
            {error}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {checks.length > 0 ? (
        <div className="mt-3 rounded-lg border border-line p-3">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">
            Verification checks
          </div>
          <ul className="space-y-1">
            {checks.map((c) => (
              <li key={c.name} className="flex items-start gap-2 text-[12px]">
                <Check
                  size={12}
                  className={c.ok ? 'mt-1 text-good' : 'mt-1 text-bad'}
                />
                <span className={c.ok ? 'text-ink' : 'text-bad'}>{c.name.replaceAll('_', ' ')}</span>
                <span className="ml-auto truncate font-mono text-[11px] text-muted">{c.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!running && !finished && error ? (
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={run}>
            <RefreshCw size={12} /> Retry recovery
          </Button>
        </div>
      ) : null}
    </Modal>
  )
}
