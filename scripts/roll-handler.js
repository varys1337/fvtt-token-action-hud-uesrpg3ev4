import { MODULE } from './constants.js'
import { canUpdateDocument, diagLog, escapeText, getStatusEffectConfigs, isSupportedActor, resolveActorToken, sameDocument } from './utils.js'
import { SystemAdapter } from './system-adapter.js'

export let RollHandler = null

const ACTION_TYPES = new Set([
    'attack', 'meleeWeaponAttack', 'rangedWeaponAttack', 'aim', 'castMagic', 'castEnchantment',
    'dash', 'delay', 'disengage', 'hide', 'useItem', 'extinguishBurning', 'defensiveStance',
    'opportunityAttack', 'specialAction', 'skill', 'profession', 'magicSkill', 'combatStyle',
    'characteristic', 'weapon', 'armor', 'shield', 'item', 'container', 'ammunition', 'spell',
    'scroll', 'languageEntry', 'factionEntry', 'manageLanguages', 'manageFactions', 'language',
    'faction', 'talent', 'trait', 'power', 'secondaryAction', 'statusEffect', 'activeEffect',
    'resources', 'utility', 'tracker', 'multiCombat', 'multiItem'
])
const SPATIAL_ACTION_TYPES = new Set([
    'attack', 'meleeWeaponAttack', 'rangedWeaponAttack', 'aim', 'castMagic', 'dash', 'disengage',
    'hide', 'useItem', 'extinguishBurning', 'defensiveStance', 'opportunityAttack', 'specialAction',
    'secondaryAction', 'spell', 'scroll', 'multiCombat'
])
Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
    /**
     * Extends Token Action HUD Core's RollHandler class and handles action events triggered when an action is clicked
     */
    RollHandler = class RollHandler extends coreModule.api.RollHandler {
        #itemSheetActionTypes = new Set(['weapon', 'armor', 'shield', 'item', 'container', 'ammunition', 'spell', 'scroll', 'skill', 'magicSkill', 'combatStyle', 'language', 'faction'])

        /**
         * Handle action click
         * Called by Token Action HUD Core when an action is left or right-clicked
         * @override
         * @param {object} event        The event
         * @param {string} encodedValue The encoded value
         */
        async handleActionClick (event, encodedValue) {
            // Core does not await overrides. Contain every asynchronous failure here.
            try {
                const action = this.#resolveAction(encodedValue)
                if (!action) return this.#warn('invalidAction')
                // Informational counters never dispatch a document or system action.
                if (action.actionTypeId === 'tracker') return
                const click = this.#snapshotEvent(event)
                const selected = Array.from(canvas?.tokens?.controlled ?? [])
                const contexts = selected
                    .filter(token => isSupportedActor(token?.actor))
                    .map(token => ({ actor: token.actor, token }))
                const coreActor = this.actor
                const coreToken = this.token
                const assignedActor = game.user?.character ?? null
                if (coreActor && !isSupportedActor(coreActor)) return
                if (!selected.length && coreActor && !sameDocument(coreActor, assignedActor)) return this.#warn('selectionChanged')
                if (selected.length !== contexts.length) return this.#warn(contexts.length ? 'invalidAction' : 'noSupportedTokens')
                if (coreActor && selected.length && (contexts.length !== 1
                    || !sameDocument(contexts[0].actor, coreActor)
                    || (coreToken && !sameDocument(contexts[0].token, coreToken)))) return this.#warn('selectionChanged')
                if (new Set(contexts.map(context => context.actor.type)).size > 1) return this.#warn('mixedActorTypes')
                if (!coreActor && !contexts.length) return this.#warn('noSupportedTokens')

                const { actionTypeId, actionId } = action
                if (actionTypeId === 'statusEffect' && this.#isRightClick(click)) {
                    if (selected.length !== 1 || contexts.length !== 1) return this.#warn('selectOneTokenForStatus')
                    await canvas.hud.token.bind(contexts[0].token)
                    return
                }

                const single = contexts.length === 1
                    ? contexts[0]
                    : coreActor ? { actor: assignedActor, token: resolveActorToken(assignedActor) } : null
                if (single && this.#isSheetRequest(click)) {
                    if (await this.#tryOpenItemSheet(actionTypeId, actionId, single.actor)) return
                }

                const shared = actionTypeId === 'multiCombat' || actionTypeId === 'multiItem'
                if (contexts.length > 1 && !shared && actionTypeId !== 'statusEffect') return this.#warn('invalidAction')
                const spatial = SPATIAL_ACTION_TYPES.has(actionTypeId) || (actionTypeId === 'multiItem' && actionId.startsWith('spell~'))
                if (spatial && this.#hasDuplicateActors(contexts)) return this.#warn('ambiguousSpatialSelection')
                let sharedMode = null
                let sharedTargets = null
                if (shared) {
                    if (contexts.length < 2) return this.#warn('invalidAction')
                    if (!['intersection', 'union'].includes(game.settings.get(MODULE.ID, 'multiTokenItemExecutionMode'))) return this.#warn('invalidAction')
                    const confirmed = await this.#confirmMultiTokenExecution(actionTypeId, actionId, contexts.length)
                    if (!confirmed) return
                    if (!this.#selectionMatches(selected, contexts)) return this.#warn('selectionChanged')
                    sharedMode = game.settings.get(MODULE.ID, 'multiTokenItemExecutionMode')
                    sharedTargets = this.#preflightSharedAction(contexts, actionTypeId, actionId, sharedMode)
                    if (!sharedTargets?.length) return
                }

                let targets = shared ? sharedTargets : !single ? contexts : [single]
                if (!spatial) targets = this.#uniqueActorContexts(targets)
                const desiredActive = actionTypeId === 'statusEffect'
                    ? !targets.every(context => this.#hasStatusEffect(context.actor, actionId))
                    : null
                let failed = 0
                for (let index = 0; index < targets.length; index++) {
                    const context = targets[index]
                    if (shared) {
                        if (!this.#selectionMatches(selected, contexts)
                            || game.settings.get(MODULE.ID, 'multiTokenItemExecutionMode') !== sharedMode) return this.#warn('selectionChanged')
                        if (sharedMode === 'intersection'
                            && !this.#preflightSharedAction(targets.slice(index), actionTypeId, actionId, sharedMode)) return
                    }
                    try {
                        const actor = context.token?.actor ?? context.actor
                        if (!sameDocument(actor, context.actor)) throw new Error('HUD actor/token context changed')
                        if (shared) {
                            await this.#handleMultiTokenAction(click, actor, context.token, actionTypeId, actionId)
                        } else if (actionTypeId === 'statusEffect') {
                            await this.#handleStatusEffectAction(click, context.token, actor, actionId, desiredActive)
                        } else {
                            await this.#handleAction(click, actor, context.token, actionTypeId, actionId)
                        }
                    } catch (error) {
                        if (targets.length === 1) throw error
                        failed++
                        console.error(`${MODULE.ID} | HUD action failed`, { actorUuid: context.actor?.uuid, actionTypeId, actionId, error })
                    }
                }
                if (failed) this.#warn('multiActionFailed', { count: failed })
            } catch (error) {
                console.error(`${MODULE.ID} | HUD action failed`, error)
                this.#warn('actionFailed')
            }
        }

        #resolveAction (encodedValue) {
            let actionTypeId
            let actionId
            const metadata = this.action?.system
            if (metadata && (Object.hasOwn(metadata, 'actionTypeId') || Object.hasOwn(metadata, 'actionId'))) {
                actionTypeId = metadata.actionTypeId
                actionId = metadata.actionId
            } else {
                if (typeof encodedValue !== 'string') return null
                const parts = encodedValue.split('|')
                if (parts.length !== 2) return null
                actionTypeId = parts[0]
                actionId = parts[1]
            }
            if (typeof actionTypeId !== 'string' || typeof actionId !== 'string' || !actionId) return null
            actionTypeId = actionTypeId.replace(/^tokenActionHud\.uesrpg3ev4\./, '')
            actionTypeId = ({ delayAction: 'delay', extinguish: 'extinguishBurning' })[actionTypeId] ?? actionTypeId
            if (!ACTION_TYPES.has(actionTypeId)) return null
            if (actionTypeId === 'tracker' && actionId !== 'attacks') return null
            if (actionTypeId === 'multiCombat' && !['attack~melee', 'attack~ranged'].includes(actionId)) return null
            if (actionTypeId === 'multiItem' && !this.#parseSharedItem(actionId)) return null
            return { actionTypeId, actionId }
        }

        #snapshotEvent (event) {
            return Object.freeze({
                originalEvent: event,
                type: event?.type ?? 'click',
                button: event?.button ?? (this.isRightClick ? 2 : 0),
                shiftKey: Boolean(event?.shiftKey ?? this.isShift),
                altKey: Boolean(event?.altKey ?? this.isAlt),
                ctrlKey: Boolean(event?.ctrlKey ?? this.isCtrl),
                metaKey: Boolean(event?.metaKey),
                target: event?.target ?? null,
                currentTarget: event?.currentTarget ?? null,
                preventDefault: () => event?.preventDefault?.(),
                stopPropagation: () => event?.stopPropagation?.()
            })
        }

        #isRightClick (event) {
            return event?.button === 2 || event?.type === 'contextmenu'
        }

        #isSheetRequest (event) {
            return this.#isRightClick(event) && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey
        }

        #warn (key, data = {}) {
            ui.notifications?.warn?.(game.i18n.format(`tokenActionHud.uesrpg3ev4.${key}`, data))
        }

        #uniqueActorContexts (contexts) {
            return contexts.filter((context, index) => !contexts.slice(0, index).some(previous => sameDocument(previous.actor, context.actor)))
        }

        #hasDuplicateActors (contexts) {
            return this.#uniqueActorContexts(contexts).length !== contexts.length
        }

        #selectionMatches (selected, contexts) {
            const current = Array.from(canvas?.tokens?.controlled ?? [])
            return selected.length === current.length
                && selected.every(token => current.some(candidate => sameDocument(candidate, token)))
                && contexts.every(context => sameDocument(context.token.actor, context.actor))
        }

        #getSharedItemMatches (actor, shared) {
            return actor.items?.filter(item => item.type === shared.itemType
                && String(item.name ?? '').trim().toLowerCase() === shared.nameKey
                && (shared.itemType !== 'talent' || item.system?.activation?.enabled === true)) ?? []
        }

        #getSharedWeapon (actor, mode) {
            return actor.items?.find(item => item.type === 'weapon' && item.system?.equipped === true
                && (mode === 'ranged' ? item.system?.attackMode === 'ranged' : item.system?.attackMode !== 'ranged')) ?? null
        }

        #preflightSharedAction (contexts, actionTypeId, actionId, mode) {
            if (!['intersection', 'union'].includes(mode)) {
                this.#warn('invalidAction')
                return null
            }
            const sharedItem = actionTypeId === 'multiItem' ? this.#parseSharedItem(actionId) : null
            const weaponMode = actionTypeId === 'multiCombat' ? actionId.slice(actionId.indexOf('~') + 1) : null
            const eligible = []
            for (const context of contexts) {
                const actor = context.token?.actor ?? context.actor
                if (!sameDocument(actor, context.actor)) {
                    this.#warn('selectionChanged')
                    return null
                }
                const count = sharedItem ? this.#getSharedItemMatches(actor, sharedItem).length : Number(Boolean(this.#getSharedWeapon(actor, weaponMode)))
                if (count > 1 && mode === 'union') this.#warn('ambiguousSharedItem')
                if (count !== 1 || !canUpdateDocument(actor)) {
                    if (mode === 'intersection') {
                        this.#warn(count === 1 ? 'permissionDenied' : count > 1 ? 'ambiguousSharedItem' : 'invalidAction')
                        return null
                    }
                    continue
                }
                eligible.push({ actor, token: context.token })
            }
            return eligible
        }

        /**
         * Handle action hover
         * Called by Token Action HUD Core when an action is hovered on or off
         * @override
         * @param {object} event        The event
         * @param {string} encodedValue The encoded value
         */
        async handleActionHover (event, encodedValue) {}

        /**
         * Handle group click
         * Called by Token Action HUD Core when a group is right-clicked while the HUD is locked
         * @override
         * @param {object} event The event
         * @param {object} group The group
         */
        async handleGroupClick (event, group) {}

        /**
         * Whether strict action diagnostics are enabled.
         * @private
         * @returns {boolean}
         */
        #isStrictDiagnosticsEnabled () {
            try {
                return !!game?.settings?.get?.(MODULE.ID, 'strictActionDiagnostics')
            } catch {
                return true
            }
        }

        /**
         * Emit a fail-visible diagnostic for action dispatch issues.
         * @private
         * @param {string} message
         * @param {object} context
         */
        #notifyDispatchIssue (message, context = {}) {
            diagLog('[dispatch]', message, context)
            if (this.#isStrictDiagnosticsEnabled()) {
                ui.notifications?.warn?.(message)
            }
        }

        /**
         * Open an embedded item sheet when the action type maps to a real actor item.
         * Synthetic HUD actions intentionally do not pass through this path.
         * @private
         * @param {string} actionTypeId
         * @param {string} actionId
         * @param {Actor|null} actor
         * @returns {Promise<boolean>}
         */
        async #tryOpenItemSheet (actionTypeId, actionId, actor) {
            if (!this.#itemSheetActionTypes.has(actionTypeId) || !actor?.items?.get) return false
            const item = actor.items.get(actionId)
            if (!item) return false
            const result = await SystemAdapter.openDocumentSheet({ document: item })
            return result.ok === true
        }

        /**
         * Invoke the system Combat Quick Action handler.
         * @private
         */
        async #callCombatQuickAction (actor, token, dataset, eventOverrides = {}) {
            if (!canUpdateDocument(actor)) return this.#warn('permissionDenied')
            const normalizedDataset = {
                ...(dataset ?? {}),
                combatAction: dataset?.combatAction ?? dataset?.action ?? '',
                action: dataset?.action ?? dataset?.combatAction ?? ''
            }
            if (!normalizedDataset?.combatAction) {
                this.#notifyDispatchIssue('Invalid combat action payload: missing combatAction.', {
                    actorId: actor?.id,
                    dataset
                })
                return
            }
            const res = await SystemAdapter.executeCombatQuickAction({
                actor,
                token,
                payload: normalizedDataset,
                shiftKey: eventOverrides?.shiftKey || false
            })
            if (res?.ok) {
                diagLog('Using adapter entrypoint', { action: normalizedDataset?.combatAction, path: res?.path })
                return
            }
            this.#notifyDispatchIssue('No combat action handler available.', {
                action: normalizedDataset?.combatAction,
                actorId: actor?.id,
                tokenId: token?.id ?? null,
                adapterPath: res?.path ?? 'none'
            })
        }

        /**
         * Invoke the system Cast Magic handler.
         * @private
         */
        async #callCastMagicAction (actor, token, preselectedSpell = null, eventOverrides = {}) {
            if (!canUpdateDocument(actor)) return this.#warn('permissionDenied')
            const res = await SystemAdapter.executeCastMagic({
                actor,
                token,
                preselectedSpell,
                shiftKey: eventOverrides?.shiftKey || false,
                castActionType: eventOverrides?.castActionType ?? 'primary'
            })
            if (res?.ok) {
                diagLog('Using adapter entrypoint', { action: 'castMagic', path: res?.path })
                return
            }
            this.#notifyDispatchIssue('No Cast Magic handler is available.', {
                actorId: actor?.id,
                tokenId: token?.id ?? null,
                adapterPath: res?.path ?? 'none'
            })
        }

        /**
         * Invoke the system skill roll handler.
         * @private
         */
        async #callSkillRoll (actor, itemId, eventOverrides = {}) {
            const res = await SystemAdapter.executeSkillRoll({
                actor,
                itemId,
                shiftKey: eventOverrides?.shiftKey || false
            })
            if (res?.ok) {
                diagLog('Using adapter entrypoint', { action: 'skill', path: res?.path })
                return
            }
            this.#notifyDispatchIssue('No skill roll handler is available.', {
                actorId: actor?.id,
                itemId,
                adapterPath: res?.path ?? 'none'
            })
        }

        /**
         * Invoke the system combat style roll handler.
         * @private
         */
        async #callCombatStyleRoll (actor, itemId, eventOverrides = {}) {
            const res = await SystemAdapter.executeCombatRoll({
                actor,
                itemId,
                shiftKey: eventOverrides?.shiftKey || false
            })
            if (res?.ok) {
                diagLog('Using adapter entrypoint', { action: 'combatStyle', path: res?.path })
                return
            }
            this.#notifyDispatchIssue('No combat roll handler is available.', {
                actorId: actor?.id,
                itemId,
                adapterPath: res?.path ?? 'none'
            })
        }

        /**
         * Handle action
         * @private
         * @param {object} event        The event
         * @param {object} actor        The actor
         * @param {object} token        The token
         * @param {string} actionTypeId The action type id
         * @param {string} actionId     The actionId
         */
        async #handleAction (event, actor, token, actionTypeId, actionId) {
            switch (actionTypeId) {
            case 'attack':
                await this.#handleAttackAction(event, actor, actionId, token)
                break
            case 'meleeWeaponAttack':
                await this.#handleWeaponAttackAction(event, actor, actionId, token)
                break
            case 'rangedWeaponAttack':
                await this.#handleWeaponAttackAction(event, actor, actionId, token)
                break
            case 'aim':
                await this.#handleAimAction(event, actor, token)
                break
            case 'castMagic':
                await this.#handleCastMagicAction(event, actor, actionId, token)
                break
            case 'castEnchantment':
                await this.#handleCastEnchantmentAction(event, actor, actionId, token)
                break
            case 'dash':
                await this.#handleDashAction(event, actor, token)
                break
            case 'delay':
                await this.#handleDelayAction(event, actor, token)
                break
            case 'disengage':
                await this.#handleDisengageAction(event, actor, token)
                break
            case 'hide':
                await this.#handleHideAction(event, actor, token)
                break
            case 'useItem':
                await this.#handleUseItemAction(event, actor, token)
                break
            case 'extinguishBurning':
                await this.#handleExtinguishBurningAction(event, actor, token)
                break
            case 'defensiveStance':
                await this.#handleDefensiveStanceAction(event, actor, token)
                break
            case 'opportunityAttack':
                await this.#handleOpportunityAttackAction(event, actor, token)
                break
            case 'specialAction':
                await this.#handleSpecialAction(event, actor, actionId, token)
                break
            case 'skill':
                await this.#handleSkillAction(event, actor, actionId)
                break
            case 'profession':
                await this.#handleProfessionAction(event, actor, actionId)
                break
            case 'magicSkill':
                await this.#handleMagicSkillAction(event, actor, actionId)
                break
            case 'combatStyle':
                await this.#handleCombatStyleAction(event, actor, actionId)
                break
            case 'characteristic':
                await this.#handleCharacteristicAction(event, actor, actionId)
                break
            case 'weapon':
            case 'armor':
            case 'shield':
            case 'item':
            case 'ammunition':
                await this.#handleEquipmentAction(event, actor, actionId)
                break
            case 'container':
                await this.#handleContainerAction(event, actor, actionId)
                break
            case 'spell':
                await this.#handleSpellAction(event, actor, actionId, token)
                break
            case 'scroll':
                await this.#handleScrollAction(event, actor, actionId, token)
                break
            case 'languageEntry':
                await this.#handleSocialAction(actor, 'language', actionId)
                break
            case 'factionEntry':
                await this.#handleSocialAction(actor, 'faction', actionId)
                break
            case 'manageLanguages':
            case 'language':
                await this.#handleSocialAction(actor, 'language')
                break
            case 'manageFactions':
            case 'faction':
                await this.#handleSocialAction(actor, 'faction')
                break
            case 'talent':
            case 'trait':
            case 'power':
                await this.#handleFeatureAction(event, actor, actionId)
                break
            case 'secondaryAction':
                await this.#handleSecondaryActionAction(event, actor, actionId, token)
                break
            case 'statusEffect':
                await this.#handleStatusEffectAction(event, token, actor, actionId)
                break
            case 'activeEffect':
                await this.#handleActiveEffectAction(actor, actionId)
                break
            case 'resources':
                await this.#handleResourcesAction(token, actionId, actor)
                break
            case 'utility':
                await this.#handleUtilityAction(token, actionId, actor)
                break
            default:
                this.#notifyDispatchIssue('Unknown HUD action type received.', {
                    actionTypeId,
                    actionId,
                    actorId: actor?.id,
                    tokenId: token?.id ?? null
                })
                break
            }
        }

        /**
         * Confirm multi-token execution to avoid accidental mass-spam or unintended action economy usage.
         * @private
         * @param {string} actionTypeId
         * @param {string} actionId
         * @param {number} count
         * @returns {Promise<boolean>}
         */
        async #confirmMultiTokenExecution (actionTypeId, actionId, count) {
            const label = this.#describeMultiTokenAction(actionTypeId, actionId)
            const result = await foundry.applications.api.DialogV2.confirm({
                window: { title: game.i18n.localize('tokenActionHud.uesrpg3ev4.confirmMultiTitle') },
                content: `<p>${game.i18n.format('tokenActionHud.uesrpg3ev4.confirmMultiContent', { action: escapeText(label), count })}</p>`,
                yes: { default: false },
                no: { default: true },
                rejectClose: false
            })
            return result === true
        }

        /**
         * Resolve a human-readable label for a multi-token action.
         * @private
         * @param {string} actionTypeId
         * @param {string} actionId
         * @returns {string}
         */
        #describeMultiTokenAction (actionTypeId, actionId) {
            if (actionTypeId === 'multiCombat') {
                const [cmd, arg] = String(actionId ?? '').split('~')
                if (cmd === 'attack' && arg === 'melee') return `Shared ${game.i18n.localize('tokenActionHud.uesrpg3ev4.attackMelee')}`
                if (cmd === 'attack' && arg === 'ranged') return `Shared ${game.i18n.localize('tokenActionHud.uesrpg3ev4.attackRanged')}`
                return 'Combat Action'
            }

            if (actionTypeId === 'multiItem') {
                const shared = this.#parseSharedItem(actionId)
                if (!shared) return game.i18n.localize('tokenActionHud.uesrpg3ev4.unsupportedAction')
                return shared.itemType === 'spell' ? `Cast shared spell: ${shared.nameKey}` : `Use shared talent: ${shared.nameKey}`
            }

            return 'Action'
        }

        #parseSharedItem (actionId) {
            const separator = actionId.indexOf('~')
            if (separator < 1) return null
            const itemType = actionId.slice(0, separator)
            if (!['spell', 'talent'].includes(itemType)) return null
            try {
                const nameKey = decodeURIComponent(actionId.slice(separator + 1)).trim().toLowerCase()
                return nameKey ? { itemType, nameKey } : null
            } catch {
                return null
            }
        }

        /**
         * Handle a multi-token action for a single actor.
         * @private
         * @param {object} event
         * @param {Actor} actor
         * @param {Token} token
         * @param {string} actionTypeId
         * @param {string} actionId
         */
        async #handleMultiTokenAction (event, actor, token, actionTypeId, actionId) {
            if (!actor) return

            if (actionTypeId === 'multiCombat') {
                const [cmd, arg] = String(actionId ?? '').split('~')
                if (cmd === 'attack' && (arg === 'melee' || arg === 'ranged')) {
                    const weapon = this.#getSharedWeapon(actor, arg)
                    if (!weapon) return
                    await this.#handleAttackAction(event, actor, weapon.id ?? arg, token)
                }
                return
            }

            if (actionTypeId === 'multiItem') {
                const shared = this.#parseSharedItem(actionId)
                if (!shared) return this.#warn('invalidAction')
                const { itemType, nameKey } = shared

                const matches = this.#getSharedItemMatches(actor, { itemType, nameKey })
                if (!matches.length) return
                if (matches.length !== 1) {
                    this.#warn('ambiguousSharedItem')
                    return
                }
                const item = matches[0]

                if (itemType === 'spell') {
                    await this.#handleSpellAction(event, actor, item.id, token)
                    return
                }

                if (itemType === 'talent') {
                    await this.#handleFeatureAction(event, actor, item.id)
                    return
                }
            }
        }

        #hasStatusEffect (actor, statusId) {
            return actor?.statuses?.has(statusId) === true
        }

        /** Toggle active status through the documented Actor API. Native TokenHUD owns overlays. */
        async #handleStatusEffectAction (event, token, actor, statusId, forceActive = null) {
            if (!actor || !statusId) return
            if (!canUpdateDocument(actor)) return this.#warn('permissionDenied')
            if (!getStatusEffectConfigs().some(effect => effect.id === statusId)) return this.#warn('invalidAction')
            const active = typeof forceActive === 'boolean' ? forceActive : !this.#hasStatusEffect(actor, statusId)
            await actor.toggleStatusEffect(statusId, { active })
        }

        /**
         * Toggle an ActiveEffect document enabled/disabled.
         * @private
         * @param {Actor} actor
         * @param {string} effectId
         */
        async #handleActiveEffectAction (actor, effectId) {
            if (!actor || !effectId) return
            const effect = actor.effects?.get(effectId)
            if (!effect) return this.#warn('invalidAction')
            if (!canUpdateDocument(effect)) return this.#warn('permissionDenied')
            await effect.update({ disabled: effect.disabled !== true })
        }

        /**
         * Handle attack action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id (melee or ranged)
         */
        async #handleAttackAction (event, actor, actionId, token) {
            let weapon = actor.items?.get(actionId) ?? null
            // Only the two recognized legacy mode IDs may select an equipped weapon.
            if (!weapon && (actionId === 'melee' || actionId === 'ranged')) {
                weapon = actor.items?.find(item => item.type === 'weapon'
                    && item.system?.equipped === true
                    && (actionId === 'ranged' ? item.system?.attackMode === 'ranged' : item.system?.attackMode !== 'ranged'))
            }
            if (!weapon || weapon.type !== 'weapon' || weapon.system?.equipped !== true) return this.#warn('invalidAction')
            if (token && !resolveActorToken(actor, token)) return this.#warn('invalidAction')
            await this.#callCombatQuickAction(actor, token, {
                combatAction: 'attack',
                action: 'attack',
                weaponId: weapon.id,
                label: game.i18n.localize('tokenActionHud.uesrpg3ev4.attack')
            }, { shiftKey: event.shiftKey })
        }

        /**
         * Handle weapon-specific attack action.
         * @private
         * @param {object} event
         * @param {object} actor
         * @param {string} actionId
         */
        async #handleWeaponAttackAction (event, actor, actionId, token) {
            await this.#handleAttackAction(event, actor, actionId, token)
        }

        /**
         * Handle aim action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleAimAction (event, actor, token) {
            await this.#callCombatQuickAction(actor, token, { combatAction: 'aim', action: 'aim', label: 'Aim' }, { shiftKey: event.shiftKey })
        }

        /**
         * Handle cast magic action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleCastMagicAction (event, actor, actionId, token) {
            if (!['cast', 'instant'].includes(actionId)) return this.#warn('invalidAction')
            const castActionType = actionId === 'instant' ? 'secondary' : 'primary'
            await this.#callCastMagicAction(actor, token, null, { shiftKey: event.shiftKey, castActionType })
        }

        /**
         * Handle dash action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleDashAction (event, actor, token) {
            await this.#callCombatQuickAction(actor, token, { combatAction: 'dash', action: 'dash', label: 'Dash' }, { shiftKey: event.shiftKey })
        }

        /**
         * Handle delay action.
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleDelayAction (event, actor, token) {
            await this.#callCombatQuickAction(actor, token, { combatAction: 'delay', action: 'delay', label: 'Delay' }, { shiftKey: event.shiftKey })
        }

        /**
         * Handle disengage action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleDisengageAction (event, actor, token) {
            await this.#callCombatQuickAction(actor, token, { combatAction: 'disengage', action: 'disengage', label: 'Disengage' }, { shiftKey: event.shiftKey })
        }

        /**
         * Handle hide action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleHideAction (event, actor, token) {
            await this.#callCombatQuickAction(actor, token, { combatAction: 'hide', action: 'hide', label: 'Hide' }, { shiftKey: event.shiftKey })
        }

        /**
         * Handle use item action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleUseItemAction (event, actor, token) {
            await this.#callCombatQuickAction(actor, token, { combatAction: 'use-item', action: 'use-item', label: 'Use Item' }, { shiftKey: event.shiftKey })
        }

        /**
         * Handle extinguish burning action.
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleExtinguishBurningAction (event, actor, token) {
            await this.#callCombatQuickAction(actor, token, {
                combatAction: 'extinguish-burning',
                action: 'extinguish-burning',
                label: 'Put Out Fire'
            }, { shiftKey: event.shiftKey })
        }

        /**
         * Handle defensive stance action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleDefensiveStanceAction (event, actor, token) {
            await this.#callCombatQuickAction(actor, token, { combatAction: 'defensive-stance', action: 'defensive-stance', label: 'Defensive Stance' }, { shiftKey: event.shiftKey })
        }

        /**
         * Handle opportunity attack action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleOpportunityAttackAction (event, actor, token) {
            await this.#callCombatQuickAction(actor, token, {
                combatAction: 'attack-of-opportunity',
                action: 'attack-of-opportunity',
                label: game.i18n.localize('tokenActionHud.uesrpg3ev4.opportunityAttack')
            }, { shiftKey: event.shiftKey })
        }

        /**
         * Handle special action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleSpecialAction (event, actor, actionId, token) {
            const definition = await SystemAdapter.getSpecialActionDefinition(actionId)
            if (!definition) return this.#warn('invalidAction')
            await this.#callCombatQuickAction(actor, token, {
                combatAction: 'specialAction',
                action: 'specialAction',
                specialId: actionId,
                actionType: definition.actionType
            }, { shiftKey: event.shiftKey })
        }

        /**
         * Handle skill action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleSkillAction (event, actor, actionId) {
            const skill = actor.items.get(actionId)
            if (!skill) return

            // Right-click: open sheet
            if (this.#isSheetRequest(event)) {
                return SystemAdapter.openDocumentSheet({ document: skill })
            }

            // Left-click: call system skill roll handler (opposed/unopposed routing).
            await this.#callSkillRoll(actor, actionId, { shiftKey: event?.shiftKey })
        }

        /**
         * Handle profession action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleProfessionAction (event, actor, actionId) {
            // Strip 'prof-' prefix if present
            const profKey = actionId.startsWith('prof-') ? actionId.substring(5) : actionId

            // Right-click: show profession details
            if (this.#isSheetRequest(event)) {
                const profValue = actor.system?.professions?.[profKey] ?? actor.system?.skills?.[profKey]?.value ?? 0
                const spec = actor.system?.skills?.[profKey]?.specialization || ''
                const name = spec || profKey.replace('profession', 'Profession ')

                await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor }),
                    content: `<h3>${escapeText(name)}</h3><p>Value: ${escapeText(profValue)}%</p>`
                })
                return
            }

            // Left-click: delegate to the system-owned Token Action HUD API. The system wrapper
            // owns any AppV2/sheet compatibility needed to reach the canonical profession roll.
            const res = await SystemAdapter.executeProfessionRoll({
                actor,
                professionKey: profKey,
                shiftKey: event?.shiftKey || false
            })
            if (res?.ok) return

            this.#notifyDispatchIssue('No profession roll handler is available.', {
                actorId: actor?.id,
                professionKey: profKey,
                adapterPath: res?.path ?? 'none'
            })
        }

        /**
         * Handle magic skill action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleMagicSkillAction (event, actor, actionId) {
            // Magic skills use the same roll handler as regular skills
            await this.#handleSkillAction(event, actor, actionId)
        }

        /**
         * Invoke the system characteristic roll handler.
         * @private
         */
        async #callCharacteristicRoll (actor, chaKey, chaLabel, eventOverrides = {}) {
            const res = await SystemAdapter.executeCharacteristicRoll({
                actor,
                key: chaKey,
                label: chaLabel,
                shiftKey: eventOverrides?.shiftKey || false
            })
            if (res?.ok) {
                diagLog('Using adapter entrypoint', { action: 'characteristic', path: res?.path })
                return
            }
            this.#notifyDispatchIssue('No characteristic roll handler is available.', {
                actorId: actor?.id,
                characteristic: chaKey,
                adapterPath: res?.path ?? 'none'
            })
        }

        /**
         * Handle characteristic action.
         * Triggers the system's characteristic test workflow (opposed if targeted, standard if untargeted).
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The characteristic key (str, end, agi, int, wp, prc, prs, lck)
         */
        async #handleCharacteristicAction (event, actor, actionId) {
            const chaKey = String(actionId ?? '').trim().toLowerCase()
            const chaLabels = {
                str: 'Strength',
                end: 'Endurance',
                agi: 'Agility',
                int: 'Intelligence',
                wp: 'Willpower',
                prc: 'Perception',
                prs: 'Personality',
                lck: 'Luck'
            }

            const chaLabel = chaLabels[chaKey]
            if (!chaLabel) {
                ui.notifications?.warn(`Unknown characteristic: ${chaKey}`)
                return
            }

            await this.#callCharacteristicRoll(actor, chaKey, chaLabel, { shiftKey: event?.shiftKey })
        }

        /**
         * Handle secondary action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleSecondaryActionAction (event, actor, actionId, token) {
            if (actionId === 'reload-weapon') {
                await this.#handleReloadWeaponAction(event, actor, token)
            }
        }

        /**
         * Handle reload weapon action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleReloadWeaponAction (event, actor, token) {
            await this.#callCombatQuickAction(actor, token, { combatAction: 'reload-weapon', action: 'reload-weapon', label: 'Reload Weapon' }, { shiftKey: event.shiftKey })
        }

        /**
         * Handle combat style action
         * Performs an opposed test roll (same as from character sheet)
         * Combat styles are skill items, so they use the same roll method as regular skills
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleCombatStyleAction (event, actor, actionId) {
            const combatStyle = actor.items.get(actionId)
            if (!combatStyle) return

            // Right-click: open sheet
            if (this.#isSheetRequest(event)) {
                return SystemAdapter.openDocumentSheet({ document: combatStyle })
            }

            // Left-click: use the system combat roll handler to preserve combat style allowances.
            await this.#callCombatStyleRoll(actor, actionId, { shiftKey: event.shiftKey })
        }

        /**
         * Toggle the authoritative embedded item's equipped state, or open its sheet.
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleEquipmentAction (event, actor, actionId) {
            const item = actor.items.get(actionId)
            if (!item) return this.#warn('invalidAction')
            if (this.#isSheetRequest(event) || !('equipped' in (item.system ?? {}))) {
                return SystemAdapter.openDocumentSheet({ document: item })
            }
            if (!canUpdateDocument(item)) return this.#warn('permissionDenied')
            const result = await SystemAdapter.setItemEquipped({ item, equipped: item.system.equipped !== true })
            if (!result?.ok) this.#warn('unsupportedAction')
        }

        /**
         * Handle container action.
         * @private
         * @param {object} event
         * @param {object} actor
         * @param {string} actionId
         */
        async #handleContainerAction (event, actor, actionId) {
            const item = actor.items.get(actionId)
            if (!item) return this.#warn('invalidAction')
            await SystemAdapter.openDocumentSheet({ document: item })
        }

        /**
         * Handle spell action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleSpellAction (event, actor, actionId, token) {
            const spell = actor.items.get(actionId)
            if (!spell || spell.type !== 'spell') return this.#warn('invalidAction')
            if (token && !resolveActorToken(actor, token)) return this.#warn('invalidAction')
            await this.#callCastMagicAction(actor, token, spell, { shiftKey: event.shiftKey })
        }

        /**
         * Handle cast-enchantment item action.
         * @private
         * @param {object} event
         * @param {object} actor
         * @param {string} actionId
         */
        async #handleCastEnchantmentAction (event, actor, actionId, token) {
            const item = actor.items.get(actionId)
            if (!item) {
                this.#notifyDispatchIssue('Cast-enchantment item was not found on the actor.', {
                    actorId: actor?.id,
                    itemId: actionId
                })
                return
            }

            const res = await SystemAdapter.executeCastEnchantment({
                actor,
                token,
                itemId: item.id,
                shiftKey: event?.shiftKey
            })

            if (!res?.ok) {
                this.#notifyDispatchIssue('Unable to cast enchantment from HUD.', {
                    actorId: actor?.id,
                    itemId: item.id,
                    adapterPath: res?.path ?? 'none',
                    reason: res?.reason ?? null
                })
            }
        }

        /**
         * Handle scroll action.
         * @private
         * @param {object} event
         * @param {object} actor
         * @param {string} actionId
         */
        async #handleScrollAction (event, actor, actionId, token) {
            const scroll = actor.items.get(actionId)
            if (!scroll || scroll.type !== 'scroll') return this.#warn('invalidAction')

            if (this.#isSheetRequest(event)) {
                return SystemAdapter.openDocumentSheet({ document: scroll })
            }
            if (!canUpdateDocument(actor)) return this.#warn('permissionDenied')
            if (token && !resolveActorToken(actor, token)) return this.#warn('invalidAction')

            const res = await SystemAdapter.executeScrollCast({
                actor,
                scrollItem: scroll,
                castActionType: 'primary'
            })

            if (!res?.ok) {
                this.#notifyDispatchIssue('Unable to cast scroll from HUD.', {
                    actorId: actor?.id,
                    itemId: actionId,
                    adapterPath: res?.path ?? 'none'
                })
            }
        }

        /** The system owns both actor-native and legacy embedded social selectors. */
        async #handleSocialAction (actor, kind, entryId = null) {
            if (!canUpdateDocument(actor)) return this.#warn('permissionDenied')
            const result = await SystemAdapter.openSocialSelector({ actor, kind, entryId })
            if (!result?.ok) this.#warn('unsupportedAction')
        }

        /**
         * Handle feature action (talents, traits, powers)
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleFeatureAction (event, actor, actionId) {
            const feature = actor.items.get(actionId)
            if (!feature) return

            const isRightClick = this.#isRightClick(event)
            const isShiftHeld = event?.shiftKey === true
            const activation = feature?.system?.activation ?? {}

            // Right-click behavior (unchanged):
            // - Shift+right-click always opens sheet (escape hatch)
            // - For passive features: use configured passive right-click setting
            // - For activated features: open sheet
            if (isRightClick) {
                if (isShiftHeld) {
                    return SystemAdapter.openDocumentSheet({ document: feature })
                }

                if (activation?.enabled === true) {
                    return SystemAdapter.openDocumentSheet({ document: feature })
                }

                const mode = game.settings.get(MODULE.ID, 'passiveFeatureRightClick') || 'chat'
                if (mode === 'sheet') {
                    return SystemAdapter.openDocumentSheet({ document: feature })
                }

                // mode === 'chat': post description using system content format
                if (!canUpdateDocument(feature)) return this.#warn('permissionDenied')
                await this.#postFeatureDescriptionToChat(feature, actor, event)
                return
            }

            // Left-click: delegate to the system's canonical sheet handlers so that
            // HUD activation behaves identically to the item-sheet "Activate" button.
            if (!canUpdateDocument(feature)) return this.#warn('permissionDenied')
            const res = await SystemAdapter.executeFeatureActivation({ item: feature, actor, event })
            if (!res?.ok) this.#warn('unsupportedAction')
        }

        /**
         * Post a feature's description to chat using the system's standard content format.
         * Also runs talent-specific automation (defender) and best-effort item macros,
         * mirroring the behavior of shared-handlers.js for passive feature activation.
         * @private
         * @param {object} feature The item document
         * @param {object} actor   The owning actor
         * @param {object} event   The originating event
         */
        async #postFeatureDescriptionToChat (feature, actor, event) {
            // Build content matching the system's _buildDefaultPostContent format (with image).
            const img = escapeText(feature.img)
            const name = escapeText(feature.name ?? 'Feature')
            const type = escapeText(feature.type)
            const description = feature.system?.description ?? ''
            const content = img
                ? `<h2><img src="${img}" alt="">${name}</h2><p><b>${type}</b></p><div>${description}</div>`
                : `<h2>${name}</h2><p><b>${type}</b></p><div>${description}</div>`

            await ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({ actor }),
                content
            })

            const res = await SystemAdapter.runFeaturePostChatAutomation({ item: feature, actor, event })
            if (!res?.ok) {
                this.#notifyDispatchIssue('No feature post-chat automation handler is available.', {
                    actorId: actor?.id,
                    itemId: feature?.id ?? null,
                    adapterPath: res?.path ?? 'none'
                })
            }
        }

        /**
         * Handle utility action
         * @private
         * @param {object} token    The token
         * @param {string} actionId The action id
         * @param {object|null} actorOverride Preferred actor context
         */
        async #handleUtilityAction (token, actionId, actorOverride = null) {
            const actor = actorOverride ?? token?.actor ?? null
            switch (actionId) {
            case 'endTurn':
                if (token && game.combat?.current?.tokenId === token.id) {
                    if (!canUpdateDocument(game.combat)) return this.#warn('permissionDenied')
                    await game.combat.nextTurn()
                }
                break

            case 'shortRest':
            case 'longRest': {
                if (!actor) break
                if (!canUpdateDocument(actor)) return this.#warn('permissionDenied')
                const res = await SystemAdapter.applyRest({ actor, restType: actionId })
                if (!res?.ok) {
                    this.#notifyDispatchIssue('Unable to apply rest action.', {
                        actorId: actor?.id,
                        actionId,
                        adapterPath: res?.path ?? 'none'
                    })
                }
                break
            }
            }
        }

        /**
         * Handle resource-group actions.
         * @private
         * @param {object} token
         * @param {string} actionId
         * @param {object|null} actorOverride
         */
        async #handleResourcesAction (token, actionId, actorOverride = null) {
            const actor = actorOverride ?? token?.actor ?? null
            switch (actionId) {
            case 'resource-health':
            case 'resource-stamina':
            case 'resource-magicka':
            case 'resource-luck': {
                if (!actor) break
                if (!canUpdateDocument(actor)) return this.#warn('permissionDenied')
                const res = await SystemAdapter.openResourceDialog({ actor, resourceId: actionId })
                if (!res?.ok) {
                    this.#notifyDispatchIssue('Unable to open resource dialog.', {
                        actorId: actor?.id,
                        actionId,
                        adapterPath: res?.path ?? 'none'
                    })
                }
                break
            }
            }
        }
    }
})
