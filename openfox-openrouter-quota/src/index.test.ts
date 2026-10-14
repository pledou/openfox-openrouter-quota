import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { register } from './index.js'
import type { PluginRegistry, QuotaProvider, QuotaSource } from './types.js'

const KEY = 'sk-or-v1-SECRET-INDEX-TEST-KEY'

interface LogRec {
  level: string
  msg: string
}

interface RegisteredTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>, context: Record<string, unknown>): Promise<{ success: boolean; output?: string; error?: string }>
}

function makeRegistry(opts: { withQuota?: boolean; settings?: Record<string, unknown>; configDir: string }) {
  const { withQuota = true, settings = {}, configDir } = opts
  const logs: LogRec[] = []
  let registeredProvider: QuotaProvider | undefined
  let registeredTool: RegisteredTool | undefined
  const logFn = (level: string) => (m: string) => logs.push({ level, msg: m })
  const registry: Record<string, unknown> = {
    runtime: { mode: 'development' as const, configDirectory: configDir },
    context: {
      id: 'openfox-openrouter-quota',
      version: '1.0.0',
      runtime: { mode: 'development' as const, configDirectory: configDir },
      logger: {
        debug: logFn('debug'),
        info: logFn('info'),
        warn: logFn('warn'),
        error: logFn('error'),
      },
      storage: { get: () => undefined, set: () => undefined },
      settings: () => settings,
      notify: () => undefined,
      publish: () => undefined,
    },
    registerSettings: () => undefined,
    registerTool: (t: RegisteredTool) => {
      registeredTool = t
    },
    registerUiAction: () => undefined,
    registerUiBadge: () => undefined,
    registerUiPanel: () => undefined,
    registerUiComponent: () => undefined,
    registerHook: () => undefined,
    registerRpc: () => undefined,
    registerAsset: () => undefined,
  }
  if (withQuota) {
    registry.registerQuotaProvider = (p: QuotaProvider) => {
      registeredProvider = p
    }
  }
  return { registry: registry as unknown as PluginRegistry, logs, getProvider: () => registeredProvider, getTool: () => registeredTool }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>

function makeGlobalFetch(handler: FetchHandler) {
  const calls: { url: string; auth?: string }[] = []
  const impl = async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url, auth: headers['Authorization'] })
    return handler(url, init)
  }
  return { impl, calls }
}

const VALID_KEY_BODY = {
  data: {
    usage_daily: 0.5,
    usage_weekly: 1.5,
    usage_monthly: 4.25,
    limit: 100,
    limit_remaining: 80,
    free_model_daily_requests: { used: 10, limit: 1000, remaining: 990 },
  },
}
const VALID_CREDITS_BODY = { data: { total: 50, used: 15, remaining: 35 } }

let configDir: string
let origFetch: typeof fetch

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'of-orq-'))
  mkdirSync(join(configDir, 'plugins'), { recursive: true })
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ providers: [{ id: 'prov-or', name: 'OpenRouter', url: 'https://openrouter.ai/api/v1' }] }),
    'utf8',
  )
  origFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = origFetch
  rmSync(configDir, { recursive: true, force: true })
})

describe('register()', () => {
  it('registers the quota provider when openfox-quota exposes registerQuotaProvider', async () => {
    const { registry, logs, getProvider } = makeRegistry({ configDir })
    await register(registry)
    const p = getProvider()
    expect(p).toBeDefined()
    expect(p?.id).toBe('openrouter-quota')
    expect(logs.some((l) => l.msg.includes('not detected'))).toBe(false)
  })

  it('logs a warning and does not crash when registerQuotaProvider is absent', async () => {
    const { registry, logs } = makeRegistry({ configDir, withQuota: false })
    await expect(register(registry)).resolves.toBeUndefined()
    expect(logs.some((l) => l.level === 'warn' && l.msg.includes('not detected'))).toBe(true)
  })

  it('does not crash when auto-assignment cannot load openfox-quota module', async () => {
    const { registry } = makeRegistry({ configDir })
    await expect(register(registry)).resolves.toBeUndefined()
  })
})

