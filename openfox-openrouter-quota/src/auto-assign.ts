import { findOpenRouterProvider, readOpenFoxConfig } from './config-provider.js'
import type { QuotaProviderAssignment } from './types.js'

export const SOURCE_ID = 'openrouter-quota'
export const PROVIDER_NAME = 'OpenRouter'

/**
 * Build the deterministic assignment linking our quota source to an OpenRouter
 * provider. Deterministic for a given providerId, which makes repeated calls
 * idempotent (openfox-quota's manager dedups by sourceId).
 */
export function buildAssignment(providerId: string, providerName?: string): QuotaProviderAssignment {
  return { sourceId: SOURCE_ID, providerId, providerName: providerName ?? PROVIDER_NAME }
}

export type AssignFn = (assignment: QuotaProviderAssignment) => void | Promise<void>

export interface AutoAssignDeps {
  configDir: string
  assign: AssignFn
  warn?: (message: string) => void
  readConfig?: (configDir: string) => unknown
}

/**
 * Auto-assign the OpenRouter quota source to the OpenRouter provider found in
 * OpenFox config.json. Logs a warning (does not throw) when no provider is found.
 */
export async function autoAssignOpenRouterQuota(deps: AutoAssignDeps): Promise<void> {
  const read = deps.readConfig ?? readOpenFoxConfig
  let parsed: unknown
  try {
    parsed = read(deps.configDir)
  } catch {
    parsed = undefined
  }
  const provider = findOpenRouterProvider(parsed)
  if (!provider || !provider.id) {
    deps.warn?.('No OpenRouter provider found in OpenFox config.json; skipping quota auto-assignment.')
    return
  }
  await deps.assign(buildAssignment(provider.id, provider.name))
}
