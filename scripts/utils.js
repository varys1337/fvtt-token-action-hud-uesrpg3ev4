import { MODULE } from './constants.js'

export let Utils = null

/**
 * System actor types supported by this Token Action HUD system module.
 * IMPORTANT: These are canonical Actor type ids, not localized display strings.
 */
const KNOWN_ACTOR_TYPES = new Set(['Player Character', 'NPC', 'Group'])
export let SUPPORTED_ACTOR_TYPES = new Set(KNOWN_ACTOR_TYPES)

/**
 * Resolve the configured Actor types once the world is ready.
 * Uses the documented Document implementation and TYPES accessors.
 * @returns {Set<string>}
 */
export function resolveSupportedActorTypes () {
    const types = foundry.documents.Actor.implementation.TYPES
    const intersection = Array.isArray(types) ? types.filter(type => KNOWN_ACTOR_TYPES.has(type)) : []
    SUPPORTED_ACTOR_TYPES = new Set(intersection.length ? intersection : KNOWN_ACTOR_TYPES)
    return SUPPORTED_ACTOR_TYPES
}

Hooks.once('ready', resolveSupportedActorTypes)

/**
 * Check whether an actor type is supported.
 * @param {string} actorType
 * @returns {boolean}
 */
export function isSupportedActorType (actorType) {
    return SUPPORTED_ACTOR_TYPES.has(String(actorType ?? ''))
}

/**
 * Check whether an actor is supported.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isSupportedActor (actor) {
    return !!actor && isSupportedActorType(actor.type)
}

/** Compare documents without conflating synthetic actors with their world actors. */
export function sameDocument (left, right) {
    const a = left?.document ?? left
    const b = right?.document ?? right
    if (!a || !b) return false
    if (a === b) return true
    return typeof a.uuid === 'string' && a.uuid.length > 0 && a.uuid === b.uuid
}

/** Resolve an actor's exact token context using documented Actor/Token accessors. */
export function resolveActorToken (actor, explicitToken = null) {
    if (!actor) return null

    const matchingToken = (candidate) => {
        const token = candidate?.document ? candidate : candidate?.object
        return token && sameDocument(token.actor, actor) ? token : null
    }

    if (explicitToken) return matchingToken(explicitToken)
    const syntheticToken = matchingToken(actor.token)
    if (syntheticToken) return syntheticToken
    const controlled = (canvas?.tokens?.controlled ?? []).map(matchingToken).filter(Boolean)
    if (controlled.length > 0) return controlled.length === 1 ? controlled[0] : null
    const active = (actor.getActiveTokens?.() ?? []).map(matchingToken).filter(Boolean)
    return active.length === 1 ? active[0] : null
}

/** Read valid action points without inventing a fallback resource value or limit. */
export function readActionPoints (actor) {
    const data = actor?.system?.action_points
    if (data?.value == null || data?.max == null) return null
    const value = Number(data.value)
    const max = Number(data.max)
    return Number.isFinite(value) && Number.isFinite(max) && max >= 0 ? { value, max } : null
}

/** Read the system-owned tracker for one exact token in the active encounter. */
export function readAttackTrackerView (actor, token = null, limitContext = {}) {
    const combat = game?.combat
    const tracker = game?.uesrpg?.AttackTracker
    if (!actor || !combat?.started || typeof tracker?.getTrackerViewState !== 'function') return null
    try {
        const resolvedToken = resolveActorToken(actor, token)
        const tokenUuid = resolvedToken?.document?.uuid
        if (!tokenUuid) return null
        const combatants = combat.combatants?.filter(entry => entry.token?.uuid === tokenUuid) ?? []
        if (combatants.length !== 1) return null
        const state = tracker.getTrackerViewState(actor, limitContext ?? {}, {
            combat,
            tokenUuid,
            combatantId: combatants[0].id,
            source: MODULE.ID
        })
        if (state?.trackerContext?.authoritative !== true
            || state?.trackerContext?.ambiguityState === 'unlinked-ambiguous'
            || !Number.isFinite(state?.current) || state.current < 0
            || !Number.isFinite(state?.max) || state.max < 0) return null
        return state
    } catch (error) {
        debugLog('Attack tracker view unavailable', error)
        return null
    }
}

/** Whether the current user may update this document. */
export function canUpdateDocument (document) {
    const doc = document?.document ?? document
    try {
        return !!game?.user && doc?.canUserModify?.(game.user, 'update') === true
    } catch {
        return false
    }
}

/** Escape document-derived text before including it in controlled HTML markup. */
export function escapeText (value) {
    return foundry.utils.escapeHTML(String(value ?? ''))
}

/** Read v14's keyed status registry without modifying its entries. */
export function getStatusEffectConfigs () {
    const registry = CONFIG?.statusEffects
    const entries = Array.isArray(registry)
        ? registry.map(effect => [null, effect])
        : Object.entries(registry && typeof registry === 'object' ? registry : {})
    return entries.flatMap(([key, effect]) => {
        if (!effect || typeof effect !== 'object' || Array.isArray(effect)) return []
        const id = String(effect.id ?? key ?? '').trim()
        return id ? [{ ...effect, id }] : []
    })
}

