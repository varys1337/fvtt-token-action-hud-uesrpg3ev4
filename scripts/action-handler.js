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
         * Get items count safely (handles both Collection and Array)
         * @private
         * @returns {number} The number of items
         */
        #getItemsCount () {
            if (!this.items) return 0
            // Collection has .size, Array has .length
            return this.items.size !== undefined ? this.items.size : (this.items.length || 0)
        }

        /**
         * Get items iterator that works with both Collection and Array
         * @private
         * @returns {Iterable} Iterator for items
         */
        #getItemsIterator () {
            if (!this.items) return []
            // If it's a Collection (has .entries method), use entries
            if (typeof this.items.entries === 'function') {
                return this.items.entries()
            }
            // If it's an Array, convert to [id, item] pairs
            if (Array.isArray(this.items)) {
                return this.items.map(item => [item.id || item._id, item])
            }
            // Fallback: try to iterate as-is
            return this.items
        }

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

            // Set items variable - ensure it's always initialized
            if (this.actor?.items) {
                let items = this.actor.items
                items = coreModule.api.Utils.sortItemsByName(items)
                // Ensure items is always set (even if empty)
                // sortItemsByName may return Collection or Array - both are fine
                this.items = items || this.actor.items || []
            } else {
                // Initialize empty array if no actor
                this.items = []
            }

            // Fix: System uses 'Player Character' and 'NPC' (capitalized with space)
            if (this.actorType === 'Player Character' || this.actorType === 'NPC') {
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
            const hasMeleeWeapon = this.actor?.items?.some(item =>
                item.type === 'weapon' &&
                item.system?.equipped &&
                item.system?.attackMode === 'melee'
            )
            if (hasMeleeWeapon) {
                actions.push({
                    id: 'attack-melee',
                    name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.attackMelee'),
                    encodedValue: ['attack', 'melee'].join(this.delimiter)
                })
            }

            // Attack (Ranged) - if ranged weapon equipped
            const hasRangedWeapon = this.actor?.items?.some(item =>
                item.type === 'weapon' &&
                item.system?.equipped &&
                item.system?.attackMode === 'ranged'
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

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
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

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
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

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
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

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build skills
         * @private
         */
        async #buildSkills () {
            await this.#buildCoreSkills()
            await this.#buildCombatStyles()
        }

        /**
         * Build core skills
         * @private
         */
        async #buildCoreSkills () {
            if (this.#getItemsCount() === 0 && this.actorType === 'Player Character') return

            const groupId = 'coreSkills'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            // For NPCs, build from professions (actor data, not items)
            if (this.actorType === 'NPC') {
                const professions = this.actor.system?.professions || {}
                const skillsData = this.actor.system?.skills || {}

                // Profession keys: profession1, profession2, profession3, combat, magic
                const profKeys = ['profession1', 'profession2', 'profession3', 'combat', 'magic']

                for (const key of profKeys) {
                    const value = professions[key] || 0
                    if (value === 0) continue

                    // Get specialization name if exists
                    const spec = skillsData[key]?.specialization || ''
                    const name = spec || key.replace('profession', 'Profession ')

                    actions.push({
                        id: `prof-${key}`,
                        name,
                        encodedValue: ['profession', key].join(this.delimiter),
                        info1: { text: `${value}%` }
                    })
                }
            } else {
                // For PCs, use skill items
                for (const [itemId, itemData] of this.#getItemsIterator()) {
                    if (!itemData || itemData.type !== 'skill') continue
                    if (itemData.system?.category === 'magic') continue

                    // Use the pre-computed value from system - this is the TN percentage
                    const tn = itemData.system?.value || 0
                    const name = itemData.name

                    actions.push({
                        id: itemId,
                        name,
                        encodedValue: ['skill', itemId].join(this.delimiter),
                        info1: { text: `${tn}%` }
                    })
                }
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build magic skills
         * @private
         */
        async #buildMagicSkills () {
            if (this.#getItemsCount() === 0) return

            const groupId = 'magicSkills'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.#getItemsIterator()) {
                if (!itemData || itemData.type !== 'skill') continue
                if (itemData.system?.category !== 'magic') continue

                // Use pre-computed value
                const tn = itemData.system?.value || 0
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['magicSkill', itemId].join(this.delimiter),
                    info1: { text: `${tn}%` }
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build combat styles
         * @private
         */
        async #buildCombatStyles () {
            if (this.#getItemsCount() === 0) return

            const groupId = 'combatStyles'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.#getItemsIterator()) {
                if (!itemData || itemData.type !== 'combatStyle') continue

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

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build inventory
         * @private
         */
        async #buildInventory () {
            if (this.#getItemsCount() === 0) return

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

            for (const [itemId, itemData] of this.#getItemsIterator()) {
                if (!itemData || itemData.type !== 'weapon') continue

                // ALWAYS show weapons, equipped or not
                const equipped = itemData.system?.equipped || false
                const damage = itemData.system?.damage || ''
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['weapon', itemId].join(this.delimiter),
                    info1: { text: damage },
                    cssClass: equipped ? 'active' : '' // Highlight if equipped
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build armor
         * @private
         */
        async #buildArmor () {
            const groupId = 'armor'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.#getItemsIterator()) {
                if (!itemData || itemData.type !== 'armor') continue

                // ALWAYS show armor, equipped or not
                const equipped = itemData.system?.equipped || false
                const ar = itemData.system?.ar || 0
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['armor', itemId].join(this.delimiter),
                    info1: { text: `AR ${ar}` },
                    cssClass: equipped ? 'active' : '' // Highlight if equipped
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build items
         * @private
         */
        async #buildItems () {
            const groupId = 'items'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.#getItemsIterator()) {
                if (!itemData || itemData.type !== 'item') continue
                if (itemData.type === 'spell') continue // Exclude spells

                // ALWAYS show items, equipped or not
                const equipped = itemData.system?.equipped || false
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['item', itemId].join(this.delimiter),
                    cssClass: equipped ? 'active' : '' // Highlight if equipped
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build ammunition
         * @private
         */
        async #buildAmmunition () {
            const groupId = 'ammunition'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.#getItemsIterator()) {
                if (!itemData || itemData.type !== 'ammunition') continue

                const quantity = itemData.system?.quantity || 0
                const equipped = itemData.system?.equipped || false
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['ammunition', itemId].join(this.delimiter),
                    info1: { text: `x${quantity}` },
                    cssClass: equipped ? 'active' : ''
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build spells grouped by school
         * @private
         */
        async #buildSpells () {
            if (this.#getItemsCount() === 0) return

            // Add magic skills at the top of spells category
            await this.#buildMagicSkills()

            // Group spells by school
            const spellsBySchool = new Map()

            for (const [itemId, itemData] of this.#getItemsIterator()) {
                if (!itemData || itemData.type !== 'spell') continue

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

                if (actions.length > 0) {
                    this.addActions(actions, groupData)
                }
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
            if (this.#getItemsCount() === 0) return

            const groupId = 'talents'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.#getItemsIterator()) {
                if (!itemData || itemData.type !== 'talent') continue

                const description = itemData.system?.description || ''
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['talent', itemId].join(this.delimiter),
                    tooltip: description
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build traits
         * @private
         */
        async #buildTraits () {
            if (this.#getItemsCount() === 0) return

            const groupId = 'traits'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.#getItemsIterator()) {
                if (!itemData || itemData.type !== 'trait') continue

                const description = itemData.system?.description || ''
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['trait', itemId].join(this.delimiter),
                    tooltip: description
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build powers
         * @private
         */
        async #buildPowers () {
            if (this.#getItemsCount() === 0) return

            const groupId = 'powers'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.#getItemsIterator()) {
                if (!itemData || itemData.type !== 'power') continue

                const description = itemData.system?.description || ''
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    encodedValue: ['power', itemId].join(this.delimiter),
                    tooltip: description
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
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

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }
    }
})
