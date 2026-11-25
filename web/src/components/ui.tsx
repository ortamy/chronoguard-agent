import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Copy, Loader2, X } from 'lucide-react'
import { copy } from '../lib/util'

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/* ------------------------------- Button ------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle'
type Size = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-[#6d28d9] shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-[#f4f4f5]',
  ghost: 'text-muted hover:text-ink hover:bg-[#f4f4f5]',
  danger: 'bg-bad text-white hover:bg-[#b91c1c] shadow-sm',
  subtle: 'bg-[#f4f4f5] text-ink hover:bg-[#e4e4e7]',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] rounded-lg gap-1.5',
  md: 'h-9 px-3.5 text-[13px] rounded-lg gap-2',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
}) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors focus-ring disabled:opacity-50 disabled:pointer-events-none select-none',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : null}
      {children}
    </button>
  )
}

/* -------------------------------- Card -------------------------------- */

export function Card({
  className,
  children,
  as: As = 'div',
}: {
  className?: string
  children: ReactNode
  as?: 'div' | 'section' | 'article'
}) {
  return (
    <As className={cn('rounded-xl border border-line bg-surface', className)}>{children}</As>
  )
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>
}

/* -------------------------------- Badge ------------------------------- */

type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'accent'

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-[#f4f4f5] text-[#52525b] border-[#e4e4e7]',
  good: 'bg-[#f0fdf4] text-[#15803d] border-[#dcfce7]',
  warn: 'bg-[#fffbeb] text-[#b45309] border-[#fef3c7]',
  bad: 'bg-[#fef2f2] text-[#b91c1c] border-[#fee2e2]',
  accent: 'bg-[#f5f3ff] text-[#6d28d9] border-[#ede9fe]',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function decisionTone(decision?: string): Tone {
  switch ((decision || '').toUpperCase()) {
    case 'BLOCK':
      return 'bad'
    case 'DEFER':
      return 'warn'
    case 'ALLOW':
      return 'good'
    default:
      return 'neutral'
  }
}

/* ---------------------------- AnimatedNumber -------------------------- */

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = fromRef.current
    const delta = value - from
    if (delta === 0) return
    let raf = 0
    const started = performance.now()
    const duration = 420
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(from + delta * eased))
      if (progress < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])

  return <span className={className}>{display}</span>
}

/* -------------------------------- Stat -------------------------------- */

export function Stat({
  label,
  value,
  hint,
  icon,
  tone,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  tone?: 'good' | 'warn' | 'bad' | 'accent'
}) {
  const color =
    tone === 'good'
      ? 'text-good'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'bad'
          ? 'text-bad'
          : tone === 'accent'
            ? 'text-accent'
            : 'text-ink'
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[12px] font-medium uppercase tracking-wide text-muted">{label}</div>
        {icon ? <div className="text-[#a1a1aa]">{icon}</div> : null}
      </div>
      <div className={cn('mt-2 text-[26px] font-semibold leading-8 tracking-tight', color)}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-[12px] text-muted">{hint}</div> : null}
    </Card>
  )
}

/* -------------------------------- Toast ------------------------------- */

interface ToastItem {
  id: number
  title: string
  description?: string
  tone: 'good' | 'bad' | 'neutral'
}

const ToastCtx = createContext<{
  push: (t: Omit<ToastItem, 'id'>) => void
}>({ push: () => undefined })

export function useToast() {
  return useContext(ToastCtx)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Date.now() + Math.random()
    setItems((prev) => [...prev, { ...t, id }])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id))
    }, 4200)
  }, [])

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[340px] flex-col gap-2">
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-auto rounded-xl border border-line bg-surface p-3 shadow-lg shadow-black/5"
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    'mt-1 h-2 w-2 shrink-0 rounded-full',
                    item.tone === 'good' ? 'bg-good' : item.tone === 'bad' ? 'bg-bad' : 'bg-[#a1a1aa]',
                  )}
                />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-ink">{item.title}</div>
                  {item.description ? (
                    <div className="mt-0.5 text-[12px] leading-5 text-muted">{item.description}</div>
                  ) : null}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}

/* -------------------------------- Modal ------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/25 p-4 pt-[8vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.99 }}
            transition={{ duration: 0.16 }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              'w-full rounded-2xl border border-line bg-surface shadow-2xl shadow-black/10',
              wide ? 'max-w-[720px]' : 'max-w-[520px]',
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <div className="text-[15px] font-semibold text-ink">{title}</div>
                {description ? (
                  <div className="mt-0.5 text-[12.5px] leading-5 text-muted">{description}</div>
                ) : null}
              </div>
              <button
                onClick={onClose}
                className="rounded-md p-1 text-muted transition-colors hover:bg-[#f4f4f5] hover:text-ink focus-ring"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            {children ? <div className="px-5 py-4">{children}</div> : null}
            {footer ? (
              <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/* ------------------------------ Copy chip ----------------------------- */

export function CopyChip({ value, label }: { value: string; label?: string }) {
  const [done, setDone] = useState(false)
  const toast = useToast()
  return (
    <button
      onClick={() => {
        copy(value)
          .then(() => {
            setDone(true)
            window.setTimeout(() => setDone(false), 1200)
          })
          .catch(() => toast.push({ title: 'Copy failed', tone: 'bad' }))
      }}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-[#fafafa] px-1.5 py-0.5 font-mono text-[11.5px] text-[#3f3f46] transition-colors hover:bg-[#f4f4f5] focus-ring"
      title={value}
    >
      <span className="truncate">{label || value}</span>
      {done ? <Check size={11} className="text-good" /> : <Copy size={11} className="opacity-60" />}
    </button>
  )
}

/* ------------------------------- Spinner ------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 size={16} className={cn('animate-spin text-muted', className)} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-md', className)} />
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-[#fafafa] text-[#a1a1aa]">
          {icon}
        </div>
      ) : null}
      <div className="text-[14px] font-medium text-ink">{title}</div>
      {description ? <div className="mt-1 max-w-sm text-[12.5px] leading-5 text-muted">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/* ------------------------------- Risk bar ----------------------------- */

export function RiskBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f4f4f5]">
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="h-full rounded-full"
        style={{ background: color }}
      />
    </div>
  )
}

/* ------------------------------- Switch ------------------------------- */

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors focus-ring',
        checked ? 'bg-accent' : 'bg-[#d4d4d8]',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

/* ------------------------------- Section ------------------------------ */

export function SectionTitle({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[14px] font-semibold tracking-tight text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[12px] text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  )
}
