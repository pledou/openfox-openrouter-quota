export type FetchResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number }

export interface Credits {
  total?: number
  used?: number
  remaining?: number
}

const BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_TIMEOUT_MS = 10000

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}

function safeJsonParse(text: string): Record<string, unknown> | undefined {
  try {
    const v = JSON.parse(text)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

async function doFetch(
  path: string,
  apiKey: string,
  fetchImpl: FetchLike,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<FetchResult<Record<string, unknown>>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(BASE_URL + path, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) {
      let msg = `HTTP ${res.status}`
      try {
        const body = typeof res.text === 'function' ? await res.text() : ''
        const parsed = body ? safeJsonParse(body) : undefined
        const errObj = parsed && typeof parsed['error'] === 'object' && parsed['error'] !== null
          ? (parsed['error'] as Record<string, unknown>)
          : parsed
        const errMsg = errObj ? errObj['message'] : undefined
        if (typeof errMsg === 'string' && errMsg.trim()) msg = `${msg}: ${truncate(errMsg.trim(), 140)}`
      } catch {
        // keep generic message
      }
      return { ok: false, error: msg, status: res.status }
    }
    const body = (await res.json()) as Record<string, unknown>
    const data = body && typeof body === 'object' && typeof body['data'] === 'object' && body['data'] !== null
      ? (body['data'] as Record<string, unknown>)
      : body
    return { ok: true, data }
  } catch (e) {
    const name = e instanceof Error ? e.name : ''
    const detail = e instanceof Error && e.message ? e.message : String(e)
    const msg = name === 'AbortError' ? 'request timed out' : `network error: ${detail}`
    return { ok: false, error: truncate(msg, 160) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch current API key info from OpenRouter (usage, limits, budgets,
 * free-model request caps). Never throws; returns a FetchResult.
 * The API key is only sent in the Authorization header and is never logged.
 */
export async function fetchKeyInfo(
  apiKey: string,
  fetchImpl?: FetchLike,
  timeoutMs?: number,
): Promise<FetchResult<Record<string, unknown>>> {
  return doFetch('/key', apiKey, fetchImpl ?? ((globalThis as any).fetch as FetchLike), timeoutMs)
}

/**
 * Fetch the account credit balance from OpenRouter. Never throws.
 */
export async function fetchCredits(
  apiKey: string,
  fetchImpl?: FetchLike,
  timeoutMs?: number,
): Promise<FetchResult<Credits>> {
  const res = await doFetch('/credits', apiKey, fetchImpl ?? ((globalThis as any).fetch as FetchLike), timeoutMs)
  if (res.ok) {
    const d = res.data
    return {
      ok: true,
      data: {
        total: isFiniteNumber(d['total']) ? d['total'] : undefined,
        used: isFiniteNumber(d['used']) ? d['used'] : undefined,
        remaining: isFiniteNumber(d['remaining']) ? d['remaining'] : undefined,
      },
    }
  }
  return { ok: false, error: res.error, status: res.status }
}
