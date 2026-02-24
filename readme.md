# Token Action HUD UESRPG 3ev4
Token Action HUD is a repositionable HUD of actions for a selected token, specifically designed for the UESRPG 3ev4 (Unofficial Elder Scrolls RPG 3rd Edition v4) system.

## Features
Introduction
A plug-in module for the module Token Action HUD Core which adds support for UESRPG 3ev4. If you want to learn how to use Token HUD, please check Token HUD Core wiki for tutorials.

### AppV2 Compatibility
- Targeted for `uesrpg-3ev4 v1.0.0-RC.84+` and `token-action-hud-core 2.x`
- Combat quick actions now dispatch using AppV2-compatible payload keys (`combatAction` with compatibility alias)
- Hybrid combat execution path:
  - Primary route: `encodedValue` + roll handler
  - Fallback route: direct `onClick` combat dispatcher for reliability
- New adapter layer (`scripts/system-adapter.js`) centralizes system interop with ordered fallback:
  - sheet method
  - system runtime/public API surface
  - system source-path fallback

### Feature Activation
- **Left-click** on Talents/Traits/Powers **activates** them (spends costs/uses and posts activation card)
- **Right-click** behavior for passive features is configurable in settings (post description or open sheet)
- **Shift+Right-click** always opens the item sheet (escape hatch)

### Rest Actions
- **Short Rest** and **Long Rest** buttons available in the Utility tab
- Buttons mirror the behavior of Actor sheet rest buttons
- Only visible for single-token selection

### Expanded HUD Coverage
- Added combat quick actions:
  - **Delay Turn**
  - **Put Out Fire** (`extinguish-burning`)
- Added inventory/action groups:
  - **Containers**
  - **Scrolls**
  - **Languages**
  - **Factions**
- Scroll entries cast via system scroll workflow (left-click); right-click opens item sheet.
- Language/Faction entries open their item sheet; selector dialog fallback is supported.

### Multi-Token Support
- When multiple tokens are selected, you can execute attacks, spells, and activated talents across all selected tokens
- Configurable mode: off, intersection (common actions only), or union (all actions)

### Diagnostics
- New setting: **Strict action diagnostics**
- When enabled (default), critical action dispatch failures are fail-visible with user warnings instead of silent no-op behavior
- Additional structured dispatch logs are emitted under the module debug namespace

### Known Limitations
- Magicka and Luck utility dialogs are still best-effort no-op if the system does not expose a stable dialog entrypoint
- This module is optimized for the latest AppV2 UESRPG branch and does not prioritize older pre-AppV2 behavior

## Credit
Forked from the Token HUD template https://github.com/Larkinabout/fvtt-token-action-hud-template

## License
This Foundry VTT module is licensed under a [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/) and this work is licensed under [Foundry Virtual Tabletop EULA - Limited License Agreement for module development](https://foundryvtt.com/article/license/).

## Phase 4: Minimal API

This system module exposes a small, stable API intended for **additive** integrations (other modules/macros) without coupling to Token Action HUD Core internals.

Access:

`game.modules.get("token-action-hud-uesrpg3ev4").api`

Provided methods:
- `registerBuildExtension(fn)` / `unregisterBuildExtension(fn)`
  - `fn(ctx)` is invoked after the standard action build and before caching.
  - `ctx` contains: `handler`, `actor`, `token`, `actors`, `isMultiTokenSelection`, `delimiter`.
  - Use `ctx.handler.addActions(actions, groupData)` to add actions.
- `invalidateCacheByActorId(actorId)` / `invalidateCacheByTokenId(tokenId)` / `invalidateAllCaches()`
  - Use these if your integration changes data that should be reflected immediately on the HUD.

The module also emits:

`Hooks.callAll("tokenActionHud.uesrpg3ev4ApiReady", api)`
