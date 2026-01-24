// System Module Imports
import { ACTION_TYPE, GROUP, MODULE, SPELL_SCHOOLS } from './constants.js'
import { isSupportedActor, isSupportedActorType, debugLog } from './utils.js'
import {
    getBuildCacheEntry,
    invalidateBuildCacheByActorId,
    invalidateBuildCacheByKey,
    registerBuildCacheInvalidationHooks,
    safeModifiedTime,
    setBuildCacheEntry
} from './cache.js'
import { runBuildExtensions } from './extensions.js'

export let ActionHandler = null

// Phase 4: keep cache lifecycle in a dedicated module for clarity.
registerBuildCacheInvalidationHooks()

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
    /**
     * Extends Token Action HUD Core's ActionHandler class and builds system-defined actions for the HUD
     */
    ActionHandler = class ActionHandler extends coreModule.api.ActionHandler {
        constructor (...args) {
            super(...args)
            /** @type {Array<{groupData: object, actions: object[]}>} */
            this._uesrpgBuildRecords = []
        }

        /**
         * Override addActions to also capture records for conservative caching.
         * @override
         */
        addActions (actions, groupData) {
            super.addActions(actions, groupData)
            try {
                if (!Array.isArray(actions) || !groupData?.id) return
                // Deep-clone actions to avoid later mutation by Core.
                const clone = foundry?.utils?.deepClone
                    ? foundry.utils.deepClone(actions)
                    : JSON.parse(JSON.stringify(actions))
                const gd = { ...groupData }
                this._uesrpgBuildRecords.push({ groupData: gd, actions: clone })
            } catch (e) {
                // Cache capture is best-effort. Never block HUD building.
            }
        }

        /**
         * Map system activation action types to stable sort weights.
         * Lower weight sorts first.
         * @private
         */
        #activationSortWeight = {
            free: 10,
            reaction: 20,
            secondary: 30,
            action: 40,
            passive: 90
        }

        /**
         * Normalize an activation action type.
         * @private
         * @param {string} actionType
         * @returns {string}
         */
        #normalizeActivationType (actionType) {
            const t = String(actionType ?? '').toLowerCase()
            if (t === 'free' || t === 'reaction' || t === 'secondary' || t === 'action' || t === 'passive') return t
            return 'action'
        }

        /**
         * Get a compact label for an activation action type.
         * @private
         * @param {string} actionType
         * @returns {string}
         */
        #getActivationTypeLabel (actionType) {
            const t = this.#normalizeActivationType(actionType)
            switch (t) {
            case 'free': return 'Free'
            case 'reaction': return 'Reaction'
            case 'secondary': return 'Secondary'
            case 'passive': return 'Passive'
            default: return 'Action'
            }
        }

        /**
         * Build compact cost string for HUD badges.
         * @private
         * @param {object} costs
         * @returns {string}
         */
        #getActivationCostText (costs = {}) {
            const parts = []
            const ap = Number(costs?.action_points ?? 0)
            const sp = Number(costs?.stamina ?? 0)
            const mp = Number(costs?.magicka ?? 0)
            const lp = Number(costs?.luck_points ?? 0)
            const hp = Number(costs?.health ?? 0)

            if (ap > 0) parts.push(`AP${ap}`)
            if (sp > 0) parts.push(`SP${sp}`)
            if (mp > 0) parts.push(`MP${mp}`)
            if (lp > 0) parts.push(`LP${lp}`)
            if (hp > 0) parts.push(`HP${hp}`)
            return parts.join(' ')
        }

        /**
         * Build compact uses string for HUD badges.
         * Supports both activation.uses and activation.usage.
         * @private
         * @param {object} activation
         * @returns {string}
         */
        #getActivationUsesText (activation = {}) {
            const uses = activation?.uses
            const usage = activation?.usage

            // Prefer the modern 'uses' schema if present.
            if (uses && (Number(uses?.max ?? 0) > 0 || Number(uses?.value ?? 0) > 0)) {
                const value = Number(uses?.value ?? 0)
                const max = Number(uses?.max ?? 0)
                return `${value}/${max}`
            }

            if (usage && (Number(usage?.max ?? 0) > 0 || Number(usage?.current ?? 0) > 0)) {
                const value = Number(usage?.current ?? 0)
                const max = Number(usage?.max ?? 0)
                return `${value}/${max}`
            }

            return ''
        }

        /**
         * Get action points (AP) display text for the current actor.
         * @private
         * @returns {string}
         */
        #getActionPointsText () {
            const currentAP = Number(this.actor?.system?.action_points?.value ?? 0)
            const maxAP = Number(this.actor?.system?.action_points?.max ?? 0)
            return `${currentAP}/${maxAP}`
        }

        /**
         * Build a compact AP badge action.
         * Rendered as a disabled, shrink button so it does not create a new UI region/tab.
         * @private
         * @returns {object}
         */
        #buildActionPointsBadgeAction () {
            return {
                id: 'ap-badge',
                name: `AP ${this.#getActionPointsText()}`,
                encodedValue: ['utility', 'ap-badge'].join(this.delimiter),
                cssClass: 'disabled shrink uesrpg-ap-badge'
            }
        }

        /**
         * Get attacks-per-round tracker text for the current actor.
         * @private
         * @returns {string}
         */
        #getAttacksThisRoundText () {
            const currentAttacks = Number(this.actor?.system?.combat_tracking?.attacks_this_round ?? 0)
            const maxAttacks = 2
            return `${currentAttacks}/${maxAttacks}`
        }

        /**
         * Append attacks-per-round tracker to a label.
         * @private
         * @param {string} label
         * @returns {string}
         */
        #withAttackTracker (label) {
            const t = this.#getAttacksThisRoundText()
            return `${label} ${t}`
        }

        /**
         * Build tooltip HTML for a feature item.
         * @private
         * @param {object} itemData
         * @param {object} activation
         * @returns {string}
         */
        #buildFeatureTooltip (itemData, activation = {}) {
            const descriptionHtml = itemData?.system?.description || ''
            const enabled = activation?.enabled === true
            const typeLabel = this.#getActivationTypeLabel(activation?.actionType)
            const costText = this.#getActivationCostText(activation?.costs)
            const usesText = this.#getActivationUsesText(activation)

            const title = enabled ? `Activated (${typeLabel.toLowerCase()})` : 'Passive'
            const metaParts = []
            if (enabled) {
                if (costText) metaParts.push(costText)
                if (usesText) metaParts.push(`Uses ${usesText}`)
            }

            const metaLine = metaParts.length
                ? `<div class="uesrpg-tah-tooltip-meta">${metaParts.join(' • ')}</div>`
                : ''

            // Tooltips must be readable in both Foundry light/dark themes. Item descriptions may contain
            // inline styling from the editor (e.g. black text) which becomes unreadable against dark
            // tooltip backgrounds. We therefore normalize tooltip content to plain text.
            const descriptionText = this.#tooltipPlainText(descriptionHtml)
            const descLine = descriptionText
                ? `<div class="uesrpg-tah-tooltip-desc">${descriptionText}</div>`
                : `<div class="uesrpg-tah-tooltip-desc"><i>No description.</i></div>`

            return `
                <div class="uesrpg-tah-tooltip">
                    <div class="uesrpg-tah-tooltip-title">${title}</div>
                    ${metaLine}
                    <hr class="uesrpg-tah-tooltip-sep" />
                    ${descLine}
                </div>
            `
        }

        /**
         * Convert arbitrary HTML to tooltip-safe plain text.
         * Preserves basic line breaks while stripping inline styles.
         * @private
         * @param {string} html
         * @returns {string}
         */
        #tooltipPlainText (html) {
            const raw = String(html ?? '')
            if (!raw.trim()) return ''

            try {
                const div = document.createElement('div')
                div.innerHTML = raw

                // Replace <br> with newlines to preserve author intent.
                div.querySelectorAll('br').forEach(br => br.replaceWith('\n'))

                // Newline after list items and paragraphs for readability.
                div.querySelectorAll('li').forEach(li => {
                    li.insertAdjacentText('beforeend', '\n')
                })
                div.querySelectorAll('p').forEach(p => {
                    p.insertAdjacentText('beforeend', '\n')
                })

                const text = (div.textContent ?? '').replace(/\r\n/g, '\n')
                const normalized = text
                    .split('\n')
                    .map(l => l.trim())
                    .filter(Boolean)
                    .join('<br>')

                return normalized
            } catch (_err) {
                // Fallback: best-effort strip tags.
                return raw
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
            }
        }

        /**
         * Build a feature action (talent/trait/power).
         * Adds activation badges (action type / costs / uses) and a contrast-safe tooltip.
         * @private
         * @param {string} itemId
         * @param {object} itemData
         * @param {string} encodedType
         * @returns {{ action: object, sortWeight: number, nameKey: string, isActivated: boolean }}
         */
        #buildFeatureAction (itemId, itemData, encodedType) {
            const activation = itemData?.system?.activation ?? {}
            const isActivated = activation?.enabled === true
            const actionType = this.#normalizeActivationType(activation?.actionType)
            const typeLabel = this.#getActivationTypeLabel(actionType)
            const costText = this.#getActivationCostText(activation?.costs)
            const usesText = this.#getActivationUsesText(activation)

            const action = {
                id: itemId,
                name: itemData?.name ?? 'Feature',
                encodedValue: [encodedType, itemId].join(this.delimiter),
                tooltip: this.#buildFeatureTooltip(itemData, activation),
                cssClass: isActivated ? 'active' : ''
            }

            if (isActivated) {
                action.info1 = { text: typeLabel }
                if (costText) action.info2 = { text: costText }
                if (usesText) action.info3 = { text: usesText }
            }

            return {
                action,
                sortWeight: this.#activationSortWeight[actionType] ?? 50,
                nameKey: String(itemData?.name ?? '').toLowerCase(),
                isActivated
            }
        }
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
         * Build a per-build item index to avoid repeated full scans of actor items.
         * The index is rebuilt once per Token Action HUD build and used by group builders.
         * @private
         */
        #buildItemIndex () {
            const byType = new Map()

            /** @type {{ id: string, item: any } | null} */
            let equippedRangedWeapon = null
            /** @type {{ id: string, item: any } | null} */
            let activeCombatStyle = null

            let hasEquippedMeleeWeapon = false
            let hasEquippedRangedWeapon = false

            const entries = this.#getItemsIterator()
            for (const entry of entries) {
                // entry can be [id, item] or (fallback) item-like; normalize
                const itemId = Array.isArray(entry) ? entry[0] : (entry?.id ?? entry?._id ?? null)
                const item = Array.isArray(entry) ? entry[1] : entry
                if (!item || !item.type) continue

                const type = String(item.type)
                if (!byType.has(type)) byType.set(type, [])
                byType.get(type).push([itemId, item])

                // Convenience flags for frequently-queried state
                if (type === 'weapon' && item.system?.equipped === true) {
                    const mode = String(item.system?.attackMode ?? '')
                    if (mode === 'melee') hasEquippedMeleeWeapon = true
                    if (mode === 'ranged') {
                        hasEquippedRangedWeapon = true
                        if (!equippedRangedWeapon) equippedRangedWeapon = { id: itemId, item }
                    }
                } else if (type === 'combatStyle' && item.system?.active && !activeCombatStyle) {
                    activeCombatStyle = { id: itemId, item }
                }
            }


            this._itemIndex = {
                byType,
                hasEquippedMeleeWeapon,
                hasEquippedRangedWeapon,
                equippedRangedWeapon,
                activeCombatStyle
            }
        }

        /**
         * Get item entries of a specific type from the per-build index.
         * Returns an array of [itemId, item] pairs.
         * @private
         * @param {string} type
         * @returns {Array<[string, any]>}
         */
        #getItemsOfType (type) {
            const t = String(type ?? '')
            return this._itemIndex?.byType?.get(t) ?? []
        }

        /**
         * Get the first equipped ranged weapon (if any) from the item index.
         * @private
         * @returns {{ id: string, item: any } | null}
         */
        #getEquippedRangedWeapon () {
            return this._itemIndex?.equippedRangedWeapon ?? null
        }

        /**
         * Get active combat style (if any) from the item index.
         * @private
         * @returns {{ id: string, item: any } | null}
         */
        #getActiveCombatStyle () {
            return this._itemIndex?.activeCombatStyle ?? null
        }

        /**
         * Build system actions
         * Called by Token Action HUD Core
         * @override
         * @param {array} groupIds
         */
        async buildSystemActions (groupIds) {
            // For safety, bypass caching for partial builds.
            const isPartialBuild = Array.isArray(groupIds) && groupIds.length > 0

            // Determine controlled actors for this build.
            // Token Action HUD Core may provide `this.actor` only for single-token selection.
            // When multiple tokens are selected, we derive a deterministic actor set here.
            this.isMultiTokenSelection = false

            if (!this.actor) {
                const controlledTokens = (canvas?.tokens?.controlled ?? []).filter(t => isSupportedActor(t?.actor))
                if (!controlledTokens.length) return

                const actors = controlledTokens.map(t => t.actor).filter(Boolean)
                if (!actors.length) return

                // Do not show HUD for mixed supported actor types.
                const firstType = actors[0].type
                if (!actors.every(a => a.type === firstType)) return

                // Representative actor: required for Core handler methods that assume `this.actor` exists.
                this.actor = actors[0]
                this.actors = actors
                this.isMultiTokenSelection = actors.length > 1
            } else {
                this.actors = [this.actor]
                this.isMultiTokenSelection = false
            }

            this.actorType = this.actor?.type

            // Phase 3: apply conservative cache for single-token selection only.
            // - We key by Token id to account for token-local state (status effects/overlays).
            // - We also check best-effort modifiedTime hints to avoid stale display.
            if (!isPartialBuild && !this.isMultiTokenSelection) {
                const token = this.token ?? canvas?.tokens?.controlled?.[0] ?? null
                const cacheKey = token?.id ?? null
                if (cacheKey) {
                    const cached = getBuildCacheEntry(cacheKey)
                    const actorId = this.actor?.id ?? null
                    const actorMod = safeModifiedTime(this.actor)
                    const tokenMod = safeModifiedTime(token?.document)

                    if (cached && cached.actorId === actorId) {
                        // If we have mod-time hints, verify they match.
                        const actorOk = (cached.actorMod == null || actorMod == null) ? true : cached.actorMod === actorMod
                        const tokenOk = (cached.tokenMod == null || tokenMod == null) ? true : cached.tokenMod === tokenMod
                        if (actorOk && tokenOk) {
                            for (const rec of cached.records ?? []) {
                                super.addActions(rec.actions, rec.groupData)
                            }
                            return
                        }
                        // Stale cache - drop it.
                        invalidateBuildCacheByKey(cacheKey)
                    }
                }
            }

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

            // Build per-build item index (Phase 2 performance)
            this.#buildItemIndex()

            if (isSupportedActorType(this.actorType)) {
                await this.#buildCharacterActions()
            }

            // Add multi-token execution actions when multiple supported actors of the same type are selected.
            // This is intentionally additive and does not change the single-token experience.
            if (this.isMultiTokenSelection) {
                this.#buildMultiTokenExecutionActions()
            }

            // Phase 4: run registered build extensions (additive).
            // Skip partial builds to avoid accidental duplication when Core requests a single group refresh.
            if (!isPartialBuild) {
                const token = this.token ?? canvas?.tokens?.controlled?.[0] ?? null
                await runBuildExtensions({
                    handler: this,
                    actor: this.actor,
                    token,
                    actors: Array.isArray(this.actors) ? this.actors : [this.actor].filter(Boolean),
                    isMultiTokenSelection: !!this.isMultiTokenSelection,
                    delimiter: this.delimiter
                })
            }

            // Phase 3: store cache for single-token full builds only.
            if (!isPartialBuild && !this.isMultiTokenSelection) {
                const token = this.token ?? canvas?.tokens?.controlled?.[0] ?? null
                const cacheKey = token?.id ?? null
                if (cacheKey && Array.isArray(this._uesrpgBuildRecords) && this._uesrpgBuildRecords.length > 0) {
                    const actorId = this.actor?.id ?? null
                    const actorMod = safeModifiedTime(this.actor)
                    const tokenMod = safeModifiedTime(token?.document)

                    setBuildCacheEntry(cacheKey, {
                        actorId,
                        tokenId: token?.id ?? null,
                        actorMod,
                        tokenMod,
                        records: this._uesrpgBuildRecords
                    })
                    // actor->cacheKey indexing is handled by cache.js
                }
            }
        }

        /**
         * Build multi-token execution actions (Attacks, Spells, Talents) without altering effects behavior.
         * @private
         */
        #buildMultiTokenExecutionActions () {
            const mode = game.settings.get(MODULE.ID, 'multiTokenItemExecutionMode') ?? 'intersection'
            if (mode === 'off') return

            const actors = Array.isArray(this.actors) ? this.actors.filter(a => !!a) : []
            if (actors.length < 2) return

            this.#buildMultiTokenAttacks(actors, mode)
            this.#buildMultiTokenSpells(actors, mode)
            this.#buildMultiTokenTalents(actors, mode)
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
            await this.#buildResourceBadges()
            await this.#buildStatusEffects()
            await this.#buildActiveEffects()
        }

        /**
         * Build display-only resource badges (AP/SP/MP/Luck).
         * Display-only avoids action-economy coupling.
         * @private
         */
        async #buildResourceBadges () {
            if (!this.actor || this.isMultiTokenSelection) return

            // Place badges into the existing Utility group so they appear for users
            // who have an older, persisted HUD layout which does not include the
            // newer "Resources" group.
            // This is display-only and intentionally avoids action-economy coupling.
            const groupData = GROUP.utility
            const actions = []

            const apV = Number(this.actor.system?.action_points?.value ?? 0)
            const apM = Number(this.actor.system?.action_points?.max ?? 0)
            const spV = Number(this.actor.system?.stamina?.value ?? 0)
            const spM = Number(this.actor.system?.stamina?.max ?? 0)
            const mpV = Number(this.actor.system?.magicka?.value ?? 0)
            const mpM = Number(this.actor.system?.magicka?.max ?? 0)
            const lpV = Number(this.actor.system?.luck_points?.value ?? 0)
            const lpM = Number(this.actor.system?.luck_points?.max ?? 0)

            actions.push({
                id: 'badge-ap',
                name: `AP ${apV}/${apM}`,
                encodedValue: ['utility', 'badge-ap'].join(this.delimiter),
                cssClass: 'disabled shrink uesrpg-resource-badge'
            })
            actions.push({
                id: 'badge-sp',
                name: `SP ${spV}/${spM}`,
                encodedValue: ['utility', 'badge-sp'].join(this.delimiter),
                cssClass: 'disabled shrink uesrpg-resource-badge'
            })
            actions.push({
                id: 'badge-mp',
                name: `MP ${mpV}/${mpM}`,
                encodedValue: ['utility', 'badge-mp'].join(this.delimiter),
                cssClass: 'disabled shrink uesrpg-resource-badge'
            })
            actions.push({
                id: 'badge-lp',
                name: `Luck ${lpV}/${lpM}`,
                encodedValue: ['utility', 'badge-lp'].join(this.delimiter),
                cssClass: 'disabled shrink uesrpg-resource-badge'
            })

            this.addActions(actions, groupData)
        }

        /**
         * Build multiple token actions
         * @private
         * @returns {object}
         */
        #buildMultipleTokenActions () {
            // Multi-token: expose deterministic controls and (optionally) multi-token item execution.
            // Status Effects: union display, toggle-all semantics.
            // Active Effects: tab present but empty (effect id intersection is not deterministic across actors).
            this.#buildStatusEffects({ multiToken: true })
            this.#buildActiveEffects({ multiToken: true })

            const mode = game.settings.get(MODULE.ID, 'multiTokenItemExecutionMode') ?? 'intersection'
            if (mode === 'off') return

            // Multi-token execution actions for Attacks, Spells and Activated Talents.
            const actors = Array.isArray(this.actors) ? this.actors.filter(a => !!a) : []
            if (actors.length < 2) return

            this.#buildMultiTokenAttacks(actors, mode)
            this.#buildMultiTokenSpells(actors, mode)
            this.#buildMultiTokenTalents(actors, mode)
        }

        /**
         * Build multi-token attack actions.
         * Uses union/intersection semantics based on the selected mode.
         * @private
         * @param {Actor[]} actors
         * @param {'intersection'|'union'} mode
         */
        #buildMultiTokenAttacks (actors, mode) {
            const groupId = 'primaryActions'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            const hasMeleeByActor = actors.map(a => a.items?.some(i => i.type === 'weapon' && i.system?.equipped && i.system?.attackMode === 'melee'))
            const hasRangedByActor = actors.map(a => a.items?.some(i => i.type === 'weapon' && i.system?.equipped && i.system?.attackMode === 'ranged'))

            const showMelee = mode === 'union' ? hasMeleeByActor.some(Boolean) : hasMeleeByActor.every(Boolean)
            const showRanged = mode === 'union' ? hasRangedByActor.some(Boolean) : hasRangedByActor.every(Boolean)

            if (showMelee) {
                actions.push({
                    id: 'multi-attack-melee',
                    name: this.#withAttackTracker(coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.attackMelee')),
                    encodedValue: ['multiCombat', 'attack~melee'].join(this.delimiter)
                })
            }

            if (showRanged) {
                actions.push({
                    id: 'multi-attack-ranged',
                    name: this.#withAttackTracker(coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.attackRanged')),
                    encodedValue: ['multiCombat', 'attack~ranged'].join(this.delimiter)
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build multi-token spell actions (union/intersection by spell name).
         * @private
         * @param {Actor[]} actors
         * @param {'intersection'|'union'} mode
         */
        #buildMultiTokenSpells (actors, mode) {
            // Group by school for readability, but match by name.
            const perActor = actors.map(a => {
                const spells = a.items?.filter(i => i.type === 'spell') ?? []
                return spells.map(s => ({
                    nameKey: String(s.name ?? '').trim().toLowerCase(),
                    name: s.name ?? 'Spell',
                    school: s.system?.school ?? 'other'
                }))
            })

            const counts = new Map()
            const meta = new Map()
            for (const list of perActor) {
                for (const e of list) {
                    if (!e.nameKey) continue
                    counts.set(e.nameKey, (counts.get(e.nameKey) ?? 0) + 1)
                    // Prefer first-seen label/school.
                    if (!meta.has(e.nameKey)) meta.set(e.nameKey, { name: e.name, school: e.school })
                }
            }

            const required = mode === 'union' ? 1 : actors.length
            const bySchool = new Map()
            for (const [nameKey, count] of counts.entries()) {
                if (count < required) continue
                const m = meta.get(nameKey)
                const school = m?.school ?? 'other'
                if (!bySchool.has(school)) bySchool.set(school, [])
                bySchool.get(school).push({ nameKey, name: m?.name ?? nameKey })
            }

            for (const school of SPELL_SCHOOLS) {
                const list = bySchool.get(school)
                if (!list || list.length === 0) continue
                list.sort((a, b) => a.nameKey.localeCompare(b.nameKey))

                const groupId = `${school}Spells`
                const groupData = { id: groupId, type: 'system' }
                const actions = list.map(e => ({
                    id: `multi-spell-${e.nameKey}`,
                    name: e.name,
                    encodedValue: ['multiItem', `spell~${encodeURIComponent(e.nameKey)}`].join(this.delimiter)
                }))
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build multi-token activated talent actions (union/intersection by talent name).
         * @private
         * @param {Actor[]} actors
         * @param {'intersection'|'union'} mode
         */
        #buildMultiTokenTalents (actors, mode) {
            const perActor = actors.map(a => {
                const talents = a.items?.filter(i => i.type === 'talent' && i.system?.activation?.enabled === true) ?? []
                return talents.map(t => ({
                    nameKey: String(t.name ?? '').trim().toLowerCase(),
                    name: t.name ?? 'Talent'
                }))
            })

            const counts = new Map()
            const labels = new Map()
            for (const list of perActor) {
                for (const e of list) {
                    if (!e.nameKey) continue
                    counts.set(e.nameKey, (counts.get(e.nameKey) ?? 0) + 1)
                    if (!labels.has(e.nameKey)) labels.set(e.nameKey, e.name)
                }
            }

            const required = mode === 'union' ? 1 : actors.length
            const keys = Array.from(counts.entries())
                .filter(([, c]) => c >= required)
                .map(([k]) => k)
                .sort((a, b) => a.localeCompare(b))

            if (keys.length === 0) return

            const groupData = { id: 'talentsActivated', type: 'system' }
            const actions = keys.map(k => ({
                id: `multi-talent-${k}`,
                name: labels.get(k) ?? k,
                encodedValue: ['multiItem', `talent~${encodeURIComponent(k)}`].join(this.delimiter)
            }))

            this.addActions(actions, groupData)
        }

        /**
         * Build Status Effects actions (conditions).
         * @private
         * @param {{multiToken?: boolean}} [options]
         */
        async #buildStatusEffects (options = {}) {
            const { multiToken = false } = options

            const groupId = 'statusEffects'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            // CONFIG.statusEffects is the authoritative list for the current world.
            const statusEffects = Array.isArray(CONFIG?.statusEffects) ? CONFIG.statusEffects : []
            if (statusEffects.length === 0) return

            // Determine which tokens/actors we are operating on.
            const tokens = multiToken ? (canvas?.tokens?.controlled ?? []) : (this.token ? [this.token] : [])
            if (tokens.length === 0) return

            // Precompute active-state per statusId.
            // Union semantics for display: active if any selected token has it.
            const activeById = new Map()
            const allById = new Map()
            for (const se of statusEffects) {
                const statusId = String(se?.id ?? '')
                if (!statusId) continue
                let any = false
                let all = true
                for (const t of tokens) {
                    const has = t?.document?.hasStatusEffect ? t.document.hasStatusEffect(statusId) : false
                    any = any || has
                    all = all && has
                }
                activeById.set(statusId, any)
                allById.set(statusId, all)
            }

            for (const se of statusEffects) {
                const statusId = String(se?.id ?? '')
                if (!statusId) continue
                const name = se?.name ? coreModule.api.Utils.i18n(se.name) : statusId
                const icon = se?.icon ?? null

                const isActive = activeById.get(statusId) === true
                const isAll = allById.get(statusId) === true

                actions.push({
                    id: statusId,
                    name,
                    encodedValue: ['statusEffect', statusId].join(this.delimiter),
                    img: icon,
                    cssClass: isActive ? (isAll ? 'active' : 'active uesrpg-tah-partial') : ''
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build Active Effects actions (enable/disable effect documents).
         * @private
         * @param {{multiToken?: boolean}} [options]
         */
        async #buildActiveEffects (options = {}) {
            const { multiToken = false } = options

            const groupId = 'activeEffects'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            if (multiToken) {
                // Reduced-scope: do not attempt intersection across actors by effect-id.
                // Keep the tab present but empty to avoid unsafe toggles.
                return
            }

            const actor = this.actor
            if (!actor) return

            const effects = actor.effects ?? []
            const effectList = typeof effects.values === 'function' ? Array.from(effects.values()) : Array.from(effects)

            for (const ef of effectList) {
                const id = ef?.id
                if (!id) continue
                const name = ef?.name ?? 'Effect'
                const isEnabled = ef?.disabled !== true
                actions.push({
                    id,
                    name,
                    encodedValue: ['activeEffect', id].join(this.delimiter),
                    cssClass: isEnabled ? 'active' : ''
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
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
            const hasMeleeWeapon = this._itemIndex?.hasEquippedMeleeWeapon === true
            if (hasMeleeWeapon) {
                actions.push({
                    id: 'attack-melee',
                    name: this.#withAttackTracker(coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.attackMelee')),
                    encodedValue: ['attack', 'melee'].join(this.delimiter)
                })
            }

            // Attack (Ranged) - if ranged weapon equipped
            const hasRangedWeapon = this._itemIndex?.hasEquippedRangedWeapon === true
            if (hasRangedWeapon) {
                actions.push({
                    id: 'attack-ranged',
                    name: this.#withAttackTracker(coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.attackRanged')),
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

            // Reload Weapon (only if ranged weapon equipped)
            const rangedWeapon = this.#getEquippedRangedWeapon()?.item ?? null

            if (rangedWeapon) {
                const reloadState = rangedWeapon.system?.reloadState ?? {}
                const needsReload = reloadState.requiresReload && !reloadState.isLoaded
                const reloadCost = Number(reloadState.reloadAPCost ?? 0)

                actions.push({
                    id: 'reload-weapon',
                    name: needsReload ? `Reload (${reloadCost} AP)` : 'Reload Weapon',
                    encodedValue: ['secondaryAction', 'reload-weapon'].join(this.delimiter),
                    cssClass: needsReload ? 'active' : ''
                })
            }

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
                name: this.#withAttackTracker(coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.opportunityAttack')),
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
            const activeCombatStyle = this.#getActiveCombatStyle()?.item ?? null

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
            await this.#buildMagicSkills()
            await this.#buildCombatStyles()
        }

        /**
         * Build core skills
         * @private
         */
        async #buildCoreSkills () {
            const groupId = 'coreSkills'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            // For NPCs, build from professions
            if (this.actorType === 'NPC') {
                const professions = this.actor.system?.professions || {}
                const skillsData = this.actor.system?.skills || {}

                // Standard professions from system.professions
                const standardProfs = ['combat', 'evade', 'knowledge', 'magic', 'observe', 'physical', 'social', 'stealth']

                for (const key of standardProfs) {
                    const value = professions[key] || 0
                    if (value === 0) continue

                    const name = key.charAt(0).toUpperCase() + key.slice(1)

                    actions.push({
                        id: `prof-${key}`,
                        name,
                        encodedValue: ['profession', key].join(this.delimiter),
                        info1: { text: `${value}%` }
                    })
                }

                // Special professions from system.skills (commerce, profession1-3)
                const specialProfs = ['commerce', 'profession1', 'profession2', 'profession3']

                for (const key of specialProfs) {
                    const skillData = skillsData[key]
                    if (!skillData) continue

                    // Get TN value
                    const tn = skillData.tn || 0
                    if (tn === 0) continue

                    // Get name (specialization for profession1-3, or key name for commerce)
                    const spec = String(skillData.specialization || '').trim()
                    const name = spec || (key === 'commerce' ? 'Commerce' : key.replace('profession', 'Profession '))

                    actions.push({
                        id: `prof-${key}`,
                        name,
                        encodedValue: ['profession', key].join(this.delimiter),
                        info1: { text: `${tn}%` }
                    })
                }
            } else {
                // For PCs, use skill items (excluding magic category)
                for (const [itemId, itemData] of this.#getItemsOfType('skill')) {
                    if (!itemData) continue
                    if (itemData.system?.category === 'magic') continue

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
            // Only for PCs - magic skills are item type "magicSkill"
            if (this.actorType !== 'Player Character') return
            if (this.#getItemsCount() === 0) return

            const groupId = 'magicSkills'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.#getItemsOfType('magicSkill')) {
                if (!itemData) continue

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

            for (const [itemId, itemData] of this.#getItemsOfType('combatStyle')) {
                if (!itemData) continue

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

            for (const [itemId, itemData] of this.#getItemsOfType('weapon')) {
                if (!itemData) continue

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

            for (const [itemId, itemData] of this.#getItemsOfType('armor')) {
                if (!itemData) continue

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

            for (const [itemId, itemData] of this.#getItemsOfType('item')) {
                if (!itemData) continue

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

            for (const [itemId, itemData] of this.#getItemsOfType('ammunition')) {
                if (!itemData) continue

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

            for (const [itemId, itemData] of this.#getItemsOfType('spell')) {
                if (!itemData) continue

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
                    // Get MP cost from system.cost and level from system.level (confirmed from magic workflow)
                    const mpCost = itemData.system?.cost ?? 0
                    const level = itemData.system?.level ?? 0
                    const description = itemData.system?.description || ''
                    const isAttackSpell = itemData.system?.isAttackSpell === true
                    const name = isAttackSpell ? this.#withAttackTracker(itemData.name) : itemData.name

                    actions.push({
                        id: itemId,
                        name,
                        encodedValue: ['spell', itemId].join(this.delimiter),
                        info1: { text: `MP ${mpCost}` },
                        info2: { text: `Level ${level}` },
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

            const groupDataAll = { id: 'talents', type: 'system' }
            const groupDataActivated = { id: 'talentsActivated', type: 'system' }
            const groupDataPassive = { id: 'talentsPassive', type: 'system' }

            const all = []
            const activated = []
            const passive = []

            for (const [itemId, itemData] of this.#getItemsOfType('talent')) {
                if (!itemData) continue
                const built = this.#buildFeatureAction(itemId, itemData, 'talent')
                all.push(built.action)
                if (built.isActivated) activated.push(built)
                else passive.push(built)
            }

            // Legacy combined group (for existing user layouts)
            if (all.length > 0) this.addActions(all, groupDataAll)

            // Activation-aware split groups (used by the new defaults)
            activated.sort((a, b) => (a.sortWeight - b.sortWeight) || a.nameKey.localeCompare(b.nameKey))
            passive.sort((a, b) => a.nameKey.localeCompare(b.nameKey))

            if (activated.length > 0) this.addActions(activated.map(e => e.action), groupDataActivated)
            if (passive.length > 0) this.addActions(passive.map(e => e.action), groupDataPassive)
        }

        /**
         * Build traits
         * @private
         */
        async #buildTraits () {
            if (this.#getItemsCount() === 0) return

            const groupDataAll = { id: 'traits', type: 'system' }
            const groupDataActivated = { id: 'traitsActivated', type: 'system' }
            const groupDataPassive = { id: 'traitsPassive', type: 'system' }

            const all = []
            const activated = []
            const passive = []

            for (const [itemId, itemData] of this.#getItemsOfType('trait')) {
                if (!itemData) continue
                const built = this.#buildFeatureAction(itemId, itemData, 'trait')
                all.push(built.action)
                if (built.isActivated) activated.push(built)
                else passive.push(built)
            }

            // Legacy combined group (for existing user layouts)
            if (all.length > 0) this.addActions(all, groupDataAll)

            // Activation-aware split groups (used by the new defaults)
            activated.sort((a, b) => (a.sortWeight - b.sortWeight) || a.nameKey.localeCompare(b.nameKey))
            passive.sort((a, b) => a.nameKey.localeCompare(b.nameKey))

            if (activated.length > 0) this.addActions(activated.map(e => e.action), groupDataActivated)
            if (passive.length > 0) this.addActions(passive.map(e => e.action), groupDataPassive)
        }

        /**
         * Build powers
         * @private
         */
        async #buildPowers () {
            if (this.#getItemsCount() === 0) return

            const groupDataAll = { id: 'powers', type: 'system' }
            const groupDataActivated = { id: 'powersActivated', type: 'system' }
            const groupDataPassive = { id: 'powersPassive', type: 'system' }

            const all = []
            const activated = []
            const passive = []

            for (const [itemId, itemData] of this.#getItemsOfType('power')) {
                if (!itemData) continue
                const built = this.#buildFeatureAction(itemId, itemData, 'power')
                all.push(built.action)
                if (built.isActivated) activated.push(built)
                else passive.push(built)
            }

            // Legacy combined group (for existing user layouts)
            if (all.length > 0) this.addActions(all, groupDataAll)

            // Activation-aware split groups (used by the new defaults)
            activated.sort((a, b) => (a.sortWeight - b.sortWeight) || a.nameKey.localeCompare(b.nameKey))
            passive.sort((a, b) => a.nameKey.localeCompare(b.nameKey))

            if (activated.length > 0) this.addActions(activated.map(e => e.action), groupDataActivated)
            if (passive.length > 0) this.addActions(passive.map(e => e.action), groupDataPassive)
        }

    }
})
