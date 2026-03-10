import { MODULE } from './constants.js'
import { getSystemModulePath, diagLog } from './utils.js'

function _systemImportPath (relativePath) {
    const p = getSystemModulePath(relativePath)
    if (p) return p
    const clean = String(relativePath ?? '').replace(/^\/+/, '')
    return `/systems/uesrpg-3ev4/${clean}`
}

async function _importFirst (paths = []) {
    for (const path of paths) {
        try {
            return await import(path)
        } catch (_err) {}
    }
    return null
}

function _makeSyntheticTarget (dataset = {}) {
    return { dataset: { ...(dataset ?? {}) } }
}

function _makeSyntheticEvent (target, { shiftKey = false } = {}) {
    const ev = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        shiftKey: !!shiftKey
    })
    Object.defineProperty(ev, 'currentTarget', { writable: false, value: target })
    return ev
}

function _resolveToken (actor, explicitToken = null) {
    if (explicitToken) return explicitToken
    const controlled = canvas?.tokens?.controlled?.find?.(t => t?.actor?.id === actor?.id) ?? null
    if (controlled) return controlled
    return actor?.getActiveTokens?.()?.[0] ?? null
}

function _getTokenActionHudApi () {
    return game?.uesrpg?.api?.tokenActionHud ?? null
}

export class SystemAdapter {
    static capabilities = {
        hasRuntimeApi: false,
        hasPublicBarrel: false,
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
        SystemAdapter.logDiagnostics('Using transitional fallback', { method: 'executeCombatQuickAction', path: 'src/ui/sheets/shared/listeners/combat-actions.js' })

        const resolvedToken = _resolveToken(actor, token)
        const dataset = {
            ...(payload ?? {}),
            combatAction: payload?.combatAction ?? payload?.action ?? '',
            action: payload?.action ?? payload?.combatAction ?? ''
        }

        const target = _makeSyntheticTarget(dataset)
        const event = _makeSyntheticEvent(target, { shiftKey })
        const sheet = actor?.sheet ?? { actor, token: resolvedToken, element: null }

        if (sheet && typeof sheet._onCombatQuickAction === 'function') {
            await sheet._onCombatQuickAction(event, target)
            return { ok: true, path: 'sheet._onCombatQuickAction' }
        }

        const mod = await _importFirst([
            _systemImportPath('src/ui/sheets/shared/listeners/combat-actions.js')
        ])

        if (typeof mod?.onCombatQuickAction === 'function') {
            await mod.onCombatQuickAction.call(sheet, event, target)
            return { ok: true, path: 'shared.listeners.onCombatQuickAction' }
        }

        return { ok: false, path: 'none', reason: 'no-combat-handler' }
    }

    static async executeCastMagic ({ actor, token = null, preselectedSpell = null, shiftKey = false, castActionType = 'primary' } = {}) {
        if (!actor) return { ok: false, path: 'none', reason: 'no-actor' }
        const api = _getTokenActionHudApi()
        if (typeof api?.executeCastMagic === 'function') {
            return api.executeCastMagic({ actor, token, preselectedSpell, shiftKey, castActionType })
        }
        SystemAdapter.logDiagnostics('Using transitional fallback', { method: 'executeCastMagic', path: 'src/ui/sheets/shared/listeners/magic-cast.js' })

        const resolvedToken = _resolveToken(actor, token)
        const target = _makeSyntheticTarget({ actionType: castActionType === 'secondary' ? 'secondary' : 'primary' })
        const event = _makeSyntheticEvent(target, { shiftKey })
        const sheet = actor?.sheet ?? { actor, token: resolvedToken, element: null }

        if (sheet && typeof sheet._onCastMagicAction === 'function') {
            await sheet._onCastMagicAction(event, target, preselectedSpell)
            return { ok: true, path: 'sheet._onCastMagicAction' }
        }

        const mod = await _importFirst([
            _systemImportPath('src/ui/sheets/shared/listeners/magic-cast.js')
        ])

        if (typeof mod?.onCastMagicAction === 'function') {
            await mod.onCastMagicAction.call(sheet, event, target, preselectedSpell)
            return { ok: true, path: 'shared.listeners.onCastMagicAction' }
        }

        return { ok: false, path: 'none', reason: 'no-cast-handler' }
    }

    static async executeSkillRoll ({ actor, itemId, shiftKey = false } = {}) {
        if (!actor || !itemId) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.executeSkillRoll === 'function') {
            return api.executeSkillRoll({ actor, itemId, shiftKey })
        }
        SystemAdapter.logDiagnostics('Using transitional fallback', { method: 'executeSkillRoll', path: 'src/ui/sheets/shared/listeners/rolls.js' })
        const target = {
            dataset: { itemId },
            closest: () => ({ dataset: { itemId } })
        }
        const event = _makeSyntheticEvent(target, { shiftKey })
        const sheet = actor?.sheet ?? { actor, element: null }

