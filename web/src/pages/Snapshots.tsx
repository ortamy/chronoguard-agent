import { useState } from 'react'
import { Camera, CameraOff, CornerUpLeft } from 'lucide-react'
import { api } from '../lib/api'
import type { Snapshot } from '../lib/api'
import { useData } from '../lib/data'
import { Badge, Button, Card, CardBody, EmptyState, SectionTitle, useToast } from '../components/ui'
import { RewindModal } from '../components/RewindModal'
import { fmtTime, timeAgo } from '../lib/util'

export function Snapshots() {
  const { snapshots, refresh, healthOk } = useData()
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Snapshot | null>(null)
  const toast = useToast()
  const ordered = [...snapshots].sort((a, b) => (a.create_time && b.create_time && a.create_time < b.create_time ? 1 : -1))

  const create = async () => {
    setCreating(true)
    try {
      const res = await api.createCheckpoint()
      toast.push({
        title: res.checkpoint ? `Checkpoint ${res.checkpoint} created` : 'Checkpoint created',
        tone: 'good',
      })
      await refresh()
    } catch (err) {
      toast.push({
        title: 'Checkpoint failed',
        description: err instanceof Error ? err.message : String(err),
        tone: 'bad',
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Snapshots</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Native Fly.io Sprite checkpoints — real IDs, real timestamps, real restore.
          </p>
        </div>
        <Button variant="primary" onClick={create} loading={creating} disabled={!healthOk}>
          <Camera size={14} /> Create checkpoint
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ordered.length === 0 ? (
          <Card className="sm:col-span-2 lg:col-span-3">
            <EmptyState
              icon={<CameraOff size={16} />}
              title="No checkpoints yet"
              description="Create a checkpoint to give the environment a recoverable point before risky work."
              action={
                <Button variant="primary" size="sm" onClick={create} loading={creating}>
                  Create the first checkpoint
                </Button>
              }
            />
          </Card>
        ) : (
          ordered.map((snap, i) => (
            <Card key={snap.id} className="flex flex-col">
              <CardBody className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f5f3ff] text-accent">
                    <Camera size={13} />
                  </span>
                  <span className="font-mono text-[13.5px] font-semibold text-ink">{snap.id}</span>
                  <Badge tone={snap.is_auto ? 'neutral' : 'accent'} className="ml-auto">
                    {snap.is_auto ? 'auto' : 'manual'}
                  </Badge>
                </div>
                <p className="mt-2 line-clamp-2 min-h-[32px] text-[12px] leading-4 text-muted">
                  {snap.comment || 'No comment recorded'}
                </p>
                <div className="mt-3 space-y-1 text-[11.5px] text-muted">
                  <div className="flex justify-between">
                    <span>Created</span>
                    <span className="text-[#3f3f46]">{fmtTime(snap.create_time)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Age</span>
                    <span className="text-[#3f3f46]">{timeAgo(snap.create_time)}</span>
                  </div>
                </div>
                {i === 0 ? (
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-good">
                    <span className="h-1 w-1 rounded-full bg-good" /> latest recovery point
                  </div>
                ) : null}
              </CardBody>
              <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
                <Button size="sm" className="flex-1" onClick={() => setSelected(snap)}>
                  <CornerUpLeft size={12} /> Rewind
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard?.writeText(snap.id)
                    toast.push({ title: 'Checkpoint ID copied', tone: 'neutral' })
                  }}
                >
                  Copy ID
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>

      <SectionTitle
        title="How snapshots behave"
        description="Restoring a checkpoint rewinds the whole sprite filesystem and restarts the environment."
      />
      <Card>
        <CardBody className="grid gap-3 text-[12px] leading-5 text-muted sm:grid-cols-3">
          <div>
            <div className="mb-1 font-medium text-ink">Real identifiers</div>
            IDs come from <span className="font-mono text-[11px]">sprite-env checkpoints list</span>; ChronoGuard
            never invents a checkpoint.
          </div>
          <div>
            <div className="mb-1 font-medium text-ink">Restart included</div>
            The API drops during restore. The UI polls health, then verifies the filesystem and the service.
          </div>
          <div>
            <div className="mb-1 font-medium text-ink">Audit caveat</div>
            The journal is inside the sprite, so an older restore also rewinds the journal — it is not externally
            anchored.
          </div>
        </CardBody>
      </Card>

      <RewindModal open={!!selected} snapshot={selected} onClose={() => setSelected(null)} onCompleted={refresh} />
    </div>
  )
}
