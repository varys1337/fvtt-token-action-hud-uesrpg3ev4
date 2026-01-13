# Token Action HUD UESRPG 3ev4

Token Action HUD is a repositionable HUD of actions for a selected token, specifically designed for the UESRPG 3ev4 (Unofficial Elder Scrolls RPG 3rd Edition v4) system.

## Features

### Combat Actions
**Primary Actions:**
- **Attack (Melee)** - Execute melee attacks with equipped melee weapons
- **Attack (Ranged)** - Execute ranged attacks with equipped ranged weapons
- **Aim** - Build stacking +10 bonus for ranged attacks
- **Cast Magic** - Open spell selection dialog for quick casting

**Secondary Actions:**
- **Dash** - Movement action
- **Disengage** - Retreat without attacks of opportunity
- **Hide** - Stealth action (uses stealth skill if available)
- **Use Item** - Quick access to consumable items

**Reactions:**
- **Defensive Stance** - +10 defensive tests, attack limit 0
- **Opportunity Attack** - Reaction attack with equipped melee weapon

**Special Actions:**
- Dynamic loading from active Combat Style
- **Arise**, **Shove**, **Grapple**, **Trip**, **Disarm**
- Integration with system's Skill Opposed Workflow

### Skills & Abilities
**Core Skills:**
- Display all skill items with current TN percentage
- Left-click to roll, right-click to open sheet
- Full integration with UESRPG 3ev4 skill system

**Magic Skills:**
- Display magic school skills with rank
- Click to open magic skill sheet for detailed view

**Combat Styles:**
- Show all combat styles with value and rank
- Left-click to set as active combat style
- Right-click to open sheet
- Visual indicator for active combat style

### Inventory Management
**Weapons:**
- Display equipped weapons (optional: show unequipped)
- Show damage dice for quick reference
- Left-click for damage roll, right-click to open sheet

**Armor:**
- Display armor with AR value
- Click to toggle equipped status
- Visual indicator for equipped armor

**Items:**
- General inventory items
- Post to chat on click

**Ammunition:**
- Show quantity
- Click to open sheet for management

### Spells by School
Seven spell categories with color-coded organization:
- **Alteration Spells** (Blue)
- **Conjuration Spells** (Purple)
- **Destruction Spells** (Red)
- **Illusion Spells** (Pink)
- **Mysticism Spells** (Cyan)
- **Restoration Spells** (Green)
- **Other Spells** (Gray)

Each spell displays:
- MP cost
- Rank level
- Tooltip with description
- Integration with Magic Opposed Workflow for casting

### Features
**Talents:**
- Character talents with descriptions
- Post to chat on click

**Traits:**
- Racial and acquired traits
- Post to chat on click

**Powers:**
- Special character powers
- Post to chat on click

### Action Tracking
Real-time display of:
- **Action Points:** current/max (red warning when 0)
- **Attacks This Round:** current/limit (orange warning at limit)

## Installation

### Method 1: Foundry VTT Module Browser
1. In Foundry VTT, go to **Configuration and Setup** → **Add-on Modules**
2. Click **Install Module**
3. Search for **Token Action HUD UESRPG 3ev4**
4. Click **Install**

### Method 2: Manifest URL
1. In Foundry VTT, go to **Configuration and Setup** → **Add-on Modules**
2. Click **Install Module**
3. Paste the manifest URL: `https://github.com/varys1337/fvtt-token-action-hud-uesrpg3ev4/releases/latest/download/module.json`
4. Click **Install**

## Required Modules

**CRITICAL:** Token Action HUD UESRPG 3ev4 requires:
1. [Token Action HUD Core](https://foundryvtt.com/packages/token-action-hud-core) (version 2.0.0 or higher)
2. UESRPG 3ev4 system

## Usage

1. Select a token on the canvas
2. The Token Action HUD will appear with all available actions
3. Click actions to execute them:
   - **Left-click:** Execute primary action (roll, use, etc.)
   - **Right-click:** Open item/feature sheet
4. Drag the HUD to reposition it
5. Lock the HUD to prevent accidental repositioning
6. Customize layout and groups per user

## System Integration

This module integrates with UESRPG 3ev4 system workflows:
- **OpposedWorkflow** for combat attacks
- **SkillOpposedWorkflow** for special actions
- **MagicOpposedWorkflow** for spell casting
- **AttackTracker** for 2-attack-per-round limit
- **Active Effects** for buffs/debuffs (Defensive Stance, Aim, etc.)
- **Combat Styles** via actor flags

## Settings

**Display Unequipped Items:** Toggle whether to show unequipped weapons and armor in the HUD (default: off)

## Compatibility

- **Foundry VTT:** v11 - v13
- **Token Action HUD Core:** 2.0.0+
- **UESRPG 3ev4 System:** 1.0.0+

## Support

For questions, feature requests, or bug reports, please open an issue on [GitHub](https://github.com/varys1337/fvtt-token-action-hud-uesrpg3ev4/issues).

## Credits

- **Token Action HUD Core** by Larkinabout
- **UESRPG 3ev4 System** integration

## License

This Foundry VTT module is licensed under a [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/) and this work is licensed under [Foundry Virtual Tabletop EULA - Limited License Agreement for module development](https://foundryvtt.com/article/license/).