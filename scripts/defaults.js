import { GROUP } from './constants.js'

/**
 * Default layout and groups
 */
export let DEFAULTS = null

Hooks.once('tokenActionHudCoreApiReady', async (coreModule) => {
    const groups = GROUP
    Object.values(groups).forEach(group => {
        group.name = coreModule.api.Utils.i18n(group.name)
        group.listName = `Group: ${coreModule.api.Utils.i18n(group.listName ?? group.name)}`
    })
    const groupsArray = Object.values(groups)
    DEFAULTS = {
        layout: [
            {
                nestId: 'combatActions',
                id: 'combatActions',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.combatActions'),
                groups: [
                    { ...groups.primaryActions, nestId: 'combatActions_primaryActions' },
                    { ...groups.secondaryActions, nestId: 'combatActions_secondaryActions' },
                    { ...groups.reactions, nestId: 'combatActions_reactions' },
                    { ...groups.specialActions, nestId: 'combatActions_specialActions' }
                ]
            },
            {
                nestId: 'skills',
                id: 'skills',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.skills'),
                groups: [
                    { ...groups.coreSkills, nestId: 'skills_coreSkills' },
                    { ...groups.magicSkills, nestId: 'skills_magicSkills' },
                    { ...groups.combatStyles, nestId: 'skills_combatStyles' }
                ]
            },
            {
                nestId: 'inventory',
                id: 'inventory',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.inventory'),
                groups: [
                    { ...groups.weapons, nestId: 'inventory_weapons' },
                    { ...groups.armor, nestId: 'inventory_armor' },
                    { ...groups.items, nestId: 'inventory_items' },
                    { ...groups.ammunition, nestId: 'inventory_ammunition' }
                ]
            },
            {
                nestId: 'spells',
                id: 'spells',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.spells'),
                groups: [
                    { ...groups.alterationSpells, nestId: 'spells_alteration' },
                    { ...groups.conjurationSpells, nestId: 'spells_conjuration' },
                    { ...groups.destructionSpells, nestId: 'spells_destruction' },
                    { ...groups.illusionSpells, nestId: 'spells_illusion' },
                    { ...groups.mysticismSpells, nestId: 'spells_mysticism' },
                    { ...groups.necromancySpells, nestId: 'spells_necromancy' },
                    { ...groups.restorationSpells, nestId: 'spells_restoration' },
                    { ...groups.otherSpells, nestId: 'spells_other' }
                ]
            },
            {
                nestId: 'features',
                id: 'features',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.features'),
                groups: [
                    { ...groups.talentsActivated, nestId: 'features_talentsActivated' },
                    { ...groups.talentsPassive, nestId: 'features_talentsPassive' },
                    { ...groups.traitsActivated, nestId: 'features_traitsActivated' },
                    { ...groups.traitsPassive, nestId: 'features_traitsPassive' },
                    { ...groups.powersActivated, nestId: 'features_powersActivated' },
                    { ...groups.powersPassive, nestId: 'features_powersPassive' }
                ]
            },
            {
                nestId: 'effects',
                id: 'effects',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.effects'),
                groups: [
                    { ...groups.statusEffects, nestId: 'effects_statusEffects' },
                    { ...groups.activeEffects, nestId: 'effects_magicEffects' }
                ]
            },
            {
                nestId: 'actionsTracker',
                id: 'actionsTracker',
                name: coreModule.api.Utils.i18n('tokenActionHud.uesrpg3ev4.actionsTracker'),
                groups: [
                    { ...groups.actionsTracker, nestId: 'actionsTracker_actionsTracker' }
                ]
            },
            {
                nestId: 'utility',
                id: 'utility',
                name: coreModule.api.Utils.i18n('tokenActionHud.utility'),
                groups: [
                    { ...groups.resources, nestId: 'utility_resources' },
                    { ...groups.combat, nestId: 'utility_combat' },
                    { ...groups.token, nestId: 'utility_token' },
                    { ...groups.utility, nestId: 'utility_utility' }
                ]
            }
        ],
        groups: groupsArray
    }
})
