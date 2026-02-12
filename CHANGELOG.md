# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.14] - 2026-02-12

### Added
- **Characteristics group** in Skills tab — all 8 characteristics (STR, END, AGI, INT, WP, PRC, PRS, LCK) are now displayed with their total value and can be rolled directly from the HUD
  - Left-click opens the system's characteristic test dialog (supports difficulty, manual modifiers, resistance bonuses, Iron Will for WP)
  - Targeted rolls trigger the opposed characteristic workflow (same as from the actor sheet)
  - Works for both Player Characters and NPCs

### Changed
- Compatibility verified with the system's "New-World-Only Release" (migration removal, world compatibility gate) — no breaking changes to module imports

## [1.0.13] - 2026-02-07

### Changed
- **Feature activation (left-click)** now delegates to the system's canonical shared handlers:
  - Talents use `activateTalentFromItemSheet` — supports defender talent automation, standard chat format, item macros
  - Powers use `activatePowerFromItemSheet` — supports standard chat format, item macros
  - Traits replicate the same pattern (activated → `executeItemActivation`, passive → system post format + macro)
  - Chat posts now use the system's `_buildDefaultPostContent` format with item image, type label, and description
- **Passive feature right-click chat** also uses the system content format for consistency

### Removed
- **"Actions" tab** removed from the HUD default layout (was a standalone tab containing only a non-clickable "Actions X/Y" badge — redundant with the interactive DOM-injected Action tracker already present in the tab bar)
- Orphaned `#buildActionsTracker`, `#buildActionPointsBadgeAction`, and `#getActionPointsText` methods removed from ActionHandler
- Orphaned `.uesrpg-ap-badge` CSS rule removed

### Fixed
- Passive talent activation from HUD now correctly triggers "defender" talent automation (via `runTalentActivationAutomation`)
- Feature chat posts now include `user: game.user.id` matching the system's ChatMessage creation pattern

## [1.0.12] - 2026-02-06

### Added
- **Short Rest and Long Rest buttons** in Utility tab (single-token only)
  - Mirror Actor sheet rest workflow behavior
  - Post rest summary to chat
  - Update actor resources (HP/MP/SP regeneration as per system rules)
  - Re-render actor sheet if open
- **Shift+Right-click escape hatch**: always opens item sheet for features, regardless of settings

### Changed
- **Feature activation behavior** (Talents/Traits/Powers):
  - **Left-click** now **always activates** features (spends costs/uses, posts activation card)
  - **Right-click** on passive features uses configurable behavior (post description or open sheet)
  - **Right-click** on activated features opens item sheet (no activation on right-click)
- **Setting renamed**: `passiveFeatureLeftClick` → `passiveFeatureRightClick`
  - Updated to reflect new behavior: left-click activates, right-click is configurable for passive features
- **Unified debug toggle**: merged separate `debug` and `diagnostics` settings into one `debug` setting
  - Single toggle now controls all HUD debug and diagnostics logging
  - `diagLog` now uses same guard as `debugLog`

### Fixed
- Feature activation now properly calls system activation handlers for activated features
- Passive features execute item macros best-effort (mirrors system sheet behavior)

### Documentation
- Created comprehensive test plan in `docs/testing/tokenhud-uesrpg3ev4.md`
- Updated README with feature activation, rest actions, and Shift modifier documentation

## [1.0.6] - 2026-01-24

### Added
- Phase 4: **Minimal public API** exposed at `game.modules.get("token-action-hud-uesrpg3ev4").api`:
  - `registerBuildExtension(fn)` / `unregisterBuildExtension(fn)` to add small, additive HUD action-build extensions.
  - `invalidateCacheByActorId(actorId)` / `invalidateCacheByTokenId(tokenId)` / `invalidateAllCaches()` to explicitly invalidate the conservative build cache.
  - Emits `Hooks.callAll("tokenActionHud.uesrpg3ev4ApiReady", api)` on ready.
- Phase 4: **Debug logging** setting (client) to enable guarded console debug output.

### Changed
- Refactored the conservative build cache into a dedicated module (`scripts/cache.js`) for clarity and reuse.
- Added an internal extension point (`scripts/extensions.js`) invoked after standard action building and before caching.
- Conservative cache invalidation now also clears on `updateCombat` (best-effort).

## [1.0.5] - 2026-01-24

### Changed
- Right-click Status Effect overlay behavior was adjusted to use `TokenDocument.update({ overlayEffect })` rather than `Token#toggleEffect`.
  - Note: depending on world/system configuration, this may still present as a standard status icon rather than a visible overlay.

## [1.0.4] - 2026-01-24

### Fixed
- **Resource badges visibility**: AP/SP/MP/Luck badges are now added to the existing **Utility** group so they appear even when a user has an older persisted HUD layout which does not include the newer "Resources" group.
- **Status Effect overlay (right-click)**: resolved missing icon lookups by preferring `CONFIG.statusEffects[].img` (v13) and falling back to legacy `icon`. The overlay now uses the same image as the corresponding Status Effect.

## [1.0.3] - 2026-01-24

### Added
- **Resources** group (display-only): compact badges for **AP / SP / MP / Luck**.
- **Status Effects overlay control**: right-click a Status Effect on the HUD to toggle it as a **token overlay** (visual), while ensuring the effect is active.

### Changed
- Phase 3 performance: added a conservative **build cache** for single-token HUD builds, with Foundry hook-based invalidation (no coupling to Token Action HUD Core internals).

## [1.0.2] - 2026-01-24

### Changed
- Phase 2 performance: added a per-build item index for the representative actor to avoid repeated full scans of `actor.items` during HUD construction.
- Combat/Skills/Inventory/Spells/Features builders now iterate only the relevant item subsets via the item index (no behavior change intended).

### Technical
- Item-derived combat state used by Combat Actions (equipped melee/ranged weapon checks; equipped ranged weapon reload state; active combat style lookup) is now sourced from the per-build index.

## [1.0.1] - 2026-01-24

### Fixed
- Action tracker tab is now reliably clickable (CSS no longer disables pointer events; `.disabled` state remains non-interactive).
- Multi-token execution actions (Attacks, Spells, Talents) now build correctly when multiple supported tokens of the same actor type are selected.
- Removed hard-coded system id from the AttackTracker dynamic import (now derives from `game.system.id`).

### Changed
- Centralized supported actor type checks via shared utilities and applied safer guards when the Canvas is not ready.

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
