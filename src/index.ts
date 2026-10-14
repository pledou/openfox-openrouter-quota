import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PluginRegistry, QuotaProvider, QuotaProviderAssignment, QuotaSource } from './types.js'
import { readOpenFoxConfig } from './config-provider.js'
import { resolveOpenRouterApiKey } from './key-resolver.js'
import { fetchKeyInfo, fetchCredits } from './openrouter-client.js'
import { mapKeyInfoToMetrics, mapCreditsToMetric } from './metrics-mapper.js'
import { autoAssignOpenRouterQuota, PROVIDER_NAME, SOURCE_ID } from './auto-assign.js'

interface QuotaModule {
  assignQuotaProvider?: (assignment: QuotaProviderAssignment) => void
  quotaManager?: { assignProvider?: (assignment: QuotaProviderAssignment, context?: unknown) => void }
}

/**
 * Load the already-installed `openfox-quota` plugin module (in-process) so we
 * can assign our source to an OpenRouter provider. Returns undefined when the
 * plugin is not installed or cannot be loaded. Relies on the Node ESM module
 * cache to return the same live instance OpenFox loaded.
 */
async function loadQuotaModule(configDir: string): Promise<QuotaModule | undefined> {
  try {
    const p = join(configDir, 'plugins', 'openfox-quota', 'dist', 'index.js')
    return (await import(pathToFileURL(p).href)) as QuotaModule
  } catch {
    return undefined
  }
}

export async function register(registry: PluginRegistry): Promise<void> {
  const context = registry.context
  const configDir = context.runtime.configDirectory

  registry.registerSettings({
    fields: [
      {
        key: 'apiKey',
        label: { en: 'OpenRouter API key', fr: 'Clé API OpenRouter' },
        type: 'password',
        secret: true,
        default: '',
        description: {
          en: 'Optional override for the OpenRouter API key. If empty, the OPENROUTER_API_KEY environment variable or the OpenRouter provider key from OpenFox config.json is used.',
          fr: 'Substitution facultative de la clé API OpenRouter. Si vide, la variable d’environnement OPENROUTER_API_KEY ou la clé du provider OpenRouter de config.json est utilisée.',
        },
      },
      {
        key: 'enabled',
        label: { en: 'Enabled', fr: 'Activé' },
        type: 'boolean',
        default: true,
        description: {
          en: 'Enable the OpenRouter quota provider.',
          fr: 'Activer le fournisseur de quotas OpenRouter.',
        },
      },
    ],
  })

  const buildResult = async (): Promise<{ source: QuotaSource; error?: string }> => {
    const settings = context.settings() ?? {}
    if (settings['enabled'] === false) {
      return {
        source: { id: SOURCE_ID, name: PROVIDER_NAME, description: 'OpenRouter quota provider is disabled.', metrics: [] },
        error: 'OpenRouter quota provider is disabled.',
      }
    }
    const resolved = resolveOpenRouterApiKey({ settings, env: process.env, readConfig: readOpenFoxConfig, configDir })
    if (!resolved.apiKey) {
      const error =
        'No OpenRouter API key found. Set the plugin apiKey, the OPENROUTER_API_KEY environment variable, or configure an OpenRouter provider in OpenFox.'
      return {
        source: { id: SOURCE_ID, name: PROVIDER_NAME, description: error, metrics: [] },
        error,
      }
    }
    const keyRes = await fetchKeyInfo(resolved.apiKey)
    if (!keyRes.ok) {
      const error = `OpenRouter quota unavailable: ${keyRes.error}`
      return {
        source: { id: SOURCE_ID, name: PROVIDER_NAME, description: error, metrics: [] },
        error,
      }
    }
    const metrics = mapKeyInfoToMetrics(keyRes.data)
    const creditsRes = await fetchCredits(resolved.apiKey)
    if (creditsRes.ok) {
      const creditMetric = mapCreditsToMetric(creditsRes.data)
      if (creditMetric) metrics.push(creditMetric)
    }
    return { source: { id: SOURCE_ID, name: PROVIDER_NAME, description: 'Usage and quotas for your OpenRouter API key.', metrics } }
  }

  const provider: QuotaProvider = {
    id: SOURCE_ID,
    name: PROVIDER_NAME,
    getQuota: async () => (await buildResult()).source,
  }

  if (typeof registry.registerQuotaProvider === 'function') {
    registry.registerQuotaProvider(provider)
    context.logger.info('openfox-openrouter-quota: registered OpenRouter quota provider')
  } else {
    context.logger.warn(
      'openfox-openrouter-quota: openfox-quota plugin not detected (registerQuotaProvider unavailable); quota provider not registered.',
    )
  }

  const assignOpenRouter = async (assignment: QuotaProviderAssignment): Promise<void> => {
    const quotaMod = await loadQuotaModule(configDir)
    if (!quotaMod) {
      context.logger.warn('openfox-openrouter-quota: could not load openfox-quota module; skipping auto-assignment.')
      return
    }
    if (typeof quotaMod.assignQuotaProvider === 'function') {
      quotaMod.assignQuotaProvider(assignment)
      return
    }
    if (quotaMod.quotaManager && typeof quotaMod.quotaManager.assignProvider === 'function') {
      quotaMod.quotaManager.assignProvider(assignment)
      return
    }
    context.logger.warn('openfox-openrouter-quota: openfox-quota exposes no assignment API; skipping auto-assignment.')
  }

  await autoAssignOpenRouterQuota({
    configDir,
    assign: assignOpenRouter,
    warn: (msg) => context.logger.warn(`openfox-openrouter-quota: ${msg}`),
  })

  registry.registerTool({
    name: 'get_openrouter_quota',
    description: 'Fetch current OpenRouter usage and quotas (credits, key limits, budgets, free-model caps) for the configured API key.',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const { source, error } = await buildResult()
      if (error) return { success: false, error }
      return { success: true, output: JSON.stringify(source, null, 2) }
    },
  })

  context.logger.info('openfox-openrouter-quota initialized successfully')
}

export function deactivate(): void {
  // No persistent state to clean up.
}

export { SOURCE_ID, PROVIDER_NAME }
export { resolveOpenRouterApiKey } from './key-resolver.js'
export { findOpenRouterProvider, readOpenFoxConfig } from './config-provider.js'
export { fetchKeyInfo, fetchCredits } from './openrouter-client.js'
export { mapKeyInfoToMetrics, mapCreditsToMetric } from './metrics-mapper.js'
export { autoAssignOpenRouterQuota, buildAssignment } from './auto-assign.js'
