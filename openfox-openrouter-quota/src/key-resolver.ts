import { findOpenRouterProvider } from './config-provider.js'

export interface ResolveKeyOptions {
  settings?: Record<string, unknown>
  env?: NodeJS.ProcessEnv
  readConfig?: (configDir: string) => unknown
  configDir?: string
}

export interface ResolvedKey {
  apiKey: string | undefined
  source: 'settings' | 'env' | 'config' | 'none'
}

/**
 * Resolve the OpenRouter API key with priority:
 *   1. plugin setting `apiKey` (if non-empty)
 *   2. environment variable OPENROUTER_API_KEY
 *   3. the OpenRouter provider's apiKey in OpenFox config.json
 * Returns source: 'none' when nothing is available.
 */
export function resolveOpenRouterApiKey(opts: ResolveKeyOptions): ResolvedKey {
  const settings = opts.settings ?? {}
  const fromSettings = typeof settings['apiKey'] === 'string' ? settings['apiKey'].trim() : ''
  if (fromSettings) return { apiKey: fromSettings, source: 'settings' }

  const env = opts.env ?? {}
  const fromEnv = typeof env['OPENROUTER_API_KEY'] === 'string' ? env['OPENROUTER_API_KEY'].trim() : ''
  if (fromEnv) return { apiKey: fromEnv, source: 'env' }

  if (opts.readConfig && opts.configDir) {
    try {
      const provider = findOpenRouterProvider(opts.readConfig(opts.configDir))
      if (provider?.apiKey) return { apiKey: provider.apiKey, source: 'config' }
    } catch {
      // ignore and fall through to 'none'
    }
  }

  return { apiKey: undefined, source: 'none' }
}
