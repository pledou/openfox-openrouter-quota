# AGENTS.md — openfox-openrouter-quota

Paths relative to `openfox-openrouter-quota/`.

## Purpose

OpenFox plugin that reports **OpenRouter usage & quotas** into the `openfox-quota`
panel, using the API key of the OpenRouter provider. It registers a `QuotaProvider`
(credits balance, per-key credit limit, effective budget, daily/weekly/monthly
usage, free-model daily request caps) and auto-assigns the source to the OpenRouter
provider found in OpenFox `config.json`.

## Stack

- TypeScript, ESM, tsup, vitest 3.x
- peer (runtime, in-process): `openfox-quota` (optional, for registration + assignment)
- OpenRouter API: `GET /api/v1/key`, `GET /api/v1/credits`

## Commands

```bash
npm run build      # tsup
npm test           # vitest run --passWithNoTests
npm run typecheck  # tsc --noEmit
```

## Project Map

```
src/
├── index.ts            # register()/deactivate(), QuotaProvider, auto-assign wiring, tool
├── types.ts            # local structural types (QuotaMetric/QuotaSource/PluginRegistry…)
├── config-provider.ts  # findOpenRouterProvider(), readOpenFoxConfig()
├── key-resolver.ts     # resolveOpenRouterApiKey() (settings -> env -> config.json)
├── openrouter-client.ts# fetchKeyInfo(), fetchCredits() (never throw, key never logged)
├── metrics-mapper.ts   # mapKeyInfoToMetrics(), mapCreditsToMetric()
└── auto-assign.ts      # buildAssignment(), autoAssignOpenRouterQuota()
```

## Where to Look What

- **Add a new quota metric** → `src/metrics-mapper.ts`
- **Change key resolution order** → `src/key-resolver.ts`
- **Change OpenRouter endpoints / error handling** → `src/openrouter-client.ts`
- **Change auto-assignment** → `src/auto-assign.ts` + `loadQuotaModule()` in `src/index.ts`
- **Add a setting** → `src/index.ts` (registerSettings fields)

## Conventions

- `apiVersion: 2`, ESM build only via tsup
- API key is sent only in the `Authorization: Bearer` header; never logged, never
  placed in metric labels/subtitles/descriptions.
- All OpenRouter fetches are resilient: they return a `FetchResult` (never throw).
- No build-time dependency on `openfox-quota`; it is loaded in-process at runtime.

## Cross-Project Dependencies

**Consumes (runtime, optional)**: `openfox-quota` — `registerQuotaProvider` on the
registry and `assignQuotaProvider`/`quotaManager.assignProvider` for auto-assignment.

**Touchpoints**:

- Registration: `registry.registerQuotaProvider` (added by openfox-quota)
- Assignment: `openfox-quota/dist/index.js` (loaded via dynamic `import`)

## Known Gotchas

- `dist/index.js` is the entry point loaded by OpenFox, not `src/`.
- Auto-assignment runs once at plugin registration (best-effort). Providers added or
  changed in `config.json` after the plugin is loaded are not assigned until reload.
- Auto-assignment relies on the Node ESM module cache returning the same live
  `openfox-quota` instance; if it cannot be loaded, it logs a warning and continues.
- `resolveOpenRouterApiKey` priority: setting `apiKey` → `OPENROUTER_API_KEY` →
  OpenRouter provider `apiKey` in `config.json`.

## Do Not Read / Do Not Touch

- `node_modules/`, `dist/`, `.git/`

## Further Reading

- [README.md](README.md) — overview

---

> After any change affecting structure, a command, a convention, an inter-project
> contract, or a primary flow, update this file in the same commit. If any
> information here is inaccurate, fix it.
