// System Module Imports
import { GROUP, MODULE, SPELL_SCHOOLS } from './constants.js'
import { isSupportedActor, debugLog, diagLog, escapeText, resolveActorToken, getStatusEffectConfigs, readAttackTrackerView } from './utils.js'
import { runBuildExtensions } from './extensions.js'
import { SystemAdapter } from './system-adapter.js'

export let ActionHandler = null

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
    /**
     * Extends Token Action HUD Core's ActionHandler class and builds system-defined actions for the HUD
     */
    ActionHandler = class ActionHandler extends coreModule.api.ActionHandler {
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
         * Diagnostics helper for omitted groups.
         * @private
         * @param {string} groupId
         * @param {string} reason
         * @param {object} extra
         */
        #logOmittedGroup (groupId, reason, extra = {}) {
            diagLog('Group omitted', { groupId, reason, ...extra })
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
            const usage = activation.usage
            const uses = activation.uses
            const meaningful = (data, valueKey, periodKey) => {
                const period = String(data?.[periodKey] ?? '').trim().toLowerCase()
                return Number(data?.max ?? 0) > 0 || Number(data?.[valueKey] ?? 0) > 0 || (period !== '' && period !== 'none')
            }
            const modern = meaningful(usage, 'current', 'period')
            if (!modern && !meaningful(uses, 'value', 'reset')) return ''
            const source = modern ? usage : uses
            const value = Number(source?.[modern ? 'current' : 'value'] ?? 0)
            const max = source?.max == null ? null : Number(source.max)
            const period = String(source?.[modern ? 'period' : 'reset'] ?? '').trim()
            if (!Number.isFinite(value)) return ''
            if (Number.isFinite(max) && max > 0) return `${value}/${max}`
            return period && period.toLowerCase() !== 'none' ? `${value} (${period})` : String(value)
        }

        /**
         * Core escapes visible badge text; tooltip titles also need HTML escaping.
         * @private
         */
        #textInfo (text) {
            return { text, title: escapeText(text) }
        }

        /**
         * Get attacks-per-round tracker text for the current actor.
         * @private
         * @returns {string}
         */
        #getAttacksThisRoundText (limitContext = {}) {
            if (!this.actor || this.isMultiTokenSelection) return ''
            const token = resolveActorToken(this.actor, this.token)
            const key = `${token?.document?.uuid ?? ''}:${limitContext.attackMode ?? ''}:${limitContext.weaponId ?? ''}`
            if (!this._attackTrackerViews.has(key)) {
                const state = readAttackTrackerView(this.actor, token, limitContext)
                const text = state ? `${state.current}/${state.max === Number.MAX_SAFE_INTEGER ? '∞' : state.max}` : ''
                this._attackTrackerViews.set(key, text)
            }
            return this._attackTrackerViews.get(key)
        }

        /**
         * Append attacks-per-round tracker to a label.
         * @private
         * @param {string} label
         * @returns {string}
         */
        #withAttackTracker (label, limitContext = {}) {
            const text = this.#getAttacksThisRoundText(limitContext)
            return text ? `${label} ${text}` : label
        }

        /**
         * Normalize rank values (guards legacy typos)
         * @private
         * @param {string|number|null|undefined} rank
         * @returns {string}
         */
        #normalizeRankValue (rank) {
            if (rank === null || rank === undefined) return ''
            const r = String(rank).toLowerCase()
            if (r === 'journeymain') return 'journeyman'
            return r
        }

        /**
         * Abbreviate a UESRPG rank for compact HUD display.
         * Supports string ranks (untrained/novice/apprentice/journeyman/adept/expert/master)
         * and numeric ranks (0..5 -> novice..master).
         * @private
         * @param {string|number|null|undefined} rank
         * @returns {string}
         */
        #abbrRank (rank) {
            if (rank === null || rank === undefined || rank === '') return ''
            if (typeof rank === 'number' && Number.isFinite(rank)) {
                const n = Number(rank)
                const byNum = {
                    [-1]: 'UT',
                    0: 'Nv',
                    1: 'Ap',
                    2: 'Jr',
                    3: 'Ad',
                    4: 'Ex',
                    5: 'Ma'
                }
                return byNum[n] ?? ''
            }

            const r = this.#normalizeRankValue(rank)
            const byKey = {
                untrained: 'UT',
                novice: 'Nv',
                apprentice: 'Ap',
                journeyman: 'Jr',
                adept: 'Ad',
                expert: 'Ex',
                master: 'Ma'
            }
            return byKey[r] ?? ''
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

            const automated = itemData?.flags?.['uesrpg-3ev4']?.featureConfig?.enabled === true
            const title = enabled ? `Activated (${typeLabel.toLowerCase()})` : (automated ? game.i18n.localize('tokenActionHud.uesrpg3ev4.systemManagedFeature') : 'Passive')
            const metaParts = []
            if (enabled) {
                if (costText) metaParts.push(costText)
                if (usesText) metaParts.push(`Uses ${usesText}`)
            }

            const metaLine = metaParts.length
                ? `<div class="uesrpg-tah-tooltip-meta">${metaParts.map(escapeText).join(' • ')}</div>`
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
                    <div class="uesrpg-tah-tooltip-title">${escapeText(title)}</div>
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
                const template = document.createElement('template')
                template.innerHTML = raw
                const div = template.content

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
                    .map(l => escapeText(l.trim()))
                    .filter(Boolean)
                    .join('<br>')

                return normalized
            } catch (_err) {
                // Fallback: best-effort strip tags.
                return escapeText(raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
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
                system: { actionTypeId: encodedType, actionId: itemId },
                tooltip: this.#buildFeatureTooltip(itemData, activation),
                cssClass: isActivated ? 'active' : ''
            }

            if (isActivated) {
                action.info1 = this.#textInfo(typeLabel)
                if (costText) action.info2 = this.#textInfo(costText)
                if (usesText) action.info3 = this.#textInfo(usesText)
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
            // Arrays also expose entries(); normalize their document IDs first.
            if (Array.isArray(this.items)) {
                return this.items.filter(Boolean).map(item => [item.id ?? item._id, item])
            }
            if (typeof this.items.entries === 'function') {
                return this.items.entries()
            }
            return typeof this.items[Symbol.iterator] === 'function' ? this.items : []
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
            let equippedMeleeWeapon = null
            /** @type {{ id: string, item: any } | null} */
            let activeCombatStyle = null

            let hasEquippedMeleeWeapon = false
            let hasEquippedRangedWeapon = false
            const activeCombatStyleId = this.#resolveActiveCombatStyleId()

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
                    if (mode === 'melee' && !equippedMeleeWeapon) {
                        equippedMeleeWeapon = { id: itemId, item }
                    }
                } else if (type === 'combatStyle' && !activeCombatStyle) {
                    const isActive = (activeCombatStyleId && String(itemId) === String(activeCombatStyleId)) ||
                        (!activeCombatStyleId && item.system?.active === true)
                    if (isActive) activeCombatStyle = { id: itemId, item }
                }
            }


            this._itemIndex = {
                byType,
                hasEquippedMeleeWeapon,
                hasEquippedRangedWeapon,
                equippedMeleeWeapon,
                equippedRangedWeapon,
                activeCombatStyle
            }
        }

        /**
         * Resolve the active combat style id from system flags (refactor source of truth).
         * @private
         * @returns {string|null}
         */
        #resolveActiveCombatStyleId () {
            try {
                const raw = this.actor?.getFlag?.('uesrpg-3ev4', 'activeCombatStyleId')
                return raw ? String(raw) : null
            } catch (_e) {
                return null
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
         * Get all indexed item entries.
         * @private
         * @returns {Array<[string, any]>}
         */
        #getAllItemEntries () {
            const byType = this._itemIndex?.byType
            if (!byType || typeof byType.values !== 'function') return Array.from(this.#getItemsIterator())

            const entries = []
            for (const typedEntries of byType.values()) {
                if (Array.isArray(typedEntries)) entries.push(...typedEntries)
            }
            return entries
        }

        /**
         * Does the provided value represent at least one configured cast enchantment?
         * @private
         * @param {any} value
         * @returns {boolean}
         */
        #hasCastEnchantmentEntries (value) {
            if (value == null || value === false) return false
            if (typeof value === 'string') return value.trim().length > 0
            if (typeof value === 'number') return false
            if (Array.isArray(value)) return value.some(entry => this.#hasCastEnchantmentEntries(entry))
            if (value instanceof Map || value instanceof Set) return Array.from(value.values()).some(entry => this.#hasCastEnchantmentEntries(entry))
            if (typeof value !== 'object') return false

            if (value.enabled === false) return false

            const explicitSpellKeys = [
                'spellId',
                'spellUuid',
                'spellUUID',
                'spell',
                'spellName',
                'uuid',
                'itemId',
                'actorSpellItemId',
                'sourceSpellId',
                'sourceSpellUuid'
            ]
            if (explicitSpellKeys.some(key => this.#hasCastEnchantmentEntries(value[key]))) return true

            const snapshot = value.snapshot ?? value.spellSnapshot ?? value.spellData ?? null
            if (snapshot && this.#hasCastEnchantmentEntries(snapshot.name ?? snapshot.system ?? snapshot)) return true

            return Object.values(value).some(entry => this.#hasCastEnchantmentEntries(entry))
        }

        /**
         * Determine whether an item-spellcasting slot is configured enough to expose.
         * @private
         * @param {any} slot
         * @returns {boolean}
         */
        #hasConfiguredItemSpellcastingSlot (slot) {
            if (!slot || typeof slot !== 'object') return false
            if (slot.enabled === false) return false

            return this.#hasCastEnchantmentEntries([
                slot.spellId,
                slot.spellUuid,
                slot.spellUUID,
                slot.uuid,
                slot.itemId,
                slot.actorSpellItemId,
                slot.sourceSpellId,
                slot.sourceSpellUuid,
                slot.snapshot,
                slot.spellSnapshot,
                slot.spellData
            ])
        }

        /**
         * Determine whether an inventory item exposes the system cast-enchantment workflow.
         * This mirrors the actor-sheet inventory button: a stored spell configuration on the
         * item is enough; no spell-school or profession rank is required here.
         * @private
         * @param {any} itemData
         * @returns {boolean}
         */
        #hasCastEnchantmentConfiguration (itemData) {
            if (!itemData || itemData.type === 'spell') return false

            const system = itemData.system ?? {}
            if (system.uiHasCastEnchantment === true || system.hasCastEnchantment === true || system.hasCastEnchantments === true) {
                return true
            }

            const moduleFlags = itemData.flags?.['uesrpg-3ev4'] ?? itemData.flags?.uesrpg3ev4 ?? {}
            const itemSpellcastingSlots = moduleFlags.itemSpellcasting?.slots
            if (Array.isArray(itemSpellcastingSlots) && itemSpellcastingSlots.some(slot => this.#hasConfiguredItemSpellcastingSlot(slot))) {
                return true
            }

            const candidates = [
                system.castEnchantments,
                system.castEnchantments?.spells,
                system.castEnchantments?.spellConfigurations,
                system.castEnchantments?.configurations,
                system.spellcastingConfiguration,
                system.spellcastingConfigurations,
                system.spellConfigurations,
                system.enchantment?.castEnchantments,
                system.enchantment?.spells,
                system.enchantment?.spellConfigurations,
                system.enchantment?.spellcastingConfigurations,
                system.enchantments?.castEnchantments,
                system.enchantments?.spells,
                system.enchantments?.spellConfigurations,
                system.enchantments?.spellcastingConfigurations,
                moduleFlags.castEnchantments,
                moduleFlags.spellcastingConfiguration,
                moduleFlags.spellcastingConfigurations,
                moduleFlags.spellConfigurations
            ]

            return candidates.some(candidate => this.#hasCastEnchantmentEntries(candidate))
        }

        /**
         * Return the first defined value from a list of candidate fields.
         * Preserves explicit zero values.
         * @private
         * @param {...any} values
         * @returns {any}
         */
        #firstDefinedValue (...values) {
            return values.find(value => value !== undefined && value !== null)
        }

        /**
         * Convert arbitrary social domain data into a flat array of entry-like objects.
         * @private
         * @param {any} source
         * @returns {object[]}
         */
        #normalizeSocialEntriesSource (source) {
            if (!source) return []
            if (Array.isArray(source)) return source.filter(entry => entry !== undefined && entry !== null)
            if (typeof source === 'object') return Object.entries(source).map(([key, value]) => {
                if (value && typeof value === 'object' && !Array.isArray(value)) return { key, ...value }
                return { key, name: value }
            })
            return []
        }

        /**
         * Build a stable synthetic id for a social entry.
         * @private
         * @param {object} entry
         * @param {string} prefix
         * @param {number} index
         * @returns {string}
         */
        #buildSocialEntryId (entry, prefix, index) {
            const normalizedName = String(entry?.name ?? entry?.label ?? entry?.title ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
            return String(
                entry?.id ??
                entry?.slug ??
                entry?.key ??
                normalizedName ??
                ''
            ).trim() || `${prefix}-${index + 1}`
        }

        /**
         * Get a visible label for a social entry.
         * @private
         * @param {object} entry
         * @param {string} fallback
         * @returns {string}
         */
        #getSocialEntryName (entry, fallback) {
            return String(entry?.name ?? entry?.label ?? entry?.title ?? fallback).trim() || fallback
        }

        /**
         * Build concise language metadata badges from a social entry.
         * @private
         * @param {object} entry
         * @returns {object}
         */
        #buildLanguageEntryMetadata (entry) {
            const info = {}
            const hasSpeak = typeof entry?.speak === 'boolean'
            const hasReadWrite = typeof entry?.readWrite === 'boolean'
            if (hasSpeak || hasReadWrite) {
                const spoken = hasSpeak ? (entry.speak ? 'Spoken' : 'Silent') : ''
                const written = hasReadWrite ? (entry.readWrite ? 'Written' : 'Oral') : ''
                if (spoken) info.info1 = this.#textInfo(spoken)
                if (written) info.info2 = this.#textInfo(written)
            }
            return info
        }

        /**
         * Build concise faction metadata badges from a social entry.
         * @private
         * @param {object} entry
         * @returns {object}
         */
        #buildFactionEntryMetadata (entry) {
            const info = {}
            const rankTitle = String(entry?.rankTitle ?? entry?.rank ?? entry?.standing ?? '').trim()
            const location = String(entry?.location ?? '').trim()
            const reputation = String(entry?.reputation ?? entry?.disposition ?? entry?.influence ?? '').trim()
            if (rankTitle) info.info1 = this.#textInfo(rankTitle)
            else if (reputation) info.info1 = this.#textInfo(reputation)
            if (location) info.info2 = this.#textInfo(location)
            return info
        }

        /**
         * Get normalized actor-native language entries.
         * @private
         * @returns {object[]}
         */
        #getActorLanguageEntries () {
            return this.#normalizeSocialEntriesSource(this.actor?.system?.social?.languages?.entries)
        }

        /**
         * Get normalized actor-native faction entries.
         * @private
         * @returns {object[]}
         */
        #getActorFactionEntries () {
            return this.#normalizeSocialEntriesSource(this.actor?.system?.social?.factions)
        }

        /**
         * Get equipped weapons from the item index in actor order.
         * Non-ranged weapons are treated conservatively as melee.
         * @private
         * @returns {Array<{id: string, item: any, mode: string}>}
         */
        #getEquippedWeapons () {
            return this.#getItemsOfType('weapon')
                .filter(([, item]) => item?.system?.equipped === true)
                .map(([id, item]) => ({
                    id,
                    item,
                    mode: String(item?.system?.attackMode ?? '').trim().toLowerCase() === 'ranged' ? 'ranged' : 'melee'
                }))
        }

        /**
         * Build a stable display label for equipped weapon attack actions.
         * Adds a numeric suffix only when duplicate names collide.
         * @private
         * @param {Array<{id: string, item: any, mode: string}>} entries
         * @returns {Map<string, string>}
         */
        #buildWeaponAttackLabels (entries) {
            const counts = new Map()
            for (const entry of entries) {
                const name = String(entry?.item?.name ?? 'Weapon').trim() || 'Weapon'
                counts.set(name, (counts.get(name) ?? 0) + 1)
            }

            const seen = new Map()
            const labels = new Map()
            for (const entry of entries) {
                const base = String(entry?.item?.name ?? 'Weapon').trim() || 'Weapon'
                if ((counts.get(base) ?? 0) < 2) {
                    labels.set(String(entry.id), base)
                    continue
                }

                const next = (seen.get(base) ?? 0) + 1
                seen.set(base, next)
                labels.set(String(entry.id), `${base} (${next})`)
            }

            return labels
        }

        /**
         * Build lightweight metadata for a weapon attack action.
         * @private
         * @param {any} weapon
         * @returns {object}
         */
        #buildWeaponAttackMetadata (weapon) {
            const data = {}
            const damage = String(weapon?.system?.damage ?? '').trim()
            if (damage) data.info1 = this.#textInfo(damage)

            const charge = weapon?.system?.charge
            const chargeText = (charge && (Number(charge?.max ?? 0) > 0 || Number(charge?.value ?? 0) > 0))
                ? `C ${Number(charge?.value ?? 0)}/${Number(charge?.max ?? 0)}`
                : ''
            if (chargeText) data.info2 = this.#textInfo(chargeText)

            return data
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
         * Get the first equipped melee weapon (if any) from the item index.
         * @private
         * @returns {{ id: string, item: any } | null}
         */
        #getEquippedMeleeWeapon () {
            return this._itemIndex?.equippedMeleeWeapon ?? null
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
         * Core supplies layout group IDs on every normal build.
         * Core owns actor/token context; derived data lasts for one build.
         */
        async buildSystemActions (groupIds) {
            this._attackTrackerViews = new Map()
            this._itemIndex = null
            this._multiItemIndexes = new Map()
            this.items = []
            this._uesrpgActors = []
            this.isMultiTokenSelection = false
            this.actorType = null
            const controlled = Array.from(canvas?.tokens?.controlled ?? [])
            if (controlled.some(token => !isSupportedActor(token?.actor))) return
            if (this.actor && !isSupportedActor(this.actor)) return

            this.isMultiTokenSelection = !this.actor && controlled.length > 1
            this._uesrpgActors = this.actor ? [this.actor] : controlled.map(token => token.actor)
            if (!this._uesrpgActors.length) return
            if (!this.actor && !this.isMultiTokenSelection) return
            if (new Set(this._uesrpgActors.map(actor => actor.type)).size !== 1) return

            if (this.isMultiTokenSelection) {
                this.#buildMultiTokenExecutionActions()
                await this.#buildStatusEffects({ multiToken: true })
            } else {
                this.actorType = this.actor.type
                this.items = coreModule.api.Utils.sortItemsByName(this.actor.items) ?? this.actor.items ?? []
                this.#buildItemIndex()
                await this.#buildCharacterActions()
            }

            await runBuildExtensions({
                handler: this,
                actor: this.actor ?? null,
                token: this.actor ? resolveActorToken(this.actor, this.token) : null,
                actors: [...this._uesrpgActors],
                isMultiTokenSelection: this.isMultiTokenSelection,
                delimiter: this.delimiter
            })
        }

        /**
         * Build multi-token execution actions (Attacks, Spells, Talents) without altering effects behavior.
         * @private
         */
        #buildMultiTokenExecutionActions () {
            const mode = game.settings.get(MODULE.ID, 'multiTokenItemExecutionMode') ?? 'intersection'
            if (mode === 'off') return

            const actors = this._uesrpgActors ?? []
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
         * Build resource quick-access buttons (Health/Magicka/Stamina/Luck) and rest actions.
         * Buttons mirror the Actor sheet sidebar resource menus where available.
         * @private
         */
        async #buildResourceBadges () {
            if (!this.actor || this.isMultiTokenSelection) return

            const resourceGroupData = GROUP.resources
            const resourceActions = []
            const utilityGroupData = GROUP.utility
            const utilityActions = []

            // Health is represented by system.hp + system.tempHP in the current system schema.
            const displayNumber = value => value != null && Number.isFinite(Number(value)) ? Number(value) : '—'
            const hpV = displayNumber(this.actor.system?.hp?.value)
            const hpM = displayNumber(this.actor.system?.hp?.max)
            const tempHP = displayNumber(this.actor.system?.tempHP)
            const spV = displayNumber(this.actor.system?.stamina?.value)
            const spM = displayNumber(this.actor.system?.stamina?.max)
            const mpV = displayNumber(this.actor.system?.magicka?.value)
            const mpM = displayNumber(this.actor.system?.magicka?.max)
            const lpV = displayNumber(this.actor.system?.luck_points?.value)
            const lpM = displayNumber(this.actor.system?.luck_points?.max)

            resourceActions.push({
                id: 'resource-health',
                name: tempHP > 0 ? `Health ${hpV}/${hpM} (+${tempHP})` : `Health ${hpV}/${hpM}`,
                system: { actionTypeId: 'resources', actionId: 'resource-health' },
                cssClass: 'shrink uesrpg-resource-badge'
            })
            resourceActions.push({
                id: 'resource-magicka',
                name: `Magicka ${mpV}/${mpM}`,
                system: { actionTypeId: 'resources', actionId: 'resource-magicka' },
                cssClass: 'shrink uesrpg-resource-badge'
            })
            resourceActions.push({
                id: 'resource-stamina',
                name: `Stamina ${spV}/${spM}`,
                system: { actionTypeId: 'resources', actionId: 'resource-stamina' },
                cssClass: 'shrink uesrpg-resource-badge'
            })
            resourceActions.push({
                id: 'resource-luck',
                name: game.i18n.localize('tokenActionHud.uesrpg3ev4.burnLuck'),
                info1: this.#textInfo(`LP ${lpV}/${lpM}`),
                tooltip: game.i18n.localize('tokenActionHud.uesrpg3ev4.burnLuckHint'),
                system: { actionTypeId: 'resources', actionId: 'resource-luck' },
                cssClass: 'shrink uesrpg-resource-badge'
            })

            // Add rest actions (only show for single token selection)
            utilityActions.push({
                id: 'shortRest',
                name: 'Short Rest',
                system: { actionTypeId: 'utility', actionId: 'shortRest' }
            })
            utilityActions.push({
                id: 'longRest',
                name: 'Long Rest',
                system: { actionTypeId: 'utility', actionId: 'longRest' }
            })

            if (resourceActions.length > 0) this.addActions(resourceActions, resourceGroupData)
            if (utilityActions.length > 0) this.addActions(utilityActions, utilityGroupData)
        }

        /** Per-build item buckets shared by the multi-selection builders. */
        #getMultiItems (actor, type) {
            if (!this._multiItemIndexes.has(actor)) {
                const byType = new Map()
                for (const item of actor.items ?? []) {
                    const items = byType.get(item.type) ?? []
                    items.push(item)
                    byType.set(item.type, items)
                }
                this._multiItemIndexes.set(actor, byType)
            }
            return this._multiItemIndexes.get(actor).get(type) ?? []
        }

        #getUnambiguousMultiItems (actor, type, predicate = () => true) {
            const candidates = this.#getMultiItems(actor, type).filter(predicate)
            const names = new Map()
            for (const item of candidates) {
                const key = String(item.name ?? '').trim().toLowerCase()
                if (key) names.set(key, (names.get(key) ?? 0) + 1)
            }
            return candidates.filter(item => names.get(String(item.name ?? '').trim().toLowerCase()) === 1)
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

            const hasMeleeByActor = actors.map(a => this.#getMultiItems(a, 'weapon').some(i =>
                i.system?.equipped === true &&
                String(i.system?.attackMode ?? '') !== 'ranged'
            ))
            const hasRangedByActor = actors.map(a => this.#getMultiItems(a, 'weapon').some(i => i.system?.equipped === true && i.system?.attackMode === 'ranged'))

            const showMelee = mode === 'union' ? hasMeleeByActor.some(Boolean) : hasMeleeByActor.every(Boolean)
            const showRanged = mode === 'union' ? hasRangedByActor.some(Boolean) : hasRangedByActor.every(Boolean)

            if (showMelee) {
                actions.push({
                    id: 'multi-attack-melee',
                    name: this.#withAttackTracker(`Shared ${coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.attackMelee')}`),
                    system: { actionTypeId: 'multiCombat', actionId: 'attack~melee' }
                })
            }

            if (showRanged) {
                actions.push({
                    id: 'multi-attack-ranged',
                    name: this.#withAttackTracker(`Shared ${coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.attackRanged')}`),
                    system: { actionTypeId: 'multiCombat', actionId: 'attack~ranged' }
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            } else {
                this.#logOmittedGroup(groupId, 'no equipped attacks')
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
                const spells = this.#getUnambiguousMultiItems(a, 'spell')
                const seen = new Set()
                return spells.reduce((entries, s) => {
                    const nameKey = String(s.name ?? '').trim().toLowerCase()
                    if (!nameKey || seen.has(nameKey)) return entries
                    seen.add(nameKey)
                    entries.push({
                        nameKey,
                        name: s.name ?? 'Spell',
                        school: s.system?.school ?? 'other'
                    })
                    return entries
                }, [])
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
                    system: { actionTypeId: 'multiItem', actionId: `spell~${encodeURIComponent(e.nameKey).replace(/~/g, '%7E')}` }
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
                const talents = this.#getUnambiguousMultiItems(a, 'talent', item => item.system?.activation?.enabled === true)
                const seen = new Set()
                return talents.reduce((entries, t) => {
                    const nameKey = String(t.name ?? '').trim().toLowerCase()
                    if (!nameKey || seen.has(nameKey)) return entries
                    seen.add(nameKey)
                    entries.push({
                        nameKey,
                        name: t.name ?? 'Talent'
                    })
                    return entries
                }, [])
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
                system: { actionTypeId: 'multiItem', actionId: `talent~${encodeURIComponent(k).replace(/~/g, '%7E')}` }
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

            const actors = multiToken ? this._uesrpgActors : [this.actor].filter(Boolean)
            if (!actors?.length) return
            // Match v14's configured Token HUD visibility and actor-type restrictions.
            const statusEffects = getStatusEffectConfigs().filter(effect => {
                if (effect.hud === false) return false
                const types = effect.hud?.actorTypes
                return !Array.isArray(types) || actors.every(actor => types.includes(actor.type))
            }).sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0))
            if (statusEffects.length === 0) return

            // Precompute active-state per statusId.
            // Union semantics for display: active if any selected token has it.
            const activeById = new Map()
            const allById = new Map()
            for (const se of statusEffects) {
                const statusId = String(se?.id ?? '')
                if (!statusId) continue
                let any = false
                let all = true
                for (const actor of actors) {
                    const has = actor.statuses?.has(statusId) === true
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
                const icon = se?.img ?? null

                const isActive = activeById.get(statusId) === true
                const isAll = allById.get(statusId) === true

                actions.push({
                    id: statusId,
                    name,
                    system: { actionTypeId: 'statusEffect', actionId: statusId },
                    img: icon,
                    cssClass: isActive ? (isAll ? 'active' : 'active uesrpg-tah-partial') : ''
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            } else {
                this.#logOmittedGroup(groupId, 'no status effects')
            }
        }

        /**
         * Build Active Effects actions (enable/disable effect documents).
         * @private
         * @param {{multiToken?: boolean}} [options]
         */
        async #buildActiveEffects (options = {}) {
            const { multiToken = false } = options

            if (multiToken) {
                return
            }

            const groupId = 'activeEffects'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

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
                    system: { actionTypeId: 'activeEffect', actionId: id },
                    cssClass: isEnabled ? 'active' : ''
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            } else {
                this.#logOmittedGroup(groupId, 'no combat styles')
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
            const equippedWeapons = this.#getEquippedWeapons()
            const weaponLabels = this.#buildWeaponAttackLabels(equippedWeapons)

            for (const weaponEntry of equippedWeapons.filter(entry => entry.mode === 'melee')) {
                const label = weaponLabels.get(String(weaponEntry.id)) ?? (weaponEntry.item?.name ?? 'Weapon')
                actions.push({
                    id: `attack-melee-${weaponEntry.id}`,
                    name: this.#withAttackTracker(label, { attackMode: weaponEntry.mode, weaponId: weaponEntry.id }),
                    system: { actionTypeId: 'meleeWeaponAttack', actionId: weaponEntry.id },
                    ...this.#buildWeaponAttackMetadata(weaponEntry.item),
                })
            }

            for (const weaponEntry of equippedWeapons.filter(entry => entry.mode === 'ranged')) {
                const label = weaponLabels.get(String(weaponEntry.id)) ?? (weaponEntry.item?.name ?? 'Weapon')
                actions.push({
                    id: `attack-ranged-${weaponEntry.id}`,
                    name: this.#withAttackTracker(label, { attackMode: weaponEntry.mode, weaponId: weaponEntry.id }),
                    system: { actionTypeId: 'rangedWeaponAttack', actionId: weaponEntry.id },
                    ...this.#buildWeaponAttackMetadata(weaponEntry.item),
                })
            }

            // Aim - builds stacking +10 bonus for ranged attacks
            actions.push({
                id: 'aim',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.aim'),
                system: { actionTypeId: 'aim', actionId: 'aim' },
            })

            // Cast Magic - opens spell selection dialog
            actions.push({
                id: 'cast-magic',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.castMagic'),
                system: { actionTypeId: 'castMagic', actionId: 'cast' }
            })

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            } else {
                this.#logOmittedGroup(groupId, 'no weapons')
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
                system: { actionTypeId: 'dash', actionId: 'dash' },
            })

            // Delay - defer turn timing
            actions.push({
                id: 'delay',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.delay'),
                system: { actionTypeId: 'delay', actionId: 'delay' },
            })

            // Disengage - retreat without attacks of opportunity
            actions.push({
                id: 'disengage',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.disengage'),
                system: { actionTypeId: 'disengage', actionId: 'disengage' },
            })

            // Hide - stealth action
            actions.push({
                id: 'hide',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.hide'),
                system: { actionTypeId: 'hide', actionId: 'hide' },
            })

            // Use Item - consumable item usage
            actions.push({
                id: 'use-item',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.useItem'),
                system: { actionTypeId: 'useItem', actionId: 'use' },
            })

            // Cast Magic (Instant / secondary lane)
            actions.push({
                id: 'cast-magic-instant',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.castMagicInstant'),
                system: { actionTypeId: 'castMagic', actionId: 'instant' }
            })

            // Extinguish Burning - explicit turn action for burning condition.
            actions.push({
                id: 'extinguish-burning',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.extinguishBurning'),
                system: { actionTypeId: 'extinguishBurning', actionId: 'extinguish-burning' },
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
                    system: { actionTypeId: 'secondaryAction', actionId: 'reload-weapon' },
                    cssClass: needsReload ? 'active' : '',
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            } else {
                this.#logOmittedGroup(groupId, 'no armor')
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
                system: { actionTypeId: 'defensiveStance', actionId: 'stance' },
            })

            // Opportunity Attack - reaction attack
            actions.push({
                id: 'opportunity-attack',
                name: this.#withAttackTracker(coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.opportunityAttack')),
                system: { actionTypeId: 'opportunityAttack', actionId: 'opportunity' },
            })

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            } else {
                this.#logOmittedGroup(groupId, 'no reactions')
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

            try {
                const list = await SystemAdapter.buildSpecialActionsForActor(this.actor)

                if (!Array.isArray(list)) return
                list.forEach(sa => {
                    const id = String(sa?.id ?? '').trim()
                    if (!id) return
                    actions.push({
                        id,
                        name: sa?.name ?? id,
                        system: { actionTypeId: 'specialAction', actionId: id },
                        cssClass: sa?.known ? 'active' : '',
                    })
                })
            } catch (err) {
                debugLog('System special actions unavailable', err)
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            } else {
                this.#logOmittedGroup(groupId, 'no special actions')
            }
        }

        /**
         * Build skills
         * @private
         */
        async #buildSkills () {
            await this.#buildCharacteristics()
            await this.#buildCoreSkills()
            await this.#buildMagicSkills()
            await this.#buildCombatStyles()
            await this.#buildLanguages()
            await this.#buildFactions()
        }

        /**
         * Characteristic keys and labels used by the UESRPG system.
         * @private
         */
        static #CHARACTERISTIC_KEYS = ['str', 'end', 'agi', 'int', 'wp', 'prc', 'prs', 'lck']
        static #CHARACTERISTIC_LABELS = {
            str: 'Strength',
            end: 'Endurance',
            agi: 'Agility',
            int: 'Intelligence',
            wp: 'Willpower',
            prc: 'Perception',
            prs: 'Personality',
            lck: 'Luck'
        }

        /**
         * Build characteristic action descriptors.
         * @private
         * @returns {object[]}
         */
        #getCharacteristicActions () {
            const characteristics = this.actor?.system?.characteristics
            if (!characteristics) return []

            const actions = []
            for (const chaKey of ActionHandler.#CHARACTERISTIC_KEYS) {
                const cha = characteristics[chaKey]
                if (!cha) continue

                const total = Number(cha.total ?? cha.value ?? 0)
                const label = ActionHandler.#CHARACTERISTIC_LABELS[chaKey] ?? chaKey.toUpperCase()

                actions.push({
                    id: `cha-${chaKey}`,
                    name: label,
                    system: { actionTypeId: 'characteristic', actionId: chaKey },
                    info1: this.#textInfo(`${total}`)
                })
            }

            return actions
        }

        /**
         * Build characteristic test buttons.
         * Shows each characteristic with its total value in the Skills tab.
         * Left-click triggers the system's onClickCharacteristic handler.
         * @private
         */
        async #buildCharacteristics () {
            const groupId = 'characteristics'
            const groupData = { id: groupId, type: 'system' }
            const actions = this.#getCharacteristicActions()

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            } else {
                this.#logOmittedGroup(groupId, 'no characteristics')
            }
        }

        /**
         * Build core skills
         * @private
         */
        async #buildCoreSkills () {
            const groupId = 'coreSkills'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            // Persisted Token Action HUD layouts do not automatically gain new subgroups.
            // Mirror characteristic tests into Core Skills so older layouts still surface them.
            const characteristicActions = this.#getCharacteristicActions()
                .map(action => ({ ...action, id: `core-${action.id}` }))
            actions.push(...characteristicActions)

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
                        system: { actionTypeId: 'profession', actionId: key },
                        info1: this.#textInfo(`${value}%`)
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
                        system: { actionTypeId: 'profession', actionId: key },
                        info1: this.#textInfo(`${tn}%`)
                    })
                }
            } else {
                // For PCs, use skill items (excluding magic category)
                for (const [itemId, itemData] of this.#getItemsOfType('skill')) {
                    if (!itemData) continue

                    const tn = itemData.system?.value || 0
                    const name = itemData.name
                    const rankAbbr = this.#abbrRank(itemData.system?.rank)

                    actions.push({
                        id: itemId,
                        name,
                        system: { actionTypeId: 'skill', actionId: itemId },
                        info1: this.#textInfo(`${tn}%`),
                        ...(rankAbbr ? { info2: this.#textInfo(rankAbbr) } : {})
                    })
                }
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            } else {
                this.#logOmittedGroup(groupId, 'no core skills')
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
                const rankAbbr = this.#abbrRank(itemData.system?.rank)

                actions.push({
                    id: itemId,
                    name,
                    system: { actionTypeId: 'magicSkill', actionId: itemId },
                    info1: this.#textInfo(`${tn}%`),
                    ...(rankAbbr ? { info2: this.#textInfo(rankAbbr) } : {})
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
            const activeId = this.#getActiveCombatStyle()?.id ?? null

            for (const [itemId, itemData] of this.#getItemsOfType('combatStyle')) {
                if (!itemData) continue

                const value = itemData.system?.value || 0
                const rankAbbr = this.#abbrRank(itemData.system?.rank)
                const active = activeId ? String(itemId) === String(activeId) : (itemData.system?.active === true)
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    system: { actionTypeId: 'combatStyle', actionId: itemId },
                    info1: this.#textInfo(`${value}%`),
                    ...(rankAbbr ? { info2: this.#textInfo(rankAbbr) } : {}),
                    cssClass: active ? 'active' : ''
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build languages.
         * @private
         */
        async #buildLanguages () {
            const groupData = { id: 'languages', type: 'system' }
            const actions = []
            const actorEntries = this.#getActorLanguageEntries()

            actions.push({
                id: 'manage-languages',
                name: game.i18n.localize('tokenActionHud.uesrpg3ev4.manageLanguages'),
                system: { actionTypeId: 'manageLanguages', actionId: 'manage' }
            })

            if (actorEntries.length > 0) {
                actorEntries.forEach((entry, index) => {
                    const name = this.#getSocialEntryName(entry, 'Language')
                    const syntheticId = this.#buildSocialEntryId(entry, 'lang', index)
                    const hasExplicitState = typeof entry?.active === 'boolean' || typeof entry?.enabled === 'boolean' || typeof entry?.known === 'boolean'
                    const isActive = entry?.active === true || entry?.enabled === true || entry?.known === true

                    actions.push({
                        id: `languageEntry-${syntheticId}`,
                        name,
                        system: { actionTypeId: 'languageEntry', actionId: syntheticId },
                        ...(hasExplicitState && isActive ? { cssClass: 'active' } : {}),
                        ...this.#buildLanguageEntryMetadata(entry)
                    })
                })
            } else {
                for (const [itemId, itemData] of this.#getItemsOfType('language')) {
                    if (!itemData) continue
                    actions.push({
                        id: itemId,
                        name: itemData.name ?? 'Language',
                        system: { actionTypeId: 'language', actionId: itemId }
                    })
                }
            }

            if (actions.length > 0) this.addActions(actions, groupData)
        }

        /**
         * Build factions.
         * @private
         */
        async #buildFactions () {
            const groupData = { id: 'factions', type: 'system' }
            const actions = []
            const actorEntries = this.#getActorFactionEntries()

            actions.push({
                id: 'manage-factions',
                name: game.i18n.localize('tokenActionHud.uesrpg3ev4.manageFactions'),
                system: { actionTypeId: 'manageFactions', actionId: 'manage' }
            })

            if (actorEntries.length > 0) {
                actorEntries.forEach((entry, index) => {
                    const name = this.#getSocialEntryName(entry, 'Faction')
                    const syntheticId = this.#buildSocialEntryId(entry, 'faction', index)
                    const hasExplicitState = typeof entry?.active === 'boolean' || typeof entry?.enabled === 'boolean'
                    const isActive = entry?.active === true || entry?.enabled === true

                    actions.push({
                        id: `factionEntry-${syntheticId}`,
                        name,
                        system: { actionTypeId: 'factionEntry', actionId: syntheticId },
                        ...(hasExplicitState && isActive ? { cssClass: 'active' } : {}),
                        ...this.#buildFactionEntryMetadata(entry)
                    })
                })
            } else {
                for (const [itemId, itemData] of this.#getItemsOfType('faction')) {
                    if (!itemData) continue
                    actions.push({
                        id: itemId,
                        name: itemData.name ?? 'Faction',
                        system: { actionTypeId: 'faction', actionId: itemId }
                    })
                }
            }

            if (actions.length > 0) this.addActions(actions, groupData)
        }

        /**
         * Build inventory
         * @private
         */
        async #buildInventory () {
            if (this.#getItemsCount() === 0) return

            await this.#buildWeapons()
            await this.#buildArmor()
            await this.#buildShields()
            await this.#buildItems()
            await this.#buildContainers()
            await this.#buildAmmunition()
            await this.#buildScrolls()
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
                const charge = itemData.system?.charge
                const chargeText = (charge && (Number(charge?.max ?? 0) > 0 || Number(charge?.value ?? 0) > 0))
                    ? `C ${Number(charge?.value ?? 0)}/${Number(charge?.max ?? 0)}`
                    : ''
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    system: { actionTypeId: 'weapon', actionId: itemId },
                    info1: this.#textInfo(damage),
                    ...(chargeText ? { info2: this.#textInfo(chargeText) } : {}),
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

                const equipped = itemData.system?.equipped || false
                const ar = this.#firstDefinedValue(itemData.system?.armorEffective, itemData.system?.armor, 0)
                const mar = this.#firstDefinedValue(itemData.system?.magic_arEffective, itemData.system?.magic_ar)
                const hasMar = mar !== undefined && mar !== null
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    system: { actionTypeId: 'armor', actionId: itemId },
                    info1: this.#textInfo(`AR ${ar}`),
                    ...(hasMar ? { info2: this.#textInfo(`MAR ${mar}`) } : {}),
                    cssClass: equipped ? 'active' : ''
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build shields
         * @private
         */
        async #buildShields () {
            const groupId = 'shields'
            const groupData = { id: groupId, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.#getItemsOfType('shield')) {
                if (!itemData) continue

                const equipped = itemData.system?.equipped || false
                const br = this.#firstDefinedValue(itemData.system?.blockRatingEffective, itemData.system?.blockRating, 0)
                const mbr = this.#firstDefinedValue(itemData.system?.magic_brEffective, itemData.system?.magic_br)
                const hasMbr = mbr !== undefined && mbr !== null && (Number(mbr) !== 0 || Object.prototype.hasOwnProperty.call(itemData.system || {}, 'magic_br') || Object.prototype.hasOwnProperty.call(itemData.system || {}, 'magic_brEffective'))

                actions.push({
                    id: itemId,
                    name: itemData.name,
                    system: { actionTypeId: 'shield', actionId: itemId },
                    info1: this.#textInfo(`BR ${br}`),
                    ...(hasMbr ? { info2: this.#textInfo(`MBR ${mbr}`) } : {}),
                    cssClass: equipped ? 'active' : ''
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
                const quantity = Number(itemData.system?.quantity ?? 1)
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    system: { actionTypeId: 'item', actionId: itemId },
                    ...(quantity > 1 ? { info1: this.#textInfo(`x${quantity}`) } : {}),
                    cssClass: equipped ? 'active' : '' // Highlight if equipped
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build containers.
         * @private
         */
        async #buildContainers () {
            const groupData = { id: 'containers', type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.#getItemsOfType('container')) {
                if (!itemData) continue
                const current = Number(itemData.system?.container_enc?.current ?? 0)
                const max = Number(itemData.system?.container_enc?.max ?? 0)
                const capacity = max > 0 ? `${current}/${max}` : ''
                actions.push({
                    id: itemId,
                    name: itemData.name ?? 'Container',
                    system: { actionTypeId: 'container', actionId: itemId },
                    ...(capacity ? { info1: this.#textInfo(capacity) } : {})
                })
            }

            if (actions.length > 0) this.addActions(actions, groupData)
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
                const charge = itemData.system?.charge
                const chargeText = (charge && (Number(charge?.max ?? 0) > 0 || Number(charge?.value ?? 0) > 0))
                    ? `C ${Number(charge?.value ?? 0)}/${Number(charge?.max ?? 0)}`
                    : ''
                const name = itemData.name

                actions.push({
                    id: itemId,
                    name,
                    system: { actionTypeId: 'ammunition', actionId: itemId },
                    info1: this.#textInfo(`x${quantity}`),
                    ...(chargeText ? { info2: this.#textInfo(chargeText) } : {}),
                    cssClass: equipped ? 'active' : ''
                })
            }

            if (actions.length > 0) {
                this.addActions(actions, groupData)
            }
        }

        /**
         * Build scrolls.
         * @private
         */
        async #buildScrolls () {
            const groupData = { id: 'scrolls', type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.#getItemsOfType('scroll')) {
                if (!itemData) continue
                const quantity = Number(itemData.system?.quantity ?? 0)
                const spellUuid = String(itemData.system?.spellUuid ?? '').trim()
                actions.push({
                    id: itemId,
                    name: itemData.name ?? 'Scroll',
                    system: { actionTypeId: 'scroll', actionId: itemId },
                    info1: this.#textInfo(`x${quantity}`),
                    ...(spellUuid ? { info2: this.#textInfo('Linked Spell') } : {})
                })
            }

            if (actions.length > 0) this.addActions(actions, groupData)
        }

        /**
         * Build cast-enchantment item actions under the Spells category.
         * @private
         */
        #buildCastEnchantments () {
            const groupData = { id: GROUP.castEnchantments.id, type: 'system' }
            const actions = []

            for (const [itemId, itemData] of this.#getAllItemEntries()) {
                if (!this.#hasCastEnchantmentConfiguration(itemData)) continue

                const description = itemData.system?.description || itemData.system?.flavor || ''
                actions.push({
                    id: `castEnchantment-${itemId}`,
                    name: itemData.name ?? itemId,
                    system: { actionTypeId: 'castEnchantment', actionId: itemId },
                    img: itemData.img,
                    tooltip: `${this.#tooltipPlainText(description)}<br>${escapeText(game.i18n.localize('tokenActionHud.uesrpg3ev4.openActorSheetForEnchantment'))}`
                })
            }

            if (actions.length > 0) this.addActions(actions, groupData)
        }

        /**
         * Build spells grouped by school
         * @private
         */
        async #buildSpells () {
            if (this.#getItemsCount() === 0) return

            this.#buildCastEnchantments()

            // Group spells by school
            const spellsBySchool = new Map()
            let totalSpells = 0

            for (const [itemId, itemData] of this.#getItemsOfType('spell')) {
                if (!itemData) continue
                totalSpells += 1

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
                        system: { actionTypeId: 'spell', actionId: itemId },
                        info1: this.#textInfo(`MP ${mpCost}`),
                        info2: this.#textInfo(`Level ${level}`),
                        tooltip: description
                    })
                }

                if (actions.length > 0) {
                    this.addActions(actions, groupData)
                }
            }

            if (totalSpells === 0) {
                this.#logOmittedGroup('spells', 'no spells')
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
            if (all.length === 0) this.#logOmittedGroup('talents', 'no talents')
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
            if (all.length === 0) this.#logOmittedGroup('traits', 'no traits')
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
            if (all.length === 0) this.#logOmittedGroup('powers', 'no powers')
        }

    }
})
