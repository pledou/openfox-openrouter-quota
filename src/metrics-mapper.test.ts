import { describe, expect, it } from 'vitest'
import { mapKeyInfoToMetrics, mapCreditsToMetric } from './metrics-mapper.js'
import type { QuotaMetric } from './types.js'

const NOW = new Date(Date.UTC(2026, 9, 14, 10, 30, 0)) // 2026-10-14T10:30:00Z

describe('mapKeyInfoToMetrics', () => {
  it('maps daily/weekly/monthly usage to currency (USD) metrics', () => {
    const m = mapKeyInfoToMetrics(
      { usage_daily: 1.25, usage_weekly: 3.5, usage_monthly: 12.75 },
      NOW,
    )
    const currency = m.filter((x) => x.kind === 'currency') as Extract<QuotaMetric, { kind: 'currency' }>[]
    expect(currency).toHaveLength(3)
    expect(currency.map((c) => c.label)).toEqual(['Usage (daily)', 'Usage (weekly)', 'Usage (monthly)'])
    expect(currency.map((c) => c.amount)).toEqual([1.25, 3.5, 12.75])
    expect(currency.every((c) => c.currency === 'USD')).toBe(true)
  })

  it('emits a token-balance metric for the per-key credit limit', () => {
    const m = mapKeyInfoToMetrics({ limit: 50, limit_remaining: 12.5 }, NOW)
    const tb = m.find((x) => x.kind === 'token-balance' && x.label === 'Key credit limit')
    expect(tb).toEqual({ kind: 'token-balance', label: 'Key credit limit', total: 50, remaining: 12.5, currency: 'USD' })
  })

  it('skips the key credit limit when limit is null (unlimited)', () => {
    const m = mapKeyInfoToMetrics({ limit: null, limit_remaining: null }, NOW)
    expect(m.find((x) => x.label === 'Key credit limit')).toBeUndefined()
  })

  it('maps free_model_daily_requests to a windowed day metric', () => {
    const m = mapKeyInfoToMetrics(
      { free_model_daily_requests: { used: 40, limit: 1000, remaining: 960 } },
      NOW,
    )
    const w = m.find((x) => x.kind === 'windowed' && x.label === 'Free-model requests (daily)') as Extract<
      QuotaMetric,
      { kind: 'windowed' }
    >
    expect(w).toBeDefined()
    expect(w.used).toBe(40)
    expect(w.limit).toBe(1000)
    expect(w.window).toBe('day')
    expect(w.unit).toBe('requests')
    expect(w.resetsAt).toBe('2026-10-15T00:00:00.000Z')
  })

  it('maps a weekly effective_budget to a windowed week metric', () => {
    const m = mapKeyInfoToMetrics(
      {
        effective_budget: {
          limit_usd: 100,
          spend_usd: 40,
          remaining_usd: 60,
          reset_interval: 'weekly',
          resets_at: '2026-10-19T00:00:00.000Z',
        },
      },
      NOW,
    )
    const w = m.find((x) => x.kind === 'windowed' && x.label === 'Effective budget') as Extract<QuotaMetric, { kind: 'windowed' }>
    expect(w).toBeDefined()
    expect(w.used).toBe(40)
    expect(w.limit).toBe(100)
    expect(w.window).toBe('week')
    expect(w.unit).toBe('USD')
    expect(w.resetsAt).toBe('2026-10-19T00:00:00.000Z')
  })

  it('maps a lifetime effective_budget (null reset_interval) to a token-balance metric', () => {
    const m = mapKeyInfoToMetrics(
      { effective_budget: { limit_usd: 200, spend_usd: 10, remaining_usd: 190, reset_interval: null } },
      NOW,
    )
    const tb = m.find((x) => x.kind === 'token-balance' && x.label === 'Effective budget')
    expect(tb).toEqual({ kind: 'token-balance', label: 'Effective budget', total: 200, remaining: 190, currency: 'USD' })
  })

  it('ignores malformed / non-finite fields', () => {
    const m = mapKeyInfoToMetrics(
      {
        usage_daily: 'not-a-number',
        usage_weekly: NaN,
        usage_monthly: -1,
        limit: 'x',
        free_model_daily_requests: { used: 1, limit: 0 },
        effective_budget: { limit_usd: 'nope' },
      },
      NOW,
    )
    expect(m).toHaveLength(0)
  })

  it('produces no metrics for an empty object', () => {
    expect(mapKeyInfoToMetrics({}, NOW)).toEqual([])
  })
})

describe('mapCreditsToMetric', () => {
  it('maps a full credits balance to a token-balance USD metric', () => {
    const m = mapCreditsToMetric({ total: 50, used: 15.4, remaining: 34.6 })
    expect(m).toEqual({ kind: 'token-balance', label: 'Credits balance', total: 50, remaining: 34.6, currency: 'USD' })
  })

  it('returns undefined when total or remaining is missing', () => {
    expect(mapCreditsToMetric({ total: 50 })).toBeUndefined()
    expect(mapCreditsToMetric({ remaining: 34.6 })).toBeUndefined()
    expect(mapCreditsToMetric({})).toBeUndefined()
  })
})
