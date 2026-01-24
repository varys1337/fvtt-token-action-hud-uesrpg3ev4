/**
 * Module-based constants
 */
export const MODULE = {
    ID: 'token-action-hud-uesrpg3ev4'
}

/**
 * Core module
 */
export const CORE_MODULE = {
    ID: 'token-action-hud-core'
}

/**
 * Core module version required by the system module
 */
export const REQUIRED_CORE_MODULE_VERSION = '2.0'

/**
 * Action types
 */
export const ACTION_TYPE = {
    // Combat Actions
    attack: 'tokenActionHud.uesrpg3ev4.attack',
    aim: 'tokenActionHud.uesrpg3ev4.aim',
    castMagic: 'tokenActionHud.uesrpg3ev4.castMagic',
    dash: 'tokenActionHud.uesrpg3ev4.dash',
    disengage: 'tokenActionHud.uesrpg3ev4.disengage',
    hide: 'tokenActionHud.uesrpg3ev4.hide',
    useItem: 'tokenActionHud.uesrpg3ev4.useItem',
    defensiveStance: 'tokenActionHud.uesrpg3ev4.defensiveStance',
    opportunityAttack: 'tokenActionHud.uesrpg3ev4.opportunityAttack',
    specialAction: 'tokenActionHud.uesrpg3ev4.specialAction',

    // Skills
    skill: 'tokenActionHud.uesrpg3ev4.skill',
    magicSkill: 'tokenActionHud.uesrpg3ev4.magicSkill',
    combatStyle: 'tokenActionHud.uesrpg3ev4.combatStyle',

    // Inventory
    weapon: 'tokenActionHud.uesrpg3ev4.weapon',
    armor: 'tokenActionHud.uesrpg3ev4.armor',
    item: 'tokenActionHud.uesrpg3ev4.item',
    ammunition: 'tokenActionHud.uesrpg3ev4.ammunition',

    // Spells
    spell: 'tokenActionHud.uesrpg3ev4.spell',

    // Features
    talent: 'tokenActionHud.uesrpg3ev4.talent',
    trait: 'tokenActionHud.uesrpg3ev4.trait',
    power: 'tokenActionHud.uesrpg3ev4.power',

    // Effects
    statusEffect: 'tokenActionHud.uesrpg3ev4.statusEffect',
    activeEffect: 'tokenActionHud.uesrpg3ev4.activeEffect',

    // Utility
    utility: 'tokenActionHud.utility'
}

/**
 * Spell Schools
 */
export const SPELL_SCHOOLS = [
    'alteration',
    'conjuration',
    'destruction',
    'illusion',
    'mysticism',
    'restoration',
    'other'
]

/**
 * Groups
 */
