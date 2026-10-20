# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-10-20

### Added
- Register the optional **UESRPG Parchment (Framed)** Core style with individual wood frames, system parchment textures, Cyrodiil typography, and transparent bar/panel backgrounds. Preserve the current style until selected.
- Enrich existing spell, talent, trait, power, and cast-enchantment descriptions into native Foundry document links, preserving rich formatting and relative Item references. Await completed descriptions per group, reuse feature results, and skip enrichment in names-only/disabled tooltip modes.

### Fixed
- Position collapse/expand outside the first category with a traversable 6px gap, normalize utility controls, and retain saved HUD positions and Core visibility behavior.
- Preserve active/disabled states, parchment textures, focus cues, and partial-selection indicators.
- Justify HUD tooltip text and style native links consistently in hover and locked tooltips. Handle description failures locally without displaying unprocessed source HTML or aborting the HUD build.
- Keep this companion HUD opaque through AP edits and temporary hover loss, using a HUD-scoped UI fade variable; leave other Foundry UI fading and Core layout transitions unchanged.
- Recognize the exact owning ActorDelta identity for unlinked-token AP updates, retaining UUID/value checks and normal refreshes for other changes.

### Validation and boundaries
- Source inspection and release-package checks only; no tests, JavaScript execution, compilation, or live Foundry verification. Runtime acceptance scenarios are recorded in the maintenance notes.
- Retain native tooltip interaction and access checks. Disable roll/embed/custom enrichment and unrevealed secrets. Add no schema migration, layout reset, dependency source patch, or compatibility-verification increase.

## [1.3.1] - 2026-10-19

### Fixed
- Fit long plain-text HUD labels within existing button dimensions with bounded font reduction and up to two complete lines. Preserve full-name accessibility and use whole-line ellipsis in compact themes.
- Add the authoritative read-only attack counter inside Utility by default.
- Install the explicitly approved AP-only Core filter adapter so matching local AP control writes update the counter in place without the normal full HUD rebuild. Preserve normal document hooks and all unrelated refresh paths.

### Integration boundary
- The adapter wraps only the current Core HUD instance's public Actor-update filter and restores it on close/teardown when still owned. Unknown payloads, mismatched values/identity, additional fields, late notifications, and separate Token/Item/effect changes retain normal refreshes.
- Source inspection only; no tests, builds, syntax execution, benchmarks, or live Foundry checks. Runtime rendering and hook timing remain unverified.

## [1.3.0] - 2026-10-19

### Changed
- Target Foundry 14.368+ within generation 14, UESRPG v14.3.1+, and Token Action HUD Core 2.1.2+ from the 2.1 API series.
- Use one metadata-based action dispatcher with captured modifiers and exact actor/token context.
- Open the native actor sheet for enchantment casting and the native Token HUD for status overlays.
- Preserve Core's ApplicationV2 ownership, layout, and themes; adapt known legacy action rows without resetting saved layouts.

### Fixed
- Remove retained action snapshots, duplicate combat callbacks, and companion attack-counter writes.
- Restore build extensions and consistent settings refreshes; coalesce relevant supplemental document refreshes.
- Separate shared multi-selection actions from private inventory/effect IDs and reject ambiguous linked-token spatial execution.
- Serialize manual AP edits from document data, guard permissions and stale selection, and read authoritative system attack tracker views.
- Repair feature/profession right-click routing, use DialogV2 cancellation, and escape generated text/tooltip output.
- Package complete source releases under real version tags with working manifest/download URLs.

### Validation and limitations
- Source inspection only. No tests, syntax execution, builds, benchmarks, or live Foundry checks were performed; the historical manifest verification claim was not increased.
- System enchantment API and explicit-token handling, plus Core asynchronous dispatch handling, remain documented upstream findings. No dependencies or actor/Item schemas were changed.

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
