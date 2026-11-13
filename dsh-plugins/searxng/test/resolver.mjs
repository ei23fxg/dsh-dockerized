/**
 * Test-only ESM resolver that mimics DSH's installation-scope interception:
 * bare `@deepseek-ai/*` requests from this package resolve to the running DSH
 * installation instead of a profile-local copy. Production never uses this;
 * the DSH loader routes those imports itself.
 */
import { pathToFileURL } from 'node:url'

const installRoot = process.env.DSH_INSTALL_ROOT ?? '/usr/local/lib/node_modules/@deepseek-ai/dsh'
const anchor = pathToFileURL(`${installRoot}/package.json`).href

/**
 * @param {string} specifier - the requested module.
 * @param {object} context - Node's resolution context.
 * @param {Function} nextResolve - the default resolver.
 * @returns {Promise<object>} the resolution.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@deepseek-ai/')) {
    return nextResolve(specifier, { ...context, parentURL: anchor })
  }
  return nextResolve(specifier, context)
}
