/**
 * SearXNG-backed search provider for the DeepSeek Harness web capability seam
 * (`ctx.web`). Registering it makes the native `web_search` tool query a
 * self-hosted SearXNG instance's JSON API instead of a vendor search endpoint.
 */
import { type Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'

export { DEFAULT_TIMEOUT_MS, SEARXNG_PROVIDER_ID } from './mapping.js'
export { buildSearchURL, httpFailureMessage, mapSearxngResponse, mapSearxngResult, normalizeBaseURL } from './mapping.js'

/** Cordis plugin name used by loader diagnostics. */
export declare const name: 'web-search-searxng'

/** The web seam this provider registers into. */
export declare const inject: string[]

/** Plugin config; every key is optional. */
export interface Config {
  /** Instance root, e.g. `http://10.1.1.11:4002`; must expose `format=json`. */
  baseURL?: string
  /** SearXNG `language` parameter, e.g. `de`, `de-DE`, `en-US`. */
  language?: string
  /** Comma-separated engine allowlist, e.g. `duckduckgo,brave`. */
  engines?: string
  /** Comma-separated category filter, e.g. `general,news,it`. */
  categories?: string
  /** Recency filter: `day`, `week`, `month` or `year`. */
  timeRange?: string
  /** `0` off, `1` moderate, `2` strict. */
  safeSearch?: number
  /** Authorization header value, verbatim, for an API gate in front of SearXNG. */
  authHeader?: string
  /** Per-request deadline in milliseconds. Defaults to 15000. */
  timeoutMs?: number
}

export declare const Config: z<Config, Config, 'plain'>

/** Resolved constructor options for {@link SearxngSearchProvider}. */
export type SearxngSearchProviderOptions = Config

/** A `WebSearchProvider` backed by a SearXNG instance's JSON API. */
export declare class SearxngSearchProvider implements WebSearchProvider {
  readonly id: 'searxng'
  constructor(options: SearxngSearchProviderOptions)
  /** Cheap local check: a valid http(s) instance root is configured. */
  available(): boolean
  /** Run one search; honors `signal` and the configured `timeoutMs`. */
  search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>
}

/** Register the SearXNG search provider with `ctx.web`. */
export declare function apply(ctx: Context, config: Config): void
