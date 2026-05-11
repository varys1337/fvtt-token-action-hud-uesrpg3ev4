import { debugLog } from './utils.js'

/**
 * Internal, conservative build cache.
 *
 * The cache is intentionally isolated to this system module and does NOT depend on Token Action HUD Core internals.
 * It is keyed by Token id (string) to respect token-local HUD state.
 */
const _buildCache = new Map()

/** @type {Map<string, Set<string>>} actorId -> Set<tokenId> */
const _actorToCacheKeys = new Map()

let _cacheHooksRegistered = false

function _unindexCacheKey (key, actorId) {
    if (!actorId) return
    const set = _actorToCacheKeys.get(actorId)
    if (!set) return
    set.delete(key)
    if (set.size === 0) _actorToCacheKeys.delete(actorId)
}

export function invalidateBuildCacheByKey (key) {
    if (!key) return
    const entry = _buildCache.get(key)
    if (entry) _unindexCacheKey(key, entry.actorId)
    _buildCache.delete(key)
}

export function invalidateBuildCacheByActorId (actorId) {
    if (!actorId) return
    const keys = _actorToCacheKeys.get(actorId)
    if (keys) {
        for (const k of keys) _buildCache.delete(k)
        _actorToCacheKeys.delete(actorId)
    }
}

export function invalidateAllBuildCaches () {
    _buildCache.clear()
    _actorToCacheKeys.clear()
}

export function getBuildCacheEntry (key) {
    if (!key) return null
    return _buildCache.get(key) ?? null
}

export function setBuildCacheEntry (key, entry) {
    if (!key || !entry) return
    _buildCache.set(key, entry)
    const actorId = entry.actorId
    if (actorId) {
        const set = _actorToCacheKeys.get(actorId) ?? new Set()
        set.add(key)
        _actorToCacheKeys.set(actorId, set)
    }
}

/**
 * Register conservative invalidation hooks.
 * This is safe to call multiple times.
 */
export function registerBuildCacheInvalidationHooks () {
    if (_cacheHooksRegistered) return
    _cacheHooksRegistered = true

    // Actor-level changes that can affect what appears on the HUD.
    Hooks.on('updateActor', (actor) => invalidateBuildCacheByActorId(actor?.id))

    // Item changes (inventory/spells/features) always imply a rebuild for the owning actor.
    Hooks.on('createItem', (item) => invalidateBuildCacheByActorId(item?.parent?.id))
    Hooks.on('updateItem', (item) => invalidateBuildCacheByActorId(item?.parent?.id))
    Hooks.on('deleteItem', (item) => invalidateBuildCacheByActorId(item?.parent?.id))

    // ActiveEffects can affect resources and action availability.
    Hooks.on('createActiveEffect', (effect) => invalidateBuildCacheByActorId(effect?.parent?.id))
    Hooks.on('updateActiveEffect', (effect) => invalidateBuildCacheByActorId(effect?.parent?.id))
    Hooks.on('deleteActiveEffect', (effect) => invalidateBuildCacheByActorId(effect?.parent?.id))

    // Token changes can affect token-local display.
    Hooks.on('updateToken', (tokenDoc) => {
        invalidateBuildCacheByKey(tokenDoc?.id)
        invalidateBuildCacheByActorId(tokenDoc?.actorId)
    })

    // Selection changes can swap between tokens quickly.
    Hooks.on('controlToken', (token) => invalidateBuildCacheByKey(token?.id))

    // Conservative: combat updates can change turn-based availability.
    Hooks.on('updateCombat', () => {
        debugLog('Cache invalidated: updateCombat')
        invalidateAllBuildCaches()
    })

    // System-specific hooks (guarded; only fire when the system emits them).
    Hooks.on('uesrpg.timeChanged', () => {
        debugLog('Cache invalidated: uesrpg.timeChanged')
        invalidateAllBuildCaches()
    })
    Hooks.on('uesrpg.combatTimeChanged', () => {
        debugLog('Cache invalidated: uesrpg.combatTimeChanged')
        invalidateAllBuildCaches()
    })
    Hooks.on('uesrpgDamageApplied', (actor) => invalidateBuildCacheByActorId(actor?.id))
    Hooks.on('uesrpgHealingApplied', (actor) => invalidateBuildCacheByActorId(actor?.id))
}
