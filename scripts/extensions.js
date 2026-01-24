import { debugLog } from './utils.js'

/**
 * Phase 4: Extension registry.
 *
 * Allows system-adjacent modules/macros to register small, additive action-build extensions
 * without modifying the core action builder. This stays intentionally shallow to avoid
 * coupling to Token Action HUD Core internals.
 */

/** @type {Set<Function>} */
const _buildExtensions = new Set()

/**
 * Register an action-build extension.
 *
 * The callback is invoked after this module builds its standard actions and before caching.
 * It receives a single context argument:
 *  {
 *    handler, actor, token, isMultiTokenSelection, actors, delimiter
 *  }
 *
 * The callback may call handler.addActions(actions, groupData) to add additional actions.
 * Errors are caught and logged (when debug is enabled).
 */
export function registerBuildExtension (fn) {
    if (typeof fn !== 'function') return
    _buildExtensions.add(fn)
}

/** Remove a previously registered extension. */
export function unregisterBuildExtension (fn) {
    _buildExtensions.delete(fn)
}

/** Clear all registered extensions. */
export function clearBuildExtensions () {
    _buildExtensions.clear()
}

/**
 * Invoke all extensions.
 * @internal
 */
export async function runBuildExtensions (context) {
    if (_buildExtensions.size === 0) return
    for (const fn of Array.from(_buildExtensions)) {
        try {
            // Allow async or sync callbacks.
            await fn(context)
        } catch (err) {
            debugLog('Build extension error', err)
        }
    }
}