export const GROUP = {
    // Combat Actions
    primaryActions: { id: 'primaryActions', name: 'tokenActionHud.uesrpg3ev4.primaryActions', type: 'system' },
    secondaryActions: { id: 'secondaryActions', name: 'tokenActionHud.uesrpg3ev4.secondaryActions', type: 'system' },
    reactions: { id: 'reactions', name: 'tokenActionHud.uesrpg3ev4.reactions', type: 'system' },
    specialActions: { id: 'specialActions', name: 'tokenActionHud.uesrpg3ev4.specialActions', type: 'system' },

    // Skills
    coreSkills: { id: 'coreSkills', name: 'tokenActionHud.uesrpg3ev4.coreSkills', type: 'system' },
    magicSkills: { id: 'magicSkills', name: 'tokenActionHud.uesrpg3ev4.magicSkills', type: 'system' },
    combatStyles: { id: 'combatStyles', name: 'tokenActionHud.uesrpg3ev4.combatStyles', type: 'system' },

    // Inventory
    weapons: { id: 'weapons', name: 'tokenActionHud.uesrpg3ev4.weapons', type: 'system' },
    armor: { id: 'armor', name: 'tokenActionHud.uesrpg3ev4.armor', type: 'system' },
    items: { id: 'items', name: 'tokenActionHud.uesrpg3ev4.items', type: 'system' },
    ammunition: { id: 'ammunition', name: 'tokenActionHud.uesrpg3ev4.ammunition', type: 'system' },

    // Spells by School
    alterationSpells: { id: 'alterationSpells', name: 'tokenActionHud.uesrpg3ev4.alterationSpells', type: 'system' },
    conjurationSpells: { id: 'conjurationSpells', name: 'tokenActionHud.uesrpg3ev4.conjurationSpells', type: 'system' },
    destructionSpells: { id: 'destructionSpells', name: 'tokenActionHud.uesrpg3ev4.destructionSpells', type: 'system' },
    illusionSpells: { id: 'illusionSpells', name: 'tokenActionHud.uesrpg3ev4.illusionSpells', type: 'system' },
    mysticismSpells: { id: 'mysticismSpells', name: 'tokenActionHud.uesrpg3ev4.mysticismSpells', type: 'system' },
    restorationSpells: { id: 'restorationSpells', name: 'tokenActionHud.uesrpg3ev4.restorationSpells', type: 'system' },
    otherSpells: { id: 'otherSpells', name: 'tokenActionHud.uesrpg3ev4.otherSpells', type: 'system' },

    // Features
    talents: { id: 'talents', name: 'tokenActionHud.uesrpg3ev4.talents', type: 'system' },
    traits: { id: 'traits', name: 'tokenActionHud.uesrpg3ev4.traits', type: 'system' },
    powers: { id: 'powers', name: 'tokenActionHud.uesrpg3ev4.powers', type: 'system' },

    // Features (Activation split)
    talentsActivated: { id: 'talentsActivated', name: 'tokenActionHud.uesrpg3ev4.talentsActivated', type: 'system' },
    talentsPassive: { id: 'talentsPassive', name: 'tokenActionHud.uesrpg3ev4.talentsPassive', type: 'system' },
    traitsActivated: { id: 'traitsActivated', name: 'tokenActionHud.uesrpg3ev4.traitsActivated', type: 'system' },
    traitsPassive: { id: 'traitsPassive', name: 'tokenActionHud.uesrpg3ev4.traitsPassive', type: 'system' },
    powersActivated: { id: 'powersActivated', name: 'tokenActionHud.uesrpg3ev4.powersActivated', type: 'system' },
    powersPassive: { id: 'powersPassive', name: 'tokenActionHud.uesrpg3ev4.powersPassive', type: 'system' },


    // Effects
    statusEffects: { id: 'statusEffects', name: 'tokenActionHud.uesrpg3ev4.statusEffects', type: 'system' },
    // "Magic Effects" is the UESRPG-facing label for actor ActiveEffects.
    activeEffects: { id: 'activeEffects', name: 'tokenActionHud.uesrpg3ev4.magicEffects', type: 'system' },

    // Actions Tracker (non-clickable display only)
    actionsTracker: { id: 'actionsTracker', name: 'tokenActionHud.uesrpg3ev4.actionsTracker', type: 'system' },

    // Resources (display-only badges)
    resources: { id: 'resources', name: 'tokenActionHud.uesrpg3ev4.resources', type: 'system' },

    // Utility
    combat: { id: 'combat', name: 'tokenActionHud.combat', type: 'system' },
    token: { id: 'token', name: 'tokenActionHud.token', type: 'system' },
    utility: { id: 'utility', name: 'tokenActionHud.utility', type: 'system' }
}

/**
 * Item types
 */
export const ITEM_TYPE = {
    weapon: { groupId: 'weapons' },
    armor: { groupId: 'armor' },
    item: { groupId: 'items' },
    ammunition: { groupId: 'ammunition' },
    spell: { groupId: 'spells' },
    talent: { groupId: 'talents' },
    trait: { groupId: 'traits' },
    power: { groupId: 'powers' },
    skill: { groupId: 'coreSkills' },
    magicSkill: { groupId: 'magicSkills' },
    combatStyle: { groupId: 'combatStyles' }
}
