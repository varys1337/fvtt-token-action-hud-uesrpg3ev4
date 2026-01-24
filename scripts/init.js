import { SystemManager } from './system-manager.js'
import { MODULE, REQUIRED_CORE_MODULE_VERSION } from './constants.js'
import { getSystemModulePath, isSupportedActor, debugLog } from './utils.js'
import {
    invalidateAllBuildCaches,
    invalidateBuildCacheByActorId,
    invalidateBuildCacheByKey
} from './cache.js'
import { registerBuildExtension, unregisterBuildExtension } from './extensions.js'

// Cache last known HUD root from render hook for idempotent re-ensures.
let _lastHudRootEl = null

// Debounced tracker update state (Phase 2)
let _trackerUpdateTimer = null
let _lastTrackerLabel = null
let _lastTrackerActorId = null
let _lastTrackerEnsureRequested = false



/**
 * HUD DOM helpers
 * These helpers are intentionally structural (not localized-text based) to remain robust across
 * Token Action HUD Core language packs and minor markup changes.
 */
function getHudRoot (app, html) {
    // Prefer the render hook HTML root (most reliable), with a fallback to a known id and a cached root.
    const root = (html?.[0] ?? html) || _lastHudRootEl || document.querySelector('#token-action-hud')
    if (root) _lastHudRootEl = root
    return root
}

function getTabBar (hudRoot) {
    if (!hudRoot) return null
    return hudRoot.querySelector('#tah-groups')
        || hudRoot.querySelector('.tah-tab-groups')
        // Additional structural fallbacks observed across Token Action HUD Core layouts
        || hudRoot.querySelector('#tah-tabs')
        || hudRoot.querySelector('.tah-tabs')
        || hudRoot.querySelector('.tah-groups')
        || hudRoot.querySelector('.tah-tabbar')
        || hudRoot.querySelector('.tah-tabs-bar')
        || null
}

function getTabNodes (tabBar) {
    if (!tabBar) return []

    // Some layouts wrap each tab button in a `.tah-tab-group`.
    // In some TAH Core builds, these wrappers are not direct children (e.g. there is an inner scroller).
    let wrapped = Array.from(tabBar.querySelectorAll(':scope > .tah-tab-group'))
    if (!wrapped.length) wrapped = Array.from(tabBar.querySelectorAll('.tah-tab-group'))
    if (wrapped.length) return wrapped

    // Fallback: tab controls may be direct children of the tab bar, or nested within an inner container.
    let controls = Array.from(tabBar.querySelectorAll(':scope > button, :scope > a, :scope > div[role="button"]'))
    if (!controls.length) controls = Array.from(tabBar.querySelectorAll('button, a, div[role="button"]'))
    return controls
}

/**
 * Locate the Utility tab control without relying on localization keys.
 * Preference order:
 *  1) data attributes that commonly encode group/tab ids
 *  2) visible label fallback ("Utility")
 */
function findUtilityControl (root) {
    if (!root) return null

    // Attribute-based detection (most stable when present).
    const attrSel = [
        '[data-group-id="utility"]',
        '[data-group="utility"]',
        '[data-tab="utility"]',
        '[data-id="utility"]',
        '[data-groupid="utility"]'
    ].join(',')
    const byAttr = root.querySelector(attrSel)
    if (byAttr) return byAttr

    // Label fallback (case-insensitive). This is a fallback only and will still work in your current layout.
    const controls = Array.from(root.querySelectorAll('button, a, div[role="button"]'))
    return controls.find(c => ((c.textContent ?? '').trim().toLowerCase() === 'utility')) ?? null
}

function getTabNodeFromControl (control) {
    if (!control) return null
    return control.closest?.('.tah-tab-group') || control
}

function isTabLikeNode (node) {
    if (!node) return false
    // Wrapper case
    if (node.classList?.contains('tah-tab-group')) {
        const c = node.querySelector('button, a, div[role="button"]')
        const t = (c?.textContent ?? '').trim()
        return t.length > 0
    }

    // Direct control case (exclude icon-only controls like lock/edit)
    if (node.matches?.('button, a, div[role="button"]')) {
        const t = (node.textContent ?? '').trim()
        return t.length > 0
    }
    return false
}

