import { useCallback, useEffect, useRef, useState } from 'react'
import type { CGEvent } from './api'

/* ------------------------------------------------------------------ */
/* data hooks                                                          */
/* ------------------------------------------------------------------ */

export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  intervalMs = 0,
): { data: T | null; error: string | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const mounted = useRef(true)

  const run = useCallback(async () => {
    try {
      const value = await fnRef.current()
      if (!mounted.current) return
      setData(value)
      setError(null)
    } catch (err) {
      if (!mounted.current) return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    setLoading(true)
    void run()
    if (!intervalMs) return () => { mounted.current = false }
    const id = window.setInterval(run, intervalMs)
    return () => {
      mounted.current = false
      window.clearInterval(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, run, ...deps])

  return { data, error, loading, refresh: run }
}

/** Live event feed over SSE with automatic reconnect + polling fallback. */
export function useLiveEvents(): {
  events: CGEvent[]
  connected: boolean
  lastEvent: CGEvent | null
} {
  const [events, setEvents] = useState<CGEvent[]>([])
  const [connected, setConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<CGEvent | null>(null)

  useEffect(() => {
    let source: EventSource | null = null
    let retry: number | undefined
    let closed = false

    const connect = () => {
      if (closed) return
      source = new EventSource('/api/stream')
      source.onopen = () => setConnected(true)
      source.onmessage = (msg) => {
        try {
          const payload = JSON.parse(msg.data) as { type: string; event?: CGEvent }
          if (payload.type === 'event' && payload.event) {
            const event = payload.event
            setLastEvent(event)
            setEvents((prev) => [event, ...prev].slice(0, 400))
          }
        } catch {
          /* ignore malformed frames */
        }
      }
      source.onerror = () => {
        setConnected(false)
        source?.close()
        if (!closed) retry = window.setTimeout(connect, 2500)
      }
    }

    connect()
    return () => {
      closed = true
      source?.close()
      if (retry) window.clearTimeout(retry)
    }
  }, [])

  return { events, connected, lastEvent }
}

/* ------------------------------------------------------------------ */
/* formatting                                                          */
/* ------------------------------------------------------------------ */

export function timeAgo(iso?: string | null): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diff = Math.max(0, Date.now() - then)
  const s = Math.floor(diff / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export function fmtTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function decisionColor(decision?: string): string {
  switch ((decision || '').toUpperCase()) {
    case 'BLOCK':
      return 'var(--color-bad)'
    case 'DEFER':
      return 'var(--color-warn)'
    case 'ALLOW':
      return 'var(--color-good)'
    default:
      return 'var(--color-muted)'
  }
}

export function riskColor(level?: string): string {
  switch ((level || '').toUpperCase()) {
    case 'CRITICAL':
      return 'var(--color-bad)'
    case 'HIGH':
      return '#ea580c'
    case 'MEDIUM':
      return 'var(--color-warn)'
    default:
      return 'var(--color-good)'
  }
}

export function riskBg(level?: string): string {
  switch ((level || '').toUpperCase()) {
    case 'CRITICAL':
      return '#fef2f2'
    case 'HIGH':
      return '#fff7ed'
    case 'MEDIUM':
      return '#fffbeb'
    default:
      return '#f0fdf4'
  }
}

export function shortId(id?: string): string {
  if (!id) return '—'
  return id.length > 14 ? `${id.slice(0, 14)}…` : id
}

export function copy(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text)
  return Promise.reject(new Error('clipboard unavailable'))
}
