import { MODULE } from './constants.js'
import { isSupportedActor, diagLog } from './utils.js'
import { SystemAdapter } from './system-adapter.js'

export let RollHandler = null

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
    /**
     * Extends Token Action HUD Core's RollHandler class and handles action events triggered when an action is clicked
     */
    RollHandler = class RollHandler extends coreModule.api.RollHandler {
        #itemSheetActionTypes = new Set(['weapon', 'armor', 'shield', 'item', 'container', 'ammunition', 'spell', 'scroll', 'talent', 'trait', 'power', 'skill', 'magicSkill', 'combatStyle', 'language', 'faction'])
        #coreRenderableActionTypes = new Set(['skill', 'profession', 'magicSkill', 'combatStyle', 'weapon', 'armor', 'shield', 'item', 'container', 'ammunition', 'spell', 'scroll', 'language', 'faction'])

        /**
         * Handle action click
         * Called by Token Action HUD Core when an action is left or right-clicked
         * @override
         * @param {object} event        The event
         * @param {string} encodedValue The encoded value
         */
        async handleActionClick (event, encodedValue) {
            let [actionTypeId, actionId] = encodedValue.split('|')
            const aliases = {
                delayAction: 'delay',
                extinguish: 'extinguishBurning'
            }
            actionTypeId = aliases[actionTypeId] ?? actionTypeId
            const isRightClick = event?.button === 2 || event?.type === 'contextmenu'

            // We may not have this.actor in multi-token contexts; resolve controlled tokens once for safe fallbacks.
            const selectedTokens = (canvas?.tokens?.controlled ?? [])
            const controlledTokens = selectedTokens.filter((token) => isSupportedActor(token?.actor))

            if (this.actor && !isSupportedActor(this.actor)) return

            if (!this.actor && selectedTokens.length > 0 && controlledTokens.length === 0) {
                this.#notifyDispatchIssue('No supported UESRPG tokens selected.', {
                    actionTypeId,
                    actionId,
                    selected: selectedTokens.length,
                    supported: controlledTokens.length
                })
                return
            }

            if (selectedTokens.length > controlledTokens.length) {
                diagLog('Ignoring unsupported tokens', {
                    selected: selectedTokens.length,
                    supported: controlledTokens.length
                })
            }

            if (!this.actor && controlledTokens.length === 0) {
                return
            }

            if (controlledTokens.length > 1) {
                const typeSet = new Set(controlledTokens.map(t => t?.actor?.type).filter(Boolean))
                if (typeSet.size > 1) {
                    ui.notifications?.warn?.('Mixed actor types selected. Please select only one type.')
                    return
                }
            }

            const actor = this.#getSingleContextActor(controlledTokens)

            if (isRightClick) {
                if (await this.#tryOpenItemSheet(actionTypeId, actionId, actor)) return
            }

            // Core render-item behavior must have a single actor context.
            if (this.#coreRenderableActionTypes.has(actionTypeId) && this.isRenderItem()) {
                if (actor && typeof this.renderItem === 'function') return this.renderItem(actor, actionId)
                if (actor && typeof this.doRenderItem === 'function') return this.doRenderItem(actor, actionId)
            }

            // If single actor is selected
            if (this.actor) {
                await this.#handleAction(event, this.actor, this.token, actionTypeId, actionId)
                return
            }

            // Multi-token execution actions (Attacks, Spells, Talents).
            // These actions are built only when multiple tokens are selected.
            if ((actionTypeId === 'multiCombat' || actionTypeId === 'multiItem') && controlledTokens.length > 1) {
                const confirmed = await this.#confirmMultiTokenExecution(actionTypeId, actionId, controlledTokens.length)
                if (!confirmed) return

                for (const token of controlledTokens) {
                    const actor = token.actor
                    if (!actor) continue
                    await this.#handleMultiTokenAction(event, actor, token, actionTypeId, actionId)
                }
                return
            }

            // Status effects need deterministic multi-token behavior.
            // Left-click: toggle active state (all-or-none).
            // Right-click: toggle overlay (visual) state (all-or-none) while ensuring the status is active.
            if (actionTypeId === 'statusEffect' && controlledTokens.length > 1) {
                if (isRightClick) {
                    const icon = this.#getStatusEffectIcon(actionId)
                    if (!icon) {
                        ui.notifications?.warn(`No icon found for status effect: ${actionId}`)
                        return
                    }

                    const allOverlay = controlledTokens.every(t => String(this.#getTokenOverlayEffect(t)) === String(icon))
                    const desiredOverlay = !allOverlay

                    for (const token of controlledTokens) {
                        const actor = token.actor
                        await this.#ensureStatusEffectActive(token, actor, actionId)
                        await this.#setTokenOverlayEffect(token, icon, desiredOverlay)
                    }
                    return
                }

                const allHave = controlledTokens.every(t => t?.document?.hasStatusEffect ? t.document.hasStatusEffect(actionId) : false)
                const desiredActive = !allHave
                for (const token of controlledTokens) {
                    const actor = token.actor
                    await this.#handleStatusEffectAction(event, token, actor, actionId, desiredActive)
                }
                return
            }

            // If multiple actors are selected
            for (const token of controlledTokens) {
                const actor = token.actor
                await this.#handleAction(event, actor, token, actionTypeId, actionId)
            }
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
         * Resolve the single actor context used for render-item and sheet-open flows.
         * @private
         * @param {Token[]} controlledTokens
         * @returns {Actor|null}
         */
        #getSingleContextActor (controlledTokens = []) {
            if (this.actor) return this.actor
            if (controlledTokens.length === 1) return controlledTokens[0]?.actor ?? null
            return null
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
            if (item?.sheet && typeof item.sheet.render === 'function') {
                item.sheet.render(true)
                return true
            }
            return false
        }

        /**
         * Build a synthetic target-like object with a dataset payload.
         * @private
         * @param {object} dataset
         * @returns {object}
         */
        #makeSyntheticTarget (dataset = {}) {
            return { dataset: { ...(dataset ?? {}) } }
        }

        /**
         * Build a synthetic action event with a dataset payload.
         * @private
         * @param {object} dataset
         * @param {object} [opts]
         * @returns {Event}
         */
        #makeActionEvent (dataset = {}, opts = {}) {
            const target = this.#makeSyntheticTarget(dataset)
            const fakeEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                shiftKey: opts?.shiftKey || false
            })

            Object.defineProperty(fakeEvent, 'currentTarget', {
                writable: false,
                value: target
            })

            return { event: fakeEvent, target }
        }

        /**
         * Build a synthetic item click event for roll handlers that call .closest('.item').
         * @private
         * @param {string} itemId
         * @param {object} [opts]
         * @returns {Event}
         */
        #makeItemEvent (itemId, opts = {}) {
            const target = {
                ...this.#makeSyntheticTarget({ itemId }),
                closest: () => ({ dataset: { itemId } })
            }
            const fakeEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                shiftKey: opts?.shiftKey || false
            })

            Object.defineProperty(fakeEvent, 'currentTarget', {
                writable: false,
                value: target
            })

            return { event: fakeEvent, target }
        }

        /**
         * Invoke the system Combat Quick Action handler.
         * @private
         */
        async #callCombatQuickAction (actor, token, dataset, eventOverrides = {}) {
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
                await this.#handleAttackAction(event, actor, actionId)
                break
            case 'meleeWeaponAttack':
                await this.#handleWeaponAttackAction(event, actor, actionId)
                break
            case 'rangedWeaponAttack':
                await this.#handleWeaponAttackAction(event, actor, actionId)
                break
            case 'aim':
                await this.#handleAimAction(event, actor)
                break
            case 'castMagic':
                await this.#handleCastMagicAction(event, actor, actionId)
                break
            case 'dash':
                await this.#handleDashAction(event, actor)
                break
            case 'delay':
                await this.#handleDelayAction(event, actor)
                break
            case 'disengage':
                await this.#handleDisengageAction(event, actor)
                break
            case 'hide':
                await this.#handleHideAction(event, actor)
                break
            case 'useItem':
                await this.#handleUseItemAction(event, actor)
                break
            case 'extinguishBurning':
                await this.#handleExtinguishBurningAction(event, actor)
                break
            case 'defensiveStance':
                await this.#handleDefensiveStanceAction(event, actor)
                break
            case 'opportunityAttack':
                await this.#handleOpportunityAttackAction(event, actor)
                break
            case 'specialAction':
                await this.#handleSpecialAction(event, actor, actionId)
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
                await this.#handleWeaponAction(event, actor, actionId)
                break
            case 'armor':
                await this.#handleArmorAction(event, actor, actionId)
                break
            case 'shield':
                await this.#handleShieldAction(event, actor, actionId)
                break
            case 'item':
                await this.#handleItemAction(event, actor, actionId)
                break
            case 'container':
                await this.#handleContainerAction(event, actor, actionId)
                break
            case 'ammunition':
                await this.#handleAmmunitionAction(event, actor, actionId)
                break
            case 'spell':
                await this.#handleSpellAction(event, actor, actionId)
                break
            case 'scroll':
                await this.#handleScrollAction(event, actor, actionId)
                break
            case 'languageEntry':
                await this.#handleLanguageEntryAction(event, actor, actionId)
                break
            case 'factionEntry':
                await this.#handleFactionEntryAction(event, actor, actionId)
                break
            case 'manageLanguages':
                await this.#handleManageLanguagesAction(actor)
                break
            case 'manageFactions':
                await this.#handleManageFactionsAction(actor)
                break
            case 'language':
                await this.#handleLanguageAction(event, actor, actionId)
                break
            case 'faction':
                await this.#handleFactionAction(event, actor, actionId)
                break
            case 'talent':
            case 'trait':
            case 'power':
                await this.#handleFeatureAction(event, actor, actionId)
                break
            case 'secondaryAction':
                await this.#handleSecondaryActionAction(event, actor, actionId)
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
            try {
                const label = this.#describeMultiTokenAction(actionTypeId, actionId)
                const content = `<p>Execute <strong>${label}</strong> for <strong>${count}</strong> selected tokens?</p>`
                return await Dialog.confirm({
                    title: 'Confirm Multi-Token Execution',
                    content,
                    yes: () => true,
                    no: () => false,
                    defaultYes: false
                })
            } catch (error) {
                console.warn(`${MODULE.ID} | Multi-token confirm failed, defaulting to cancel`, error)
                return false
            }
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
                const [itemType, nameKeyEnc] = String(actionId ?? '').split('~')
                let nameKey = nameKeyEnc
                try { nameKey = decodeURIComponent(nameKeyEnc) } catch (e) {}

                if (itemType === 'spell') return `Cast shared spell: ${nameKey}`
                if (itemType === 'talent') return `Use shared talent: ${nameKey}`
                return `Item: ${nameKey}`
            }

            return 'Action'
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
                    const mode = arg
                    const weapon = actor.items?.find?.(i =>
                        i.type === 'weapon' &&
                        i.system?.equipped === true &&
                        (mode === 'ranged'
                            ? String(i.system?.attackMode ?? '') === 'ranged'
                            : String(i.system?.attackMode ?? '') !== 'ranged')
                    ) ?? null
                    if (!weapon) return
                    await this.#handleAttackAction(event, actor, weapon.id ?? weapon._id ?? arg)
                }
                return
            }

            if (actionTypeId === 'multiItem') {
                const [itemType, nameKeyEnc] = String(actionId ?? '').split('~')
                let nameKey = nameKeyEnc
                try { nameKey = decodeURIComponent(nameKeyEnc) } catch (e) {}
                nameKey = String(nameKey ?? '').trim().toLowerCase()
                if (!itemType || !nameKey) return

                const item = actor.items?.find(i => i.type === itemType && String(i.name ?? '').trim().toLowerCase() === nameKey)
                if (!item) return

                if (itemType === 'spell') {
                    await this.#handleSpellAction(event, actor, item.id)
                    return
                }

                if (itemType === 'talent') {
                    await this.#handleFeatureAction(event, actor, item.id)
                    return
                }
            }
        }

        /**
         * Resolve the icon path for a Foundry status effect id.
         * @private
         * @param {string} statusId
         * @returns {string|null}
         */
        #getStatusEffectIcon (statusId) {
            const effects = Array.isArray(CONFIG?.statusEffects) ? CONFIG.statusEffects : []
            const found = effects.find(e => String(e?.id ?? '') === String(statusId))
            // Prefer "img" (v13) while supporting legacy "icon".
            const img = found?.img ?? found?.icon
            return img ? String(img) : null
        }


        /**
         * Read the current Token overlay effect path without using deprecated accessors.
         * @private
         * @param {Token} token
         * @returns {string}
         */
        #getTokenOverlayEffect (token) {
            const doc = token?.document
            // Avoid TokenDocument#overlayEffect getter (deprecated). Read from source instead.
            const src = doc?._source
            const overlay = src && typeof src.overlayEffect === 'string' ? src.overlayEffect : ''
            return String(overlay || '')
        }

        /**
         * Ensure a Foundry status effect is active on the actor/token.
         * @private
         * @param {Token} token
         * @param {Actor} actor
         * @param {string} statusId
         */
        async #ensureStatusEffectActive (token, actor, statusId) {
            if (!actor || !statusId) return
            const has = token?.document?.hasStatusEffect ? token.document.hasStatusEffect(statusId) : false
            if (has) return
            try {
                await actor.toggleStatusEffect(statusId, { active: true })
            } catch (error) {
                console.error(`${MODULE.ID} | Failed ensuring status effect active`, { statusId, error })
            }
        }

        /**
         * Set or clear a token overlay effect (visual only).
         * Uses Token#toggleEffect when available; falls back to TokenDocument update.
         * @private
         * @param {Token} token
         * @param {string} icon
         * @param {boolean} desired
         */
        async #setTokenOverlayEffect (token, icon, desired) {
            if (!token || !icon) return
            const doc = token.document
            if (!doc || typeof doc.update !== 'function') return

            // Read current overlay without deprecated accessors.
            const current = this.#getTokenOverlayEffect(token)
            const want = desired ? String(icon) : ''

            // No-op if already in desired state.
            if ((desired && String(current) === want) || (!desired && String(current) === '')) return

            try {
                // TokenDocument.overlayEffect is a StringField and is not nullable; clear using an empty string.
                await doc.update({ overlayEffect: want })
            } catch (error) {
                console.error(`${MODULE.ID} | Failed setting overlay effect`, { icon, desired, error })
            }
        }

        /**
         * Status effect behavior:
         * - Left-click toggles active state.
         * - Right-click toggles the overlay (visual) state while ensuring the status is active.
         * @private
         * @param {MouseEvent} event
         * @param {Token} token
         * @param {Actor} actor
         * @param {string} statusId
         * @param {boolean|null} forceActive
         */
        async #handleStatusEffectAction (event, token, actor, statusId, forceActive = null) {
            if (!actor || !statusId) return

            const isRightClick = event?.button === 2 || event?.type === 'contextmenu'
            if (isRightClick) {
                const icon = this.#getStatusEffectIcon(statusId)
                if (!icon) {
                    ui.notifications?.warn(`No icon found for status effect: ${statusId}`)
                    return
                }

                // Ensure status is active; then toggle overlay.
                await this.#ensureStatusEffectActive(token, actor, statusId)
                const current = String(this.#getTokenOverlayEffect(token))
                const desiredOverlay = current !== String(icon)
                await this.#setTokenOverlayEffect(token, icon, desiredOverlay)
                return
            }

            try {
                const has = token?.document?.hasStatusEffect ? token.document.hasStatusEffect(statusId) : false
                const desired = typeof forceActive === 'boolean' ? forceActive : !has
                await actor.toggleStatusEffect(statusId, { active: desired })
            } catch (error) {
                console.error(`${MODULE.ID} | Failed toggling status effect`, { statusId, error })
                ui.notifications?.warn(`Unable to toggle status effect: ${statusId}`)
            }
        }

        /**
         * Toggle an ActiveEffect document enabled/disabled.
         * @private
         * @param {Actor} actor
         * @param {string} effectId
         */
        async #handleActiveEffectAction (actor, effectId) {
            if (!actor || !effectId) return
            try {
                const effects = actor.effects ?? []
                const effect = typeof effects.get === 'function' ? effects.get(effectId) : Array.from(effects).find(e => e?.id === effectId)
                if (!effect) return
                const disabled = effect.disabled === true
                await effect.update({ disabled: !disabled })
            } catch (error) {
                console.error(`${MODULE.ID} | Failed toggling active effect`, { effectId, error })
                ui.notifications?.warn('Unable to toggle Active Effect')
            }
        }

        /**
         * Handle attack action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id (melee or ranged)
         */
        async #handleAttackAction (event, actor, actionId) {
            try {
                // Resolve weapon from actionId (preferred), fallback to equipped by mode for legacy action ids.
                let weapon = actor?.items?.get?.(actionId) ?? null
                let label = game.i18n.localize('tokenActionHud.uesrpg3ev4.attack')

                if (!weapon) {
                    const attackMode = actionId === 'melee' ? 'melee' : 'ranged'
                    weapon = actor.items.find(item =>
                        item.type === 'weapon' &&
                        item.system?.equipped &&
                        item.system?.attackMode === attackMode
                    )
                    label = attackMode === 'melee'
                        ? game.i18n.localize('tokenActionHud.uesrpg3ev4.attackMelee')
                        : game.i18n.localize('tokenActionHud.uesrpg3ev4.attackRanged')
                }

                if (!weapon) {
                    ui.notifications.warn('No equipped weapon found for this attack.')
                    return
                }

                const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
                if (!token) {
                    ui.notifications.warn('No attacker token found. Select your token and try again.')
                    return
                }

                // Prefer system combat quick action handler for parity with sheets.
                const weaponId = weapon?.id ?? weapon?._id ?? actionId
                await this.#callCombatQuickAction(actor, token, {
                    combatAction: 'attack',
                    action: 'attack',
                    weaponId,
                    label
                })
            } catch (error) {
                console.error(`${MODULE.ID} | Error handling attack action`, error)
                ui.notifications.error('Failed to execute attack. See console for details.')
            }
        }

        /**
         * Handle weapon-specific attack action.
         * @private
         * @param {object} event
         * @param {object} actor
         * @param {string} actionId
         */
        async #handleWeaponAttackAction (event, actor, actionId) {
            await this.#handleAttackAction(event, actor, actionId)
        }

        /**
         * Handle aim action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleAimAction (event, actor) {
            const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
            await this.#callCombatQuickAction(actor, token, { combatAction: 'aim', action: 'aim', label: 'Aim' })
        }

        /**
         * Handle cast magic action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleCastMagicAction (event, actor, actionId = 'cast') {
            try {
                const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
                const castActionType = String(actionId ?? '').toLowerCase() === 'instant' ? 'secondary' : 'primary'
                await this.#callCastMagicAction(actor, token, null, { shiftKey: event?.shiftKey, castActionType })
            } catch (error) {
                console.error(`${MODULE.ID} | Error handling cast magic action`, error)
                ui.notifications.error('Failed to open spell selection')
            }
        }

        /**
         * Handle dash action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleDashAction (event, actor) {
            const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
            await this.#callCombatQuickAction(actor, token, { combatAction: 'dash', action: 'dash', label: 'Dash' })
        }

        /**
         * Handle delay action.
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleDelayAction (event, actor) {
            const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
            await this.#callCombatQuickAction(actor, token, { combatAction: 'delay', action: 'delay', label: 'Delay' })
        }

        /**
         * Handle disengage action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleDisengageAction (event, actor) {
            const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
            await this.#callCombatQuickAction(actor, token, { combatAction: 'disengage', action: 'disengage', label: 'Disengage' })
        }

        /**
         * Handle hide action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleHideAction (event, actor) {
            const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
            await this.#callCombatQuickAction(actor, token, { combatAction: 'hide', action: 'hide', label: 'Hide' })
        }

        /**
         * Handle use item action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleUseItemAction (event, actor) {
            const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
            await this.#callCombatQuickAction(actor, token, { combatAction: 'use-item', action: 'use-item', label: 'Use Item' })
        }

        /**
         * Handle extinguish burning action.
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleExtinguishBurningAction (event, actor) {
            const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
            await this.#callCombatQuickAction(actor, token, {
                combatAction: 'extinguish-burning',
                action: 'extinguish-burning',
                label: 'Put Out Fire'
            })
        }

        /**
         * Handle defensive stance action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleDefensiveStanceAction (event, actor) {
            const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
            await this.#callCombatQuickAction(actor, token, { combatAction: 'defensive-stance', action: 'defensive-stance', label: 'Defensive Stance' })
        }

        /**
         * Handle opportunity attack action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleOpportunityAttackAction (event, actor) {
            try {
                const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
                await this.#callCombatQuickAction(actor, token, {
                    combatAction: 'attack-of-opportunity',
                    action: 'attack-of-opportunity',
                    label: game.i18n.localize('tokenActionHud.uesrpg3ev4.opportunityAttack')
                })
            } catch (error) {
                console.error(`${MODULE.ID} | Error handling opportunity attack action`, error)
            }
        }

        /**
         * Handle special action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleSpecialAction (event, actor, actionId) {
            try {
                let actionType = 'primary'
                try {
                    const def = await SystemAdapter.getSpecialActionDefinition(actionId)
                    if (def?.actionType) actionType = String(def.actionType)
                } catch (_e) {
                    // ignore - fallback to primary
                }

                const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
                await this.#callCombatQuickAction(actor, token, {
                    combatAction: 'specialAction',
                    action: 'specialAction',
                    specialId: actionId,
                    actionType
                })
            } catch (error) {
                console.error(`${MODULE.ID} | Error handling special action`, error)
                // Fallback to chat message
                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor }),
                    content: `<strong>${actor.name}</strong> performs <strong>${actionId}</strong>!`
                })
            }
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
            if (this.isRenderItem()) {
                return skill.sheet.render(true)
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
            if (this.isRenderItem()) {
                const profValue = actor.system?.professions?.[profKey] || 0
                const spec = actor.system?.skills?.[profKey]?.specialization || ''
                const name = spec || profKey.replace('profession', 'Profession ')

                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor }),
                    content: `<h3>${name}</h3><p>Value: ${profValue}%</p>`
                })
                return
            }

            // Left-click: Call the system's profession roll handler.
            // The modern NPC professions handler (NpcSheetV2._onProfessionsRoll) resolves the
            // profession key via DOM traversal (closest("[data-profession-key]"), ".item", etc.)
            // OR via heuristic parsing of the passed action object.
            // Token Action HUD uses synthetic events, so we emulate both patterns.
            const fakeTarget = {
                ...this.#makeSyntheticTarget({
                    professionKey: profKey,
                    actionId: profKey,
                    id: profKey,
                    itemId: profKey
                }),
                // Heuristic resolver checks these properties directly.
                professionKey: profKey,
                id: profKey,
                actionId: profKey,
                // DOM resolver uses .closest(...) chains; emulate the key selectors it checks.
                closest: (selector) => {
                    const sel = String(selector ?? '')
                    if (!sel) return null
                    if (sel.includes('[data-profession-key]') || sel.includes('.profession-roll-target') || sel.includes('.item') || sel.includes('.npc-item')) {
                        return { dataset: { professionKey: profKey, itemId: profKey } }
                    }
                    return null
                }
            }

            const fakeEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                shiftKey: event?.shiftKey || false
            })

            // Provide both currentTarget and target for maximum compatibility.
            Object.defineProperty(fakeEvent, 'currentTarget', { writable: false, value: fakeTarget })
            Object.defineProperty(fakeEvent, 'target', { writable: false, value: fakeTarget })

            const sheet = actor.sheet
            if (sheet && typeof sheet._onProfessionsRoll === 'function') {
                await sheet._onProfessionsRoll(fakeEvent, fakeTarget)
                return
            }

            this.#notifyDispatchIssue('No profession roll handler is available.', {
                actorId: actor?.id,
                professionKey: profKey
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
        async #handleSecondaryActionAction (event, actor, actionId) {
            if (actionId === 'reload-weapon') {
                await this.#handleReloadWeaponAction(event, actor)
            }
        }

        /**
         * Handle reload weapon action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleReloadWeaponAction (event, actor) {
            const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
            await this.#callCombatQuickAction(actor, token, { combatAction: 'reload-weapon', action: 'reload-weapon', label: 'Reload Weapon' })
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
            if (this.isRenderItem()) {
                return combatStyle.sheet.render(true)
            }

            // Left-click: use the system combat roll handler to preserve combat style allowances.
            try {
                await this.#callCombatStyleRoll(actor, actionId, { shiftKey: event?.shiftKey })
            } catch (error) {
                console.error(`${MODULE.ID} | Error handling combat style action`, error)
                ui.notifications.error('Failed to roll combat style. See console for details.')
            }
        }

        /**
         * Handle weapon action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleWeaponAction (event, actor, actionId) {
            const weapon = actor.items.get(actionId)
            if (!weapon) return

            // Right-click: open sheet
            if (this.isRenderItem()) {
                return weapon.sheet.render(true)
            }

            // Left-click: toggle equipped status
            const equipped = weapon.system?.equipped || false
            await SystemAdapter.setItemEquipped({ item: weapon, equipped: !equipped })

            ui.notifications.info(`${weapon.name} ${!equipped ? 'equipped' : 'unequipped'}`)
        }

        /**
         * Handle armor action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleArmorAction (event, actor, actionId) {
            const armor = actor.items.get(actionId)
            if (!armor) return

            if (this.isRenderItem()) {
                return armor.sheet.render(true)
            }

            // Toggle equipped status
            const equipped = armor.system?.equipped || false
            await SystemAdapter.setItemEquipped({ item: armor, equipped: !equipped })

            ui.notifications.info(`${armor.name} ${!equipped ? 'equipped' : 'unequipped'}`)
        }

        /**
         * Handle shield action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleShieldAction (event, actor, actionId) {
            const shield = actor.items.get(actionId)
            if (!shield) return

            if (this.isRenderItem()) {
                return shield.sheet.render(true)
            }

            const equipped = shield.system?.equipped || false
            await SystemAdapter.setItemEquipped({ item: shield, equipped: !equipped })

            ui.notifications.info(`${shield.name} ${!equipped ? 'equipped' : 'unequipped'}`)
        }

        /**
         * Handle item action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleItemAction (event, actor, actionId) {
            const item = actor.items.get(actionId)
            if (!item) return

            // Right-click: open sheet
            if (this.isRenderItem()) {
                return item.sheet.render(true)
            }

            // Left-click: toggle equipped if item has equipped property, otherwise open sheet
            if (Object.prototype.hasOwnProperty.call(item.system || {}, 'equipped')) {
                const equipped = item.system.equipped || false
                await SystemAdapter.setItemEquipped({ item, equipped: !equipped })
                ui.notifications.info(`${item.name} ${!equipped ? 'equipped' : 'unequipped'}`)
            } else {
                // No equipped property, just open sheet
                item.sheet.render(true)
            }
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
            if (!item) return
            if (item.sheet && typeof item.sheet.render === 'function') {
                item.sheet.render(true)
            }
        }

        /**
         * Handle ammunition action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleAmmunitionAction (event, actor, actionId) {
            const ammo = actor.items.get(actionId)
            if (!ammo) return

            // Right-click: open sheet
            if (this.isRenderItem()) {
                return ammo.sheet.render(true)
            }

            // Left-click: toggle equipped if item has equipped property, otherwise open sheet
            if (Object.prototype.hasOwnProperty.call(ammo.system || {}, 'equipped')) {
                const equipped = ammo.system.equipped || false
                await SystemAdapter.setItemEquipped({ item: ammo, equipped: !equipped })
                ui.notifications.info(`${ammo.name} ${!equipped ? 'equipped' : 'unequipped'}`)
            } else {
                // No equipped property, just open sheet
                ammo.sheet.render(true)
            }
        }

        /**
         * Handle spell action
         * @private
         * @param {object} event    The event
         * @param {object} actor    The actor
         * @param {string} actionId The action id
         */
        async #handleSpellAction (event, actor, actionId) {
            const spell = actor.items.get(actionId)
            if (!spell) return

            try {
                const casterToken = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
                if (!casterToken) {
                    ui.notifications.warn('No caster token found. Select your token and try again.')
                    return
                }

                // Use the system Cast Magic handler with a preselected spell to preserve routing/range gating.
                await this.#callCastMagicAction(actor, casterToken, spell, { shiftKey: event?.shiftKey })
            } catch (error) {
                console.error(`${MODULE.ID} | Error casting spell`, error)
                // Fallback to opening spell sheet
                spell.sheet.render(true)
            }
        }

        /**
         * Handle scroll action.
         * @private
         * @param {object} event
         * @param {object} actor
         * @param {string} actionId
         */
        async #handleScrollAction (event, actor, actionId) {
            const scroll = actor.items.get(actionId)
            if (!scroll) return

            if (this.isRenderItem()) {
                return scroll.sheet?.render?.(true)
            }

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
                scroll.sheet?.render?.(true)
            }
        }

        /**
         * Handle language action.
         * @private
         * @param {object} event
         * @param {object} actor
         * @param {string} actionId
         */
        async #handleLanguageAction (event, actor, actionId) {
            const res = await SystemAdapter.openSocialSelector({ actor, kind: 'language' })
            if (!res?.ok) {
                this.#notifyDispatchIssue('No language selector available.', {
                    actorId: actor?.id,
                    adapterPath: res?.path ?? 'none'
                })
            }
        }

        /**
         * Handle faction action.
         * @private
         * @param {object} event
         * @param {object} actor
         * @param {string} actionId
         */
        async #handleFactionAction (event, actor, actionId) {
            const res = await SystemAdapter.openSocialSelector({ actor, kind: 'faction' })
            if (!res?.ok) {
                this.#notifyDispatchIssue('No faction selector available.', {
                    actorId: actor?.id,
                    adapterPath: res?.path ?? 'none'
                })
            }
        }

        /**
         * Handle actor-native language entry action.
         * @private
         * @param {object} event
         * @param {object} actor
         * @param {string} actionId
         */
        async #handleLanguageEntryAction (event, actor, actionId) {
            const res = await SystemAdapter.openSocialSelector({ actor, kind: 'language', entryId: actionId })
            if (!res?.ok) {
                this.#notifyDispatchIssue('No language selector available.', {
                    actorId: actor?.id,
                    actionId,
                    adapterPath: res?.path ?? 'none'
                })
            }
        }

        /**
         * Handle actor-native faction entry action.
         * @private
         * @param {object} event
         * @param {object} actor
         * @param {string} actionId
         */
        async #handleFactionEntryAction (event, actor, actionId) {
            const res = await SystemAdapter.openSocialSelector({ actor, kind: 'faction', entryId: actionId })
            if (!res?.ok) {
                this.#notifyDispatchIssue('No faction selector available.', {
                    actorId: actor?.id,
                    actionId,
                    adapterPath: res?.path ?? 'none'
                })
            }
        }

        /**
         * Handle manage languages action.
         * @private
         * @param {object} actor
         */
        async #handleManageLanguagesAction (actor) {
            const res = await SystemAdapter.openSocialSelector({ actor, kind: 'language' })
            if (!res?.ok) {
                this.#notifyDispatchIssue('No language selector available.', {
                    actorId: actor?.id,
                    adapterPath: res?.path ?? 'none'
                })
            }
        }

        /**
         * Handle manage factions action.
         * @private
         * @param {object} actor
         */
        async #handleManageFactionsAction (actor) {
            const res = await SystemAdapter.openSocialSelector({ actor, kind: 'faction' })
            if (!res?.ok) {
                this.#notifyDispatchIssue('No faction selector available.', {
                    actorId: actor?.id,
                    adapterPath: res?.path ?? 'none'
                })
            }
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

            const isRightClick = (event?.button === 2) || (event?.which === 3)
            const isShiftHeld = event?.shiftKey === true
            const activation = feature?.system?.activation ?? {}

            // Right-click behavior (unchanged):
            // - Shift+right-click always opens sheet (escape hatch)
            // - For passive features: use configured passive right-click setting
            // - For activated features: open sheet
            if (isRightClick) {
                if (isShiftHeld) {
                    return feature.sheet.render(true)
                }

                if (activation?.enabled === true) {
                    return feature.sheet.render(true)
                }

                const mode = game.settings.get(MODULE.ID, 'passiveFeatureRightClick') || 'chat'
                if (mode === 'sheet') {
                    return feature.sheet.render(true)
                }

                // mode === 'chat': post description using system content format
                await this.#postFeatureDescriptionToChat(feature, actor, event)
                return
            }

            // Left-click: delegate to the system's canonical sheet handlers so that
            // HUD activation behaves identically to the item-sheet "Activate" button.
            try {
                const res = await SystemAdapter.executeFeatureActivation({ item: feature, actor, event })
                if (!res?.ok) await this.#postFeatureDescriptionToChat(feature, actor, event)
            } catch (err) {
                console.error(`${MODULE.ID} | Feature activation failed`, err)
                ui.notifications.error('Failed to activate feature. See console for details.')
            }
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
            const img = feature.img ?? ''
            const name = feature.name ?? 'Feature'
            const type = feature.type ?? ''
            const description = feature.system?.description ?? ''
            const content = img
                ? `<h2><img src="${img}"</img>${name}</h2>\n    <i><b>${type}</b></i><p>\n      <i>${description}</i>`
                : `<h2>${name}</h2><p>\n  <i><b>${type}</b></i><p>\n    <i>${description}</i>`

            await ChatMessage.create({
                user: game.user.id,
                speaker: ChatMessage.getSpeaker({ actor }),
                content
            })

            await SystemAdapter.runFeaturePostChatAutomation({ item: feature, actor, event })
        }

        /**
         * Handle utility action
         * @private
         * @param {object} token    The token
         * @param {string} actionId The action id
         * @param {object|null} actorOverride Preferred actor context
         */
        async #handleUtilityAction (token, actionId, actorOverride = null) {
            const actor = actorOverride ?? token?.actor ?? this.actor ?? null
            switch (actionId) {
            case 'endTurn':
                if (token && game.combat?.current?.tokenId === token.id) {
                    await game.combat?.nextTurn()
                }
                break

            case 'shortRest':
            case 'longRest': {
                if (!actor) break
                if (!game.user?.isGM && !actor?.isOwner) {
                    ui.notifications?.warn?.('You do not have permission to rest this actor.')
                    break
                }
                const res = await SystemAdapter.applyRest({ actor, restType: actionId })
                if (!res?.ok) {
                    this.#notifyDispatchIssue('Unable to apply rest action.', {
                        actorId: actor?.id,
                        actionId,
                        adapterPath: res?.path ?? 'none'
                    })
                }
                if (actor.sheet?.rendered) actor.sheet.render(false)
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
            const actor = actorOverride ?? token?.actor ?? this.actor ?? null
            switch (actionId) {
            case 'resource-health':
            case 'resource-stamina':
            case 'resource-magicka':
            case 'resource-luck': {
                if (!actor) break
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