/**
 * Given a Utility control, find the correct container where tab nodes are direct children,
 * and return both the container and the direct-child reference node that represents Utility.
 * This is resilient to inner scroller wrappers and additional icon controls.
 */
function resolveTabInsertionContext (utilityControl, hudRoot) {
    const utilityNode = getTabNodeFromControl(utilityControl)
    if (!utilityNode) return null

    // Walk up ancestors until we find a container where tabs are direct children.
    let el = utilityNode.parentElement
    while (el && el !== hudRoot) {
        const candidates = Array.from(el.querySelectorAll(':scope > .tah-tab-group, :scope > button, :scope > a, :scope > div[role="button"]'))
            .filter(isTabLikeNode)

        // Find the direct-child node that contains our utility control.
        const ref = candidates.find(n => n === utilityNode || n.contains?.(utilityControl))

        // Consider this a valid tab container if it has enough tab-like nodes and includes our ref.
        if (ref && candidates.length >= 3) {
            return { container: el, utilityNode: ref }
        }

        el = el.parentElement
    }

    return null
}

/**
 * Find the actual insertion container that owns the tab nodes.
 * We climb ancestors until we find an element where the Utility tab node is a direct child
 * alongside at least 3 other tab-like nodes.
 */
function findTabInsertionPoint (hudRoot) {
    const utilityControl = findUtilityControl(hudRoot)
    if (!utilityControl) return null

    const utilityNode = getTabNodeFromControl(utilityControl)
    let el = utilityNode?.parentElement ?? null
    while (el && el !== hudRoot && el !== document.body) {
        const children = Array.from(el.querySelectorAll(':scope > .tah-tab-group, :scope > button, :scope > a, :scope > div[role="button"]'))
        const tabChildren = children.filter(isTabLikeNode)

        // Require that the Utility node is a direct child or that a direct child contains the Utility control.
        const directRef = tabChildren.find(n => n === utilityNode || n.contains?.(utilityControl))
        if (tabChildren.length >= 4 && directRef) {
            return { container: el, utilityNode: directRef }
        }

        el = el.parentElement
    }

    // Final fallback: if we cannot find a direct-children container, use the closest tab bar we can detect.
    return null
}

function findUtilityTabNode (tabBar) {
    // Prefer an explicit Utility tab match if present, otherwise fall back to the last tab node.
    // We avoid localization keys, but in your current Core markup the Utility tab label is rendered as text.
    const nodes = getTabNodes(tabBar)
    if (!nodes.length) return null

    // Try to locate a node whose visible label is "Utility" (case-insensitive).
    // This also protects us from "extra" controls (lock/edit icons) being counted as the last node.
    for (const node of nodes) {
        const control = node.classList?.contains('tah-tab-group')
            ? (node.querySelector('button, a, div[role="button"]') ?? node)
            : node
        const txt = (control?.textContent ?? '').trim().toLowerCase()
        if (txt === 'utility') return node
    }

    return nodes[nodes.length - 1]
}

function makeTrackerNode (utilityNode, label) {
    // Determine the reference control to mirror classes/tag.
    const isWrapper = utilityNode?.classList?.contains('tah-tab-group')
    const utilityControl = isWrapper
        ? (utilityNode.querySelector('button, a, div[role="button"]') ?? utilityNode)
        : utilityNode

    const tag = (utilityControl?.tagName ?? '').toLowerCase() === 'a' ? 'a' : 'button'
    const btn = document.createElement(tag)
    if (btn.tagName.toLowerCase() === 'button') btn.type = 'button'
    if (btn.tagName.toLowerCase() === 'a') {
        btn.href = '#'
        btn.setAttribute('role', 'button')
    }

    // Copy Utility classes for consistent styling, excluding transient state classes.
    const deny = new Set(['active', 'is-active', 'selected', 'is-selected', 'tah-active'])
    for (const c of Array.from(utilityControl?.classList ?? [])) {
        if (!deny.has(c)) btn.classList.add(c)
    }

    // Unique marker + stable id.
    btn.classList.add('tah-ap-tracker')
    btn.dataset.uesrpgActionsTracker = 'true'
    btn.dataset.uesrpgActionsTrackerRole = 'control'
    btn.id = 'uesrpg-actions-tracker-tab'
    btn.setAttribute('aria-label', 'Action tracker')

    // Interactive tracker tab (left click increment, right click decrement).
    // Disabled state (no eligible actor) is handled by the update routine.
    btn.textContent = label

    if (isWrapper) {
        const wrapper = document.createElement('div')
        for (const c of Array.from(utilityNode?.classList ?? [])) {
            if (!deny.has(c)) wrapper.classList.add(c)
        }
        wrapper.dataset.uesrpgActionsTracker = 'true'
        wrapper.dataset.uesrpgActionsTrackerRole = 'wrapper'
        wrapper.id = 'uesrpg-actions-tracker-wrapper'
        wrapper.appendChild(btn)
        return wrapper
    }

    return btn
}

