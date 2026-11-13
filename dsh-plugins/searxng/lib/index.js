/**
 * SearXNG-backed search provider for the DeepSeek Harness web capability seam
 * (`ctx.web`). Registering it makes the native `web_search` tool query a
 * self-hosted SearXNG JSON endpoint instead of a vendor search API; `web_fetch`
 * is untouched.
 *
 * The provider is deliberately thin: SearXNG owns engine selection,
 * aggregation and ranking, this package only maps its JSON envelope onto the
 * seam's normalized `WebSearchResult`.
 *
 * @module dsh-web-search-searxng
 */
import z from '@deepseek-ai/schemastery'
import { WebError } from '@deepseek-ai/dsh-web'
import {
  DEFAULT_TIMEOUT_MS,
  SEARXNG_PROVIDER_ID,
  buildSearchURL,
  httpFailureMessage,
  mapSearxngResponse,
  normalizeBaseURL,
} from './mapping.js'

export {
  DEFAULT_TIMEOUT_MS,
  SEARXNG_PROVIDER_ID,
  buildSearchURL,
  httpFailureMessage,
  mapSearxngResponse,
  mapSearxngResult,
  normalizeBaseURL,
} from './mapping.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-searxng'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Attribution header sent on every request. */
const USER_AGENT = 'dsh-web-search-searxng/0.2.0'

/**
 * Plugin config. Every key is optional: without `baseURL` (or
 * `SEARXNG_BASE_URL` in the launching environment) the provider registers as
 * unavailable and the seam never selects it.
 */
export const Config = z.object({
  /** Instance root, e.g. `http://10.1.1.11:4002`; must expose `format=json`. */
  baseURL: z.string(),
  /** SearXNG `language` parameter, e.g. `de`, `de-DE`, `en-US`. */
  language: z.string(),
  /** Comma-separated engine allowlist, e.g. `duckduckgo,brave`. */
  engines: z.string(),
  /** Comma-separated category filter, e.g. `general,news,it`. */
  categories: z.string(),
  /** Recency filter: `day`, `week`, `month` or `year`. */
  timeRange: z.string(),
  /** `0` off, `1` moderate, `2` strict. */
  safeSearch: z.number().step(1).min(0).max(2),
  /** Authorization header value, verbatim, for an API gate in front of SearXNG. */
  authHeader: z.string().role('secret'),
  /** Per-request deadline in milliseconds. Defaults to 15000. */
  timeoutMs: z.number().step(1).min(1),
})

/**
 * The SearXNG-backed search provider. Every network and protocol failure is
 * surfaced as a `WebError` carrying a routable code, so `web_search` can show
 * the cause instead of a bare "fetch failed".
 */
export class SearxngSearchProvider {
  /** @type {string} */
  id = SEARXNG_PROVIDER_ID

  /**
   * @param {object} options - resolved provider options.
   * @param {string} options.baseURL - instance root.
   * @param {string} [options.language] - SearXNG language parameter.
   * @param {string} [options.engines] - engine allowlist.
   * @param {string} [options.categories] - category filter.
   * @param {string} [options.timeRange] - recency filter.
   * @param {number} [options.safeSearch] - safesearch level.
   * @param {string} [options.authHeader] - authorization header value.
   * @param {number} [options.timeoutMs] - per-request deadline.
   */
  constructor(options) {
    this.baseURL = normalizeBaseURL(options.baseURL) ?? ''
    this.language = trimToUndefined(options.language)
    this.engines = trimToUndefined(options.engines)
    this.categories = trimToUndefined(options.categories)
    this.timeRange = trimToUndefined(options.timeRange)
    this.safeSearch =
      Number.isInteger(options.safeSearch) && options.safeSearch >= 0 && options.safeSearch <= 2
        ? options.safeSearch
        : undefined
    this.authHeader = trimToUndefined(options.authHeader)
    this.timeoutMs =
      Number.isInteger(options.timeoutMs) && options.timeoutMs > 0 ? options.timeoutMs : DEFAULT_TIMEOUT_MS
  }

  /**
   * Cheap local usability check; never touches the network.
   * @returns {boolean} whether a usable instance root is configured.
   */
  available() {
    return this.baseURL.length > 0
  }

  /**
   * Run one search through the instance's JSON API.
   * @param {{query: string, maxResults?: number}} request - the query; the
   *   seam enforces `maxResults` by truncating the returned sources.
   * @param {AbortSignal} [signal] - caller cancellation.
   * @returns {Promise<{sources: Array<object>, content?: string, truncated: boolean}>}
   */
  async search(request, signal) {
    const url = buildSearchURL(this.baseURL, {
      query: request.query,
      language: this.language,
      engines: this.engines,
      categories: this.categories,
      timeRange: this.timeRange,
      safeSearch: this.safeSearch,
    })
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs)
    const combined = signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal])

    let response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': USER_AGENT,
          ...(this.authHeader === undefined ? {} : { authorization: this.authHeader }),
        },
        signal: combined,
      })
    } catch (error) {
      if (signal?.aborted === true) {
        throw new WebError('SearXNG search was cancelled', 'WEB_ABORTED', { cause: error })
      }
      if (timeoutSignal.aborted === true) {
        throw new WebError(
          `SearXNG did not answer within ${this.timeoutMs} ms (${this.baseURL}). Raise timeoutMs in the web-search-searxng config, or check that the instance is reachable`,
          'WEB_PROVIDER_ERROR',
          { cause: error },
        )
      }
      throw new WebError(
        `SearXNG request to ${this.baseURL} failed: ${describe(error)}. Check that the instance is running and reachable from the DSH host`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }

    if (!response.ok) throw new WebError(httpFailureMessage(response.status, this.baseURL), 'WEB_PROVIDER_ERROR')

    try {
      return mapSearxngResponse(await response.json())
    } catch (error) {
      if (signal?.aborted === true) {
        throw new WebError('SearXNG search was cancelled', 'WEB_ABORTED', { cause: error })
      }
      if (timeoutSignal.aborted === true) {
        throw new WebError(
          `SearXNG did not finish its response within ${this.timeoutMs} ms (${this.baseURL})`,
          'WEB_PROVIDER_ERROR',
          { cause: error },
        )
      }
      throw new WebError(
        `SearXNG returned an unprocessable response body from ${this.baseURL}: ${describe(error)}. Does the instance enable "json" in search.formats?`,
        'WEB_PROVIDER_ERROR',
        { cause: error },
      )
    }
  }
}

/**
 * Register the SearXNG provider with `ctx.web`.
 * @param {import('@deepseek-ai/cordis').Context} ctx - the plugin context.
 * @param {object} config - the resolved plugin config.
 */
export function apply(ctx, config) {
  ctx.web.registerSearchProvider(
    new SearxngSearchProvider({
      baseURL: config.baseURL ?? process.env.SEARXNG_BASE_URL ?? '',
      language: config.language,
      engines: config.engines,
      categories: config.categories,
      timeRange: config.timeRange,
      safeSearch: config.safeSearch,
      authHeader: config.authHeader,
      timeoutMs: config.timeoutMs,
    }),
  )
}

/** `value` without surrounding whitespace when non-blank, else `undefined`. */
function trimToUndefined(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

/** Compact one error for a user-facing message. */
function describe(error) {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : ''
    return `${error.message}${cause}`
  }
  return String(error)
}
