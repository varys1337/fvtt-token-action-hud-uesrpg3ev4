import { MODULE } from './constants.js'

/**
 * Register module settings
 * Called by Token Action HUD Core to register Token Action HUD system module settings
 * @param {function} coreUpdate Token Action HUD Core update function
 */
export function register (coreUpdate) {
    game.settings.register(MODULE.ID, 'displayUnequipped', {
        name: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.displayUnequipped.name'),
        hint: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.displayUnequipped.hint'),
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            coreUpdate(value)
        }
    })

    game.settings.register(MODULE.ID, 'passiveFeatureLeftClick', {
        name: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.passiveFeatureLeftClick.name'),
        hint: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.passiveFeatureLeftClick.hint'),
        scope: 'client',
        config: true,
        type: String,
        choices: {
            chat: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.passiveFeatureLeftClick.choices.chat'),
            sheet: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.passiveFeatureLeftClick.choices.sheet')
        },
        default: 'chat',
        onChange: (value) => {
            coreUpdate(value)
        }
    })

    // Multi-token execution mode for Attacks/Spells/Talents when multiple tokens are selected.
    // - off: no multi-token item execution actions are shown
    // - intersection: only actions common to all selected actors are shown
    // - union: all actions across the selected actors are shown
    game.settings.register(MODULE.ID, 'multiTokenItemExecutionMode', {
        name: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.multiTokenItemExecutionMode.name'),
        hint: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.multiTokenItemExecutionMode.hint'),
        scope: 'client',
        config: true,
        type: String,
        choices: {
            off: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.multiTokenItemExecutionMode.choices.off'),
            intersection: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.multiTokenItemExecutionMode.choices.intersection'),
            union: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.multiTokenItemExecutionMode.choices.union')
        },
        default: 'intersection',
        onChange: (value) => {
            coreUpdate(value)
        }
    })

    game.settings.register(MODULE.ID, 'debug', {
        name: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.debug.name'),
        hint: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.debug.hint'),
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: (value) => {
            // Trigger a refresh so debug-only instrumentation can take effect immediately.
            coreUpdate(value)
        }
    })
}
