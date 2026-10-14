# openfox-openrouter-quota

OpenRouter **Usage & Quotas** provider for OpenFox.

It plugs into the [`openfox-quota`](https://github.com/JamesDAdams/openfox-quota)
"Usage & Quotas" panel and reports, for the API key of your **OpenRouter** provider:

- **Credits balance** (account total / remaining, USD)
- **Per-key credit limit** (`limit` / `limit_remaining`, when a cap is set)
- **Effective budget** (org guardrail / workspace / key budget) — windowed or lifetime
- **Usage** by day / week / month (USD)
- **Free-model daily request cap** (`free_model_daily_requests`)

The OpenRouter provider only needs to exist in OpenFox (any provider whose `url` or
`name` references OpenRouter). No separate provider implementation is required — this
plugin reads the existing provider's API key.

## How it works

- On registration it exposes a `QuotaProvider` (`id: openrouter-quota`) through
  `registry.registerQuotaProvider` (provided by `openfox-quota`).
- It resolves the API key in this order:
  1. the plugin's `apiKey` setting (password field)
  2. the `OPENROUTER_API_KEY` environment variable
  3. the `apiKey` of the OpenRouter provider in OpenFox `config.json`
- It fetches `GET /api/v1/key` and `GET /api/v1/credits` (Bearer auth), maps the
  response to quota metrics, and refreshes with the quota panel / on demand.
- It auto-assigns the quota source to the OpenRouter provider so the gauges/badges
  appear on that provider. This is idempotent and best-effort. Note: the assignment
  runs once at plugin registration — if an OpenRouter provider is added or changed in
  OpenFox after the plugin is already loaded, restart (or reload) OpenFox for the
  assignment to run again.

## Install

```bash
# into OpenFox's plugins directory
npm install openfox-openrouter-quota
# or: copy the built dist/ into ~/.config/openfox/plugins/openfox-openrouter-quota/
```

Requires the `openfox-quota` plugin to be installed for the UI. If it is not
present, this plugin logs a warning and does nothing (no crash).

## Usage

1. Enable the **OpenRouter Quota** plugin in OpenFox.
2. Make sure an OpenRouter provider is configured (with its API key), or set
   `OPENROUTER_API_KEY`, or fill the plugin's **OpenRouter API key** setting.
3. Open **Usage & Quotas** in the header — the OpenRouter section shows your
   credits, limits, budgets, usage, and free-model caps.
4. Use the tool `get_openrouter_quota` to fetch the current report from the agent.

## Security

The API key is only sent in the `Authorization: Bearer` header. It is never written
to logs and never appears in metric labels, subtitles, or descriptions.

## Development

```bash
npm install
npm run build      # tsup -> dist/
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

## License

MIT
