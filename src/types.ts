// Local structural declarations mirroring the types exposed by the
// `openfox-quota` plugin and the OpenFox plugin host API. Declared locally so
// this plugin has no hard build-time dependency on openfox-quota.

export type LocalizedString = { en: string; fr: string }

export type PluginBadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export type MetricDisplayMode = 'gauge' | 'value'

export type QuotaMetric =
  | {
      kind: 'windowed'
      label: string
      used: number
      limit: number
      window: 'hour' | 'day' | 'week' | 'month'
      model?: string
      resetsAt?: string
      unit?: string
      subtitle?: LocalizedString
      icon?: string
      displayMode?: MetricDisplayMode
      formattedValue?: string | LocalizedString
    }
  | {
      kind: 'token-balance'
      label: string
      total: number
      remaining: number
      model?: string
      unit?: string
      currency?: string
      subtitle?: LocalizedString
      icon?: string
      displayMode?: MetricDisplayMode
      formattedValue?: string | LocalizedString
    }
  | {
      kind: 'currency'
      label: string
      amount: number
      currency?: string
      subtitle?: LocalizedString
      tone?: PluginBadgeTone
      model?: string
      icon?: string
      displayMode?: MetricDisplayMode
      formattedValue?: string | LocalizedString
    }

export interface QuotaSource {
  id: string
  name: string
  description?: string
  metrics: QuotaMetric[]
}

export interface QuotaProvider {
  readonly id: string
  readonly name: string
  getQuota(): Promise<QuotaSource> | QuotaSource
}

export interface QuotaProviderAssignment {
  sourceId: string
  providerId: string
  providerName?: string
  selectedModels?: string[]
  metricDisplayModes?: Record<string, MetricDisplayMode>
  unlinked?: boolean
}

export interface PluginSettingsField {
  key: string
  type: 'text' | 'password' | 'number' | 'boolean' | 'select' | 'textarea' | 'path'
  label: LocalizedString
  description?: LocalizedString
  default?: string | number | boolean
  options?: { value: string; label: LocalizedString }[]
  required?: boolean
  secret?: boolean
}

export interface PluginSettingsSchema {
  fields: PluginSettingsField[]
}

export interface PluginContext {
  readonly id: string
  readonly version: string
  readonly runtime: { mode: 'production' | 'development'; configDirectory: string }
  readonly logger: {
    debug(message: string, context?: Record<string, unknown>): void
    info(message: string, context?: Record<string, unknown>): void
    warn(message: string, context?: Record<string, unknown>): void
    error(message: string, context?: Record<string, unknown>): void
  }
  readonly storage: {
    get(key: string): unknown
    set(key: string, value: unknown): void
  }
  settings(scope?: 'global' | 'project', projectId?: string): Record<string, unknown>
  notify(request: {
    title: LocalizedString
    body?: LocalizedString
    level?: 'info' | 'success' | 'warning' | 'error'
    actions?: { label: LocalizedString; onActivate: { kind: string; panelId?: string; url?: string } }[]
  }): void
  publish(panelId: string | undefined, key: string, value: unknown): void
}

export interface PluginRegistry {
  readonly runtime: { mode: 'production' | 'development'; configDirectory: string }
  readonly context: PluginContext
  registerTool(tool: {
    name: string
    description: string
    parameters: Record<string, unknown>
    execute(args: Record<string, unknown>, context: Record<string, unknown>): Promise<{ success: boolean; output?: string; error?: string }>
  }): void
  registerSettings(schema: PluginSettingsSchema): void
  registerUiAction(action: unknown): void
  registerUiBadge(badge: unknown): void
  registerUiPanel(panel: unknown): void
  registerUiComponent(component: unknown): void
  registerHook(event: string, handler: (payload: unknown) => void | Promise<void>): void
  registerRpc(method: string, handler: (params: Record<string, unknown>, context: Record<string, unknown>) => unknown | Promise<unknown>): void
  registerAsset(relativePath: string): void
  registerQuotaProvider?(provider: QuotaProvider): void
}
