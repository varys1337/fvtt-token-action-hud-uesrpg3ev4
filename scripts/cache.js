import { CORE_MODULE, MODULE } from './constants.js'
import { hasChangedPath, sameDocument } from './utils.js'

/**
 * Compatibility API: actions now derive directly from documents on each build.
 * No action snapshots or document references are retained between builds.
 * Invalidation intentionally does not request a render.
 */
export function invalidateBuildCacheByKey (_key) {}
export function invalidateBuildCacheByActorId (_actorId) {}
export function invalidateAllBuildCaches () {}
export function getBuildCacheEntry (_key) { return null }
export function setBuildCacheEntry (_key, _entry) {}

let _refreshTimer = null
let _refreshHooksRegistered = false
const _refreshTargets = new Set()
let _unscopedRefreshRequested = false

function isHudBridgeActive () {
    return game?.system?.id === 'uesrpg-3ev4'
        && game.modules?.get(MODULE.ID)?.active === true
        && game.modules?.get(CORE_MODULE.ID)?.active === true
}

function cancelHudRefresh () {
    if (_refreshTimer !== null) clearTimeout(_refreshTimer)
    _refreshTimer = null
    _refreshTargets.clear()
    _unscopedRefreshRequested = false
}

/** Coalesce requests through Core's supported refresh hook after document hooks finish. */
export function requestHudRefresh (...documents) {
    if (!isHudBridgeActive() || !game?.tokenActionHud || !canvas?.ready) return
    const targets = documents.filter(Boolean)
    if (targets.length === 0) _unscopedRefreshRequested = true
    else targets.forEach(document => _refreshTargets.add(document))
    if (_refreshTimer !== null) return
    _refreshTimer = setTimeout(() => {
        const pendingTargets = Array.from(_refreshTargets)
        const unscoped = _unscopedRefreshRequested
        cancelHudRefresh()
        if (!isHudBridgeActive() || !game?.tokenActionHud || !canvas?.ready) return
        const context = getHudContext()
        if (!unscoped && !pendingTargets.some(document => isRelevantDocument(document, context))) return
        Hooks.callAll('forceUpdateTokenActionHud')
    }, 0)
}

function getHudContext () {
    const hud = game?.tokenActionHud
    const manager = hud?.hudManager
    if (!isHudBridgeActive() || !manager || !canvas?.ready) return null
    const tokens = [
        manager.token,
        ...(Array.isArray(manager.tokens) ? manager.tokens : []),
        ...(canvas.tokens?.controlled ?? [])
    ].filter(Boolean).map(token => token.document ?? token)
    const actors = [
        manager.actor,
        ...(Array.isArray(manager.actors) ? manager.actors : []),
        ...tokens.map(token => token.actor)
    ].filter(Boolean)
    return { hud, tokens, actors }
}

function getOwningActor (document) {
    let current = document?.document ?? document
    while (current) {
        const name = current.constructor?.documentName
        if (name === 'Actor') return current
        if (name === 'Token') return current.actor ?? null
        current = current.parent
    }
    return null
}

function isRelevantActor (actor, context) {
    if (!actor || !context) return false
    return context.actors.some(current => sameDocument(current, actor)
        || sameDocument(current.token?.baseActor, actor))
        || context.tokens.some(token => sameDocument(token.baseActor, actor))
}

function isRelevantDocument (document, context) {
    const doc = document?.document ?? document
    if (!doc || !context) return false
    if (doc.constructor?.documentName === 'Token') {
        return context.tokens.some(token => sameDocument(token, doc))
    }
    return isRelevantActor(getOwningActor(doc), context)
}

function supplementActorRefresh (actor, changes) {
    const context = getHudContext()
    if (!isRelevantActor(actor, context)) return
    // Core 2.1.2 filters these hooks through its singular actor context.
    if (context.hud.isValidActorOrItemUpdate?.(actor, changes) === true) return
    requestHudRefresh(actor)
}

/**
 * Supplement only the document events Core 2.1.2 omits or rejects for the active
 * context. Core owns normal actor/item/selection/combat refreshes. This bridge
 * never listens to render or forceUpdate hooks and never writes documents.
 */
export function registerHudRefreshHooks () {
    if (_refreshHooksRegistered) return
    _refreshHooksRegistered = true

    for (const name of ['updateActor', 'deleteActor']) {
        Hooks.on(name, supplementActorRefresh)
    }
    for (const name of ['createItem', 'updateItem', 'deleteItem']) {
        Hooks.on(name, item => supplementActorRefresh(getOwningActor(item)))
    }

    Hooks.on('updateActiveEffect', effect => {
        const context = getHudContext()
        if (isRelevantDocument(effect.target, context) || isRelevantDocument(effect.parent, context)) {
            requestHudRefresh(effect.target, effect.parent)
        }
    })
    for (const name of ['createActiveEffect', 'deleteActiveEffect']) {
        Hooks.on(name, effect => {
            const context = getHudContext()
            if (!isRelevantDocument(effect.target, context) && !isRelevantDocument(effect.parent, context)) return
            if (context.hud.isControlledActor?.(effect.parent) === true) return
            requestHudRefresh(effect.target, effect.parent)
        })
    }

    for (const name of ['createActorDelta', 'updateActorDelta', 'deleteActorDelta']) {
        Hooks.on(name, delta => {
            if (isRelevantDocument(delta.parent, getHudContext())) requestHudRefresh(delta.parent)
        })
    }

    Hooks.on('updateToken', (token, changes) => {
        const context = getHudContext()
        if (!isRelevantDocument(token, context)) return
        const relevant = ['name', 'actorId', 'actorLink', 'delta', 'hidden',
            'flags.' + MODULE.ID, 'flags.uesrpg-3ev4', 'flags.uesrpg3ev4']
        if (!relevant.some(path => hasChangedPath(changes, path))) return
        // Core handles hidden updates itself, except when its flag filter rejects them.
        if (Object.hasOwn(changes ?? {}, 'hidden')
            && context.hud.isValidTokenChange?.(token, changes) === true) return
        requestHudRefresh(token)
    })

    for (const name of ['createCombatant', 'deleteCombatant', 'updateCombatant']) {
        Hooks.on(name, combatant => {
            const context = getHudContext()
            if (!isRelevantDocument(combatant.token, context) && !isRelevantActor(combatant.actor, context)) return
            if (name === 'updateCombatant' && context.hud.isControlledActor?.(combatant.actor) === true) return
            requestHudRefresh(combatant.token, combatant.actor)
        })
    }

    Hooks.on('canvasTearDown', cancelHudRefresh)
    Hooks.on('canvasReady', () => requestHudRefresh())
    Hooks.on('closeApplicationV2', app => {
        if (app === game?.tokenActionHud) cancelHudRefresh()
    })
}

/** Compatibility alias for older module integrations. */
export function registerBuildCacheInvalidationHooks () {
    registerHudRefreshHooks()
}
