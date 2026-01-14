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
    html.on('click', 'button[data-ues-opposed-action="commit"]', async (event) => {
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
