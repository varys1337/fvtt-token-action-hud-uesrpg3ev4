// System Module Imports
import { SPELL_SCHOOLS } from './constants.js'
import { Utils } from './utils.js'

export let ActionHandler = null

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
    /**
     * Extends Token Action HUD Core's ActionHandler class and builds system-defined actions for the HUD
     */
    ActionHandler = class ActionHandler extends coreModule.api.ActionHandler {
        /**
         * Build system actions
         * Called by Token Action HUD Core
         * @override
         * @param {array} groupIds
         */
        async buildSystemActions (groupIds) {
            // Set actor and token variables
            this.actors = (!this.actor) ? this._getActors() : [this.actor]
            this.actorType = this.actor?.type

            // Settings
            this.displayUnequipped = Utils.getSetting('displayUnequipped')

            // Set items variable
            if (this.actor) {
                let items = this.actor.items
                items = coreModule.api.Utils.sortItemsByName(items)
                this.items = items
            }

            if (this.actorType === 'character' || this.actorType === 'npc') {
                await this.#buildCharacterActions()
            } else if (!this.actor) {
                this.#buildMultipleTokenActions()
            }
        }

        /**
         * Build character actions
         * @private
         */
        async #buildCharacterActions () {
            await this.#buildCombatActions()
            await this.#buildSkills()
            await this.#buildInventory()
            await this.#buildSpells()
            await this.#buildFeatures()
            await this.#buildActionTracking()
        }

        /**
         * Build multiple token actions
         * @private
         * @returns {object}
         */
        #buildMultipleTokenActions () {
        }

        /**
         * Build combat actions
         * @private
         */
        async #buildCombatActions () {
            // Primary Actions
            await this.#buildPrimaryActions()

            // Secondary Actions
            await this.#buildSecondaryActions()

            // Reactions
            await this.#buildReactions()

            // Special Actions
            await this.#buildSpecialActions()
        }

        /**
         * Build primary actions
         * @private
         */
        async #buildPrimaryActions () {
            const groupId = 'primaryActions'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            // Attack (Melee) - if melee weapon equipped
            const hasMeleeWeapon = this.actor.items?.some(item =>
                item.type === 'weapon' &&
                item.system?.equipped &&
                item.system?.weaponType === 'melee'
            )
            if (hasMeleeWeapon) {
                actions.push({
                    id: 'attack-melee',
                    name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.attackMelee'),
                    encodedValue: ['attack', 'melee'].join(this.delimiter)
                })
            }

            // Attack (Ranged) - if ranged weapon equipped
            const hasRangedWeapon = this.actor.items?.some(item =>
                item.type === 'weapon' &&
                item.system?.equipped &&
                item.system?.weaponType === 'ranged'
            )
            if (hasRangedWeapon) {
                actions.push({
                    id: 'attack-ranged',
                    name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.attackRanged'),
                    encodedValue: ['attack', 'ranged'].join(this.delimiter)
                })
            }

            // Aim - builds stacking +10 bonus for ranged attacks
            actions.push({
                id: 'aim',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.aim'),
                encodedValue: ['aim', 'aim'].join(this.delimiter)
            })

            // Cast Magic - opens spell selection dialog
            actions.push({
                id: 'cast-magic',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.castMagic'),
                encodedValue: ['castMagic', 'cast'].join(this.delimiter)
            })

            this.addActions(actions, groupData)
        }

        /**
         * Build secondary actions
         * @private
         */
        async #buildSecondaryActions () {
            const groupId = 'secondaryActions'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            // Dash - movement action
            actions.push({
                id: 'dash',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.dash'),
                encodedValue: ['dash', 'dash'].join(this.delimiter)
            })

            // Disengage - retreat without attacks of opportunity
            actions.push({
                id: 'disengage',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.disengage'),
                encodedValue: ['disengage', 'disengage'].join(this.delimiter)
            })

            // Hide - stealth action
            actions.push({
                id: 'hide',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.hide'),
                encodedValue: ['hide', 'hide'].join(this.delimiter)
            })

            // Use Item - consumable item usage
            actions.push({
                id: 'use-item',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.useItem'),
                encodedValue: ['useItem', 'use'].join(this.delimiter)
            })

            this.addActions(actions, groupData)
        }

        /**
         * Build reactions
         * @private
         */
        async #buildReactions () {
            const groupId = 'reactions'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            // Defensive Stance - +10 defensive tests, attack limit 0
            actions.push({
                id: 'defensive-stance',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.defensiveStance'),
                encodedValue: ['defensiveStance', 'stance'].join(this.delimiter)
            })

            // Opportunity Attack - reaction attack
            actions.push({
                id: 'opportunity-attack',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.opportunityAttack'),
                encodedValue: ['opportunityAttack', 'opportunity'].join(this.delimiter)
            })

            this.addActions(actions, groupData)
        }

        /**
         * Build special actions
         * @private
         */
        async #buildSpecialActions () {
            const groupId = 'specialActions'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            // Get active combat style special actions
            const activeCombatStyle = this.actor.items?.find(item =>
                item.type === 'combatStyle' &&
                item.system?.active
            )

            // Basic special actions always available
            const specialActions = ['arise', 'shove', 'grapple', 'trip', 'disarm']

            specialActions.forEach(action => {
                actions.push({
                    id: action,
                    name: coreModule.api.Utils.i18n(`tokenActionHud.uesrpg3ev4.${action}`),
                    encodedValue: ['specialAction', action].join(this.delimiter)
                })
            })

            // Add combat style specific actions if available
            if (activeCombatStyle?.system?.specialActions) {
                const styleActions = activeCombatStyle.system.specialActions || []
                styleActions.forEach(action => {
                    actions.push({
                        id: action.id || action.name,
                        name: action.name,
                        encodedValue: ['specialAction', action.id || action.name].join(this.delimiter)
                    })
                })
            }

            this.addActions(actions, groupData)
        }

        /**
         * Build skills
         * @private
         */
        async #buildSkills () {
            await this.#buildCoreSkills()
            await this.#buildMagicSkills()
            await this.#buildCombatStyles()
        }

        /**
         * Build core skills
         * @private
         */
        async #buildCoreSkills () {
            if (!this.items || this.items.size === 0) return

            const groupId = 'coreSkills'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.items) {
                if (itemData.type !== 'skill') continue
                if (itemData.system?.category === 'magic') continue // Magic skills in separate group

                const tn = itemData.system?.tn || 0
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['skill', itemId].join(this.delimiter),
                    info1: { text: `${tn}%` }
                })
            }

            this.addActions(actions, groupData)
        }

        /**
         * Build magic skills
         * @private
         */
        async #buildMagicSkills () {
            if (!this.items || this.items.size === 0) return

            const groupId = 'magicSkills'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.items) {
                if (itemData.type !== 'skill') continue
                if (itemData.system?.category !== 'magic') continue

                const rank = itemData.system?.rank || 0
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['magicSkill', itemId].join(this.delimiter),
                    info1: { text: `Rank ${rank}` }
                })
            }

            this.addActions(actions, groupData)
        }

        /**
         * Build combat styles
         * @private
         */
        async #buildCombatStyles () {
            if (!this.items || this.items.size === 0) return

            const groupId = 'combatStyles'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.items) {
                if (itemData.type !== 'combatStyle') continue

                const value = itemData.system?.value || 0
                const rank = itemData.system?.rank || 0
                const active = itemData.system?.active || false
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['combatStyle', itemId].join(this.delimiter),
                    info1: { text: `${value}` },
                    info2: { text: `Rank ${rank}` },
                    cssClass: active ? 'active' : ''
                })
            }

            this.addActions(actions, groupData)
        }

        /**
         * Build inventory
         * @private
         */
        async #buildInventory () {
            if (!this.items || this.items.size === 0) return

            await this.#buildWeapons()
            await this.#buildArmor()
            await this.#buildItems()
            await this.#buildAmmunition()
        }

        /**
         * Build weapons
         * @private
         */
        async #buildWeapons () {
            const groupId = 'weapons'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.items) {
                if (itemData.type !== 'weapon') continue

                const equipped = itemData.system?.equipped || false
                if (!equipped && !this.displayUnequipped) continue

                const damage = itemData.system?.damage || ''
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['weapon', itemId].join(this.delimiter),
                    info1: { text: damage }
                })
            }

            this.addActions(actions, groupData)
        }

        /**
         * Build armor
         * @private
         */
        async #buildArmor () {
            const groupId = 'armor'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.items) {
                if (itemData.type !== 'armor') continue

                const equipped = itemData.system?.equipped || false
                if (!equipped && !this.displayUnequipped) continue

                const ar = itemData.system?.ar || 0
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['armor', itemId].join(this.delimiter),
                    info1: { text: `AR ${ar}` },
                    cssClass: equipped ? 'active' : ''
                })
            }

            this.addActions(actions, groupData)
        }

        /**
         * Build items
         * @private
         */
        async #buildItems () {
            const groupId = 'items'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.items) {
                if (itemData.type !== 'item') continue
                if (itemData.type === 'spell') continue // Exclude spells

                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['item', itemId].join(this.delimiter)
                })
            }

            this.addActions(actions, groupData)
        }

        /**
         * Build ammunition
         * @private
         */
        async #buildAmmunition () {
            const groupId = 'ammunition'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.items) {
                if (itemData.type !== 'ammunition') continue

                const quantity = itemData.system?.quantity || 0
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['ammunition', itemId].join(this.delimiter),
                    info1: { text: `x${quantity}` }
                })
            }

            this.addActions(actions, groupData)
        }

        /**
         * Build spells grouped by school
         * @private
         */
        async #buildSpells () {
            if (!this.items || this.items.size === 0) return

            // Group spells by school
            const spellsBySchool = new Map()

            for (const [itemId, itemData] of this.items) {
                if (itemData.type !== 'spell') continue

                const school = itemData.system?.school || 'other'
                if (!spellsBySchool.has(school)) {
                    spellsBySchool.set(school, [])
                }

                spellsBySchool.get(school).push({ itemId, itemData })
            }

            // Build actions for each school
            for (const school of SPELL_SCHOOLS) {
                const spells = spellsBySchool.get(school)
                if (!spells || spells.length === 0) continue

                const groupId = `${school}Spells`
                const groupData = { id: groupId, type: 'system' }
                const actions = []

                for (const { itemId, itemData } of spells) {
                    const mpCost = itemData.system?.mpCost || 0
                    const rank = itemData.system?.rank || 0
                    const description = itemData.system?.description || ''
                    const name = itemData.name

                    actions.push({
                        id: itemId,
                        name,
                        encodedValue: ['spell', itemId].join(this.delimiter),
                        info1: { text: `MP ${mpCost}` },
                        info2: { text: `Rank ${rank}` },
                        tooltip: description
                    })
                }

                this.addActions(actions, groupData)
            }
        }

        /**
         * Build features
         * @private
         */
        async #buildFeatures () {
            await this.#buildTalents()
            await this.#buildTraits()
            await this.#buildPowers()
        }

        /**
         * Build talents
         * @private
         */
        async #buildTalents () {
            if (!this.items || this.items.size === 0) return

            const groupId = 'talents'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.items) {
                if (itemData.type !== 'talent') continue

                const description = itemData.system?.description || ''
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['talent', itemId].join(this.delimiter),
                    tooltip: description
                })
            }

            this.addActions(actions, groupData)
        }

        /**
         * Build traits
         * @private
         */
        async #buildTraits () {
            if (!this.items || this.items.size === 0) return

            const groupId = 'traits'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.items) {
                if (itemData.type !== 'trait') continue

                const description = itemData.system?.description || ''
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['trait', itemId].join(this.delimiter),
                    tooltip: description
                })
            }

            this.addActions(actions, groupData)
        }

        /**
         * Build powers
         * @private
         */
        async #buildPowers () {
            if (!this.items || this.items.size === 0) return

            const groupId = 'powers'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.items) {
                if (itemData.type !== 'power') continue

                const description = itemData.system?.description || ''
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['power', itemId].join(this.delimiter),
                    tooltip: description
                })
            }

            this.addActions(actions, groupData)
        }

        /**
         * Build action tracking display
         * @private
         */
        async #buildActionTracking () {
            const groupId = 'actionTracking'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            // Action Points
            const ap = Utils.getActionPoints(this.actor)
            actions.push({
                id: 'action-points',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.actionPoints'),
                encodedValue: ['utility', 'action-points'].join(this.delimiter),
                info1: {
                    text: `${ap.current}/${ap.max}`,
                    class: ap.current === 0 ? 'tah-spotlight' : ''
                },
                cssClass: 'toggle disabled'
            })

            // Attacks This Round
            const attacks = Utils.getAttacksThisRound(this.actor)
            actions.push({
                id: 'attacks-this-round',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.attacksThisRound'),
                encodedValue: ['utility', 'attacks-this-round'].join(this.delimiter),
                info1: {
                    text: `${attacks.current}/${attacks.limit}`,
                    class: attacks.current >= attacks.limit ? 'tah-spotlight' : ''
                },
                cssClass: 'toggle disabled'
            })

            this.addActions(actions, groupData)
        }
    }
})