// ---------------------------------------------------------------------------
// Action counter tracker ("Action X/3")
// Stored per-actor as a module flag.
// ---------------------------------------------------------------------------
const ACTION_TRACKER_FLAG_SCOPE = MODULE.ID
const ACTION_TRACKER_FLAG_KEY = 'actionTracker'
const DEFAULT_ACTION_TRACKER_MAX = 3

function getEligibleControlledActor () {
    if (!canvas?.ready || !canvas?.tokens) return null
    const token = canvas.tokens.controlled?.[0] ?? null
    const actor = token?.actor ?? null
    if (!isSupportedActor(actor)) return null
    return actor
}


function getActorActionMax (actor) {
    const max = Number(actor?.system?.action_points?.max)
    if (Number.isFinite(max) && max > 0) return max
    return DEFAULT_ACTION_TRACKER_MAX
}

function getActorActionCount (actor) {
    if (!actor) return 0

    // Primary source of truth: system action points.
    const ap = Number(actor?.system?.action_points?.value)
    const max = getActorActionMax(actor)
    if (Number.isFinite(ap)) return Math.max(0, Math.min(max, ap))

    // Backwards compatibility: fall back to module flag if AP is unavailable.
    const stored = actor.getFlag(ACTION_TRACKER_FLAG_SCOPE, ACTION_TRACKER_FLAG_KEY)
    const value = Number(stored?.value ?? stored ?? 0)
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(max, value))
}

async function setActorActionCount (actor, nextValue) {
    if (!actor) return
    const max = getActorActionMax(actor)
    const clamped = Math.max(0, Math.min(max, Number(nextValue) || 0))

    // Prefer updating system AP so the tracker reflects the actor's available actions correctly.
    if (actor?.system?.action_points) {
        await actor.update({ 'system.action_points.value': clamped })
        return
    }

    // Fallback if the actor schema does not include action_points.
    await actor.setFlag(ACTION_TRACKER_FLAG_SCOPE, ACTION_TRACKER_FLAG_KEY, { value: clamped })
}

async function incrementActorActionCount (actor, delta) {
    if (!actor) return
    const current = getActorActionCount(actor)
    await setActorActionCount(actor, current + (Number(delta) || 0))
}

function getTrackerButtonFromInjected (injected) {
    if (!injected) return null
    return injected.matches?.('button, a, div[role="button"]')
        ? injected
        : injected.querySelector?.('button, a, div[role="button"]')
}

Hooks.on('tokenActionHudCoreApiReady', async () => {
    /**
     * Return the SystemManager and requiredCoreModuleVersion to Token Action HUD Core
     */
    const module = game.modules.get(MODULE.ID)
    module.api = {
        requiredCoreModuleVersion: REQUIRED_CORE_MODULE_VERSION,
        SystemManager
    }
    Hooks.call('tokenActionHudSystemReady', module)
})

/**
 * Ensure an always-visible Action counter tracker exists in the HUD tab bar.
 * Shows "Action X/3" where X is a per-actor counter stored as a module flag.
 *
 * Interactions:
 * - Left click: increment by 1
 * - Right click: decrement by 1
 *
 * The tracker is injected as a tab-style button immediately before the structural Utility tab.
 *
 * @param {Application} app
 * @param {JQuery} html
 */
