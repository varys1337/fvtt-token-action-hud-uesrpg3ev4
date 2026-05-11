import { MODULE } from './constants.js'

export let Utils = null

/**
 * System actor types supported by this Token Action HUD system module.
 * IMPORTANT: These are canonical Actor type ids, not localized display strings.
 */
const KNOWN_ACTOR_TYPES = new Set(['Player Character', 'NPC', 'Group'])
export let SUPPORTED_ACTOR_TYPES = new Set(KNOWN_ACTOR_TYPES)

/**
 * Resolve supported actor types dynamically from the system model when available.
 * Intersects with known UESRPG types for safety and falls back conservatively.
 * @returns {Set<string>}
 */
export function resolveSupportedActorTypes () {
    const model = game?.system?.model?.Actor
    if (model && typeof model === 'object') {
        const keys = Object.keys(model)
        const intersection = keys.filter(k => KNOWN_ACTOR_TYPES.has(k))
        SUPPORTED_ACTOR_TYPES = new Set(intersection.length ? intersection : KNOWN_ACTOR_TYPES)
        return SUPPORTED_ACTOR_TYPES
    }

    SUPPORTED_ACTOR_TYPES = new Set(KNOWN_ACTOR_TYPES)
    return SUPPORTED_ACTOR_TYPES
}

/**
 * Check whether an actor type is supported.
 * @param {string} actorType
 * @returns {boolean}
 */
export function isSupportedActorType (actorType) {
    const types = resolveSupportedActorTypes()
    return types.has(String(actorType ?? ''))
}

/**
 * Check whether an actor is supported.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isSupportedActor (actor) {
    return !!actor && isSupportedActorType(actor.type)
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

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
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
                coreModule.api.Logger.debug(`Setting '${key}' not found`)
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
                coreModule.api.Logger.debug(`Setting '${key}' set to '${value}'`)
            } catch {
                coreModule.api.Logger.debug(`Setting '${key}' not found`)
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
            return actor.effects.some(effect =>
                effect.statuses?.has(key) ||
                effect.flags?.core?.statusId === key
            )
        }

        /**
         * Get active effect by key
         * @param {object} actor The actor
         * @param {string} key   The effect key
         * @returns {object}     The effect or null
         */
        static getEffect (actor, key) {
            if (!actor?.effects) return null
            return actor.effects.find(effect =>
                effect.statuses?.has(key) ||
                effect.flags?.core?.statusId === key
            )
        }

        /**
         * Parse a value as a number safely
         * @param {any} value        The value to parse
         * @param {number} fallback  The fallback value
         * @returns {number}         The parsed number or fallback
         */
        static parseNumber (value, fallback = 0) {
            const parsed = Number(value)
            return isNaN(parsed) ? fallback : parsed
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
         * @returns {object}     Object with current and max AP
         */
        static getActionPoints (actor) {
            const current = Utils.parseNumber(actor?.system?.action_points?.value, 0)
            const max = Utils.parseNumber(actor?.system?.action_points?.max, 0)
            return { current, max }
        }

        /**
         * Get attacks this round from actor
         * @param {object} actor The actor
         * @returns {object}     Object with current and limit
         */
        static getAttacksThisRound (actor) {
            const current = Utils.parseNumber(actor?.system?.combat_tracking?.attacks_this_round, 0)
            const limit = 2
            return { current, limit }
        }
    }
})
