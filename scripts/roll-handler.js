import { MODULE } from './constants.js'
import { isSupportedActor, getSystemModulePath, diagLog } from './utils.js'

export let RollHandler = null

/**
 * Resolve a system-relative import path for the active system.
 * Falls back to the canonical UESRPG system id to preserve compatibility in older installs.
 * @param {string} relativePath
 * @returns {string}
 */
function _systemImportPath (relativePath) {
    const p = getSystemModulePath(relativePath)
    if (p) return p
    const clean = String(relativePath ?? '').replace(/^\/+/, '')
    return `/systems/uesrpg-3ev4/${clean}`
}

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
    /**
     * Extends Token Action HUD Core's RollHandler class and handles action events triggered when an action is clicked
     */
    RollHandler = class RollHandler extends coreModule.api.RollHandler {
        /**
         * Handle action click
         * Called by Token Action HUD Core when an action is left or right-clicked
         * @override
         * @param {object} event        The event
         * @param {string} encodedValue The encoded value
         */
        async handleActionClick (event, encodedValue) {
            const [actionTypeId, actionId] = encodedValue.split('|')
            const isRightClick = event?.button === 2 || event?.type === 'contextmenu'

            // We may not have this.actor in multi-token contexts; resolve controlled tokens once for safe fallbacks.
            const selectedTokens = (canvas?.tokens?.controlled ?? [])
            const controlledTokens = selectedTokens.filter((token) => isSupportedActor(token?.actor))

            if (this.actor && !isSupportedActor(this.actor)) return

            if (!this.actor && selectedTokens.length > 0 && controlledTokens.length === 0) {
                ui.notifications?.warn?.('No supported UESRPG tokens selected.')
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

            // Right-click on embedded items/features/spells should open the relevant Item sheet, matching prior behavior.
            // Guard against multi-token selection (no single actor context) to avoid null-actor errors.
            if (isRightClick) {
                const itemSheetTypes = ['weapon', 'armor', 'item', 'ammunition', 'spell', 'talent', 'trait', 'power', 'skill', 'magicSkill', 'combatStyle']
                if (itemSheetTypes.includes(actionTypeId)) {
                    const actor = this.actor ?? (controlledTokens.length === 1 ? controlledTokens[0]?.actor : null)
                    const item = actor?.items?.get ? actor.items.get(actionId) : null
                    if (item?.sheet && typeof item.sheet.render === 'function') {
                        item.sheet.render(true)
                        return
                    }
                }
            }

            // NOTE: Do not include Talents/Traits/Powers here.
            // Those now support activation and have dedicated click behavior.
            const renderable = ['skill', 'profession', 'magicSkill', 'combatStyle', 'weapon', 'armor', 'item', 'ammunition', 'spell']

            // Core render-item behavior must have a single actor context.
            if (renderable.includes(actionTypeId) && this.isRenderItem()) {
                const actor = this.actor ?? (controlledTokens.length === 1 ? controlledTokens[0]?.actor : null)
                if (actor) return this.doRenderItem(actor, actionId)
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
         * Build a synthetic action event with a dataset payload.
         * @private
         * @param {object} dataset
         * @param {object} [opts]
         * @returns {Event}
         */
        #makeActionEvent (dataset = {}, opts = {}) {
            const fakeEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                shiftKey: opts?.shiftKey || false
            })

            Object.defineProperty(fakeEvent, 'currentTarget', {
                writable: false,
                value: { dataset }
            })

            return fakeEvent
        }

        /**
         * Build a synthetic item click event for roll handlers that call .closest('.item').
         * @private
         * @param {string} itemId
         * @param {object} [opts]
         * @returns {Event}
         */
        #makeItemEvent (itemId, opts = {}) {
            const fakeEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                shiftKey: opts?.shiftKey || false
            })

            Object.defineProperty(fakeEvent, 'currentTarget', {
                writable: false,
                value: {
                    closest: () => ({ dataset: { itemId } }),
                    dataset: { itemId }
                }
            })

            return fakeEvent
        }

        /**
         * Invoke the system Combat Quick Action handler.
         * @private
         */
        async #callCombatQuickAction (actor, token, dataset, eventOverrides = {}) {
            const sheet = actor?.sheet ?? { actor, token, element: null }
            const event = this.#makeActionEvent(dataset, eventOverrides)

            if (sheet && typeof sheet._onCombatQuickAction === 'function') {
                diagLog('Using system entrypoint', { action: dataset?.action, entry: '_onCombatQuickAction' })
                return sheet._onCombatQuickAction(event)
            }

            try {
                const { onCombatQuickAction } = await import(_systemImportPath('src/ui/sheets/shared/listeners/combat-actions.js'))
                if (typeof onCombatQuickAction === 'function') {
                    diagLog('Using system entrypoint', { action: dataset?.action, entry: 'onCombatQuickAction' })
                    return onCombatQuickAction(sheet, event)
                }
            } catch (err) {
                console.error(`${MODULE.ID} | Failed to load system combat quick action handler`, err)
            }
        }

        /**
         * Invoke the system Cast Magic handler.
         * @private
         */
        async #callCastMagicAction (actor, token, preselectedSpell = null, eventOverrides = {}) {
            const sheet = actor?.sheet ?? { actor, token, element: null }
            const event = this.#makeActionEvent({ actionType: 'primary' }, eventOverrides)

            if (sheet && typeof sheet._onCastMagicAction === 'function') {
                diagLog('Using system entrypoint', { action: 'castMagic', entry: '_onCastMagicAction' })
                return sheet._onCastMagicAction(event, preselectedSpell)
            }

            try {
                const { onCastMagicAction } = await import(_systemImportPath('src/ui/sheets/shared/listeners/magic-cast.js'))
                if (typeof onCastMagicAction === 'function') {
                    diagLog('Using system entrypoint', { action: 'castMagic', entry: 'onCastMagicAction' })
                    return onCastMagicAction(sheet, event, preselectedSpell)
                }
            } catch (err) {
                console.error(`${MODULE.ID} | Failed to load system cast magic handler`, err)
            }
        }

        /**
         * Invoke the system skill roll handler.
         * @private
         */
        async #callSkillRoll (actor, itemId, eventOverrides = {}) {
            const sheet = actor?.sheet ?? { actor, token: this.token, element: null }
            const event = this.#makeItemEvent(itemId, eventOverrides)

            if (sheet && typeof sheet._onSkillRoll === 'function') {
                diagLog('Using system entrypoint', { action: 'skill', entry: '_onSkillRoll' })
                return sheet._onSkillRoll(event)
            }

            try {
                const { onSkillRoll } = await import(_systemImportPath('src/ui/sheets/shared/listeners/rolls.js'))
                if (typeof onSkillRoll === 'function') {
                    diagLog('Using system entrypoint', { action: 'skill', entry: 'onSkillRoll' })
                    return onSkillRoll(sheet, event)
                }
            } catch (err) {
                console.error(`${MODULE.ID} | Failed to load system skill roll handler`, err)
            }
        }

        /**
         * Invoke the system combat style roll handler.
         * @private
         */
        async #callCombatStyleRoll (actor, itemId, eventOverrides = {}) {
            const sheet = actor?.sheet ?? { actor, token: this.token, element: null }
            const event = this.#makeItemEvent(itemId, eventOverrides)

            if (sheet && typeof sheet._onCombatRoll === 'function') {
                diagLog('Using system entrypoint', { action: 'combatStyle', entry: '_onCombatRoll' })
                return sheet._onCombatRoll(event)
            }

            try {
                const { onCombatRoll } = await import(_systemImportPath('src/ui/sheets/shared/listeners/rolls.js'))
                if (typeof onCombatRoll === 'function') {
                    diagLog('Using system entrypoint', { action: 'combatStyle', entry: 'onCombatRoll' })
                    return onCombatRoll(sheet, event)
                }
            } catch (err) {
                console.error(`${MODULE.ID} | Failed to load system combat roll handler`, err)
            }
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
            case 'aim':
                await this.#handleAimAction(event, actor)
                break
            case 'castMagic':
                await this.#handleCastMagicAction(event, actor)
                break
            case 'dash':
                await this.#handleDashAction(event, actor)
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
            case 'item':
                await this.#handleItemAction(event, actor, actionId)
                break
            case 'ammunition':
                await this.#handleAmmunitionAction(event, actor, actionId)
                break
            case 'spell':
                await this.#handleSpellAction(event, actor, actionId)
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
            case 'utility':
                await this.#handleUtilityAction(token, actionId)
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
                if (cmd === 'attack' && arg === 'melee') return game.i18n.localize('tokenActionHud.uesrpg3ev4.attackMelee')
                if (cmd === 'attack' && arg === 'ranged') return game.i18n.localize('tokenActionHud.uesrpg3ev4.attackRanged')
                return 'Combat Action'
            }

            if (actionTypeId === 'multiItem') {
                const [itemType, nameKeyEnc] = String(actionId ?? '').split('~')
                let nameKey = nameKeyEnc
                try { nameKey = decodeURIComponent(nameKeyEnc) } catch (e) {}

                if (itemType === 'spell') return `Spell: ${nameKey}`
                if (itemType === 'talent') return `Talent: ${nameKey}`
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
                        String(i.system?.attackMode ?? '') === mode
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
                    action: 'attack',
                    weaponId,
                    label
                })
            } catch (error) {
                console.error('Error handling attack action:', error)
                ui.notifications.error('Failed to execute attack. See console for details.')
            }
        }

        /**
         * Handle aim action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleAimAction (event, actor) {
            const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
            await this.#callCombatQuickAction(actor, token, { action: 'aim', label: 'Aim' })
        }

        /**
         * Handle cast magic action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleCastMagicAction (event, actor) {
            try {
                const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
                await this.#callCastMagicAction(actor, token, null, { shiftKey: event?.shiftKey })
            } catch (error) {
                console.error('Error handling cast magic action:', error)
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
            await this.#callCombatQuickAction(actor, token, { action: 'dash', label: 'Dash' })
        }

        /**
         * Handle disengage action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleDisengageAction (event, actor) {
            const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
            await this.#callCombatQuickAction(actor, token, { action: 'disengage', label: 'Disengage' })
        }

        /**
         * Handle hide action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleHideAction (event, actor) {
            const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
            await this.#callCombatQuickAction(actor, token, { action: 'hide', label: 'Hide' })
        }

        /**
         * Handle use item action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleUseItemAction (event, actor) {
            const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
            await this.#callCombatQuickAction(actor, token, { action: 'use-item', label: 'Use Item' })
        }

        /**
         * Handle defensive stance action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleDefensiveStanceAction (event, actor) {
            const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
            await this.#callCombatQuickAction(actor, token, { action: 'defensive-stance', label: 'Defensive Stance' })
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
                    action: 'attack-of-opportunity',
                    label: game.i18n.localize('tokenActionHud.uesrpg3ev4.opportunityAttack')
                })
            } catch (error) {
                console.error('Error handling opportunity attack action:', error)
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
                    const { getSpecialActionById } = await import(_systemImportPath('src/core/config/special-actions.js'))
                    const def = typeof getSpecialActionById === 'function' ? getSpecialActionById(actionId) : null
                    if (def?.actionType) actionType = String(def.actionType)
                } catch (_e) {
                    // ignore - fallback to primary
                }

                const token = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
                await this.#callCombatQuickAction(actor, token, {
                    action: 'specialAction',
                    specialId: actionId,
                    actionType
                })
            } catch (error) {
                console.error('Error handling special action:', error)
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

            // Left-click: Call sheet's profession roll
            const fakeEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            })

            Object.defineProperty(fakeEvent, 'currentTarget', {
                writable: false,
                value: { id: profKey }
            })

            const sheet = actor.sheet
            if (sheet && typeof sheet._onProfessionsRoll === 'function') {
                await sheet._onProfessionsRoll(fakeEvent)
            }
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
            const sheet = actor?.sheet ?? { actor, token: this.token, element: null }

            // Build a synthetic event that matches what onClickCharacteristic expects:
            // - event.currentTarget.id = chaKey
            // - event.currentTarget.getAttribute("name") = chaLabel
            const fakeEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                shiftKey: eventOverrides?.shiftKey || false
            })

            const fakeTarget = document.createElement('span')
            fakeTarget.id = chaKey
            fakeTarget.setAttribute('name', chaLabel)

            Object.defineProperty(fakeEvent, 'currentTarget', {
                writable: false,
                value: fakeTarget
            })

            // Try the sheet instance method first (underscore-prefixed).
            if (sheet && typeof sheet._onClickCharacteristic === 'function') {
                diagLog('Using system entrypoint', { action: 'characteristic', entry: '_onClickCharacteristic' })
                return sheet._onClickCharacteristic(fakeEvent)
            }

            // Fall back to the exported handler.
            try {
                const { onClickCharacteristic } = await import(_systemImportPath('src/ui/sheets/shared/listeners/characteristics-handlers.js'))
                if (typeof onClickCharacteristic === 'function') {
                    diagLog('Using system entrypoint', { action: 'characteristic', entry: 'onClickCharacteristic' })
                    return onClickCharacteristic(sheet, fakeEvent)
                }
            } catch (err) {
                console.error(`${MODULE.ID} | Failed to load system characteristic roll handler`, err)
            }
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
            await this.#callCombatQuickAction(actor, token, { action: 'reload-weapon', label: 'Reload Weapon' })
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
                console.error('Error handling combat style action:', error)
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
            await weapon.update({ 'system.equipped': !equipped })

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

            // Toggle equipped status
            const equipped = armor.system?.equipped || false
            await armor.update({ 'system.equipped': !equipped })

            ui.notifications.info(`${armor.name} ${!equipped ? 'equipped' : 'unequipped'}`)
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
                await item.update({ 'system.equipped': !equipped })
                ui.notifications.info(`${item.name} ${!equipped ? 'equipped' : 'unequipped'}`)
            } else {
                // No equipped property, just open sheet
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
                await ammo.update({ 'system.equipped': !equipped })
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
                console.error('Error casting spell:', error)
                // Fallback to opening spell sheet
                spell.sheet.render(true)
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
                const featureType = String(feature.type ?? '')

                if (featureType === 'talent') {
                    const { activateTalentFromItemSheet } = await import(
                        _systemImportPath('src/ui/sheets/shared-handlers.js')
                    )
                    await activateTalentFromItemSheet({ item: feature, event })
                    return
                }

                if (featureType === 'power') {
                    const { activatePowerFromItemSheet } = await import(
                        _systemImportPath('src/ui/sheets/shared-handlers.js')
                    )
                    await activatePowerFromItemSheet({ item: feature, event })
                    return
                }

                // Traits: no dedicated system handler — replicate the shared-handler pattern.
                if (activation?.enabled === true) {
                    const { executeItemActivation } = await import(
                        _systemImportPath('src/core/system/activation/activation-executor.js')
                    )
                    await executeItemActivation({
                        item: feature,
                        actor,
                        event,
                        renderChat: true,
                        includeImage: true,
                        context: {}
                    })
                } else {
                    await this.#postFeatureDescriptionToChat(feature, actor, event)
                }
            } catch (err) {
                console.error('token-action-hud-uesrpg3ev4 | Feature activation failed', err)
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

            // Talent-specific automation: check for "defender" slug
            if (String(feature.type ?? '') === 'talent') {
                try {
                    const { resolveTalentSlug } = await import(
                        _systemImportPath('src/core/traits/talents-api.js')
                    )
                    const { runTalentActivationAutomation } = await import(
                        _systemImportPath('src/core/system/activation/activation-executor.js')
                    )
                    if (resolveTalentSlug(feature?.name ?? '') === 'defender') {
                        await runTalentActivationAutomation({ item: feature, actor, context: {} })
                    }
                } catch (_e) {
                    // Best-effort: talent automation is non-critical
                }
            }

            // Run item macro best-effort
            try {
                const { executeItemMacroBestEffort } = await import(
                    _systemImportPath('src/core/system/activation/activation-executor.js')
                )
                if (typeof executeItemMacroBestEffort === 'function') {
                    await executeItemMacroBestEffort(feature, { event })
                }
            } catch (_e) {
                // Best-effort: macro execution is non-critical
            }
        }

        /**
         * Handle utility action
         * @private
         * @param {object} token    The token
         * @param {string} actionId The action id
         */
        async #handleUtilityAction (token, actionId) {
            const actor = token?.actor
            switch (actionId) {
            case 'endTurn':
                if (game.combat?.current?.tokenId === token.id) {
                    await game.combat?.nextTurn()
                }
                break

            // Short Rest
            case 'shortRest': {
                if (!actor) break
                // Mirror system permission checks
                if (!game.user?.isGM && !actor?.isOwner) {
                    ui.notifications?.warn?.('You do not have permission to rest this actor.')
                    break
                }
                try {
                    const { applyShortRest, buildRestChatContent } = await import(_systemImportPath('src/ui/sheets/rest-workflow.js'))
                    if (typeof applyShortRest === 'function') {
                        const { line } = await applyShortRest(actor)
                        if (line) {
                            const content = buildRestChatContent('Short Rest', [line])
                            await ChatMessage.create({
                                user: game.user.id,
                                speaker: ChatMessage.getSpeaker({ actor }),
                                content
                            })
                        }
                        // Re-render sheet if open
                        if (actor.sheet?.rendered) actor.sheet.render(false)
                    }
                } catch (error) {
                    console.error(`${MODULE.ID} | Failed applying Short Rest`, error)
                    ui.notifications?.error?.('Failed to apply Short Rest. See console for details.')
                }
                break
            }

            // Long Rest
            case 'longRest': {
                if (!actor) break
                // Mirror system permission checks
                if (!game.user?.isGM && !actor?.isOwner) {
                    ui.notifications?.warn?.('You do not have permission to rest this actor.')
                    break
                }
                try {
                    const { applyLongRest, buildRestChatContent } = await import(_systemImportPath('src/ui/sheets/rest-workflow.js'))
                    if (typeof applyLongRest === 'function') {
                        const { line } = await applyLongRest(actor)
                        if (line) {
                            const content = buildRestChatContent('Long Rest', [line])
                            await ChatMessage.create({
                                user: game.user.id,
                                speaker: ChatMessage.getSpeaker({ actor }),
                                content
                            })
                        }
                        // Re-render sheet if open
                        if (actor.sheet?.rendered) actor.sheet.render(false)
                    }
                } catch (error) {
                    console.error(`${MODULE.ID} | Failed applying Long Rest`, error)
                    ui.notifications?.error?.('Failed to apply Long Rest. See console for details.')
                }
                break
            }

            // Resource quick-access (Utility tab)
            case 'resource-health': {
                if (!actor) break
                try {
                    const { HPTempHPDialog } = await import(_systemImportPath('src/ui/apps/hp-temp-hp-dialog.js'))
                    if (HPTempHPDialog?.show) await HPTempHPDialog.show(actor)
                } catch (error) {
                    console.error(`${MODULE.ID} | Failed opening Health dialog`, error)
                }
                break
            }
            case 'resource-stamina': {
                if (!actor) break
                try {
                    const mod = await import(_systemImportPath('src/core/stamina/stamina-dialog.js'))
                    const openStaminaDialog = mod?.openStaminaDialog
                    if (typeof openStaminaDialog === 'function') await openStaminaDialog(actor)
                } catch (error) {
                    console.error(`${MODULE.ID} | Failed opening Stamina dialog`, error)
                }
                break
            }
            case 'resource-magicka': {
                // Pre-wired for future system support. Silent no-op if not implemented.
                if (!actor) break
                try {
                    const mod = await import(_systemImportPath('src/core/magic/magicka-dialog.js'))
                    const openMagickaDialog = mod?.openMagickaDialog
                    if (typeof openMagickaDialog === 'function') await openMagickaDialog(actor)
                } catch (_e) {
                    // No-op until the system exposes a Magicka dialog entrypoint.
                }
                break
            }
            case 'resource-luck': {
                // Pre-wired for future system support. Silent no-op if not implemented.
                if (!actor) break
                try {
                    const mod = await import(_systemImportPath('src/core/luck/luck-dialog.js'))
                    const openLuckDialog = mod?.openLuckDialog
                    if (typeof openLuckDialog === 'function') await openLuckDialog(actor)
                } catch (_e) {
                    // No-op until the system exposes a Luck dialog entrypoint.
                }
                break
            }
            }
        }
    }
})