function ensureActionsTrackerTab (app, html) {
    try {
        // We do not rely on the "actionsTracker" category being present in a saved HUD layout.
        // Instead, we inject a real tab-style element into the existing tab bar.
        //
        // IMPORTANT: the tab bar markup can differ based on Token Action HUD Core version and user layout.
        // The most reliable anchor is the existing "Utility" tab button.

        const hudRoot = getHudRoot(app, html)
        if (!hudRoot) return

        // Prefer a robust insertion point derived from the actual Utility control.
        // This handles layouts where the tab bar is nested in an inner scroller and does not match legacy ids/classes.
        let insertion = findTabInsertionPoint(hudRoot)
        if (!insertion) {
            const tabs = getTabBar(hudRoot)
            if (!tabs) return
            const utilityNode = findUtilityTabNode(tabs)
            if (!utilityNode) return
            insertion = { container: tabs, utilityNode }
        }

        const tabContainer = insertion.container
        const utilityNode = insertion.utilityNode

        const actor = getEligibleControlledActor()
        const current = actor ? getActorActionCount(actor) : 0
        const max = actor ? getActorActionMax(actor) : DEFAULT_ACTION_TRACKER_MAX
        const label = `Action ${current}/${max}`

        // Check if tracker already exists
        let injected = tabContainer.querySelector?.('#uesrpg-actions-tracker-wrapper')
        || tabContainer.querySelector?.('#uesrpg-actions-tracker-tab')
        || tabContainer.querySelector?.('[data-uesrpg-actions-tracker="true"]')

        if (!injected) {
            injected = makeTrackerNode(utilityNode, label)
            // Insert before the structural Utility node.
            tabContainer.insertBefore(injected, utilityNode)

            // Wire interactions once.
            const btn = getTrackerButtonFromInjected(injected)
            if (btn) {
                btn.addEventListener('click', async (ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    const a = getEligibleControlledActor()
                    if (!a) return
                    await incrementActorActionCount(a, +1)
                    updateActionsTrackerInDOM()
                })
                btn.addEventListener('contextmenu', async (ev) => {
                    ev.preventDefault()
                    ev.stopPropagation()
                    const a = getEligibleControlledActor()
                    if (!a) return
                    await incrementActorActionCount(a, -1)
                    updateActionsTrackerInDOM()
                })
            }
        } else {
            const btn = getTrackerButtonFromInjected(injected)
            if (btn) btn.textContent = label
        }

        // Ensure the injected node remains positioned immediately before Utility (idempotent).
        // This protects against Core reflows/reorders without requiring multiple delayed injections.
        if (injected && insertion?.utilityNode && injected.parentElement === tabContainer) {
            const ref = insertion.utilityNode
            if (ref && injected !== ref.previousElementSibling) {
                tabContainer.insertBefore(injected, ref)
            }
        }

// Apply enabled/disabled state depending on whether we have an eligible controlled actor.
        const btn = getTrackerButtonFromInjected(injected)
        if (btn) {
            const enabled = !!actor
            btn.setAttribute('aria-disabled', enabled ? 'false' : 'true')
            btn.classList.toggle('disabled', !enabled)
        }
    } catch (err) {
        console.warn('TAH UESRPG3e | Failed to ensure Actions tracker tab', err)
    }
}

// Token Action HUD Core emits a dedicated render hook.
// This is the correct and reliable place to manipulate the HUD DOM.
Hooks.on('renderTokenActionHud', (app, html) => {
    // Inject once per render; updates are debounced to avoid bursty DOM writes.
    scheduleActionsTrackerUpdate({ ensure: true, app, html, immediate: true })
})

// Some Token Action HUD Core versions emit a "forceUpdate" hook (e.g. when the selected token changes).
Hooks.on('forceUpdateTokenActionHud', () => {
    scheduleActionsTrackerUpdate({ ensure: true, delay: 25 })
})

// Helper function to update the Actions tracker directly in the DOM
function repositionActionsTrackerBeforeUtility (hudRoot, trackerNode) {
    if (!hudRoot || !trackerNode) return
    try {
        const insertion = findTabInsertionPoint(hudRoot)
        if (!insertion?.container || !insertion?.utilityNode) return

        // If the tracked node is the control, prefer moving the wrapper when present.
        const moving = trackerNode.closest?.('#uesrpg-actions-tracker-wrapper') || trackerNode
        const { container, utilityNode } = insertion

        // Ensure the tracker lives in the resolved container and is positioned immediately before Utility.
        if (moving.parentElement !== container) {
            container.insertBefore(moving, utilityNode)
            return
        }
        if (moving !== utilityNode.previousElementSibling) {
            container.insertBefore(moving, utilityNode)
        }
    } catch (err) {
        // no-op
    }
}

