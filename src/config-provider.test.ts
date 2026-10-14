import { describe, expect, it } from 'vitest'
import { findOpenRouterProvider } from './config-provider.js'

describe('findOpenRouterProvider', () => {
  it('finds a provider by url containing openrouter.ai', () => {
    const cfg = { providers: [{ id: 'a', name: 'My Router', url: 'https://openrouter.ai/api/v1', apiKey: 'k' }] }
    const p = findOpenRouterProvider(cfg)
    expect(p).toEqual({ id: 'a', name: 'My Router', apiKey: 'k' })
  })

  it('finds a provider by name containing openrouter', () => {
    const cfg = { providers: [{ id: 'b', name: 'OpenRouter', apiKey: 'k2' }] }
    const p = findOpenRouterProvider(cfg)
    expect(p?.id).toBe('b')
    expect(p?.apiKey).toBe('k2')
  })

  it('returns undefined when no OpenRouter provider exists', () => {
    const cfg = { providers: [{ id: 'c', name: 'Ollama', url: 'http://localhost:11434' }] }
    expect(findOpenRouterProvider(cfg)).toBeUndefined()
  })

  it('returns undefined for malformed config', () => {
    expect(findOpenRouterProvider(undefined)).toBeUndefined()
    expect(findOpenRouterProvider({})).toBeUndefined()
    expect(findOpenRouterProvider({ providers: 'nope' })).toBeUndefined()
    expect(findOpenRouterProvider({ providers: [null, 42, { name: 7 }] })).toBeUndefined()
  })
})
