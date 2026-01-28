import { MODULE } from './constants.js'
import { isSupportedActorType, getSystemModulePath } from './utils.js'

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
            const controlledTokens = (canvas?.tokens?.controlled ?? [])
                .filter((token) => isSupportedActorType(token?.actor?.type))

            // Right-click on embedded items/features/spells should open the relevant Item sheet, matching prior behavior.
            // Guard against multi-token selection (no single actor context) to avoid null-actor errors.
            if (isRightClick) {
                const itemSheetTypes = ['weapon', 'armor', 'item', 'ammunition', 'spell', 'talent', 'trait', 'power']
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
                    await this.#handleAttackAction(event, actor, arg)
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
                // Find equipped weapon of the appropriate type
                const attackMode = actionId === 'melee' ? 'melee' : 'ranged'
                const weapon = actor.items.find(item =>
                    item.type === 'weapon' &&
                    item.system?.equipped &&
                    item.system?.attackMode === attackMode
                )

                if (!weapon) {
                    ui.notifications.warn(`No ${attackMode} weapon equipped`)
                    return
                }

                // Resolve defenders (multi-target supported): prefer explicit user targets, then fallback to a single targeted token.
                const defenderTokenUuids = Array.from(game.user?.targets ?? [])
                    .map(t => t?.document?.uuid ?? t?.uuid)
                    .filter(Boolean)

                if (defenderTokenUuids.length === 0) {
                    const targetToken = canvas.tokens.controlled.find(t => t.id !== this.token?.id) ||
                        Array.from(canvas.tokens.placeables.values()).find(t => t.isTargeted)
                    if (targetToken?.document?.uuid || targetToken?.uuid) {
                        defenderTokenUuids.push(targetToken.document?.uuid ?? targetToken.uuid)
                    }
                }

                if (defenderTokenUuids.length === 0) {
                    ui.notifications.warn('Select at least one target to attack')
                    return
                }

                // Dynamically import OpposedWorkflow from system
                const { OpposedWorkflow } = await import(_systemImportPath('src/core/combat/opposed-workflow.js'))

                // Create pending attack workflow
                const attackerToken = this.token ?? canvas?.tokens?.controlled?.find(t => t?.actor?.id === actor.id) ?? actor.getActiveTokens?.()[0] ?? null
                if (!attackerToken) {
                    ui.notifications.warn('No attacker token found. Select your token and try again.')
                    return
                }

                await OpposedWorkflow.createPending({
                    attackerTokenUuid: attackerToken.document?.uuid ?? attackerToken.uuid,
                    defenderTokenUuids,
                    weaponUuid: weapon.uuid,
                    attackMode
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
            // Call the system's Aim workflow directly from actor sheet
            const fakeEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            })

            Object.defineProperty(fakeEvent, 'currentTarget', {
                writable: false,
                value: {
                    dataset: {
                        action: 'aim',
                        label: 'Aim'
                    }
                }
            })

            const sheet = actor.sheet
            if (sheet && typeof sheet._onCombatQuickAction === 'function') {
                await sheet._onCombatQuickAction(fakeEvent)
            } else {
                ui.notifications.warn('Aim action not available')
            }
        }

        /**
         * Handle cast magic action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleCastMagicAction (event, actor) {
            try {
                // Get all spells from actor
                const spells = actor.items.filter(item => item.type === 'spell')

                if (spells.length === 0) {
                    ui.notifications.warn('No spells available')
                    return
                }

                // Create spell selection dialog
                const spellList = spells.map(spell =>
                    `<option value="${spell.id}">${spell.name} (MP ${spell.system?.cost || 0})</option>`
                ).join('')

                const content = `
                    <form>
                        <div class="form-group">
                            <label>Select Spell:</label>
                            <select id="spell-select" style="width: 100%;">
                                ${spellList}
                            </select>
                        </div>
                    </form>
                `

                new Dialog({
                    title: 'Cast Magic',
                    content,
                    buttons: {
                        cast: {
                            label: 'Cast',
                            callback: async (html) => {
                                const spellId = html.find('#spell-select').val()
                                await this.#handleSpellAction(event, actor, spellId)
                            }
                        },
                        cancel: {
                            label: 'Cancel'
                        }
                    },
                    default: 'cast'
                }).render(true)
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
            // Post dash action to chat
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content: `<strong>${actor.name}</strong> uses <strong>Dash</strong> to move quickly!`
            })
        }

        /**
         * Handle disengage action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleDisengageAction (event, actor) {
            try {
                // Apply disengage effect
                await actor.createEmbeddedDocuments('ActiveEffect', [{
                    name: 'Disengaged',
                    icon: 'icons/svg/cancel.svg',
                    flags: { core: { statusId: 'disengaged' } },
                    duration: { turns: 1 }
                }])

                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor }),
                    content: `<strong>${actor.name}</strong> uses <strong>Disengage</strong> to retreat safely!`
                })
            } catch (error) {
                console.error('Error handling disengage action:', error)
            }
        }

        /**
         * Handle hide action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleHideAction (event, actor) {
            try {
                // Find stealth/sneak skill
                const stealthSkill = actor.items.find(item =>
                    item.type === 'skill' &&
                    (item.name.toLowerCase().includes('stealth') || item.name.toLowerCase().includes('sneak'))
                )

                if (stealthSkill) {
                    await this.#handleSkillAction(event, actor, stealthSkill.id)
                } else {
                    ChatMessage.create({
                        speaker: ChatMessage.getSpeaker({ actor }),
                        content: `<strong>${actor.name}</strong> attempts to <strong>Hide</strong>!`
                    })
                }
            } catch (error) {
                console.error('Error handling hide action:', error)
            }
        }

        /**
         * Handle use item action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleUseItemAction (event, actor) {
            // Get consumable items
            const consumables = actor.items.filter(item =>
                item.type === 'item' &&
                item.system?.consumable
            )

            if (consumables.length === 0) {
                ui.notifications.warn('No consumable items available')
                return
            }

            // Create item selection dialog
            const itemList = consumables.map(item =>
                `<option value="${item.id}">${item.name}</option>`
            ).join('')

            const content = `
                <form>
                    <div class="form-group">
                        <label>Select Item:</label>
                        <select id="item-select" style="width: 100%;">
                            ${itemList}
                        </select>
                    </div>
                </form>
            `

            new Dialog({
                title: 'Use Item',
                content,
                buttons: {
                    use: {
                        label: 'Use',
                        callback: async (html) => {
                            const itemId = html.find('#item-select').val()
                            await this.#handleItemAction(event, actor, itemId)
                        }
                    },
                    cancel: {
                        label: 'Cancel'
                    }
                },
                default: 'use'
            }).render(true)
        }

        /**
         * Handle defensive stance action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleDefensiveStanceAction (event, actor) {
            // Call the system's Defensive Stance workflow directly from actor sheet
            const fakeEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            })

            Object.defineProperty(fakeEvent, 'currentTarget', {
                writable: false,
                value: {
                    dataset: {
                        action: 'defensive-stance',
                        label: 'Defensive Stance'
                    }
                }
            })

            const sheet = actor.sheet
            if (sheet && typeof sheet._onCombatQuickAction === 'function') {
                await sheet._onCombatQuickAction(fakeEvent)
            } else {
                ui.notifications.warn('Defensive Stance action not available')
            }
        }

        /**
         * Handle opportunity attack action
         * @private
         * @param {object} event The event
         * @param {object} actor The actor
         */
        async #handleOpportunityAttackAction (event, actor) {
            try {
                // Find equipped melee weapon
                const meleeWeapon = actor.items.find(item =>
                    item.type === 'weapon' &&
                    item.system?.equipped &&
                    item.system?.attackMode === 'melee'
                )

                if (!meleeWeapon) {
                    ui.notifications.warn('No melee weapon equipped for opportunity attack')
                    return
                }

                // Execute opportunity attack
                await this.#handleAttackAction(event, actor, 'melee')
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
                // Special case for 'arise' - just post chat message
                if (actionId.toLowerCase() === 'arise') {
                    // Use system's executeSpecialAction if available
                    if (typeof actor.executeSpecialAction === 'function') {
                        await actor.executeSpecialAction('arise')
                    } else {
                        // Fallback to chat message
                        ChatMessage.create({
                            speaker: ChatMessage.getSpeaker({ actor }),
                            content: `<strong>${actor.name}</strong> performs <strong>Arise</strong>!`
                        })
                    }
                    return
                }

                // For other special actions, use opposed workflow
                // Get target token if one is selected
                const targetToken = canvas.tokens.controlled.find(t => t.id !== this.token?.id) ||
                                   Array.from(canvas.tokens.placeables.values()).find(t => t.isTargeted)

                // Dynamically import SkillOpposedWorkflow from system
                const { SkillOpposedWorkflow } = await import(_systemImportPath('src/core/skills/opposed-workflow.js'))

                // Create pending skill opposed workflow for special action
                await SkillOpposedWorkflow.createPending({
                    attackerTokenUuid: this.token?.document?.uuid || actor.uuid,
                    defenderTokenUuid: targetToken?.document?.uuid || null,
                    attackerSkillUuid: null, // Let user choose from dropdown
                    attackerSkillLabel: actionId.charAt(0).toUpperCase() + actionId.slice(1)
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

            // Left-click: Call the system's skill roll directly (works with or without target)
            // The system's SimpleActorSheet._onSkillRoll handles both opposed and unopposed
            const fakeEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                shiftKey: event?.shiftKey || false
            })

            Object.defineProperty(fakeEvent, 'currentTarget', {
                writable: false,
                value: {
                    closest: () => ({ dataset: { itemId: actionId } })
                }
            })

            // Call the actor sheet's skill roll method directly
            const sheet = actor.sheet
            if (sheet && typeof sheet._onSkillRoll === 'function') {
                await sheet._onSkillRoll(fakeEvent)
            } else {
                // Fallback: open sheet
                skill.sheet.render(true)
            }
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
            // Call the actor sheet's reload workflow directly
            const fakeEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            })

            Object.defineProperty(fakeEvent, 'currentTarget', {
                writable: false,
                value: {
                    dataset: {
                        action: 'reload-weapon',
                        label: 'Reload Weapon'
                    }
                }
            })

            const sheet = actor.sheet
            if (sheet && typeof sheet._onCombatQuickAction === 'function') {
                await sheet._onCombatQuickAction(fakeEvent)
            } else {
                ui.notifications.warn('Reload Weapon action not available')
            }
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

            // Left-click: perform skill roll (same as regular skills - handles both opposed and unopposed)
            // The system's SimpleActorSheet._onSkillRoll handles combat styles the same way as regular skills
            try {
                const fakeEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    shiftKey: event?.shiftKey || false
                })

                Object.defineProperty(fakeEvent, 'currentTarget', {
                    writable: false,
                    value: {
                        closest: () => ({ dataset: { itemId: actionId } })
                    }
                })

                // Call the actor sheet's skill roll method directly
                // This handles both opposed (with target) and unopposed (no target) tests
                const sheet = actor.sheet
                if (sheet && typeof sheet._onSkillRoll === 'function') {
                    await sheet._onSkillRoll(fakeEvent)
                } else {
                    // Fallback: if target is selected, try SkillOpposedWorkflow
                    const targetToken = canvas.tokens.controlled.find(t => t.id !== this.token?.id) ||
                                       Array.from(canvas.tokens.placeables.values()).find(t => t.isTargeted)
                    
                    if (targetToken) {
                        const { SkillOpposedWorkflow } = await import(_systemImportPath('src/core/skills/opposed-workflow.js'))
                        await SkillOpposedWorkflow.createPending({
                            attackerTokenUuid: this.token?.document?.uuid || actor.uuid,
                            defenderTokenUuid: targetToken?.document?.uuid,
                            attackerSkillUuid: combatStyle.uuid,
                            attackerSkillLabel: combatStyle.name
                        })
                    } else {
                        // Final fallback: open sheet
                        combatStyle.sheet.render(true)
                    }
                }
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

                const [{ MagicOpposedWorkflow }, { shouldUseTargetedSpellWorkflow, shouldUseModernSpellWorkflow }, { getSpellRangeType, getSpellAoEConfig, placeAoETemplateAndCollectTargets }, { SKILL_DIFFICULTIES }] = await Promise.all([
                    import(_systemImportPath('src/core/magic/opposed-workflow.js')),
                    import(_systemImportPath('src/core/magic/spell-routing.js')),
                    import(_systemImportPath('src/core/magic/spell-range.js')),
                    import(_systemImportPath('src/core/skills/skill-tn.js'))
                ])

                // Mirror the actor sheet flow: after spell selection, present spell options dialog.
                // If the user cancels, do not proceed.
                const spellOptions = await this.#showSpellOptionsDialog({ actor, spell, SKILL_DIFFICULTIES })
                if (spellOptions === null) return

                const targetsFromUser = Array.from(game.user?.targets ?? [])
                const rangeType = getSpellRangeType(spell)

                // AoE targeting: place template, then collect affected tokens.
                let aoeTemplateUuid = null
                let aoeTemplateId = null
                let targets = targetsFromUser
                if (rangeType === 'aoe') {
                    const placed = await placeAoETemplateAndCollectTargets({ casterToken, spell })
                    if (!placed) return
                    aoeTemplateUuid = placed.templateDoc?.uuid ?? null
                    aoeTemplateId = placed.templateDoc?.id ?? null
                    targets = Array.isArray(placed.targets) ? placed.targets : []
                }

                // Targeted (attack/healing/direct) spells route into the opposed workflow when at least one defender is present.
                if (shouldUseTargetedSpellWorkflow(spell, targets)) {
                    const defenderTokenUuids = Array.from(targets)
                        .map(t => t?.document?.uuid ?? t?.uuid)
                        .filter(Boolean)

                    const aoeConfig = (rangeType === 'aoe')
                        ? { ...(getSpellAoEConfig(spell) ?? {}), isAoE: true, templateUuid: aoeTemplateUuid, templateId: aoeTemplateId }
                        : null

                    await MagicOpposedWorkflow.createPending({
                        attackerTokenUuid: casterToken.document?.uuid ?? casterToken.uuid,
                        defenderTokenUuids,
                        spellUuid: spell.uuid,
                        spellOptions,
                        castActionType: 'primary',
                        aoe: aoeConfig,
                        isAoE: rangeType === 'aoe'
                    })
                    return
                }

                // All spells use the modern casting engine when not routing into a targeted pending card.
                // This matches the actor sheet behavior (shouldUseModernSpellWorkflow currently returns true for all spells).
                if (shouldUseModernSpellWorkflow?.(spell) ?? true) {
                    await MagicOpposedWorkflow.castUnopposed({
                        attackerActorUuid: actor.uuid,
                        attackerTokenUuid: casterToken.document?.uuid ?? casterToken.uuid,
                        spellUuid: spell.uuid,
                        spellOptions,
                        castActionType: 'primary'
                    })
                    return
                }
            } catch (error) {
                console.error('Error casting spell:', error)
                // Fallback to opening spell sheet
                spell.sheet.render(true)
            }
        }

        /**
         * Spell options dialog (mirrors the ActorSheet "Cast Magic" follow-up dialog).
         * Keeps TokenHUD casting semantics aligned with the system sheets.
         *
         * @private
         * @param {object} params
         * @param {Actor} params.actor
         * @param {Item} params.spell
         * @param {Array<{key:string,label:string,mod:number}>} params.SKILL_DIFFICULTIES
         * @returns {Promise<object|null>} spellOptions or null if cancelled
         */
        async #showSpellOptionsDialog ({ actor, spell, SKILL_DIFFICULTIES }) {
            const wpTotal = Number(actor?.system?.characteristics?.wp?.total ?? 0)
            const wpBonus = Math.floor(wpTotal / 10)
            const hasOverload = Boolean(spell?.system?.hasOverload)
            const baseCost = Number(spell?.system?.cost ?? 0)

            // Talent hooks (scaffolding only; does not apply mechanics beyond flags passed through)
            const hasOverchargeTalent = actor?.items?.some?.(i => i?.type === 'talent' && String(i?.name ?? '').trim() === 'Overcharge') ?? false
            const hasMagickaCyclingTalent = actor?.items?.some?.(i => i?.type === 'talent' && String(i?.name ?? '').trim() === 'Magicka Cycling') ?? false

            const difficulties = Array.isArray(SKILL_DIFFICULTIES) ? SKILL_DIFFICULTIES : []
            // Ensure 'average' default selected, if present.
            const difficultyOptionsHtml = difficulties.map(df => {
                const sign = Number(df?.mod ?? 0) >= 0 ? '+' : ''
                const key = String(df?.key ?? 'average')
                const sel = key === 'average' ? 'selected' : ''
                const label = String(df?.label ?? key)
                const mod = Number(df?.mod ?? 0)
                return `<option value="${key}" ${sel}>${label} (${sign}${mod})</option>`
            }).join('\n')

            const overloadText = String(spell?.system?.overloadEffect ?? '').trim() || 'double cost for enhanced effect'

            const content = `
                <form class="uesrpg-spell-options">
                    <h3>${spell.name}</h3>
                    <div class="form-group">
                        <label>MP Cost: <b>${baseCost}</b></label>
                    </div>
                    <div class="form-group" style="margin-bottom:8px; margin-top:8px;">
                        <label style="display:block;"><b>Difficulty</b></label>
                        <select name="difficultyKey" style="width:100%;">
                            ${difficultyOptionsHtml}
                        </select>
                    </div>
                    <div class="form-group" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                        <label style="margin:0;"><b>Manual Modifier</b></label>
                        <input type="number" name="manualModifier" value="0" style="width:120px; text-align:center;" />
                    </div>
                    <hr style="margin: 10px 0;"/>
                    <div class="form-group" id="restrainGroup" style="margin-top: 8px;">
                        <label style="display: flex; align-items: center; gap: 8px;">
                            <input type="checkbox" name="restrain" id="restrainCheckbox" ${!hasOverload ? 'checked' : ''} />
                            <span><b>Spell Restraint</b> (reduce cost by ${wpBonus} to min 1)</span>
                        </label>
                    </div>
                    ${hasOverload ? `
                        <div class="form-group" id="overloadGroup" style="margin-top: 8px;">
                            <label style="display: flex; align-items: center; gap: 8px;">
                                <input type="checkbox" name="overload" id="overloadCheckbox" />
                                <span><b>Overload</b> (${overloadText})</span>
                            </label>
                        </div>
                    ` : ''}
                    ${hasOverchargeTalent ? `
                        <div class="form-group" style="margin-top: 8px;">
                            <label style="display: flex; align-items: center; gap: 8px;">
                                <input type="checkbox" name="overcharge" />
                                <span><b>Overcharge</b> (talent option; not yet implemented)</span>
                            </label>
                        </div>
                    ` : ''}
                    ${hasMagickaCyclingTalent ? `
                        <div class="form-group" style="margin-top: 8px;">
                            <label style="display: flex; align-items: center; gap: 8px;">
                                <input type="checkbox" name="magickaCycling" />
                                <span><b>Magicka Cycling</b> (talent option; not yet implemented)</span>
                            </label>
                        </div>
                    ` : ''}
                </form>
            `

            return await new Promise((resolve) => {
                const dialog = new Dialog({
                    title: 'Spell Options',
                    content,
                    buttons: {
                        cast: {
                            label: 'Cast',
                            callback: (html) => {
                                const root = html instanceof HTMLElement ? html : html?.[0]
                                const form = root?.querySelector?.('form')
                                const difficultyKey = String(form?.difficultyKey?.value ?? 'average')
                                const manualModifierRaw = form?.manualModifier?.value ?? '0'
                                const manualModifier = Number.parseInt(String(manualModifierRaw ?? '0'), 10) || 0
                                resolve({
                                    isRestrained: form?.restrain?.checked ?? false,
                                    isOverloaded: form?.overload?.checked ?? false,
                                    useOvercharge: form?.overcharge?.checked ?? false,
                                    useMagickaCycling: form?.magickaCycling?.checked ?? false,
                                    difficultyKey,
                                    manualModifier,
                                    restraintValue: wpBonus,
                                    baseCost
                                })
                            }
                        },
                        cancel: { label: 'Cancel', callback: () => resolve(null) }
                    },
                    default: 'cast',
                    render: (html) => {
                        if (!hasOverload) return
                        const restrainCheckbox = html.find?.('#restrainCheckbox')?.[0]
                        const overloadCheckbox = html.find?.('#overloadCheckbox')?.[0]
                        const restrainGroup = html.find?.('#restrainGroup')?.[0]
                        const overloadGroup = html.find?.('#overloadGroup')?.[0]

                        if (restrainCheckbox && overloadCheckbox) {
                            restrainCheckbox.addEventListener('change', (e) => {
                                if (e?.target?.checked) {
                                    overloadCheckbox.checked = false
                                    if (overloadGroup) overloadGroup.style.opacity = '0.5'
                                } else {
                                    if (overloadGroup) overloadGroup.style.opacity = '1'
                                }
                            })
                            overloadCheckbox.addEventListener('change', (e) => {
                                if (e?.target?.checked) {
                                    restrainCheckbox.checked = false
                                    if (restrainGroup) restrainGroup.style.opacity = '0.5'
                                } else {
                                    if (restrainGroup) restrainGroup.style.opacity = '1'
                                }
                            })
                        }
                    }
                }, { width: 420 })
                dialog.render(true)
            })
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
            if (isRightClick) {
                return feature.sheet.render(true)
            }

            const activation = feature?.system?.activation ?? {}

            // Activated feature: use the system activation executor (same as the sheet).
            if (activation?.enabled === true) {
                try {
                    const { executeItemActivation } = await import(_systemImportPath('src/core/system/activation/activation-executor.js'))
                    await executeItemActivation({
                        item: feature,
                        actor,
                        event,
                        renderChat: true,
                        includeImage: false,
                        context: {}
                    })
                } catch (err) {
                    console.error('token-action-hud-uesrpg3ev4 | Feature activation failed', err)
                    ui.notifications.error('Failed to activate feature. See console for details.')
                }
                return
            }

            // Passive feature: configured left-click behavior.
            const mode = game.settings.get(MODULE.ID, 'passiveFeatureLeftClick') || 'chat'
            if (mode === 'sheet') {
                return feature.sheet.render(true)
            }

            const description = feature.system?.description || ''
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content: `
                    <h3>${feature.name}</h3>
                    <div>${description || '<i>No description.</i>'}</div>
                `
            })
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
