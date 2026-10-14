import { describe, expect, it } from 'vitest'
import { resolveOpenRouterApiKey } from './key-resolver.js'

describe('resolveOpenRouterApiKey', () => {
  it('prefers the plugin setting when present', () => {
    const res = resolveOpenRouterApiKey({
      settings: { apiKey: 'sk-set' },
      env: { OPENROUTER_API_KEY: 'sk-env' },
      readConfig: () => ({ providers: [{ id: 'p1', name: 'OpenRouter', apiKey: 'sk-cfg' }] }),
      configDir: '/x',
    })
    expect(res).toEqual({ apiKey: 'sk-set', source: 'settings' })
  })

  it('falls back to OPENROUTER_API_KEY env when no setting', () => {
    const res = resolveOpenRouterApiKey({
      settings: {},
      env: { OPENROUTER_API_KEY: 'sk-env' },
      readConfig: () => ({ providers: [{ id: 'p1', name: 'OpenRouter', apiKey: 'sk-cfg' }] }),
      configDir: '/x',
    })
    expect(res).toEqual({ apiKey: 'sk-env', source: 'env' })
  })

  it('falls back to the OpenRouter provider in config.json', () => {
    const res = resolveOpenRouterApiKey({
      settings: {},
      env: {},
      readConfig: () => ({ providers: [{ id: 'p1', name: 'OpenRouter', apiKey: 'sk-cfg' }] }),
      configDir: '/x',
    })
    expect(res).toEqual({ apiKey: 'sk-cfg', source: 'config' })
  })

  it('returns none when no source is available', () => {
    const res = resolveOpenRouterApiKey({
      settings: {},
      env: {},
      readConfig: () => ({ providers: [{ id: 'p1', name: 'Ollama' }] }),
      configDir: '/x',
    })
    expect(res).toEqual({ apiKey: undefined, source: 'none' })
  })

  it('ignores empty/whitespace setting and env values', () => {
    const res = resolveOpenRouterApiKey({
      settings: { apiKey: '   ' },
      env: { OPENROUTER_API_KEY: '' },
      readConfig: () => ({ providers: [{ id: 'p1', name: 'OpenRouter', apiKey: 'sk-cfg' }] }),
      configDir: '/x',
    })
    expect(res).toEqual({ apiKey: 'sk-cfg', source: 'config' })
  })

  it('does not throw when readConfig throws', () => {
    const res = resolveOpenRouterApiKey({
      settings: {},
      env: {},
      readConfig: () => {
        throw new Error('boom')
      },
      configDir: '/x',
    })
    expect(res).toEqual({ apiKey: undefined, source: 'none' })
  })
})
