import { MODULE } from './constants.js'
import { requestHudRefresh } from './cache.js'

/**
 * Register module settings
 * Called by Token Action HUD Core to register Token Action HUD system module settings
 * @param {function} _coreUpdate Core's setting-cache callback (for Core-owned settings only)
 */
export function register (_coreUpdate) {
    game.settings.register(MODULE.ID, 'passiveFeatureRightClick', {
        name: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.passiveFeatureRightClick.name'),
        hint: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.passiveFeatureRightClick.hint'),
        scope: 'client',
        config: true,
        type: String,
        choices: {
            chat: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.passiveFeatureRightClick.choices.chat'),
            sheet: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.passiveFeatureRightClick.choices.sheet')
        },
        default: 'chat',
        onChange: () => requestHudRefresh()
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
        onChange: () => requestHudRefresh()
    })

    // Unified debug toggle: controls all HUD debug and diagnostics logging.
    game.settings.register(MODULE.ID, 'debug', {
        name: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.debug.name'),
        hint: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.debug.hint'),
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => requestHudRefresh()
    })

    // Fail-visible action diagnostics for critical execution paths.
    game.settings.register(MODULE.ID, 'strictActionDiagnostics', {
        name: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.strictActionDiagnostics.name'),
        hint: game.i18n.localize('tokenActionHud.uesrpg3ev4.settings.strictActionDiagnostics.hint'),
        scope: 'client',
        config: true,
        type: Boolean,
        default: true,
        onChange: () => requestHudRefresh()
    })
}