describe('getQuota() via registered provider', () => {
  async function getQuotaFromSettings(settings: Record<string, unknown>, handler: FetchHandler) {
    const { registry, logs, getProvider } = makeRegistry({ configDir, settings })
    const { impl, calls } = makeGlobalFetch(handler)
    globalThis.fetch = impl as unknown as typeof fetch
    try {
      await register(registry)
      const provider = getProvider()
      expect(provider).toBeDefined()
      const source = (await provider!.getQuota()) as QuotaSource
      return { source, calls, logs }
    } finally {
      globalThis.fetch = origFetch
    }
  }

  it('sends the bearer key, returns metrics, and never leaks the key (criterion 8)', async () => {
    const { source, calls, logs } = await getQuotaFromSettings(
      { apiKey: KEY },
      (url) => (url.endsWith('/key') ? jsonResponse(VALID_KEY_BODY) : jsonResponse(VALID_CREDITS_BODY)),
    )
    const keyCall = calls.find((c) => c.url.endsWith('/key'))
    expect(keyCall?.auth).toBe(`Bearer ${KEY}`)
    const serialized = JSON.stringify(source)
    expect(serialized).not.toContain(KEY)
    expect(logs.some((l) => l.msg.includes(KEY))).toBe(false)
  })

  it('handles a 401 on /key without throwing and reports the error (criterion 6)', async () => {
    const { source } = await getQuotaFromSettings({ apiKey: KEY }, () =>
      jsonResponse({ error: { message: 'Invalid API key' } }, 401),
    )
    expect(source.metrics).toEqual([])
    expect(source.description).toContain('401')
  })

  it('still returns key metrics when /credits fails (best-effort, criterion 5)', async () => {
    const { source } = await getQuotaFromSettings({ apiKey: KEY }, (url) =>
      url.endsWith('/key') ? jsonResponse(VALID_KEY_BODY) : jsonResponse({ error: { message: 'boom' } }, 500),
    )
    const labels = source.metrics.map((m) => m.label)
    expect(labels).toContain('Usage (daily)')
    expect(labels).not.toContain('Credits balance')
  })

  it('includes the credits balance when /credits succeeds (criterion 5)', async () => {
    const { source } = await getQuotaFromSettings({ apiKey: KEY }, (url) =>
      url.endsWith('/key') ? jsonResponse(VALID_KEY_BODY) : jsonResponse(VALID_CREDITS_BODY),
    )
    const labels = source.metrics.map((m) => m.label)
    expect(labels).toContain('Credits balance')
  })
})

describe('get_openrouter_quota tool', () => {
  async function runToolFromSettings(settings: Record<string, unknown>, handler: FetchHandler) {
    const { registry, getTool } = makeRegistry({ configDir, settings })
    const { impl, calls } = makeGlobalFetch(handler)
    globalThis.fetch = impl as unknown as typeof fetch
    try {
      await register(registry)
      const tool = getTool()
      expect(tool).toBeDefined()
      expect(tool!.name).toBe('get_openrouter_quota')
      const result = await tool!.execute({}, {})
      return { result, calls }
    } finally {
      globalThis.fetch = origFetch
    }
  }

  it('returns success with the report when data is produced', async () => {
    const { result } = await runToolFromSettings(
      { apiKey: KEY },
      (url) => (url.endsWith('/key') ? jsonResponse(VALID_KEY_BODY) : jsonResponse(VALID_CREDITS_BODY)),
    )
    expect(result.success).toBe(true)
    expect(result.output).toContain('Usage (daily)')
    expect(result.output).toContain('Credits balance')
  })

  it('returns success:false with an error when no API key is configured', async () => {
    const savedEnv = process.env['OPENROUTER_API_KEY']
    delete process.env['OPENROUTER_API_KEY']
    try {
      const { result } = await runToolFromSettings({}, (url) =>
        url.endsWith('/key') ? jsonResponse(VALID_KEY_BODY) : jsonResponse(VALID_CREDITS_BODY),
      )
      expect(result.success).toBe(false)
      expect(result.error).toContain('No OpenRouter API key')
      expect(result.output).toBeUndefined()
    } finally {
      if (savedEnv === undefined) delete process.env['OPENROUTER_API_KEY']
      else process.env['OPENROUTER_API_KEY'] = savedEnv
    }
  })

  it('returns success:false with an error when the OpenRouter fetch fails (401)', async () => {
    const { result } = await runToolFromSettings({ apiKey: KEY }, () =>
      jsonResponse({ error: { message: 'Invalid API key' } }, 401),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('401')
    expect(result.output).toBeUndefined()
  })

  it('returns success:false with an error when the provider is disabled', async () => {
    const { result } = await runToolFromSettings({ apiKey: KEY, enabled: false }, (url) =>
      url.endsWith('/key') ? jsonResponse(VALID_KEY_BODY) : jsonResponse(VALID_CREDITS_BODY),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('disabled')
  })
})
