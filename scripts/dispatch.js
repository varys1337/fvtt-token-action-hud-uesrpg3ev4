import { MODULE } from './constants.js'
import { diagLog } from './utils.js'
import { SystemAdapter } from './system-adapter.js'

function _isStrictDiagnosticsEnabled () {
    try {
        return !!game?.settings?.get?.(MODULE.ID, 'strictActionDiagnostics')
    } catch {
        return true
    }
}

function _warnDispatch (message, context = {}) {
    diagLog('[dispatch]', message, context)
    if (!_isStrictDiagnosticsEnabled()) return
    ui.notifications?.warn?.(message)
}

function _makeSyntheticTarget (dataset = {}) {
    return { dataset: { ...(dataset ?? {}) } }
}

function _makeSyntheticEvent (target, { shiftKey = false } = {}) {
    const ev = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        shiftKey: !!shiftKey
    })
    Object.defineProperty(ev, 'currentTarget', {
        writable: false,
        value: target
    })
    return ev
}

function _resolveTokenForActor (actor, explicitToken = null) {
    if (explicitToken) return explicitToken
    const controlled = canvas?.tokens?.controlled?.find?.(t => t?.actor?.id === actor?.id) ?? null
    if (controlled) return controlled
    return actor?.getActiveTokens?.()?.[0] ?? null
}

/**
 * Hybrid dispatcher for high-risk combat quick actions.
 * Adds a direct action callback path while retaining encodedValue execution.
 *
 * @param {Actor} actor
 * @param {object} payload
 * @param {object} [opts]
 * @param {Token|null} [opts.token]
 * @param {boolean} [opts.shiftKey]
 * @returns {Promise<boolean>} true if a handler was executed
 */
export async function executeCombatQuickActionForActor (actor, payload = {}, opts = {}) {
    if (!actor) {
        _warnDispatch('Unable to execute combat action: actor not available.')
        return false
    }

    const token = _resolveTokenForActor(actor, opts?.token ?? null)
    const dataset = {
        ...(payload ?? {}),
        combatAction: payload?.combatAction ?? payload?.action ?? '',
        action: payload?.action ?? payload?.combatAction ?? ''
    }
    const target = _makeSyntheticTarget(dataset)
    const event = _makeSyntheticEvent(target, { shiftKey: opts?.shiftKey ?? false })
    const sheet = actor?.sheet ?? { actor, token, element: null }

    try {
        const res = await SystemAdapter.executeCombatQuickAction({
            actor,
            token,
            payload: dataset,
            shiftKey: opts?.shiftKey ?? false
        })
        if (res?.ok) {
            return true
        }
    } catch (err) {
        console.error(`${MODULE.ID} | Hybrid combat dispatch failed`, { dataset, actorId: actor?.id, err })
        _warnDispatch('Failed to execute combat action. See console for details.', { action: dataset?.combatAction, actorId: actor?.id })
        return false
    }

    _warnDispatch('No combat action handler is available for this actor.', {
        action: dataset?.combatAction,
        actorId: actor?.id,
        tokenId: token?.id ?? null
    })
    return false
}
