import { SystemManager } from './system-manager.js'
import { MODULE, REQUIRED_CORE_MODULE_VERSION } from './constants.js'
import { isSupportedActor, debugLog, sameDocument, resolveActorToken, canUpdateDocument, hasChangedPath, readActionPoints } from './utils.js'
import {
    invalidateAllBuildCaches,
    invalidateBuildCacheByActorId,
    invalidateBuildCacheByKey,
    registerHudRefreshHooks
} from './cache.js'
import { registerBuildExtension, unregisterBuildExtension } from './extensions.js'
import { registerLayoutCompatibilityHooks } from './layout-compatibility.js'
import { SystemAdapter } from './system-adapter.js'

let hudApp = null
let hudRoot = null
let trackerTimer = null
let lifecycleGeneration = 0
const pendingApEdits = new Map()

/** Core owns selection, including the assigned-character HUD with no controlled token. */
function getTrackerContext () {
    if (!canvas?.ready || !hudApp?.hudManager) return null
    const controlled = Array.from(canvas.tokens?.controlled ?? [])
    if (controlled.length > 1) return null
    const hudActor = hudApp.hudManager.actor
    if (!isSupportedActor(hudActor)) return null
    if (controlled.length === 1 && !sameDocument(controlled[0].actor, hudActor)) return null
    if (!controlled.length && !sameDocument(game.user?.character, hudActor)) return null
    const actor = controlled.length === 1 ? controlled[0].actor : game.user.character
    const token = controlled.length === 1 ? controlled[0] : resolveActorToken(actor, hudApp.hudManager.token)
    return { actor, token }
}

/** Serialize manual edits locally; never maintain an optimistic resource count. */
function queueActionPointEdit (delta) {
    const context = getTrackerContext()
    if (!context || !canUpdateDocument(context.actor) || !readActionPoints(context.actor)) return
    const actorUuid = context.actor.uuid
    if (!actorUuid) return
    const generation = lifecycleGeneration
    const previous = pendingApEdits.get(actorUuid) ?? Promise.resolve()
    const task = previous.then(async () => {
        if (generation !== lifecycleGeneration) return
        const current = getTrackerContext()
        if (!current || !sameDocument(current.actor, context.actor) || !canUpdateDocument(current.actor)) return
        if ((current.token?.document?.uuid ?? null) !== (context.token?.document?.uuid ?? null)) return
        const points = readActionPoints(current.actor)
        if (!points) return
        const next = Math.max(0, Math.min(points.max, points.value + delta))
        if (next !== points.value) await current.actor.update({ 'system.action_points.value': next })
        updateTracker()
    }).catch(error => {
        console.error(`${MODULE.ID} | Action point update failed`, error)
        ui.notifications.warn(game.i18n.localize('tokenActionHud.uesrpg3ev4.actionPointUpdateFailed'))
        updateTracker()
    }).finally(() => {
        if (pendingApEdits.get(actorUuid) === task) pendingApEdits.delete(actorUuid)
    })
    pendingApEdits.set(actorUuid, task)
}

/** The render hook provides pending HTML; it need not be connected yet. */
function ensureTracker (root) {
    const groups = root?.querySelector?.('[data-part="groups"]')
    if (!groups) return null
    let wrapper = groups.querySelector(':scope > [data-uesrpg-actions-tracker="true"]')
    if (!wrapper) {
        const doc = root.ownerDocument
        wrapper = doc.createElement('div')
        wrapper.className = 'uesrpg-actions-tracker-wrapper'
        wrapper.dataset.uesrpgActionsTracker = 'true'
        wrapper.dataset.uesrpgActionsTrackerRole = 'wrapper'
        const button = doc.createElement('button')
        button.type = 'button'
        button.className = 'tah-ap-tracker tah-group-button tah-button-box'
        button.dataset.uesrpgActionsTrackerRole = 'control'
        button.addEventListener('click', event => {
            event.preventDefault()
            event.stopPropagation()
            queueActionPointEdit(1)
        })
        button.addEventListener('contextmenu', event => {
            event.preventDefault()
            event.stopPropagation()
            queueActionPointEdit(-1)
        })
        wrapper.append(button)
    }

    const utility = Array.from(groups.children).find(group =>
        group.matches('[data-part="group"]') &&
        group.querySelector('[data-part="groupButton"][value="utility"]')
    )
    if (utility && wrapper.nextElementSibling !== utility) groups.insertBefore(wrapper, utility)
    else if (!utility && groups.lastElementChild !== wrapper) groups.append(wrapper)
    return wrapper.querySelector('[data-uesrpg-actions-tracker-role="control"]')
}

