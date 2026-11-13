/**
 * Pure SearXNG wire-format helpers: base-URL validation, request-URL building,
 * response normalization, and human-readable HTTP failure text. No Cordis or
 * DSH imports live here so the logic stays unit-testable in plain Node.
 * @module dsh-web-search-searxng/mapping
 */

/** Stable provider id this package registers under. */
export const SEARXNG_PROVIDER_ID = 'searxng'

/** Default per-request deadline; the tool layer owns the outer search timeout. */
export const DEFAULT_TIMEOUT_MS = 15000

/**
 * Validate and normalize a SearXNG base URL.
 *
 * `URL.canParse` alone would accept `localhost:4002` (a valid URL with an
 * unusable `localhost:` scheme), so the scheme is checked explicitly. A query
 * or fragment cannot be part of a base URL because `/search` is appended to
 * the path and a fresh query string replaces the existing one.
 *
 * @param {unknown} value - candidate base URL.
 * @returns {string | undefined} the URL without trailing slashes, or
 *   `undefined` when it is missing or unusable.
 */
export function normalizeBaseURL(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return undefined
  const raw = value.trim()
  if (!URL.canParse(raw)) return undefined
  const url = new URL(raw)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  if (url.search.length > 0 || url.hash.length > 0) return undefined
  url.pathname = url.pathname.replace(/\/+$/u, '')
  return url.toString().replace(/\/+$/u, '')
}

/**
 * Build the JSON search endpoint for one query while preserving an optional
 * deployment sub-path (e.g. `http://host/searxng`).
 *
 * @param {string} baseURL - a URL accepted by {@link normalizeBaseURL}.
 * @param {object} options - per-request options.
 * @param {string} options.query - the search query.
 * @param {string} [options.language] - SearXNG `language`, e.g. `de` or `de-DE`.
 * @param {string} [options.engines] - comma-separated engine allowlist.
 * @param {string} [options.categories] - comma-separated category filter.
 * @param {string} [options.timeRange] - `day`, `week`, `month` or `year`.
 * @param {number} [options.safeSearch] - `0` off, `1` moderate, `2` strict.
 * @returns {string} the absolute request URL.
 */
export function buildSearchURL(baseURL, options) {
  const url = new URL(baseURL)
  url.pathname = `${url.pathname.replace(/\/+$/u, '')}/search`
  const params = url.searchParams
  params.set('q', options.query)
  params.set('format', 'json')
  if (nonEmpty(options.language) !== undefined) params.set('language', options.language)
  if (nonEmpty(options.engines) !== undefined) params.set('engines', options.engines)
  if (nonEmpty(options.categories) !== undefined) params.set('categories', options.categories)
  if (nonEmpty(options.timeRange) !== undefined) params.set('time_range', options.timeRange)
  if (Number.isInteger(options.safeSearch)) params.set('safesearch', String(options.safeSearch))
  url.hash = ''
  return url.toString()
}

/**
 * Map one SearXNG result to a normalized source. Entries without a URL are
 * dropped: the seam promises every source is citeable, and every other field
 * is optional there.
 *
 * @param {unknown} result - one entry of SearXNG's `results[]`.
 * @returns {{url: string, title?: string, snippet?: string, publishedAt?: string} | undefined}
 */
export function mapSearxngResult(result) {
  if (result === null || typeof result !== 'object') return undefined
  const url = nonEmpty(result.url)
  if (url === undefined) return undefined
  const source = { url }
  const title = nonEmpty(result.title)
  if (title !== undefined) source.title = title
  const snippet = nonEmpty(result.content)
  if (snippet !== undefined) source.snippet = snippet
  const publishedAt = nonEmpty(result.publishedDate)
  if (publishedAt !== undefined) source.publishedAt = publishedAt
  return source
}

/**
 * Normalize a SearXNG response envelope. Sources are deduplicated by URL
 * because metasearch can surface the same page through several engines;
 * `answers` become the optional provider `content` that `web_search` renders
 * ahead of the source list.
 *
 * @param {unknown} body - the parsed `GET /search?format=json` body.
 * @returns {{sources: Array<object>, content?: string, truncated: boolean}}
 */
export function mapSearxngResponse(body) {
  const results = body !== null && typeof body === 'object' && Array.isArray(body.results) ? body.results : []
  const seen = new Set()
  const sources = []
  for (const result of results) {
    const source = mapSearxngResult(result)
    if (source === undefined || seen.has(source.url)) continue
    seen.add(source.url)
    sources.push(source)
  }
  const answers =
    body !== null && typeof body === 'object' && Array.isArray(body.answers)
      ? body.answers.filter((answer) => nonEmpty(answer) !== undefined)
      : []
  return {
    sources,
    ...(answers.length > 0 ? { content: answers.join('\n\n') } : {}),
    truncated: false,
  }
}

/**
 * Human-readable failure text naming the two fixes a user can actually make:
 * HTTP 403 is nearly always an instance without `json` in `search.formats`,
 * and 429 is the instance's rate limiter.
 *
 * @param {number} status - the HTTP status code.
 * @param {string} baseURL - the instance the request went to.
 * @returns {string} the error message.
 */
export function httpFailureMessage(status, baseURL) {
  const at = baseURL.length > 0 ? ` at ${baseURL}` : ''
  if (status === 401 || status === 403) {
    return `SearXNG refused the request (HTTP ${status})${at}. Most likely the instance does not enable the JSON API: add "json" to search.formats in its settings.yml and restart it, or set authHeader when an API gate fronts the instance`
  }
  if (status === 429) {
    return `SearXNG instance rate limit hit (HTTP 429)${at}. Space out requests, or raise the limiter limits (limiter: false for a private instance)`
  }
  if (status === 404) {
    return `SearXNG returned HTTP 404${at}. Check baseURL: it must point at the instance root, not at /search`
  }
  return `SearXNG instance error (HTTP ${status})${at}`
}

/** `value` when it is a non-blank string, else `undefined`. */
function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}
