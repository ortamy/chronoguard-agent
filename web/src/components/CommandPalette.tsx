import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Camera, CornerUpLeft, PlayCircle, Search, ShieldAlert, Zap } from 'lucide-react'
import { cn } from './ui'
import { NAV, type RouteId } from './Shell'

export interface PaletteAction {
  id: string
  label: string
  hint?: string
  icon: React.ReactNode
  run: () => void
}

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  actions,
}: {
  open: boolean
  onClose: () => void
  onNavigate: (r: RouteId) => void
  actions: PaletteAction[]
}) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      window.setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  const items = useMemo(() => {
    const navItems: PaletteAction[] = NAV.map((n) => {
      const Icon = n.icon
      return {
        id: `nav-${n.id}`,
        label: `Go to ${n.label}`,
        hint: 'Navigation',
        icon: <Icon size={14} />,
        run: () => onNavigate(n.id),
      }
    })
    const all = [...navItems, ...actions]
    const q = query.trim().toLowerCase()
    if (!q) return all
    return all.filter((i) => `${i.label} ${i.hint || ''}`.toLowerCase().includes(q))
  }, [query, actions, onNavigate])

  useEffect(() => {
    setIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex((i) => Math.min(items.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[index]
        if (item) {
          item.run()
          onClose()
        }
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, items, index, onClose])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[95] flex items-start justify-center bg-black/25 p-4 pt-[12vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[560px] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl shadow-black/10"
          >
            <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
              <Search size={15} className="text-[#a1a1aa]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages and actions…"
                className="h-6 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-[#a1a1aa]"
              />
              <kbd className="rounded border border-line bg-[#fafafa] px-1.5 font-mono text-[10px] text-[#71717a]">
                esc
              </kbd>
            </div>
            <div className="max-h-[320px] overflow-y-auto p-1.5">
              {items.length === 0 ? (
                <div className="px-3 py-8 text-center text-[12.5px] text-muted">No results</div>
              ) : (
                items.map((item, i) => (
                  <button
                    key={item.id}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => {
                      item.run()
                      onClose()
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors',
                      i === index ? 'bg-[#f4f4f5] text-ink' : 'text-[#52525b]',
                    )}
                  >
                    <span className="text-[#71717a]">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.hint ? <span className="text-[11px] text-[#a1a1aa]">{item.hint}</span> : null}
                    {i === index ? <ArrowRight size={12} className="text-[#a1a1aa]" /> : null}
                  </button>
                ))
              )}
            </div>
            <div className="flex items-center gap-3 border-t border-line px-3.5 py-2 text-[10.5px] text-[#a1a1aa]">
              <span>↑↓ navigate</span>
              <span>↵ select</span>
              <span className="ml-auto">ChronoGuard command palette</span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export function buildActions(opts: {
  createCheckpoint: () => void
  runDemo: () => void
  simulateDanger: () => void
  rewindLatest: () => void
}): PaletteAction[] {
  return [
    {
      id: 'create-checkpoint',
      label: 'Create checkpoint',
      hint: 'Snapshot',
      icon: <Camera size={14} />,
      run: opts.createCheckpoint,
    },
    {
      id: 'run-demo',
      label: 'Run guarded demo scenario',
      hint: 'Demo',
      icon: <PlayCircle size={14} />,
      run: opts.runDemo,
    },
    {
      id: 'simulate-danger',
      label: 'Simulate danger alert',
      hint: 'Demo',
      icon: <ShieldAlert size={14} />,
      run: opts.simulateDanger,
    },
    {
      id: 'rewind-latest',
      label: 'Rewind to latest checkpoint',
      hint: 'Recovery',
      icon: <CornerUpLeft size={14} />,
      run: opts.rewindLatest,
    },
    {
      id: 'quick-read',
      label: 'Inspect workspace (guarded read)',
      hint: 'Agent',
      icon: <Zap size={14} />,
      run: () => {
        window.location.hash = '/activity'
      },
    },
  ]
}