function flushActionsTrackerUpdate (app, html, { ensure = false } = {}) {
    const hudRoot = getHudRoot(app, html)

    // Ensure or re-ensure the injected node when requested, or if missing.
    let tracker = (hudRoot?.querySelector?.('[data-uesrpg-actions-tracker="true"]') ?? null)
        || document.querySelector('[data-uesrpg-actions-tracker="true"]')

    if (ensure || !tracker) {
        // Force a re-ensure pass; this is idempotent and will move the node if needed.
        ensureActionsTrackerTab(app, html)

        // Refresh reference after ensure.
        tracker = (hudRoot?.querySelector?.('[data-uesrpg-actions-tracker="true"]') ?? null)
            || document.querySelector('[data-uesrpg-actions-tracker="true"]')
    }

    if (!tracker) return

    const actor = getEligibleControlledActor()
    const current = actor ? getActorActionCount(actor) : 0
    const max = actor ? getActorActionMax(actor) : DEFAULT_ACTION_TRACKER_MAX
    const label = `Action ${current}/${max}`
    const actorId = actor?.id ?? null

    const btn = getTrackerButtonFromInjected(tracker)
    if (btn) {
        // Update label only if it changed (prevents redundant DOM writes during bursty hooks).
        if (label !== _lastTrackerLabel || actorId !== _lastTrackerActorId) {
            btn.textContent = label
            _lastTrackerLabel = label
            _lastTrackerActorId = actorId
        }

        const enabled = !!actor
        btn.setAttribute('aria-disabled', enabled ? 'false' : 'true')
        btn.classList.toggle('disabled', !enabled)
    }

    // Keep placement stable (Core can reflow / reorder).
    if (hudRoot) repositionActionsTrackerBeforeUtility(hudRoot, tracker)
}

function scheduleActionsTrackerUpdate ({ delay = 50, ensure = false, app = null, html = null, immediate = false } = {}) {
    // Coalesce ensure requests across a debounce window.
    _lastTrackerEnsureRequested = _lastTrackerEnsureRequested || !!ensure

    const run = () => {
        const shouldEnsure = _lastTrackerEnsureRequested
        _lastTrackerEnsureRequested = false
        flushActionsTrackerUpdate(app, html, { ensure: shouldEnsure })
    }

    if (immediate || delay <= 0) {
        if (_trackerUpdateTimer) {
            clearTimeout(_trackerUpdateTimer)
            _trackerUpdateTimer = null
        }
        run()
        return
    }

    if (_trackerUpdateTimer) clearTimeout(_trackerUpdateTimer)
    _trackerUpdateTimer = setTimeout(() => {
        _trackerUpdateTimer = null
        run()
    }, delay)
}

// Backwards-compatible name used elsewhere in this file.
function updateActionsTrackerInDOM () {
    scheduleActionsTrackerUpdate({ immediate: true })
}


// Update tracker when actor data changes (action points, etc.)
Hooks.on('updateActor', (actor, updateData, options, userId) => {
    // Scope to the currently controlled actor only.
    const controlledActor = canvas?.tokens?.controlled?.[0]?.actor ?? null
    if (!controlledActor || actor?.id !== controlledActor.id) return

    const touched = updateData?.flags?.[MODULE.ID]?.[ACTION_TRACKER_FLAG_KEY]
        || updateData?.flags?.[MODULE.ID]?.[ACTION_TRACKER_FLAG_KEY]?.value
        || updateData?.system?.action_points
        || updateData?.system?.combat_tracking

    if (touched) scheduleActionsTrackerUpdate({ delay: 50 })
})

// Update tracker when token selection changes
Hooks.on('controlToken', (token, controlled) => {
    // Selection changes can cause HUD rebuilds; ensure injection, then update.
    scheduleActionsTrackerUpdate({ ensure: true, delay: 25 })
})

