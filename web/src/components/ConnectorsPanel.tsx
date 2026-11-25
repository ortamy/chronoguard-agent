import { useEffect, useState } from 'react'
import { ArrowUpRight, Cable, Check, Loader2, Play, X } from 'lucide-react'
import { api, type ConnectorSummary } from '../lib/api'
import { Badge, Button, Card, CardBody, SectionTitle, useToast } from '../components/ui'

const TEST_PATH = '/v1/apps?org_slug=artem-909'

export function ConnectorsPanel({ compact }: { compact?: boolean }) {
  const [data, setData] = useState<ConnectorSummary | null>(null)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const toast = useToast()

  const load = () =>
    api
      .connectors()
      .then(setData)
      .catch((err) => toast.push({ title: 'Connector discovery failed', description: String(err), tone: 'bad' }))

  useEffect(() => {
    void load()
  }, [])

  const test = async () => {
    setTesting(true)
    setResult(null)
    try {
      const res = await api.connectorTest('custom_api', TEST_PATH)
      const apps = (res.data as { total_apps?: number })?.total_apps
      setResult({
        ok: res.ok,
        text: res.ok ? `HTTP ${res.status} · ${apps ?? '?'} Fly apps returned` : res.error || `HTTP ${res.status}`,
      })
      toast.push({ title: res.ok ? 'Connector call succeeded' : 'Connector call failed', tone: res.ok ? 'good' : 'bad' })
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : String(err) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardBody>
        <SectionTitle
          title="Sprites Connectors"
          description="Official gateway — provider credentials never enter the sprite."
          action={
            <Button size="sm" onClick={load}>
              Refresh
            </Button>
          }
        />

        {!data ? (
          <div className="flex items-center gap-2 py-4 text-[12.5px] text-muted">
            <Loader2 size={14} className="animate-spin" /> Discovering connectors…
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
              <Badge tone={data.connections.length > 0 ? 'good' : 'warn'}>
                {data.connections.length} connected
              </Badge>
              <span>{data.available.length} providers available</span>
              {data.fetched_at ? <span className="font-mono">· {data.fetched_at}</span> : null}
            </div>

            {data.connections.length === 0 ? (
              <div className="rounded-lg border border-line bg-[#fafafa] p-3 text-[12px] text-muted">
                No connector is configured yet. Add one in the Sprites dashboard, then refresh.
              </div>
            ) : (
              <ul className="space-y-2">
                {data.connections.map((conn) => (
                  <li key={conn.id} className="rounded-lg border border-line p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#f5f3ff] text-accent">
                        <Cable size={12} />
                      </span>
                      <span className="text-[12.5px] font-medium text-ink">
                        {conn.display_name || conn.provider}
                      </span>
                      <Badge tone="accent">{conn.provider}</Badge>
                      <span className="font-mono text-[10.5px] text-[#a1a1aa]">{conn.id}</span>
                      {conn.manage_url ? (
                        <a
                          href={conn.manage_url}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-accent hover:underline"
                        >
                          Manage <ArrowUpRight size={11} />
                        </a>
                      ) : null}
                    </div>
                    {conn.description ? (
                      <p className="mt-1 text-[11.5px] leading-4 text-muted">{conn.description}</p>
                    ) : null}
                    {conn.gateway_base_url ? (
                      <div className="mt-1.5 truncate font-mono text-[10.5px] text-[#a1a1aa]">
                        {conn.gateway_base_url}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {!compact ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={test} loading={testing}>
                  <Play size={12} /> Test Machines connector
                </Button>
                {result ? (
                  <span
                    className={`inline-flex items-center gap-1 text-[11.5px] ${result.ok ? 'text-good' : 'text-bad'}`}
                  >
                    {result.ok ? <Check size={12} /> : <X size={12} />}
                    {result.text}
                  </span>
                ) : (
                  <span className="text-[11.5px] text-muted">Real gateway call, read-only.</span>
                )}
              </div>
            ) : null}

            {data.llm && !data.llm.available ? (
              <div className="mt-3 rounded-lg border border-[#fef3c7] bg-[#fffbeb] p-3 text-[11.5px] leading-5 text-[#92400e]">
                No LLM connector yet — the agent loop stays in "unavailable" mode until a reasoning provider is
                added. Gemini has a free tier; Anthropic and OpenRouter are pay-as-you-go. Nothing pretends to be a
                model it is not.
                {data.llm.setup_url ? (
                  <a
                    href={data.llm.setup_url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-1 text-accent hover:underline"
                  >
                    Set up Gemini (free)
                  </a>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardBody>
    </Card>
  )
}
