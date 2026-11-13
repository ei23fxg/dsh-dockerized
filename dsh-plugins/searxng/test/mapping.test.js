import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSearchURL,
  httpFailureMessage,
  mapSearxngResponse,
  mapSearxngResult,
  normalizeBaseURL,
} from '../lib/mapping.js'

test('normalizeBaseURL accepts plain and sub-path instance roots', () => {
  assert.equal(normalizeBaseURL('http://10.1.1.11:4002'), 'http://10.1.1.11:4002')
  assert.equal(normalizeBaseURL('  http://10.1.1.11:4002/  '), 'http://10.1.1.11:4002')
  assert.equal(normalizeBaseURL('https://search.example.org/searxng/'), 'https://search.example.org/searxng')
})

test('normalizeBaseURL rejects values that cannot be a base URL', () => {
  assert.equal(normalizeBaseURL(undefined), undefined)
  assert.equal(normalizeBaseURL(''), undefined)
  assert.equal(normalizeBaseURL('   '), undefined)
  assert.equal(normalizeBaseURL('localhost:4002'), undefined)
  assert.equal(normalizeBaseURL('ftp://search.example.org'), undefined)
  assert.equal(normalizeBaseURL('http://search.example.org/?x=1'), undefined)
  assert.equal(normalizeBaseURL('http://search.example.org/#frag'), undefined)
})

test('buildSearchURL appends /search and only sets configured parameters', () => {
  const plain = new URL(buildSearchURL('http://10.1.1.11:4002', { query: 'deepseek harness' }))
  assert.equal(plain.pathname, '/search')
  assert.equal(plain.searchParams.get('q'), 'deepseek harness')
  assert.equal(plain.searchParams.get('format'), 'json')
  assert.equal(plain.searchParams.has('language'), false)
  assert.equal(plain.searchParams.has('safesearch'), false)

  const full = new URL(
    buildSearchURL('http://10.1.1.11:4002/searxng/', {
      query: 'eu ai act',
      language: 'de',
      engines: 'duckduckgo,brave',
      categories: 'general,news',
      timeRange: 'week',
      safeSearch: 1,
    }),
  )
  assert.equal(full.pathname, '/searxng/search')
  assert.equal(full.searchParams.get('q'), 'eu ai act')
  assert.equal(full.searchParams.get('language'), 'de')
  assert.equal(full.searchParams.get('engines'), 'duckduckgo,brave')
  assert.equal(full.searchParams.get('categories'), 'general,news')
  assert.equal(full.searchParams.get('time_range'), 'week')
  assert.equal(full.searchParams.get('safesearch'), '1')
})

test('mapSearxngResult keeps URL-only entries and drops unusable ones', () => {
  assert.deepEqual(mapSearxngResult({ url: 'https://example.com', title: ' Example ' }), {
    url: 'https://example.com',
    title: ' Example ',
  })
  assert.equal(mapSearxngResult({ title: 'no url' }), undefined)
  assert.equal(mapSearxngResult({ url: '   ' }), undefined)
  assert.equal(mapSearxngResult(null), undefined)
})

test('mapSearxngResponse maps fields, dedupes URLs and carries answers', () => {
  const result = mapSearxngResponse({
    results: [
      {
        url: 'https://example.com/a',
        title: 'A',
        content: 'Alpha',
        publishedDate: '2024-01-02T03:04:05Z',
      },
      { url: 'https://example.com/a', title: 'A duplicate' },
      { url: 'https://example.com/b' },
      { title: 'no url' },
    ],
    answers: ['42', '', 7],
  })

  assert.deepEqual(result.sources, [
    {
      url: 'https://example.com/a',
      title: 'A',
      snippet: 'Alpha',
      publishedAt: '2024-01-02T03:04:05Z',
    },
    { url: 'https://example.com/b' },
  ])
  assert.equal(result.content, '42')
  assert.equal(result.truncated, false)
})

test('mapSearxngResponse tolerates a body without results', () => {
  assert.deepEqual(mapSearxngResponse({}), { sources: [], truncated: false })
  assert.deepEqual(mapSearxngResponse(null), { sources: [], truncated: false })
  assert.deepEqual(mapSearxngResponse({ results: 'nope' }), { sources: [], truncated: false })
})

test('httpFailureMessage explains the fixable SearXNG failures', () => {
  assert.match(httpFailureMessage(403, 'http://x'), /search\.formats/u)
  assert.match(httpFailureMessage(429, 'http://x'), /rate limit/u)
  assert.match(httpFailureMessage(404, 'http://x'), /not at \/search/u)
  assert.match(httpFailureMessage(502, 'http://x'), /HTTP 502/u)
})
