import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { api, type CGEvent, type Incident, type LegacyState, type Policy, type Snapshot } from './api'
import { useLiveEvents } from './util'
import { useToast } from '../components/ui'

interface DataCtx {
  state: LegacyState | null
  snapshots: Snapshot[]
  policy: Policy | null
  incidents: Incident[]
  events: CGEvent[]
  connected: boolean
  healthOk: boolean
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const Ctx = createContext<DataCtx>({
  state: null,
  snapshots: [],
  policy: null,
  incidents: [],
  events: [],
  connected: false,
  healthOk: false,
  loading: true,
  error: null,
  refresh: async () => undefined,
})

export function useData() {
  return useContext(Ctx)
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LegacyState | null>(null)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [policy, setPolicy] = useState<Policy | null>(null)
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [remoteEvents, setRemoteEvents] = useState<CGEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [healthOk, setHealthOk] = useState(false)
  const { events: liveEvents, connected } = useLiveEvents()
  const toast = useToast()
  const seen = useRef<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    try {
      const [st, snaps, inc, pol, evs] = await Promise.all([
        api.state(),
        api.snapshots(),
        api.incidents(),
        api.policy(),
        api.events(300),
      ])
      setState(st.state)
      setSnapshots(snaps.snapshots)
      setIncidents(inc.incidents)
      setPolicy(pol.policy)
      setRemoteEvents(evs.events)
      setHealthOk(true)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setHealthOk(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const primary = window.setInterval(refresh, 6000)
    const health = window.setInterval(async () => {
      try {
        await api.health()
        setHealthOk(true)
      } catch {
        setHealthOk(false)
      }
    }, 15000)
    return () => {
      window.clearInterval(primary)
      window.clearInterval(health)
    }
  }, [refresh])

  // Merge SSE events on top of the fetched journal (dedupe by id).
  const events = useMemo(() => {
    const map = new Map<string, CGEvent>()
    for (const e of remoteEvents) map.set(e.id, e)
    for (const e of liveEvents) map.set(e.id, e)
    return [...map.values()].sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0))
  }, [remoteEvents, liveEvents])

  // Toast on newly streamed security events.
  useEffect(() => {
    const last = liveEvents[0]
    if (!last || seen.current.has(last.id)) return
    seen.current.add(last.id)
    if (last.type === 'action' && last.decision === 'BLOCK') {
      toast.push({
        title: 'Threat blocked',
        description: `${last.tool} · risk ${last.risk?.score ?? '—'}`,
        tone: 'bad',
      })
    }
    if (last.type === 'action' && last.decision === 'DEFER') {
      toast.push({
        title: 'Approval required',
        description: `${last.tool} is waiting for a decision`,
        tone: 'neutral',
      })
    }
  }, [liveEvents, toast])

  const value = useMemo(
    () => ({ state, snapshots, policy, incidents, events, connected, healthOk, loading, error, refresh }),
    [state, snapshots, policy, incidents, events, connected, healthOk, loading, error, refresh],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
