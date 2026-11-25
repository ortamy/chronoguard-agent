import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ToastProvider, useToast } from './components/ui'
import { DataProvider, useData } from './lib/data'
import { Shell, useRoute, type RouteId } from './components/Shell'
import { CommandPalette, buildActions } from './components/CommandPalette'
import { RewindModal } from './components/RewindModal'
import { Overview } from './pages/Overview'
import { Agent } from './pages/Agent'
import { Security } from './pages/Security'
import { Activity } from './pages/Activity'
import { Snapshots } from './pages/Snapshots'
import { Timeline } from './pages/Timeline'
import { Policies } from './pages/Policies'
import { Settings } from './pages/Settings'
import { api, type Snapshot } from './lib/api'

function Pages({ route, navigate }: { route: RouteId; navigate: (r: RouteId) => void }) {
  const page = (() => {
    switch (route) {
      case 'agent':
        return <Agent />
      case 'security':
        return <Security />
      case 'activity':
        return <Activity />
      case 'snapshots':
        return <Snapshots />
      case 'timeline':
        return <Timeline />
      case 'policies':
        return <Policies />
      case 'settings':
        return <Settings />
      default:
        return <Overview navigate={navigate} />
    }
  })()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={route}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -2 }}
        transition={{ duration: 0.14 }}
      >
        {page}
      </motion.div>
    </AnimatePresence>
  )
}

function Workspace() {
  const [route, navigate] = useRoute()
  const { snapshots, refresh } = useData()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [rewind, setRewind] = useState<Snapshot | null>(null)
  const [demoBusy, setDemoBusy] = useState(false)
  const toast = useToast()

  const latest = useMemo(() => {
    if (snapshots.length === 0) return null
    return [...snapshots].sort((a, b) =>
      (a.create_time || '') < (b.create_time || '') ? 1 : -1,
    )[0]
  }, [snapshots])

  const createCheckpoint = useCallback(async () => {
    try {
      const res = await api.createCheckpoint()
      toast.push({ title: res.checkpoint ? `Checkpoint ${res.checkpoint} created` : 'Checkpoint created', tone: 'good' })
      await refresh()
    } catch (err) {
      toast.push({
        title: 'Checkpoint failed',
        description: err instanceof Error ? err.message : String(err),
        tone: 'bad',
      })
    }
  }, [refresh, toast])

  const runDemo = useCallback(async () => {
    setDemoBusy(true)
    try {
      await api.demo()
      toast.push({
        title: 'Demo scenario executed',
        description: 'Contexts: one allowed write, one blocked delete, one deferred approval.',
        tone: 'neutral',
      })
      await refresh()
      navigate('security')
    } catch (err) {
      toast.push({
        title: 'Demo failed',
        description: err instanceof Error ? err.message : String(err),
        tone: 'bad',
      })
    } finally {
      setDemoBusy(false)
    }
  }, [refresh, toast, navigate])

  const simulateDanger = useCallback(async () => {
    try {
      await api.simulateDanger()
      toast.push({ title: 'Danger alert simulated', tone: 'bad' })
      await refresh()
      navigate('security')
    } catch (err) {
      toast.push({
        title: 'Simulation failed',
        description: err instanceof Error ? err.message : String(err),
        tone: 'bad',
      })
    }
  }, [refresh, toast, navigate])

  const actions = useMemo(
    () =>
      buildActions({
        createCheckpoint: () => void createCheckpoint(),
        runDemo: () => void runDemo(),
        simulateDanger: () => void simulateDanger(),
        rewindLatest: () => {
          if (latest) setRewind(latest)
          else toast.push({ title: 'No checkpoint yet', description: 'Create one first.', tone: 'neutral' })
        },
      }),
    [createCheckpoint, runDemo, simulateDanger, latest, toast],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <Shell
        route={route}
        navigate={navigate}
        onSearch={() => setPaletteOpen(true)}
        onDemo={() => void runDemo()}
        demoBusy={demoBusy}
      >
        <Pages route={route} navigate={navigate} />
      </Shell>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onNavigate={navigate}
        actions={actions}
      />

      <RewindModal
        open={!!rewind}
        snapshot={rewind}
        onClose={() => setRewind(null)}
        onCompleted={refresh}
      />
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <DataProvider>
        <Workspace />
      </DataProvider>
    </ToastProvider>
  )
}
