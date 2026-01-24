# Token Action HUD UESRPG 3ev4
Token Action HUD is a repositionable HUD of actions for a selected token, specifically designed for the UESRPG 3ev4 (Unofficial Elder Scrolls RPG 3rd Edition v4) system.

## Features
Introduction
A plug-in module for the module Token Action HUD Core which adds support for UESRPG 3ev4. If you want to learn how to use Token HUD, please check Token HUD Core wiki for tutorials.

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
