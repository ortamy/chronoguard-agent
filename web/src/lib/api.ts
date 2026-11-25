export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type Decision = 'ALLOW' | 'DEFER' | 'BLOCK'

export interface Risk {
  score: number
  level: RiskLevel
  reasons: string[]
  resources: string[]
}

export interface CGEvent {
  id: string
  ts: string
  type: string
  actor: string
  action?: string
  tool?: string
  args?: Record<string, unknown>
  risk?: Risk
  decision?: Decision
  status?: string
  policy_rules?: string[]
  approval?: { required: boolean; state?: string; by?: string; at?: string }
  result?: Record<string, unknown>
  checkpoint?: string
  verification?: string
  checks?: { name: string; ok: boolean; detail: string }[]
  message?: string
  goal?: string
  provider?: string
  content_preview?: string | null
}

export interface Snapshot {
  id: string
  create_time: string | null
  comment: string
  is_auto: boolean
  verification?: string
}

export interface Metrics {
  actions_inspected: number
  threats_blocked: number
  pending_approvals: number
  allowed: number
  deferred: number
  blocked: number
  executed: number
}

export interface Policy {
  protected_paths: string[]
  allowed_ops: string[]
  restricted_ops: string[]
  approval_required_ops: string[]
  risk_threshold: number
  snapshots_enabled: boolean
  github_repo?: string
  agent?: { name: string; id: string; model: string; provider?: string }
}

export interface LegacyState {
  checkpoints: string[]
  last_checkpoint: string | null
  last_action: string | null
  last_action_time: string | null
  status: string
  alerts: { time: string; level: string; message: string }[]
  server_port: number
  log_tail: string[]
  server_time: string
  metrics?: Metrics
  snapshots?: Snapshot[]
  agent?: { name: string; id: string; model: string }
  latest_checkpoint?: Snapshot | null
}

export interface Incident {
  id: string
  ts: string
  tool?: string
  args?: Record<string, unknown>
  risk?: Risk
  decision: Decision
  status?: string
  policy_rules: string[]
  approval?: { required: boolean; state?: string }
  result?: Record<string, unknown>
}

export interface Connector {
  id: string
  provider: string
  display_name?: string
  description?: string
  connection_type?: string
  gateway_base_url?: string
  manage_url?: string
  usage_snippet?: string
  access_policy?: Record<string, unknown>
}

export interface AvailableProvider {
  provider: string
  display_name?: string
  description?: string
  default_scopes?: string[]
  setup_url?: string
}

export interface LlmMode {
  kind: string
  provider?: string
  model?: string
  tier?: string
  available: boolean
  note?: string
  setup_url?: string
}

export interface ConnectorSummary {
  ok: boolean
  fetched_at?: string
  connections: Connector[]
  available: AvailableProvider[]
  llm: LlmMode
  error?: string
}

export interface AgentStep {
  step: number
  tool: string
  decision?: string
  ok?: boolean
  error?: string
  event_id?: string
}

export interface AgentRun {
  ok: boolean
  run_id?: string
  goal?: string
  mode?: LlmMode
  steps?: AgentStep[]
  final?: string
  duration_ms?: number
  error?: string
  setup_url?: string
}

const jsonHeaders = { 'Content-Type': 'application/json' }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...jsonHeaders, ...(init?.headers || {}) } })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`Non-JSON response from ${path}`)
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data as T
}

