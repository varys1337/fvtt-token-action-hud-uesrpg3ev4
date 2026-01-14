import { MODULE } from './constants.js'

export let Utils = null

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
            const current = Utils.parseNumber(actor?.system?.combat?.actionPoints?.current, 0)
            const max = Utils.parseNumber(actor?.system?.combat?.actionPoints?.max, 0)
            return { current, max }
        }

        /**
         * Get attacks this round from actor
         * @param {object} actor The actor
         * @returns {object}     Object with current and limit
         */
        static getAttacksThisRound (actor) {
            const current = Utils.parseNumber(actor?.system?.combat?.attacksThisRound?.current, 0)
            const limit = Utils.parseNumber(actor?.system?.combat?.attacksThisRound?.limit, 2)
            return { current, limit }
        }
    }
})
