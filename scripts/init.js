import { SystemManager } from './system-manager.js'
import { MODULE, REQUIRED_CORE_MODULE_VERSION } from './constants.js'

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
 * Ensure an always-visible, non-clickable Actions tracker button exists in the HUD tab bar.
 * Shows "Actions X/Y" where X is current action points and Y is max action points.
 * 
 * This is the ONLY place where the Actions tracker is displayed - as a tab button in the tab bar.
 * It appears before the "Utility" tab and updates automatically when action points change.
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

        // Prefer the render hook HTML root (most reliable), with a fallback to a known id.
        // Token Action HUD Core's root element id/class has differed across releases and layouts.
        const hudRoot = (html?.[0] ?? html) || document.querySelector('#token-action-hud')
        if (!hudRoot) return

        // Locate the Utility tab button.
        const utilityText = (game?.i18n?.localize?.('tokenActionHud.utility') ?? 'Utility').trim()
        const buttons = Array.from(hudRoot.querySelectorAll('button, a, div[role="button"]'))
        const utilityBtn = buttons.find(b => (b.textContent ?? '').trim() === utilityText)
        if (!utilityBtn) return

        // Some Token Action HUD Core layouts wrap each tab button in a `.tah-tab-group`.
        // When that wrapper is present, its parent is the actual tab bar container.
        const utilityWrapper = utilityBtn.closest('.tah-tab-group')

        // Determine the tab bar container.
        // Prefer known tab containers. Some layouts wrap each tab button in a `.tah-tab-group`.
        // In that case, the Utility button's parent is the wrapper, NOT the tab bar; inserting there
        // would place two buttons inside one wrapper (no gap) and visually overlap.
            // Reuse wrapper determined above (if any)
        const tabs = utilityBtn.closest('#tah-groups')
            || utilityBtn.closest('.tah-tab-groups')
            || utilityWrapper?.parentElement
            || utilityBtn.parentElement
        if (!tabs) return

        // Get current actor's action points
        const token = canvas?.tokens?.controlled?.[0] ?? null
        const actor = token?.actor ?? null

        // Only show for PC/NPC actors as requested.
        // Actor types in this system are localized labels (see system template.json):
        // "Player Character" and "NPC".
        if (!actor || !['Player Character', 'NPC'].includes(actor.type)) return
        const currentAP = Number(actor?.system?.action_points?.value ?? 0) || 0
        const maxAP = Number(actor?.system?.action_points?.max ?? 0) || 0
        const label = `Actions ${currentAP}/${maxAP}`

        // Check if tracker already exists
        let injected = tabs.querySelector?.('[data-uesrpg-actions-tracker="true"]')

        if (!injected) {
            // Create new tracker "tab" element.
            // Mirror the structure around the existing Utility control (wrapper or direct button).
            // Build the interactive element in the same tag family as the Utility control.
            const btn = document.createElement(utilityBtn.tagName.toLowerCase() === 'a' ? 'a' : 'button')
            if (btn.tagName.toLowerCase() === 'button') btn.type = 'button'

            // Copy Utility classes for consistent styling, then apply our "disabled" marker.
            for (const c of Array.from(utilityBtn.classList ?? [])) btn.classList.add(c)
            btn.classList.add('tah-ap-tracker')

            // Make it explicitly non-interactive.
            btn.style.pointerEvents = 'none'
            btn.setAttribute('aria-disabled', 'true')
            btn.textContent = label

            // If the HUD uses wrappers, create a wrapper consistent with Utility's wrapper.
            if (utilityWrapper) {
                injected = document.createElement('div')
                injected.className = utilityWrapper.className
                injected.dataset.uesrpgActionsTracker = 'true'
                injected.appendChild(btn)
            } else {
                injected = btn
                injected.dataset.uesrpgActionsTracker = 'true'
            }

            // Insert before Utility.
            // If TAH Core uses wrappers (.tah-tab-group), we insert before the wrapper.
            // Otherwise, we insert before the button itself.
            if (utilityWrapper && utilityWrapper.parentElement === tabs) {
                tabs.insertBefore(injected, utilityWrapper)
            } else {
                tabs.insertBefore(injected, utilityBtn)
            }
        } else {
            // Update existing tracker label
            const btn = injected.matches?.('button, a, div[role="button"]')
                ? injected
                : injected.querySelector?.('button, a, div[role="button"]')
            if (btn) btn.textContent = label
        }
    } catch (err) {
        console.warn('TAH UESRPG3e | Failed to ensure Actions tracker tab', err)
    }
}

// Token Action HUD Core emits a dedicated render hook.
// This is the correct and reliable place to manipulate the HUD DOM.
Hooks.on('renderTokenActionHud', (app, html) => {
    // Try to inject immediately, then again after a delay to handle async DOM updates
    ensureActionsTrackerTab(app, html)
    setTimeout(() => {
        ensureActionsTrackerTab(app, html)
    }, 100)
})

// Some Token Action HUD Core versions emit a "forceUpdate" hook (e.g. when the selected token changes).
Hooks.on('forceUpdateTokenActionHud', () => {
    setTimeout(updateActionsTrackerInDOM, 50)
})

// Helper function to update the Actions tracker directly in the DOM
function updateActionsTrackerInDOM () {
    try {
        const tracker = document.querySelector('[data-uesrpg-actions-tracker="true"]')
        if (!tracker) return

        const token = canvas?.tokens?.controlled?.[0] ?? null
        const actor = token?.actor ?? null
        const currentAP = Number(actor?.system?.action_points?.value ?? 0) || 0
        const maxAP = Number(actor?.system?.action_points?.max ?? 0) || 0
        const label = `Actions ${currentAP}/${maxAP}`

        const btn = tracker.matches?.('button, a, div[role="button"]')
            ? tracker
            : tracker.querySelector?.('button, a, div[role="button"]')
        if (btn) btn.textContent = label
    } catch (err) {
        // Silently fail if DOM isn't ready yet
    }
}

// Update tracker when actor data changes (action points, etc.)
Hooks.on('updateActor', (actor, updateData, options, userId) => {
    if (updateData?.system?.action_points || updateData?.system?.combat_tracking) {
        setTimeout(updateActionsTrackerInDOM, 100)
    }
})

// Update tracker when token selection changes
Hooks.on('controlToken', (token, controlled) => {
    setTimeout(updateActionsTrackerInDOM, 100)
})

// Update tracker when combat round/turn changes (attacks reset)
Hooks.on('updateCombat', (combat, updateData, options, userId) => {
    if (updateData?.round || updateData?.turn) {
        setTimeout(updateActionsTrackerInDOM, 100)
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
            const { AttackTracker } = await import('/systems/uesrpg-3ev4/module/combat/attack-tracker.js')
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