/** Detect nested, flattened, or deletion updates without treating zero as absent. */
export function hasChangedPath (changes, path) {
    if (!changes || typeof changes !== 'object') return false
    for (const [key, value] of Object.entries(changes)) {
        const parts = key.split('.')
        const deleted = parts.some(part => part.startsWith('-='))
        const changedPath = parts.map(part => part.startsWith('-=') ? part.slice(2) : part).join('.')
        if (changedPath === path || changedPath.startsWith(`${path}.`)) return true
        if (!path.startsWith(`${changedPath}.`)) continue
        if (deleted || value === null || typeof value !== 'object') return true
        if (hasChangedPath(value, path.slice(changedPath.length + 1))) return true
    }
    return false
}

/**
 * Build a stable system-relative module path.
 * Avoid hard-coding the system id so forks/test installs continue to work.
 * @param {string} relativePath
 * @returns {string|null}
 */
export function getSystemModulePath (relativePath) {
    const systemId = game?.system?.id
    if (!systemId) return null
    const clean = String(relativePath ?? '').replace(/^\/+/, '')
    return `/systems/${systemId}/${clean}`
}

/**
 * Unified debug logging: guards both debug and diagnostics logs behind a single toggle.
 * Guarded behind a module setting to avoid log spam in production worlds.
 */
export function isDebugEnabled () {
    try {
        return !!game?.settings?.get?.(MODULE.ID, 'debug')
    } catch {
        return false
    }
}

export function debugLog (...args) {
    if (!isDebugEnabled()) return
    // Use console directly to avoid relying on Token Action HUD Core logger availability.
    // Keep messages short and structured.
    console.debug(`[${MODULE.ID}]`, ...args)
}

/**
 * Diagnostics logging: now unified with debugLog.
 * Prefixed with [diag] for easier filtering if needed.
 */
export function diagLog (...args) {
    if (!isDebugEnabled()) return
    console.debug(`[${MODULE.ID}][diag]`, ...args)
}

Hooks.once('tokenActionHudCoreApiReady', () => {
    /**
     * Utility functions
     */
    Utils = class Utils {
        /**
         * Get setting
         * @param {string} key               The key
         * @param {string=null} defaultValue The default value
         * @returns {string}                 The setting value
         */
        static getSetting (key, defaultValue = null) {
            let value = defaultValue ?? null
            try {
                value = game.settings.get(MODULE.ID, key)
            } catch {
                debugLog(`Setting '${key}' not found`)
            }
            return value
        }

        /**
         * Set setting
         * @param {string} key   The key
         * @param {string} value The value
         */
        static async setSetting (key, value) {
            try {
                value = await game.settings.set(MODULE.ID, key, value)
                debugLog(`Setting '${key}' set to '${value}'`)
            } catch {
                debugLog(`Setting '${key}' not found`)
            }
        }

        /**
         * Check if actor has a specific active effect
         * @param {object} actor The actor
         * @param {string} key   The effect key to check
         * @returns {boolean}    Whether the effect is active
         */
        static hasEffect (actor, key) {
            if (!actor?.effects) return false
            return actor.effects.some(effect => effect.statuses?.has(key))
        }

        /**
         * Get active effect by key
         * @param {object} actor The actor
         * @param {string} key   The effect key
         * @returns {object}     The effect or null
         */
        static getEffect (actor, key) {
            if (!actor?.effects) return null
            return actor.effects.find(effect => effect.statuses?.has(key)) ?? null
        }

        /**
         * Parse a value as a number safely
         * @param {any} value        The value to parse
         * @param {number} fallback  The fallback value
         * @returns {number}         The parsed number or fallback
         */
        static parseNumber (value, fallback = 0) {
            const parsed = Number(value)
            return Number.isFinite(parsed) ? parsed : fallback
        }

        /**
         * Parse a value as a string safely
         * @param {any} value        The value to parse
         * @param {string} fallback  The fallback value
         * @returns {string}         The parsed string or fallback
         */
        static parseString (value, fallback = '') {
            return value != null ? String(value) : fallback
        }

        /**
         * Get action points from actor
         * @param {object} actor The actor
         * @returns {object|null} Object with current and max AP, or null when unavailable
         */
        static getActionPoints (actor) {
            const points = readActionPoints(actor)
            return points ? { current: points.value, max: points.max } : null
        }

        /**
         * Get attacks this round from actor
         * @param {object} actor The actor
         * @param {object|null} token Exact token context, when available
         * @param {object} limitContext System attack-limit context
         * @returns {object|null} Object with current and limit, or null when unavailable
         */
        static getAttacksThisRound (actor, token = null, limitContext = {}) {
            const state = readAttackTrackerView(actor, token, limitContext)
            return state ? { current: state.current, limit: state.max } : null
        }
    }
})