export const api = {
  state: () => request<{ ok: boolean; state: LegacyState }>('/api/state'),
  health: () =>
    request<{ ok: boolean; status: string; uptime_sec: number; checkpoints: number }>('/api/health'),
  events: (limit = 200, decision = 'ALL', q = '') =>
    request<{ ok: boolean; events: CGEvent[] }>(
      `/api/events?limit=${limit}&decision=${decision}&q=${encodeURIComponent(q)}`,
    ),
  incidents: () => request<{ ok: boolean; incidents: Incident[] }>('/api/incidents'),
  snapshots: () => request<{ ok: boolean; snapshots: Snapshot[] }>('/api/snapshots'),
  policy: () => request<{ ok: boolean; policy: Policy }>('/api/policies'),
  log: () => request<{ ok: boolean; lines: string[] }>('/api/log'),
  createCheckpoint: (comment?: string) =>
    request<{ ok: boolean; checkpoint?: string; message?: string }>('/api/action/checkpoint', {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }),
  rollback: (checkpoint: string) =>
    request<{ ok: boolean; message?: string }>('/api/action/rollback', {
      method: 'POST',
      body: JSON.stringify({ checkpoint }),
    }),
  verify: (checkpoint: string) =>
    request<{ ok: boolean; verified: boolean; checks: { name: string; ok: boolean; detail: string }[] }>(
      '/api/action/verify',
      { method: 'POST', body: JSON.stringify({ checkpoint }) },
    ),
  approve: (eventId: string) =>
    request<{ ok: boolean }>('/api/action/approve', {
      method: 'POST',
      body: JSON.stringify({ event_id: eventId }),
    }),
  deny: (eventId: string) =>
    request<{ ok: boolean }>('/api/action/deny', {
      method: 'POST',
      body: JSON.stringify({ event_id: eventId }),
    }),
  propose: (tool: string, args: Record<string, unknown>, actor = 'agent') =>
    request<{ ok: boolean; decision: Decision; pending?: boolean; blocked?: boolean; event: CGEvent; result?: Record<string, unknown> }>(
      '/api/action/propose',
      { method: 'POST', body: JSON.stringify({ tool, args, actor }) },
    ),
  savePolicy: (policy: Partial<Policy>) =>
    request<{ ok: boolean; policy: Policy }>('/api/policies', {
      method: 'POST',
      body: JSON.stringify(policy),
    }),
  demo: () => request<{ ok: boolean; steps: Record<string, unknown>[] }>('/api/action/demo', { method: 'POST' }),
  task: (goal: string) =>
    request<{ ok: boolean; goal: string; steps: Record<string, unknown>[] }>('/api/action/task', {
      method: 'POST',
      body: JSON.stringify({ goal }),
    }),
  simulateDanger: () =>
    request<{ ok: boolean; event: CGEvent }>('/api/action/simulate_danger', { method: 'POST' }),
  clearLog: () => request<{ ok: boolean }>('/api/log', { method: 'DELETE' }),

  connectors: () => request<ConnectorSummary>('/api/connectors'),
  connectorTest: (provider: string, path: string) =>
    request<{ ok: boolean; status: number; data: unknown; error?: string; setup_url?: string }>(
      '/api/connectors/test',
      { method: 'POST', body: JSON.stringify({ provider, path }) },
    ),
  agentMode: () => request<{ ok: boolean; mode: LlmMode }>('/api/agent/mode'),
  runAgent: (goal: string, maxSteps = 6) =>
    request<AgentRun>('/api/agent/run', {
      method: 'POST',
      body: JSON.stringify({ goal, max_steps: maxSteps }),
    }),
  githubStatus: () =>
    request<{ ok: boolean; configured: boolean; repo: string; setup_url: string; note?: string }>(
      '/api/github/status',
    ),
  githubReport: (eventId: string, repo?: string) =>
    request<{ ok: boolean; url?: string; deduped?: boolean; error?: string; setup_url?: string; readonly?: boolean }>(
      '/api/github/report',
      { method: 'POST', body: JSON.stringify({ event_id: eventId, repo }) },
    ),
  auditExport: () =>
    request<{ exported_at: string; sprite: string; events: CGEvent[]; incidents: Incident[] }>(
      '/api/audit/export',
    ),
  auditImport: (bundle: unknown) =>
    request<{ ok: boolean; imported: number; journal_size: number }>('/api/audit/import', {
      method: 'POST',
      body: JSON.stringify({ bundle }),
    }),
}
