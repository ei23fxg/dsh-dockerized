import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'

import { WebError } from '@deepseek-ai/dsh-web'

import { SearxngSearchProvider, apply } from '../lib/index.js'

/** Start a minimal SearXNG stand-in whose behavior depends on the query. */
async function startInstance() {
  const state = { lastURL: undefined, lastHeaders: undefined }
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    state.lastURL = url
    state.lastHeaders = request.headers
    const query = url.searchParams.get('q') ?? ''

    if (query === 'forbidden') {
      response.writeHead(403, { 'content-type': 'application/json' })
      response.end('{"error":"json format disabled"}')
      return
    }
    if (query === 'html') {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end('<html><body>not json</body></html>')
      return
    }
    if (query === 'slow') return

    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        query,
        results: [
          { url: 'https://example.com/a', title: 'A', content: 'Alpha' },
          { url: 'https://example.com/a', title: 'A duplicate' },
          { url: 'https://example.com/b' },
        ],
        answers: ['42'],
      }),
    )
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {
    baseURL: `http://127.0.0.1:${address.port}`,
    state,
    async close() {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

test('provider registers as available only with a usable base URL', () => {
  assert.equal(new SearxngSearchProvider({ baseURL: 'http://10.1.1.11:4002' }).available(), true)
  assert.equal(new SearxngSearchProvider({ baseURL: '10.1.1.11:4002' }).available(), false)
  assert.equal(new SearxngSearchProvider({}).available(), false)
})

test('search maps the instance response and forwards options', async () => {
  const instance = await startInstance()
  try {
    const provider = new SearxngSearchProvider({
      baseURL: instance.baseURL,
      language: 'de',
      engines: 'duckduckgo,brave',
      categories: 'general',
      timeRange: 'week',
      safeSearch: 1,
      authHeader: 'Bearer test-token',
    })

    const result = await provider.search({ query: 'deepseek harness', maxResults: 8 })

    assert.deepEqual(result.sources, [
      { url: 'https://example.com/a', title: 'A', snippet: 'Alpha' },
      { url: 'https://example.com/b' },
    ])
    assert.equal(result.content, '42')
    assert.equal(result.truncated, false)

    assert.equal(instance.state.lastURL.searchParams.get('q'), 'deepseek harness')
    assert.equal(instance.state.lastURL.searchParams.get('format'), 'json')
    assert.equal(instance.state.lastURL.searchParams.get('language'), 'de')
    assert.equal(instance.state.lastURL.searchParams.get('engines'), 'duckduckgo,brave')
    assert.equal(instance.state.lastURL.searchParams.get('categories'), 'general')
    assert.equal(instance.state.lastURL.searchParams.get('time_range'), 'week')
    assert.equal(instance.state.lastURL.searchParams.get('safesearch'), '1')
    assert.equal(instance.state.lastHeaders.authorization, 'Bearer test-token')
  } finally {
    await instance.close()
  }
})

test('a 403 becomes an actionable WEB_PROVIDER_ERROR', async () => {
  const instance = await startInstance()
  try {
    const provider = new SearxngSearchProvider({ baseURL: instance.baseURL })
    await assert.rejects(provider.search({ query: 'forbidden' }), (error) => {
      assert.ok(error instanceof WebError)
      assert.equal(error.code, 'WEB_PROVIDER_ERROR')
      assert.match(error.message, /HTTP 403/u)
      assert.match(error.message, /search\.formats/u)
      return true
    })
  } finally {
    await instance.close()
  }
})

test('a non-JSON body becomes an actionable WEB_PROVIDER_ERROR', async () => {
  const instance = await startInstance()
  try {
    const provider = new SearxngSearchProvider({ baseURL: instance.baseURL })
    await assert.rejects(provider.search({ query: 'html' }), (error) => {
      assert.equal(error.code, 'WEB_PROVIDER_ERROR')
      assert.match(error.message, /unprocessable response body/u)
      assert.match(error.message, /search\.formats/u)
      return true
    })
  } finally {
    await instance.close()
  }
})

test('the request deadline fails with the configured bound', async () => {
  const instance = await startInstance()
  try {
    const provider = new SearxngSearchProvider({ baseURL: instance.baseURL, timeoutMs: 50 })
    await assert.rejects(provider.search({ query: 'slow' }), (error) => {
      assert.equal(error.code, 'WEB_PROVIDER_ERROR')
      assert.match(error.message, /within 50 ms/u)
      return true
    })
  } finally {
    await instance.close()
  }
})

test('caller cancellation surfaces as WEB_ABORTED', async () => {
  const instance = await startInstance()
  try {
    const provider = new SearxngSearchProvider({ baseURL: instance.baseURL, timeoutMs: 5000 })
    const controller = new AbortController()
    const pending = provider.search({ query: 'slow' }, controller.signal)
    setTimeout(() => controller.abort(), 20)
    await assert.rejects(pending, (error) => {
      assert.equal(error.code, 'WEB_ABORTED')
      return true
    })
  } finally {
    await instance.close()
  }
})

test('apply registers an available provider from SEARXNG_BASE_URL', async () => {
  const instance = await startInstance()
  const previous = process.env.SEARXNG_BASE_URL
  process.env.SEARXNG_BASE_URL = instance.baseURL
  try {
    let registered
    const ctx = { web: { registerSearchProvider: (provider) => (registered = provider) } }
    apply(ctx, {})

    assert.ok(registered)
    assert.equal(registered.available(), true)
    const result = await registered.search({ query: 'env' })
    assert.equal(result.sources.length, 2)
  } finally {
    if (previous === undefined) delete process.env.SEARXNG_BASE_URL
    else process.env.SEARXNG_BASE_URL = previous
    await instance.close()
  }
})
