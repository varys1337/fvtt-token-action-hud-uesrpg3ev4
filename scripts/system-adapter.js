import { MODULE } from './constants.js'
import { diagLog } from './utils.js'

function _getTokenActionHudApi () {
    return game?.uesrpg?.api?.tokenActionHud ?? null
}

export class SystemAdapter {
    static capabilities = {
        hasRuntimeApi: false,
        lastResolvedAt: null
    }

    static refreshCapabilities () {
        const runtime = _getTokenActionHudApi()
        SystemAdapter.capabilities.hasRuntimeApi = !!runtime
        SystemAdapter.capabilities.lastResolvedAt = Date.now()
        return { ...SystemAdapter.capabilities }
    }

    static diagnosticsSnapshot () {
        return {
            ...SystemAdapter.refreshCapabilities(),
            systemId: game?.system?.id ?? null,
            systemVersion: game?.system?.version ?? null
        }
    }

    static logDiagnostics (...args) {
        try {
            if (!game?.settings?.get?.(MODULE.ID, 'debug')) return
        } catch {
            return
        }
        diagLog('[adapter]', ...args)
    }

    static async executeCombatQuickAction ({ actor, token = null, payload = {}, shiftKey = false } = {}) {
        if (!actor) return { ok: false, path: 'none', reason: 'no-actor' }
        const api = _getTokenActionHudApi()
        if (typeof api?.executeCombatQuickAction === 'function') {
            return api.executeCombatQuickAction({ actor, token, payload, shiftKey })
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'executeCombatQuickAction' })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }

    static async executeCastMagic ({ actor, token = null, preselectedSpell = null, shiftKey = false, castActionType = 'primary' } = {}) {
        if (!actor) return { ok: false, path: 'none', reason: 'no-actor' }
        const api = _getTokenActionHudApi()
        if (typeof api?.executeCastMagic === 'function') {
            return api.executeCastMagic({ actor, token, preselectedSpell, shiftKey, castActionType })
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'executeCastMagic' })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }

    static async executeCastEnchantment ({ actor, token = null, itemId, shiftKey = false } = {}) {
        if (!actor || !itemId) return { ok: false, path: 'none', reason: 'bad-args' }

        const item = actor.items?.get?.(itemId) ?? null
        if (!item) return { ok: false, path: 'none', reason: 'missing-item' }

        // Cast Enchantments must mirror the actor sheet inventory button, not the
        // generic Cast Magic action. The generic Cast Magic path treats stored item
        // spells as selectable spell sources and opens Spell Options before it reaches
        // the item-spellcasting runtime. The actor-sheet handler preserves the stored
        // spellcasting configuration on the item, including Ignore Test / skip test.
        const sheet = actor.sheet ?? null
        const handler = sheet?._onCastEnchantmentAction ?? sheet?.onCastEnchantmentAction ?? null
        if (typeof handler === 'function') {
            const target = {
                dataset: { action: 'castEnchantment', itemId: item.id },
                closest: () => target
            }
            const event = {
                currentTarget: target,
                target,
                shiftKey: Boolean(shiftKey),
                preventDefault: () => {},
                stopPropagation: () => {}
            }

            await handler.call(sheet, event, target)
            return { ok: true, path: 'actor-sheet-cast-enchantment-handler' }
        }

        const api = _getTokenActionHudApi()
        if (typeof api?.executeCastEnchantment === 'function') {
            return api.executeCastEnchantment({ actor, token, item, sourceItem: item, itemId: item.id, shiftKey })
        }
        if (typeof api?.castEnchantment === 'function') {
            return api.castEnchantment({ actor, token, item, sourceItem: item, itemId: item.id, shiftKey })
        }

        SystemAdapter.logDiagnostics('Missing system cast-enchantment handler', { method: 'executeCastEnchantment', actorId: actor.id, itemId: item.id })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }

    static async executeSkillRoll ({ actor, itemId, shiftKey = false } = {}) {
        if (!actor || !itemId) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.executeSkillRoll === 'function') {
            return api.executeSkillRoll({ actor, itemId, shiftKey })
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'executeSkillRoll' })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }

    static async executeCombatRoll ({ actor, itemId, shiftKey = false } = {}) {
        if (!actor || !itemId) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.executeCombatRoll === 'function') {
            return api.executeCombatRoll({ actor, itemId, shiftKey })
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'executeCombatRoll' })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }

    static async executeCharacteristicRoll ({ actor, key, label, shiftKey = false } = {}) {
        if (!actor || !key || !label) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.executeCharacteristicRoll === 'function') {
            return api.executeCharacteristicRoll({ actor, key, label, shiftKey })
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'executeCharacteristicRoll' })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }

    static async executeProfessionRoll ({ actor, professionKey, shiftKey = false } = {}) {
        if (!actor || !professionKey) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.executeProfessionRoll === 'function') {
            return api.executeProfessionRoll({ actor, professionKey, shiftKey })
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'executeProfessionRoll' })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }

    static async executeFeatureActivation ({ item, actor, event = null } = {}) {
        if (!item) return { ok: false, path: 'none', reason: 'no-item' }
        const api = _getTokenActionHudApi()
        if (typeof api?.executeFeatureActivation === 'function') {
            return api.executeFeatureActivation({ item, actor, event })
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'executeFeatureActivation' })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }

    static async executeScrollCast ({ actor, scrollItem, castActionType = 'primary' } = {}) {
        if (!actor || !scrollItem) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.executeScrollCast === 'function') {
            return api.executeScrollCast({ actor, scrollItem, castActionType })
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'executeScrollCast' })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }

    static async openResourceDialog ({ actor, resourceId } = {}) {
        if (!actor || !resourceId) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.openResourceDialog === 'function') {
            return api.openResourceDialog({ actor, resourceId })
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'openResourceDialog' })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }

    static async applyRest ({ actor, restType } = {}) {
        if (!actor || !restType) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.applyRest === 'function') {
            return api.applyRest({ actor, restType })
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'applyRest' })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }

    static async openSocialSelector ({ actor, kind, entryId = null } = {}) {
        if (!actor || !kind) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.openSocialSelector === 'function') {
            return api.openSocialSelector({ actor, kind, entryId })
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'openSocialSelector' })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }

    static async getSpecialActionDefinition (id) {
        const api = _getTokenActionHudApi()
        if (typeof api?.getSpecialActionDefinition === 'function') {
            return api.getSpecialActionDefinition(id)
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'getSpecialActionDefinition' })
        return null
    }

    static async buildSpecialActionsForActor (actor) {
        const api = _getTokenActionHudApi()
        if (typeof api?.buildSpecialActionsForActor === 'function') {
            return api.buildSpecialActionsForActor(actor)
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'buildSpecialActionsForActor' })
        return []
    }

    static async setItemEquipped ({ item, equipped } = {}) {
        if (!item) return { ok: false, path: 'none', reason: 'no-item' }
        const api = _getTokenActionHudApi()
        if (typeof api?.setItemEquipped === 'function') {
            return api.setItemEquipped({ item, equipped })
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'setItemEquipped' })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }

    static async openDocumentSheet ({ document } = {}) {
        const api = _getTokenActionHudApi()
        if (typeof api?.openDocumentSheet === 'function') {
            return api.openDocumentSheet({ document })
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'openDocumentSheet' })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }

    static async runFeaturePostChatAutomation ({ item, actor = null, event = null } = {}) {
        if (!item) return { ok: false, path: 'none', reason: 'no-item' }
        const api = _getTokenActionHudApi()
        if (typeof api?.runFeaturePostChatAutomation === 'function') {
            return api.runFeaturePostChatAutomation({ item, actor, event })
        }
        SystemAdapter.logDiagnostics('Missing system Token Action HUD API', { method: 'runFeaturePostChatAutomation' })
        return { ok: false, path: 'none', reason: 'missing-system-api' }
    }
}

SystemAdapter.refreshCapabilities()
