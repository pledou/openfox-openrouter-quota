import { describe, expect, it, vi } from 'vitest'
import { autoAssignOpenRouterQuota, buildAssignment, SOURCE_ID } from './auto-assign.js'

const CFG = { providers: [{ id: 'prov-or', name: 'OpenRouter', apiKey: 'k' }] }

describe('buildAssignment', () => {
  it('builds a deterministic assignment with a default provider name', () => {
    expect(buildAssignment('prov-or')).toEqual({ sourceId: SOURCE_ID, providerId: 'prov-or', providerName: 'OpenRouter' })
  })

  it('uses the provided provider name when given', () => {
    expect(buildAssignment('prov-or', 'My OpenRouter')).toEqual({
      sourceId: SOURCE_ID,
      providerId: 'prov-or',
      providerName: 'My OpenRouter',
    })
  })

  it('is deterministic for the same providerId (idempotent input)', () => {
    expect(buildAssignment('prov-or')).toEqual(buildAssignment('prov-or'))
  })
})

describe('autoAssignOpenRouterQuota', () => {
  it('assigns to the OpenRouter provider found in config', async () => {
    const assign = vi.fn()
    await autoAssignOpenRouterQuota({ configDir: '/x', assign, readConfig: () => CFG })
    expect(assign).toHaveBeenCalledTimes(1)
    expect(assign).toHaveBeenCalledWith({ sourceId: SOURCE_ID, providerId: 'prov-or', providerName: 'OpenRouter' })
  })

  it('is idempotent: repeated calls produce identical assignments (no duplicates)', async () => {
    const assignments: unknown[] = []
    const assign = vi.fn((a: { sourceId: string }) => {
      // Simulate openfox-quota manager dedup by sourceId.
      const idx = assignments.findIndex((x) => (x as { sourceId: string }).sourceId === a.sourceId)
      if (idx >= 0) assignments[idx] = a
      else assignments.push(a)
    })
    await autoAssignOpenRouterQuota({ configDir: '/x', assign, readConfig: () => CFG })
    await autoAssignOpenRouterQuota({ configDir: '/x', assign, readConfig: () => CFG })
    expect(assign).toHaveBeenCalledTimes(2)
    expect(assignments).toHaveLength(1)
  })

  it('warns and does not assign when no OpenRouter provider is found', async () => {
    const assign = vi.fn()
    const warn = vi.fn()
    await autoAssignOpenRouterQuota({
      configDir: '/x',
      assign,
      warn,
      readConfig: () => ({ providers: [{ id: 'a', name: 'Ollama' }] }),
    })
    expect(assign).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('No OpenRouter provider')
  })

  it('warns and does not assign when config read fails', async () => {
    const assign = vi.fn()
    const warn = vi.fn()
    await autoAssignOpenRouterQuota({
      configDir: '/x',
      assign,
      warn,
      readConfig: () => {
        throw new Error('ENOENT')
      },
    })
    expect(assign).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
