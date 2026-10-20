/**
 * Local manual-AP updates may refresh the counter in place. Limit the exception
 * to an exact pending AP-value update on the current HUD instance.
 *
 * Narrow, reversible adapter for the current HUD instance's public actor-update
 * filter. It changes no document hooks, resource mechanics, or document writes.
 * All unmatched or uncertain changes retain the original filter result.
 */

import { sameDocument } from './utils.js'

const FILTER_METHOD = 'isValidActorOrItemUpdate'
const AP_VALUE_PATH = 'system.action_points.value'
const pendingWrites = new Map()
let attachment = null

function actorUuid (actor) {
    try {
        if (actor?.constructor?.documentName !== 'Actor') return null
        return typeof actor.uuid === 'string' && actor.uuid.length > 0 ? actor.uuid : null
    } catch {
        return null
    }
}

function isPlainRecord (value) {
    if (value === null || typeof value !== 'object') return false
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
}

/** Synthetic Actor hooks retain the exact owning ActorDelta's update-envelope ID. */
function actorUpdateIds (actor) {
    const ids = new Set()
    if (typeof actor.id === 'string' && actor.id) ids.add(actor.id)
    if (actor.isToken === true) {
        const token = actor.token
        const delta = token?.delta
        if (delta?.constructor?.documentName === 'ActorDelta'
            && sameDocument(token.actor, actor)
            && sameDocument(delta.parent, token)
            && typeof delta.id === 'string' && delta.id) ids.add(delta.id)
    }
    return ids
}

/**
 * Accept one AP-value leaf in nested, flattened, or mixed dot-path notation.
 * Only optional root _stats and matching Actor/owning ActorDelta _id metadata may accompany it.
 * Unknown fields, mismatched IDs, deletion operators, arrays, duplicate AP paths,
 * and nonnumeric values fail open.
 */
function readOnlyApValue (changes, expectedIds) {
    if (!isPlainRecord(changes)) return null
    let apValue = null
    let found = false

    const visit = (node, prefix = '') => {
        if (!isPlainRecord(node)) return false
        const keys = Reflect.ownKeys(node)
        if (keys.length === 0) return false
        for (const key of keys) {
            if (typeof key !== 'string') return false
            const descriptor = Object.getOwnPropertyDescriptor(node, key)
            if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return false
            const value = descriptor.value
            const path = prefix ? `${prefix}.${key}` : key
            if (path === '_id') {
                if (typeof value !== 'string' || !expectedIds.has(value)) return false
                continue
            }
            if (path === '_stats') {
                if (!isPlainRecord(value)) return false
                continue
            }
            if (path.startsWith('_stats.')) continue
            if (path === AP_VALUE_PATH) {
                if (found || typeof value !== 'number' || !Number.isFinite(value)) return false
                found = true
                apValue = value
                continue
            }
            if (path !== 'system' && path !== 'system.action_points') return false
            if (!visit(value, path)) return false
        }
        return true
    }

    return visit(changes) && found ? { value: apValue } : null
}

/**
 * refreshCounter must synchronously re-read or schedule a re-read of document
 * data. If it throws or returns a Promise, the original full refresh is retained.
 */
function requestCounterRead (state) {
    if (!state?.active || attachment !== state) return false
    try {
        const result = Reflect.apply(state.refreshCounter, undefined, [])
        if (result && typeof result.then === 'function') {
            Promise.resolve(result).catch(() => {})
            return false
        }
        return true
    } catch {
        return false
    }
}

/**
 * Match only Actor updates during an active local manual-AP write. The actor UUID
 * and sole AP leaf must match an expected finite numeric value exactly.
 *
 * The cache bridge may also call this for updateActorDelta using delta.parent.actor
 * and that hook's unchanged changes object. Token/Item/ActiveEffect updates are
 * outside this adapter; extra ActorDelta fields intentionally fail open.
 */
