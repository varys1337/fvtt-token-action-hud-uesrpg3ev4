export let RollHandler = null

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

            const renderable = ['skill', 'profession', 'magicSkill', 'combatStyle', 'weapon', 'armor', 'item', 'ammunition', 'spell', 'talent', 'trait', 'power']

            if (renderable.includes(actionTypeId) && this.isRenderItem()) {
                return this.doRenderItem(this.actor, actionId)
            }

            const knownCharacters = ['Player Character', 'NPC']

            // If single actor is selected
            if (this.actor) {
                await this.#handleAction(event, this.actor, this.token, actionTypeId, actionId)
                return
            }

            const controlledTokens = canvas.tokens.controlled
                .filter((token) => knownCharacters.includes(token.actor?.type))

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
            case 'utility':
                await this.#handleUtilityAction(token, actionId)
                break
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

                // Get target token if one is selected
                const targetToken = canvas.tokens.controlled.find(t => t.id !== this.token?.id) ||
                                   Array.from(canvas.tokens.placeables.values()).find(t => t.isTargeted)

                // Dynamically import OpposedWorkflow from system
                const { OpposedWorkflow } = await import('/systems/uesrpg-3ev4/module/combat/opposed-workflow.js')

                // Create pending attack workflow
                await OpposedWorkflow.createPending({
                    attackerTokenUuid: this.token?.document?.uuid || actor.uuid,
                    defenderTokenUuid: targetToken?.document?.uuid || null,
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
                    `<option value="${spell.id}">${spell.name} (MP ${spell.system?.mpCost || 0})</option>`
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
            try {
                // Apply defensive stance effect (+10 defensive tests per stack, stackable)
                await actor.createEmbeddedDocuments('ActiveEffect', [{
                    name: 'Defensive Stance',
                    icon: 'icons/svg/shield.svg',
                    flags: { core: { statusId: 'defensive-stance' } },
                    changes: [
                        {
                            key: 'system.modifiers.combat.defenseTN.total',
                            mode: 2, // ADD mode for proper stacking
                            value: 10
                        }
                    ],
                    duration: { turns: 1 }
                }])

                // Count total stances after adding the new one
                const totalStances = actor.effects.filter(e =>
                    e.flags?.core?.statusId === 'defensive-stance' ||
                    e.name === 'Defensive Stance'
                ).length
                const totalBonus = totalStances * 10

                ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor }),
                    content: `<strong>${actor.name}</strong> takes a <strong>Defensive Stance</strong> (total: +${totalBonus} to defensive tests)!`
                })
            } catch (error) {
                console.error('Error handling defensive stance action:', error)
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
                const { SkillOpposedWorkflow } = await import('/systems/uesrpg-3ev4/module/skills/opposed-workflow.js')

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
            // Right-click: show profession details
            if (this.isRenderItem()) {
                const profValue = actor.system?.professions?.[actionId] || 0
                const spec = actor.system?.skills?.[actionId]?.specialization || ''
                const name = spec || actionId.replace('profession', 'Profession ')

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
                value: { id: actionId }
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
            const skill = actor.items.get(actionId)
            if (!skill) return

            // Right-click or render: open sheet
            if (this.isRenderItem()) {
                return skill.sheet.render(true)
            }

            // Left-click: open sheet (magic skills don't roll directly)
            skill.sheet.render(true)
        }

        /**
         * Handle combat style action
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

            // Left-click: set as active combat style
            try {
                // Deactivate all other combat styles
                const updates = actor.items
                    .filter(item => item.type === 'combatStyle' && item.id !== actionId)
                    .map(item => ({ _id: item.id, 'system.active': false }))

                if (updates.length > 0) {
                    await actor.updateEmbeddedDocuments('Item', updates)
                }

                // Activate this combat style
                await combatStyle.update({ 'system.active': true })

                ui.notifications.info(`${combatStyle.name} is now the active combat style`)
            } catch (error) {
                console.error('Error setting active combat style:', error)
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
                // Get target token if one is selected (optional for unopposed spells)
                const targetToken = canvas.tokens.controlled.find(t => t.id !== this.token?.id) ||
                                   Array.from(canvas.tokens.placeables.values()).find(t => t.isTargeted)

                // Dynamically import MagicOpposedWorkflow from system
                const { MagicOpposedWorkflow } = await import('/systems/uesrpg-3ev4/module/magic/opposed-workflow.js')

                // Create pending magic opposed workflow - target is now optional
                await MagicOpposedWorkflow.createPending({
                    attackerTokenUuid: this.token?.document?.uuid || actor.uuid,
                    defenderTokenUuid: targetToken?.document?.uuid || null, // null is OK for unopposed spells
                    spellUuid: spell.uuid
                })
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

            // Right-click: open sheet
            if (this.isRenderItem()) {
                return feature.sheet.render(true)
            }

            // Left-click: post description to chat
            const description = feature.system?.description || ''
            ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor }),
                content: `
                    <h3>${feature.name}</h3>
                    <p>${description}</p>
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
            switch (actionId) {
            case 'endTurn':
                if (game.combat?.current?.tokenId === token.id) {
                    await game.combat?.nextTurn()
                }
                break
            }
        }
    }
})
