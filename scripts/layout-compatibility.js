import { GROUP } from './constants.js'
import { debugLog } from './utils.js'

const LEGACY_GROUPS = [
    { id: GROUP.castEnchantments.id, prefix: 'castEnchantment-', omitMissingPresets: true },
    { id: GROUP.languages.id, prefix: 'languageEntry-', itemType: 'language' },
    { id: GROUP.factions.id, prefix: 'factionEntry-', itemType: 'faction' }
]
const ITEM_ACTION_TYPES = new Set([
    'weapon', 'armor', 'shield', 'item', 'container', 'ammunition', 'scroll',
    'spell', 'skill', 'magicSkill', 'combatStyle', 'language', 'faction',
    'talent', 'trait', 'power', 'castEnchantment'
])
let _hooksRegistered = false

/**
 * Adapt known legacy action rows in the prepared HUD only.
 *
 * Core's documented pre-render hook runs after actions are built. Its public
 * group lookup returns the same group objects used by the rendered HUD. Keep
 * saved selection and ordering without writing Core's layout storage. Ordinary
 * customization saves remain entirely under Core's control.
 */
function normalizeLegacyActionIds (_hud, hudManager) {
    const availableActions = hudManager?.actionHandler?.availableActions
    const groupHandler = hudManager?.groupHandler
    if (!(availableActions instanceof Map) || typeof groupHandler?.getGroups !== 'function') return

    let normalizedCount = 0

    for (const legacyGroup of LEGACY_GROUPS) {
        const groups = groupHandler.getGroups({ id: legacyGroup.id })
        if (!Array.isArray(groups)) continue
        for (const group of groups) {
            if (group?.id !== legacyGroup.id || !Array.isArray(group.actions)) continue

            // Social groups may also contain embedded language/faction Items.
            // Their raw IDs retain their document meaning even if a native
            // social entry happens to use the same key.
            const isEmbeddedItemRow = action => {
                if (!legacyGroup.itemType) return false
                const rawType = availableActions.get(action?.id)?.system?.actionTypeId
                    ?? action?.system?.actionTypeId
                const item = hudManager.actor?.items?.get?.(action?.id)
                return rawType === legacyGroup.itemType || item?.type === legacyGroup.itemType
            }

            // Generated replacements are appended by Core before this hook.
            // Prefer the legacy row's position and selection over that default.
            const replacementIds = new Set()
            for (const action of group.actions) {
                if (typeof action?.id !== 'string' || action.id.startsWith(legacyGroup.prefix) || isEmbeddedItemRow(action)) continue
                const replacementId = `${legacyGroup.prefix}${action.id}`
                if (availableActions.has(replacementId)) replacementIds.add(replacementId)
            }

            const normalizedActions = []
            const addedReplacementIds = new Set()
            let changed = false

            for (const action of group.actions) {
                const actionId = action?.id
                if (typeof actionId !== 'string') {
                    normalizedActions.push(action)
                    continue
                }

                if (actionId.startsWith(legacyGroup.prefix)) {
                    if (replacementIds.has(actionId)) {
                        changed = true
                        continue
                    }
                    normalizedActions.push(action)
                    continue
                }

                if (isEmbeddedItemRow(action)) {
                    normalizedActions.push(action)
                    continue
                }

                const replacementId = `${legacyGroup.prefix}${actionId}`
                const replacement = availableActions.get(replacementId)
                if (replacement) {
                    changed = true
                    if (addedReplacementIds.has(replacementId)) continue
                    addedReplacementIds.add(replacementId)

                    const userSelected = action.userSelected ?? replacement.userSelected ?? true
                    const systemSelected = replacement.systemSelected ?? true
                    normalizedActions.push({
                        ...replacement,
                        isPreset: action.isPreset ?? true,
                        userSelected,
                        systemSelected,
                        selected: systemSelected !== false && userSelected !== false
                    })
                    normalizedCount += 1
                    continue
                }

                // Nonpreset legacy rows may have been refreshed by Core with
                // ordinary Item metadata. Keep them out of the cast group once
                // its cast configuration is gone. Core macro/compendium actions
                // have their own callback and retain that unrelated meaning.
                const currentAction = availableActions.get(actionId) ?? action
                const unrelatedCallback = typeof currentAction.onClick === 'function'
                const isItemAction = ITEM_ACTION_TYPES.has(currentAction.system?.actionTypeId)
                    || !!hudManager.actor?.items?.get?.(actionId)
                if (legacyGroup.omitMissingPresets && !unrelatedCallback
                    && (action.isPreset === true || isItemAction)) {
                    changed = true
                    normalizedCount += 1
                    continue
                }

                normalizedActions.push(action)
            }

            if (changed) group.actions = normalizedActions
        }
    }

    if (normalizedCount > 0) debugLog('Adapted legacy HUD action rows', { count: normalizedCount })
}

/** Register the Core 2.1 pre-render compatibility adapter once. */
export function registerLayoutCompatibilityHooks () {
    if (_hooksRegistered) return
    _hooksRegistered = true
    Hooks.on('tokenActionHudCorePreRender', normalizeLegacyActionIds)
}
