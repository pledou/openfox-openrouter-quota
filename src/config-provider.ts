import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface OpenFoxOpenRouterProvider {
  id: string
  name: string
  apiKey?: string
}

/**
 * Find the OpenRouter provider in a parsed OpenFox config object.
 * A provider is considered OpenRouter if its url contains "openrouter.ai"
 * or its name contains "openrouter".
 */
export function findOpenRouterProvider(parsedConfig: unknown): OpenFoxOpenRouterProvider | undefined {
  if (!parsedConfig || typeof parsedConfig !== 'object') return undefined
  const providers = (parsedConfig as Record<string, unknown>)['providers']
  if (!Array.isArray(providers)) return undefined
  for (const p of providers) {
    if (!p || typeof p !== 'object') continue
    const obj = p as Record<string, unknown>
    const url = typeof obj['url'] === 'string' ? obj['url'].toLowerCase() : ''
    const name = typeof obj['name'] === 'string' ? obj['name'].toLowerCase() : ''
    if (url.includes('openrouter.ai') || name.includes('openrouter')) {
      return {
        id: typeof obj['id'] === 'string' ? obj['id'] : '',
        name: typeof obj['name'] === 'string' ? obj['name'] : 'OpenRouter',
        apiKey: typeof obj['apiKey'] === 'string' ? obj['apiKey'] : undefined,
      }
    }
  }
  return undefined
}

/**
 * Read and parse `<configDir>/config.json`. Returns undefined on any error.
 */
export function readOpenFoxConfig(configDir: string): unknown {
  try {
    const raw = readFileSync(join(configDir, 'config.json'), 'utf8')
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}
