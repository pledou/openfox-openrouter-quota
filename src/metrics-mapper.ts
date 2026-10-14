import type { QuotaMetric } from './types.js'

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function nextUtcMidnightISO(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)).toISOString()
}

/**
 * Map a parsed `GET /api/v1/key` data object into quota metrics.
 * - usage_daily / usage_weekly / usage_monthly  -> currency (USD)
 * - limit + limit_remaining (per-key credit cap) -> token-balance (USD)
 * - free_model_daily_requests                    -> windowed (day, requests)
 * - effective_budget                             -> windowed or token-balance (USD)
 * Only finite, well-formed fields are emitted.
 */
export function mapKeyInfoToMetrics(key: Record<string, unknown>, now: Date = new Date()): QuotaMetric[] {
  const metrics: QuotaMetric[] = []

  const addCurrency = (label: string, amount: unknown): void => {
    if (isFiniteNumber(amount) && amount >= 0) {
      metrics.push({ kind: 'currency', label, amount, currency: 'USD' })
    }
  }

  addCurrency('Usage (daily)', key['usage_daily'])
  addCurrency('Usage (weekly)', key['usage_weekly'])
  addCurrency('Usage (monthly)', key['usage_monthly'])

  const limit = key['limit']
  const limitRemaining = key['limit_remaining']
  if (isFiniteNumber(limit) && isFiniteNumber(limitRemaining)) {
    metrics.push({ kind: 'token-balance', label: 'Key credit limit', total: limit, remaining: limitRemaining, currency: 'USD' })
  }

  const free = key['free_model_daily_requests']
  if (free && typeof free === 'object') {
    const f = free as Record<string, unknown>
    if (isFiniteNumber(f['limit']) && f['limit'] > 0) {
      metrics.push({
        kind: 'windowed',
        label: 'Free-model requests (daily)',
        used: isFiniteNumber(f['used']) ? f['used'] : 0,
        limit: f['limit'],
        window: 'day',
        unit: 'requests',
        resetsAt: nextUtcMidnightISO(now),
      })
    }
  }

  const budget = key['effective_budget']
  if (budget && typeof budget === 'object') {
    const b = budget as Record<string, unknown>
    if (isFiniteNumber(b['limit_usd'])) {
      const resetInterval = b['reset_interval']
      const resetsAt = typeof b['resets_at'] === 'string' ? b['resets_at'] : undefined
      const spend = isFiniteNumber(b['spend_usd']) ? b['spend_usd'] : 0
      const remaining = isFiniteNumber(b['remaining_usd']) ? b['remaining_usd'] : 0
      if (resetInterval === 'daily' || resetInterval === 'weekly' || resetInterval === 'monthly') {
        const window = resetInterval === 'daily' ? 'day' : resetInterval === 'weekly' ? 'week' : 'month'
        metrics.push({ kind: 'windowed', label: 'Effective budget', used: spend, limit: b['limit_usd'], window, unit: 'USD', resetsAt })
      } else {
        metrics.push({ kind: 'token-balance', label: 'Effective budget', total: b['limit_usd'], remaining, currency: 'USD' })
      }
    }
  }

  return metrics
}

/**
 * Map a parsed `GET /api/v1/credits` object into a single credit-balance
 * metric, or undefined when the shape is incomplete.
 */
export function mapCreditsToMetric(credits: { total?: number; used?: number; remaining?: number }): QuotaMetric | undefined {
  if (isFiniteNumber(credits.total) && isFiniteNumber(credits.remaining)) {
    return { kind: 'token-balance', label: 'Credits balance', total: credits.total, remaining: credits.remaining, currency: 'USD' }
  }
  return undefined
}