export function isManualApUpdate (actor, changes) {
    try {
        const state = attachment
        if (!state?.active) return false
        const uuid = actorUuid(actor)
        if (!uuid) return false
        const records = pendingWrites.get(uuid)
        if (!records?.size) return false
        const update = readOnlyApValue(changes, actorUpdateIds(actor))
        if (!update) return false
        return Array.from(records).some(record => record.owner === state && record.value === update.value)
    } catch {
        return false
    }
}

/**
 * Attach to one current HUD instance. Original this, arguments, return values,
 * and exceptions are preserved except for a confirmed matching boolean result.
 * No prototype or other HUD instance is modified.
 *
 * @param {object} hud The current Token Action HUD ApplicationV2 instance.
 * @param {Function} refreshCounter Synchronous authoritative counter read/scheduler.
 * @returns {boolean} Whether the adapter is attached.
 */
export function attachManualApRefreshFilter (hud, refreshCounter) {
    if (!hud || typeof refreshCounter !== 'function') return false
    if (attachment?.active && attachment.hud === hud && hud[FILTER_METHOD] === attachment.wrapper) {
        attachment.refreshCounter = refreshCounter
        return true
    }

    detachManualApRefreshFilter()
    const original = hud[FILTER_METHOD]
    if (typeof original !== 'function') return false
    const ownDescriptor = Object.getOwnPropertyDescriptor(hud, FILTER_METHOD)
    if (ownDescriptor && !Object.hasOwn(ownDescriptor, 'value')) return false

    const state = { hud, original, ownDescriptor, refreshCounter, active: true, wrapper: null }
    state.wrapper = function manualApRefreshFilter (...args) {
        const originalResult = Reflect.apply(state.original, this, args)
        if (!state.active || attachment !== state || this !== state.hud) return originalResult
        if (typeof originalResult !== 'boolean' || !isManualApUpdate(args[0], args[1])) return originalResult
        return requestCounterRead(state) ? false : originalResult
    }

    try {
        Object.defineProperty(hud, FILTER_METHOD, ownDescriptor
            ? { ...ownDescriptor, value: state.wrapper }
            : { configurable: true, enumerable: false, writable: true, value: state.wrapper })
    } catch {
        state.active = false
        return false
    }
    attachment = state
    return true
}

/**
 * Restore only our current wrapper. An interposed third-party wrapper is left
 * intact, while any reference to the old wrapper becomes a transparent forwarder.
 * A false return indicates that restoration was unnecessary or could not be made;
 * the adapter remains inactive in either case.
 */
export function detachManualApRefreshFilter () {
    const previous = attachment
    attachment = null
    pendingWrites.clear()
    if (!previous) return true
    previous.active = false
    try {
        if (previous.hud[FILTER_METHOD] !== previous.wrapper) return false
        if (previous.ownDescriptor) {
            Object.defineProperty(previous.hud, FILTER_METHOD, previous.ownDescriptor)
            return true
        }
        return delete previous.hud[FILTER_METHOD]
    } catch {
        return false
    }
}

/**
 * Scope an existing manual AP document update; this function never writes data.
 * Register immediately before operation(), and release in finally after awaiting
 * its result. Invalid matching inputs or an absent attachment execute normally
 * with full-refresh behavior. Operation results and failures propagate unchanged.
 *
 * @param {Actor} actor The exact current owning/synthetic Actor document.
 * @param {number} value The expected finite AP value passed to the document API.
 * @param {Function} operation Zero-argument callback performing the existing update.
 * @returns {Promise<unknown>} The original operation result.
 */
export async function runManualApUpdate (actor, value, operation) {
    if (typeof operation !== 'function') throw new TypeError('Manual AP update requires an operation callback.')
    const state = attachment
    const uuid = actorUuid(actor)
    if (!state?.active || !uuid || typeof value !== 'number' || !Number.isFinite(value)) return await operation()

    let records = pendingWrites.get(uuid)
    if (!records) {
        records = new Set()
        pendingWrites.set(uuid, records)
    }
    const record = { owner: state, value }
    records.add(record)
    try {
        return await operation()
    } finally {
        records.delete(record)
        if (records.size === 0 && pendingWrites.get(uuid) === records) pendingWrites.delete(uuid)
        requestCounterRead(state)
    }
}