// Update tracker when combat round/turn changes (attacks reset)
Hooks.on('updateCombat', (combat, updateData, options, userId) => {
    if (updateData?.round || updateData?.turn) {
        scheduleActionsTrackerUpdate({ delay: 50 })
    }
})

/**
 * Increment attack count helper function
 * Uses the system's AttackTracker if available, otherwise manually increments
 * @param {object} attackerActor The attacker actor
 */
async function incrementAttackCount (attackerActor) {
    if (!attackerActor) return
    
    try {
        // Try to use the system's AttackTracker first (preferred method)
        try {
            const path = getSystemModulePath('module/combat/attack-tracker.js')
            if (!path) throw new Error('System path unavailable')
            const { AttackTracker } = await import(path)
            if (AttackTracker && typeof AttackTracker.incrementAttacks === 'function') {
                await AttackTracker.incrementAttacks(attackerActor)
                return
            }
        } catch (importError) {
            // AttackTracker not available, fall back to manual increment
        }
        
        // Fallback: manually increment using the correct path
        // Path confirmed from AttackTracker: system.combat_tracking.attacks_this_round
        const current = attackerActor.system?.combat_tracking?.attacks_this_round ?? 0
        await attackerActor.update({
            'system.combat_tracking.attacks_this_round': current + 1
        })
    } catch (error) {
        console.error('Error incrementing attack count:', error)
    }
}

/**
 * Hook into attack completion to increment attack count
 * Note: The system's OpposedWorkflow already calls AttackTracker.incrementAttacks() at line 3814,
 * but this hook serves as a backup to ensure the HUD updates correctly when attacks are committed.
 * 
 * Listens for button clicks on attack commit buttons in chat cards.
 */
Hooks.on('renderChatMessage', async (message, html, data) => {
    // Look for commit buttons in opposed workflow chat cards
    // The system uses data-ues-opposed-action="commit" for attack commits
    const selector = 'button[data-ues-opposed-action="commit"]'
    html.off('click.tah-uesrpg3ev4', selector)
    html.on('click.tah-uesrpg3ev4', selector, async (event) => {
        try {
            // Get the message flags to find the attacker
            const workflowData = message?.flags?.['uesrpg-3ev4']?.opposedWorkflow || 
                                message?.flags?.uesrpg3ev4?.opposedWorkflow
            
            if (!workflowData) return
            
            // Only process weapon attacks (has weaponUuid or attackMode in context)
            const context = workflowData.context || {}
            const isAttack = context.weaponUuid || context.attackMode
            
            if (!isAttack) return
            
            // Get attacker actor from context
            const attackerUuid = context.attackerTokenUuid || 
                               context.attackerActorUuid ||
                               workflowData.attackerTokenUuid ||
                               workflowData.attackerActorUuid
            
            if (!attackerUuid) return
            
            const attackerDoc = await fromUuid(attackerUuid)
            const attackerToken = attackerDoc?.document ?? attackerDoc
            const attackerActor = attackerToken?.actor ?? attackerDoc
            
            // Increment attack count as backup (system should already do this, but ensure HUD updates)
            if (attackerActor) {
                await incrementAttackCount(attackerActor)
            }
        } catch (error) {
            console.error('Error incrementing attack count from button click:', error)
        }
    })
})

// ---------------------------------------------------------------------------
// Minimal API surface for additive integrations.
// ---------------------------------------------------------------------------

Hooks.once('ready', () => {
    const mod = game?.modules?.get?.(MODULE.ID)
    if (!mod) return

    // Expose a minimal API without coupling to Token Action HUD Core internals.
    // This allows other system-adjacent modules to:
    //  - register small additive build extensions
    //  - invalidate the conservative build cache when they change relevant data
    mod.api = {
        registerBuildExtension,
        unregisterBuildExtension,
        invalidateCacheByActorId: invalidateBuildCacheByActorId,
        invalidateCacheByTokenId: invalidateBuildCacheByKey,
        invalidateAllCaches: invalidateAllBuildCaches
    }

    debugLog('API ready')
    Hooks.callAll('tokenActionHud.uesrpg3ev4ApiReady', mod.api)
})