function updateTracker (pendingRoot = null) {
    const root = pendingRoot ?? (hudRoot?.isConnected ? hudRoot : null)
    if (!root) return
    const button = ensureTracker(root)
    if (!button) return
    const context = getTrackerContext()
    const points = context ? readActionPoints(context.actor) : null
    const label = game.i18n.localize('tokenActionHud.uesrpg3ev4.actionsTracker')
    const text = points ? `${label} ${points.value}/${points.max}` : `${label} —`
    if (button.textContent !== text) button.textContent = text
    button.disabled = !points || !canUpdateDocument(context?.actor)
    button.setAttribute('aria-disabled', String(button.disabled))
    button.setAttribute('aria-label', text)
    button.title = game.i18n.localize('tokenActionHud.uesrpg3ev4.actionsTrackerHint')
}

function scheduleTrackerUpdate () {
    if (trackerTimer !== null) return
    trackerTimer = setTimeout(() => {
        trackerTimer = null
        updateTracker()
    }, 25)
}

function clearTracker () {
    lifecycleGeneration += 1
    if (trackerTimer !== null) clearTimeout(trackerTimer)
    trackerTimer = null
    hudRoot = null
    hudApp = null
    pendingApEdits.clear()
}

Hooks.once('tokenActionHudCoreApiReady', () => {
    const module = game.modules.get(MODULE.ID)
    if (!module) return
    module.api = {
        ...(module.api ?? {}),
        requiredCoreModuleVersion: REQUIRED_CORE_MODULE_VERSION,
        SystemManager,
        adapterCapabilities: SystemAdapter.diagnosticsSnapshot()
    }
    Hooks.callAll('tokenActionHudSystemReady', module)
})

registerLayoutCompatibilityHooks()

// Documented ApplicationV2 render/close lifecycle, specialized to Core's HUD class.
Hooks.on('renderTokenActionHud', (app, element, context, options) => {
    hudApp = app
    hudRoot = element
    updateTracker(element)
})
Hooks.on('closeTokenActionHud', app => {
    if (app === hudApp) clearTracker()
})
Hooks.on('canvasTearDown', clearTracker)
Hooks.on('forceUpdateTokenActionHud', scheduleTrackerUpdate)
Hooks.on('controlToken', scheduleTrackerUpdate)
Hooks.on('updateActor', (actor, changes) => {
    const context = getTrackerContext()
    if (sameDocument(actor, context?.actor) && hasChangedPath(changes, 'system.action_points')) scheduleTrackerUpdate()
})
for (const hook of ['createActorDelta', 'updateActorDelta', 'deleteActorDelta']) {
    Hooks.on(hook, delta => {
        const token = getTrackerContext()?.token
        if (sameDocument(delta?.parent, token)) scheduleTrackerUpdate()
    })
}

Hooks.once('ready', () => {
    registerHudRefreshHooks()
    const module = game.modules.get(MODULE.ID)
    if (!module) return
    module.api = {
        ...(module.api ?? {}),
        registerBuildExtension,
        unregisterBuildExtension,
        invalidateCacheByActorId: invalidateBuildCacheByActorId,
        invalidateCacheByTokenId: invalidateBuildCacheByKey,
        invalidateAllCaches: invalidateAllBuildCaches,
        adapterCapabilities: SystemAdapter.diagnosticsSnapshot(),
        getAdapterDiagnostics: () => SystemAdapter.diagnosticsSnapshot()
    }
    debugLog('API ready')
    Hooks.callAll('tokenActionHud.uesrpg3ev4ApiReady', module.api)
})