        if (sheet && typeof sheet._onSkillRoll === 'function') {
            await sheet._onSkillRoll(event, target)
            return { ok: true, path: 'sheet._onSkillRoll' }
        }

        const mod = await _importFirst([
            _systemImportPath('src/ui/sheets/shared/listeners/rolls.js')
        ])
        if (typeof mod?.onSkillRoll === 'function') {
            await mod.onSkillRoll.call(sheet, event, target)
            return { ok: true, path: 'shared.listeners.onSkillRoll' }
        }

        return { ok: false, path: 'none', reason: 'no-skill-handler' }
    }

    static async executeCombatRoll ({ actor, itemId, shiftKey = false } = {}) {
        if (!actor || !itemId) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.executeCombatRoll === 'function') {
            return api.executeCombatRoll({ actor, itemId, shiftKey })
        }
        SystemAdapter.logDiagnostics('Using transitional fallback', { method: 'executeCombatRoll', path: 'src/ui/sheets/shared/listeners/rolls.js' })
        const target = {
            dataset: { itemId },
            closest: () => ({ dataset: { itemId } })
        }
        const event = _makeSyntheticEvent(target, { shiftKey })
        const sheet = actor?.sheet ?? { actor, element: null }

        if (sheet && typeof sheet._onCombatRoll === 'function') {
            await sheet._onCombatRoll(event, target)
            return { ok: true, path: 'sheet._onCombatRoll' }
        }

        const mod = await _importFirst([
            _systemImportPath('src/ui/sheets/shared/listeners/rolls.js')
        ])
        if (typeof mod?.onCombatRoll === 'function') {
            await mod.onCombatRoll.call(sheet, event, target)
            return { ok: true, path: 'shared.listeners.onCombatRoll' }
        }

        return { ok: false, path: 'none', reason: 'no-combat-roll-handler' }
    }

    static async executeCharacteristicRoll ({ actor, key, label, shiftKey = false } = {}) {
        if (!actor || !key || !label) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.executeCharacteristicRoll === 'function') {
            return api.executeCharacteristicRoll({ actor, key, label, shiftKey })
        }
        SystemAdapter.logDiagnostics('Using transitional fallback', { method: 'executeCharacteristicRoll', path: 'src/ui/sheets/shared/listeners/characteristics-handlers.js' })

        const target = document.createElement('span')
        target.id = key
        target.setAttribute('name', label)
        const event = _makeSyntheticEvent(target, { shiftKey })
        const sheet = actor?.sheet ?? { actor, element: null }

        if (sheet && typeof sheet._onClickCharacteristic === 'function') {
            await sheet._onClickCharacteristic(event, target)
            return { ok: true, path: 'sheet._onClickCharacteristic' }
        }

        const mod = await _importFirst([
            _systemImportPath('src/ui/sheets/shared/listeners/characteristics-handlers.js')
        ])
        if (typeof mod?.onClickCharacteristic === 'function') {
            await mod.onClickCharacteristic.call(sheet, event, target)
            return { ok: true, path: 'shared.listeners.onClickCharacteristic' }
        }

        return { ok: false, path: 'none', reason: 'no-characteristic-handler' }
    }

    static async executeFeatureActivation ({ item, actor, event = null } = {}) {
        if (!item) return { ok: false, path: 'none', reason: 'no-item' }
        const api = _getTokenActionHudApi()
        if (typeof api?.executeFeatureActivation === 'function') {
            return api.executeFeatureActivation({ item, actor, event })
        }
        SystemAdapter.logDiagnostics('Using transitional fallback', { method: 'executeFeatureActivation', path: 'src/ui/sheets/shared-handlers.js' })

        const mod = await _importFirst([
            _systemImportPath('src/ui/sheets/shared-handlers.js')
        ])

        if (item.type === 'talent' && typeof mod?.activateTalentFromItemSheet === 'function') {
            await mod.activateTalentFromItemSheet({ item, event })
            return { ok: true, path: 'shared-handlers.activateTalentFromItemSheet' }
        }
        if (item.type === 'power' && typeof mod?.activatePowerFromItemSheet === 'function') {
            await mod.activatePowerFromItemSheet({ item, event })
            return { ok: true, path: 'shared-handlers.activatePowerFromItemSheet' }
        }
        if (item.type === 'trait' && typeof mod?.activateTraitFromItemSheet === 'function') {
            await mod.activateTraitFromItemSheet({ item, event })
            return { ok: true, path: 'shared-handlers.activateTraitFromItemSheet' }
        }

        const activationMod = await _importFirst([
            _systemImportPath('src/core/system/activation/activation-executor.js')
        ])

        if (typeof activationMod?.executeItemActivation === 'function') {
            await activationMod.executeItemActivation({
                item,
                actor: actor ?? item.actor ?? null,
                event,
                renderChat: true,
                includeImage: true,
                context: {}
            })
            return { ok: true, path: 'activation-executor.executeItemActivation' }
        }

        return { ok: false, path: 'none', reason: 'no-feature-activation-handler' }
    }

    static async executeScrollCast ({ actor, scrollItem, castActionType = 'primary' } = {}) {
        if (!actor || !scrollItem) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.executeScrollCast === 'function') {
            return api.executeScrollCast({ actor, scrollItem, castActionType })
        }
        SystemAdapter.logDiagnostics('Using transitional fallback', { method: 'executeScrollCast', path: 'src/core/magic/scroll-casting.js' })

        const mod = await _importFirst([
            _systemImportPath('src/core/magic/scroll-casting.js')
        ])

        if (typeof mod?.castScrollFromItem === 'function') {
            const result = await mod.castScrollFromItem({
                scrollItem,
                casterActor: actor,
                castActionType
            })
            return { ok: true, path: 'scroll-casting.castScrollFromItem', result }
        }

        return { ok: false, path: 'none', reason: 'no-scroll-cast-handler' }
    }

    static async openResourceDialog ({ actor, resourceId } = {}) {
        if (!actor || !resourceId) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.openResourceDialog === 'function') {
            return api.openResourceDialog({ actor, resourceId })
        }
        SystemAdapter.logDiagnostics('Using transitional fallback', { method: 'openResourceDialog', path: resourceId })

        if (resourceId === 'resource-health') {
            const mod = await _importFirst([_systemImportPath('src/ui/apps/hp-temp-hp-dialog.js')])
            if (mod?.HPTempHPDialog?.show) {
                await mod.HPTempHPDialog.show(actor)
                return { ok: true, path: 'HPTempHPDialog.show' }
            }
        }

        if (resourceId === 'resource-stamina') {
            const mod = await _importFirst([_systemImportPath('src/core/stamina/stamina-dialog.js')])
            if (typeof mod?.openStaminaDialog === 'function') {
                await mod.openStaminaDialog(actor)
                return { ok: true, path: 'openStaminaDialog' }
            }
        }

        if (resourceId === 'resource-magicka') {
            const mod = await _importFirst([_systemImportPath('src/ui/apps/magicka-barrier-dialog.js')])
            if (mod?.MagickaBarrierDialog?.show) {
                await mod.MagickaBarrierDialog.show(actor)
                return { ok: true, path: 'MagickaBarrierDialog.show' }
            }
        }

        if (resourceId === 'resource-luck') {
            const mod = await _importFirst([_systemImportPath('src/core/luck/luck-workflow.js')])
            const fn = mod?.openBurnLuckFromSheet ?? mod?.LuckAPI?.openBurnLuckFromSheet ?? mod?.LuckAPI?.openBurnDialog
            if (typeof fn === 'function') {
                await fn(actor)
                return { ok: true, path: 'luck.openBurnLuckFromSheet' }
            }
        }

        return { ok: false, path: 'none', reason: 'no-resource-dialog-handler' }
    }

    static async applyRest ({ actor, restType } = {}) {
        if (!actor || !restType) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.applyRest === 'function') {
            return api.applyRest({ actor, restType })
        }
        SystemAdapter.logDiagnostics('Using transitional fallback', { method: 'applyRest', path: 'src/ui/sheets/rest-workflow.js' })

        const mod = await _importFirst([_systemImportPath('src/ui/sheets/rest-workflow.js')])
        if (!mod) return { ok: false, path: 'none', reason: 'no-rest-module' }

        const fn = restType === 'shortRest' ? mod.applyShortRest : mod.applyLongRest
        if (typeof fn !== 'function') return { ok: false, path: 'none', reason: 'no-rest-function' }

        const { line } = await fn(actor)
        if (line && typeof mod.buildRestChatContent === 'function') {
            await ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({ actor }),
                content: mod.buildRestChatContent(restType === 'shortRest' ? 'Short Rest' : 'Long Rest', [line])
            })
        }

        return { ok: true, path: `rest-workflow.${restType}` }
    }

    static async openSocialSelector ({ actor, kind, entryId = null } = {}) {
        if (!actor || !kind) return { ok: false, path: 'none', reason: 'bad-args' }
        const api = _getTokenActionHudApi()
        if (typeof api?.openSocialSelector === 'function') {
            return api.openSocialSelector({ actor, kind, entryId })
        }
        SystemAdapter.logDiagnostics('Using transitional fallback', { method: 'openSocialSelector', path: 'src/ui/apps/v2/social-selectors.js' })
        const mod = await _importFirst([_systemImportPath('src/ui/apps/v2/social-selectors.js')])
        if (kind === 'language' && mod?.LanguageSelectorAppV2?.prompt) {
            await mod.LanguageSelectorAppV2.prompt(actor)
            return { ok: true, path: 'LanguageSelectorAppV2.prompt', entryId, focusedOpenSupported: false }
        }
        if (kind === 'faction' && mod?.FactionSelectorAppV2?.prompt) {
            await mod.FactionSelectorAppV2.prompt(actor)
            return { ok: true, path: 'FactionSelectorAppV2.prompt', entryId, focusedOpenSupported: false }
        }
        return { ok: false, path: 'none', reason: 'no-social-selector' }
    }

    static async getSpecialActionDefinition (id) {
        const api = _getTokenActionHudApi()
        if (typeof api?.getSpecialActionDefinition === 'function') {
            return api.getSpecialActionDefinition(id)
        }
        SystemAdapter.logDiagnostics('Using transitional fallback', { method: 'getSpecialActionDefinition', path: 'src/core/combat/combat-style-utils.js' })
        const mod = await _importFirst([_systemImportPath('src/core/combat/combat-style-utils.js')])
        if (typeof mod?.getSpecialActionById === 'function') {
            return mod.getSpecialActionById(id)
        }
        return null
    }

    static async buildSpecialActionsForActor (actor) {
        const api = _getTokenActionHudApi()
        if (typeof api?.buildSpecialActionsForActor === 'function') {
            return api.buildSpecialActionsForActor(actor)
        }
        SystemAdapter.logDiagnostics('Using transitional fallback', { method: 'buildSpecialActionsForActor', path: 'src/core/combat/combat-style-utils.js' })
        const mod = await _importFirst([_systemImportPath('src/core/combat/combat-style-utils.js')])
        if (typeof mod?.buildSpecialActionsForActor === 'function') {
            return mod.buildSpecialActionsForActor(actor) ?? []
        }
        return []
    }

    static async setItemEquipped ({ item, equipped } = {}) {
        if (!item) return { ok: false, path: 'none', reason: 'no-item' }
        const api = _getTokenActionHudApi()
        if (typeof api?.setItemEquipped === 'function') {
            return api.setItemEquipped({ item, equipped })
        }
        SystemAdapter.logDiagnostics('Using transitional fallback', { method: 'setItemEquipped', path: 'item.update.system.equipped' })

        const desired = Boolean(equipped)
        if (typeof item.update === 'function') {
            await item.update({ 'system.equipped': desired })
            return { ok: true, path: 'item.update.system.equipped' }
        }

        return { ok: false, path: 'none', reason: 'no-item-update' }
    }

    static async openDocumentSheet ({ document } = {}) {
        const api = _getTokenActionHudApi()
        if (typeof api?.openDocumentSheet === 'function') {
            return api.openDocumentSheet({ document })
        }
        if (!document?.sheet || typeof document.sheet.render !== 'function') {
            return { ok: false, path: 'none', reason: 'no-sheet' }
        }
        document.sheet.render(true)
        return { ok: true, path: 'document.sheet.render' }
    }

    static async runFeaturePostChatAutomation ({ item, actor = null, event = null } = {}) {
        if (!item) return { ok: false, path: 'none', reason: 'no-item' }
        const api = _getTokenActionHudApi()
        if (typeof api?.runFeaturePostChatAutomation === 'function') {
            return api.runFeaturePostChatAutomation({ item, actor, event })
        }
        SystemAdapter.logDiagnostics('Using transitional fallback', { method: 'runFeaturePostChatAutomation', path: 'src/core/system/activation/activation-executor.js' })
        const activationMod = await _importFirst([
            _systemImportPath('src/core/system/activation/activation-executor.js')
        ])
        if (typeof activationMod?.executeItemActivation === 'function') {
            await activationMod.executeItemActivation({
                item,
                actor: actor ?? item.actor ?? null,
                event,
                renderChat: false,
                includeImage: false,
                context: {}
            })
            return { ok: true, path: 'activation-executor.executeItemActivation.renderChatFalse' }
        }
        return { ok: false, path: 'none', reason: 'no-feature-post-chat-handler' }
    }
}

SystemAdapter.refreshCapabilities()
