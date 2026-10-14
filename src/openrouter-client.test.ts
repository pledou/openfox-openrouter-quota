import { describe, expect, it } from 'vitest'
import { fetchKeyInfo, fetchCredits } from './openrouter-client.js'

const KEY = 'sk-or-v1-SECRET-TEST-KEY'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

interface Call {
  url: string
  auth?: string
}

function makeFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url, auth: headers['Authorization'] })
    return handler(url, init)
  }
  return { fetchImpl, calls }
}

describe('fetchKeyInfo', () => {
  it('sends the Authorization bearer header and unwraps data', async () => {
    const { fetchImpl, calls } = makeFetch(() =>
      jsonResponse({ data: { usage_daily: 1, usage_weekly: 2, usage_monthly: 3 } }),
    )
    const res = await fetchKeyInfo(KEY, fetchImpl)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data).toEqual({ usage_daily: 1, usage_weekly: 2, usage_monthly: 3 })
    }
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/key')
    expect(calls[0].auth).toBe(`Bearer ${KEY}`)
  })

  it('returns a non-throwing failure result on HTTP 401', async () => {
    const { fetchImpl } = makeFetch(() => jsonResponse({ error: { message: 'Invalid API key' } }, 401))
    const res = await fetchKeyInfo(KEY, fetchImpl)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.status).toBe(401)
      expect(res.error).toContain('401')
      expect(res.error).not.toContain(KEY)
    }
  })

  it('returns a non-throwing failure result on HTTP 404', async () => {
    const { fetchImpl } = makeFetch(() => jsonResponse({ error: { message: 'Not found' } }, 404))
    const res = await fetchKeyInfo(KEY, fetchImpl)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.status).toBe(404)
  })

  it('returns a non-throwing failure result on network error', async () => {
    const fetchImpl = async () => {
      throw new Error('ECONNREFUSED')
    }
    const res = await fetchKeyInfo(KEY, fetchImpl)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('network error')
  })

  it('returns a non-throwing timeout result when the request is aborted', async () => {
    const fetchImpl = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal
        if (!signal) return
        if (signal.aborted) {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          return
        }
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    const res = await fetchKeyInfo(KEY, fetchImpl, 20)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('request timed out')
  })
})

describe('fetchCredits', () => {
  it('maps total/used/remaining from the credits endpoint', async () => {
    const { fetchImpl, calls } = makeFetch(() => jsonResponse({ data: { total: 50, used: 15.4, remaining: 34.6 } }))
    const res = await fetchCredits(KEY, fetchImpl)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.data).toEqual({ total: 50, used: 15.4, remaining: 34.6 })
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/credits')
  })

  it('returns a non-throwing failure result when the credits call fails', async () => {
    const { fetchImpl } = makeFetch(() => jsonResponse({ error: { message: 'no' } }, 500))
    const res = await fetchCredits(KEY, fetchImpl)
    expect(res.ok).toBe(false)
  })

  it('never leaks the key in error output', async () => {
    const { fetchImpl } = makeFetch(() => jsonResponse({ error: { message: 'bad key' } }, 401))
    const res = await fetchCredits(KEY, fetchImpl)
    expect(JSON.stringify(res)).not.toContain(KEY)
  })
})
