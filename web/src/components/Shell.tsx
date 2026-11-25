import { useEffect, useState, type ReactNode } from 'react'
import {
  Activity,
  Bot,
  Camera,
  ChevronDown,
  History,
  LayoutDashboard,
  Menu,
  PlayCircle,
  ScrollText,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  X,
} from 'lucide-react'
import { motion } from 'motion/react'
import { cn } from './ui'
import { useData } from '../lib/data'

export const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'security', label: 'Security Center', icon: ShieldAlert },
  { id: 'activity', label: 'Agent Activity', icon: Activity },
  { id: 'snapshots', label: 'Snapshots', icon: Camera },
  { id: 'timeline', label: 'Timeline & Rewind', icon: History },
  { id: 'policies', label: 'Policies', icon: ScrollText },
  { id: 'settings', label: 'Settings', icon: Settings },
] as const

export type RouteId = (typeof NAV)[number]['id']

export function useRoute(): [RouteId, (r: RouteId) => void] {
  const read = (): RouteId => {
    const raw = window.location.hash.replace(/^#\/?/, '')
    const found = NAV.find((n) => n.id === raw)
    return found ? found.id : 'overview'
  }
  const [route, setRoute] = useState<RouteId>(read)
  const navigate = (r: RouteId) => {
    window.location.hash = `/${r}`
    setRoute(r)
    window.scrollTo({ top: 0 })
  }
  useEffect(() => {
    const onHash = () => setRoute(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return [route, navigate]
}

function SidebarInner({ route, navigate, onSearch }: { route: RouteId; navigate: (r: RouteId) => void; onSearch: () => void }) {
  const { connected, healthOk, state } = useData()
  const live = connected && healthOk
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
          <Shield size={15} strokeWidth={2.4} />
        </div>
        <div className="leading-tight">
          <div className="text-[13.5px] font-semibold tracking-tight text-ink">ChronoGuard</div>
          <div className="text-[10.5px] text-muted">AI safety &amp; recovery</div>
        </div>
      </div>

      <button
        onClick={onSearch}
        className="mx-3 mb-3 flex h-8 items-center gap-2 rounded-lg border border-line bg-[#fafafa] px-2.5 text-[12.5px] text-muted transition-colors hover:bg-white focus-ring"
      >
        <Search size={13} />
        <span>Search…</span>
        <kbd className="ml-auto rounded border border-line bg-white px-1 font-mono text-[10px] text-[#71717a]">
          ⌘K
        </kbd>
      </button>

      <nav className="flex-1 space-y-0.5 px-2">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = route === item.id
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={cn(
                'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors focus-ring',
                active
                  ? 'bg-[#f4f4f5] font-medium text-ink'
                  : 'text-[#52525b] hover:bg-[#f4f4f5] hover:text-ink',
              )}
            >
              <Icon size={15} className={active ? 'text-accent' : 'text-[#a1a1aa] group-hover:text-[#71717a]'} />
              <span>{item.label}</span>
              {active ? <span className="ml-auto h-1 w-1 rounded-full bg-accent" /> : null}
            </button>
          )
        })}
      </nav>

      <div className="border-t border-line p-3">
        <div className="rounded-lg border border-line bg-[#fafafa] p-2.5">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                live ? 'bg-good dot-live' : 'bg-[#a1a1aa]',
              )}
            />
            <span className="text-[11.5px] font-medium text-ink">chronoguard-dev</span>
            <ChevronDown size={12} className="ml-auto text-[#a1a1aa]" />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-muted">
            <span>{live ? 'Connected' : 'Disconnected'}</span>
            <span className="font-mono">:{state?.server_port ?? 8090}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Shell({
  route,
  navigate,
  onSearch,
  onDemo,
  demoBusy,
  children,
}: {
  route: RouteId
  navigate: (r: RouteId) => void
  onSearch: () => void
  onDemo: () => void
  demoBusy: boolean
  children: ReactNode
}) {
  const [drawer, setDrawer] = useState(false)
  const { connected, healthOk, state, incidents } = useData()
  const pending = state?.metrics?.pending_approvals ?? 0
  const title = NAV.find((n) => n.id === route)?.label ?? 'Overview'
  const live = connected && healthOk

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 border-r border-line bg-surface lg:block">
        <SidebarInner route={route} navigate={navigate} onSearch={onSearch} />
      </aside>

      {drawer ? (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div className="absolute inset-0 bg-black/25" onClick={() => setDrawer(false)} />
          <motion.div
            initial={{ x: -260 }}
            animate={{ x: 0 }}
            className="absolute inset-y-0 left-0 w-[232px] border-r border-line bg-surface"
          >
            <button
              className="absolute right-2 top-2 rounded p-1 text-muted hover:bg-[#f4f4f5]"
              onClick={() => setDrawer(false)}
              aria-label="Close menu"
            >
              <X size={16} />
            </button>
            <SidebarInner
              route={route}
              navigate={(r) => {
                navigate(r)
                setDrawer(false)
              }}
              onSearch={() => {
                setDrawer(false)
                onSearch()
              }}
            />
          </motion.div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
          <div className="flex h-12 items-center gap-3 px-4 lg:px-8">
            <button
              className="rounded-md p-1.5 text-muted hover:bg-[#f4f4f5] lg:hidden"
              onClick={() => setDrawer(true)}
              aria-label="Open menu"
            >
              <Menu size={16} />
            </button>
            <div className="flex items-center gap-1.5 text-[12.5px]">
              <span className="text-muted">ChronoGuard</span>
              <span className="text-[#d4d4d8]">/</span>
              <span className="font-medium text-ink">{title}</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {pending > 0 ? (
                <button
                  onClick={() => navigate('security')}
                  className="hidden items-center gap-1.5 rounded-lg border border-[#fef3c7] bg-[#fffbeb] px-2 py-1 text-[11.5px] font-medium text-[#b45309] sm:flex focus-ring"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                  {pending} pending
                </button>
              ) : null}
              {incidents.length > 0 ? (
                <button
                  onClick={() => navigate('security')}
                  className="hidden items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-[11.5px] font-medium text-[#52525b] sm:flex focus-ring"
                >
                  <ShieldAlert size={12} className="text-bad" />
                  {incidents.length} incidents
                </button>
              ) : null}

              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] font-medium',
                  live
                    ? 'border-[#dcfce7] bg-[#f0fdf4] text-[#15803d]'
                    : 'border-line bg-surface text-muted',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', live ? 'bg-good dot-live' : 'bg-[#a1a1aa]')} />
                <span className="hidden sm:inline">{live ? 'Live' : 'Offline'}</span>
              </span>

              <button
                onClick={onDemo}
                disabled={demoBusy}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[12px] font-medium text-ink transition-colors hover:bg-[#f4f4f5] disabled:opacity-50 focus-ring"
              >
                <PlayCircle size={13} className="text-accent" />
                <span className="hidden sm:inline">{demoBusy ? 'Running…' : 'Run demo'}</span>
              </button>

              <div className="ml-1 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-[#f4f4f5] text-[11px] font-semibold text-[#52525b]">
                A
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>

        <footer className="border-t border-line px-4 py-4 text-[11.5px] text-muted lg:px-8">
          <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-2">
            <span>
              ChronoGuard · sprite <span className="font-mono text-[#52525b]">chronoguard-dev</span> · your AI&apos;s
              last line of defense
            </span>
            <span className="font-mono">http://127.0.0.1:8090</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
