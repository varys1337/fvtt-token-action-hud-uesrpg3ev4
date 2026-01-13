# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-13

### Added
- Initial release of Token Action HUD for UESRPG 3ev4
- Combat Actions integration:
  - Primary Actions: Attack (Melee/Ranged), Aim, Cast Magic
  - Secondary Actions: Dash, Disengage, Hide, Use Item
  - Reactions: Defensive Stance, Opportunity Attack
  - Special Actions: Arise, Shove, Grapple, Trip, Disarm (with dynamic Combat Style actions)
- Skills & Abilities display:
  - Core Skills with TN percentage display
  - Magic Skills with rank display
  - Combat Styles with active style management
- Inventory Management:
  - Weapons with damage display and roll functionality
  - Armor with AR value and equip toggle
  - General items and ammunition
- Spells by School:
  - Seven spell categories (Alteration, Conjuration, Destruction, Illusion, Mysticism, Restoration, Other)
  - Color-coded spell schools
  - MP cost and rank display
  - Integration with Magic Opposed Workflow
- Features display:
  - Talents, Traits, and Powers
  - Post to chat functionality
- Action Tracking:
  - Real-time Action Points display with warning when 0
  - Attacks This Round tracking with limit warnings
- System Integration:
  - OpposedWorkflow for combat attacks
  - SkillOpposedWorkflow for special actions
  - MagicOpposedWorkflow for spell casting
  - Active Effects support (Aim, Defensive Stance, Disengage)
  - Combat Style activation via actor flags
- Token Action HUD Core 2.0 compatibility
- UESRPG 3ev4 themed styling with color-coded groups
- Display Unequipped Items setting

### Technical
- Compatible with Foundry VTT v11-v13
- Requires Token Action HUD Core 2.0.0+
- Dynamic imports for system workflow integration
- Defensive coding with safe property access
- Production-ready code following Foundry v13 best practices

[1.0.0]: https://github.com/varys1337/fvtt-token-action-hud-uesrpg3ev4/releases/tag/v1.0.0
