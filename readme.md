# Token Action HUD UESRPG 3ev4

A UESRPG companion for Token Action HUD Core, providing combat, skill, inventory, spell, feature, condition, and resource shortcuts.

## Compatibility

This source update is version **1.3.0** and targets **Foundry VTT 14.368 and later v14 builds**, **UESRPG v14.3.1+**, and **Token Action HUD Core 2.1.2+ within its 2.1 API series**. Core's integration handshake is `2.1`; the package dependency separately declares its minimum patch version.

Validation for this update was **source inspection only**. No tests, syntax execution, builds, benchmarks, or live Foundry checks were run. The historical manifest `verified: 14.360` was retained and is not evidence that these changes were runtime-verified on that build or on 14.368/14.369. Release packaging archives these saved source files without executing module code; it does not add runtime verification.

## Installation

Install Token Action HUD Core 2.1.2+ from its 2.1 API series and enable it with this companion in a UESRPG v14.3.1+ world on Foundry 14.368 or a later v14 build.

Use the [latest module manifest](https://github.com/varys1337/fvtt-token-action-hud-uesrpg3ev4/releases/latest/download/module.json) in Foundry's module installer. Version 1.3.0 is available from the [release page](https://github.com/varys1337/fvtt-token-action-hud-uesrpg3ev4/releases/tag/v1.3.0).

## Behavior

- Combat, spells, scrolls, feature activation, equipment changes, rests, and resource workflows use the UESRPG runtime bridge at `game.uesrpg.api.tokenActionHud`.
- Generated actions use Core's action metadata and one companion dispatcher. Existing extension actions with encoded values remain supported through guarded decoding.
- Left-clicking a condition changes its active state through Foundry's Actor API. Right-clicking opens the native Token HUD for one selected token; manage overlay presentation there.
- Enchantment shortcuts open the actor sheet. Use the system's Cast Enchantment control to preserve stored costs, casting options, and skip-test behavior.
- Passive feature right-click follows the module setting (description in chat or sheet). Shift-right-click opens the feature sheet. Activated feature right-click opens its sheet.
- The Actions tracker reads document Action Points. Left-click adds one; right-click subtracts one. It permits manual editing for one eligible actor with update permission, and serializes edits in this client. It never increments attack counters.
- Attack badges use the system's contextual AttackTracker view and rule-derived limit. Unresolved tracker context has no badge; an unlimited limit displays as infinity.
- Burn Luck opens the existing system workflow using the Luck characteristic. Its separate LP badge displays Luck Points; it is not a Luck Points editor.

## Multiple selection

The existing off/intersection/union setting controls shared attacks, spells, and activated talents. Multiple selection shows shared execution actions and aggregate conditions, rather than private Item or ActiveEffect IDs from the first actor. Shared names are counted once per actor; ambiguous duplicate names are skipped.

Actor-scoped condition/feature changes are deduplicated by actor document identity. Spatial actions retain exact token context. Ambiguous spatial execution involving multiple tokens for the same linked actor is rejected while the upstream system token-context limitation remains unresolved. Selection changes during confirmation cancel that operation.

## Existing HUD layouts

Existing group IDs and ordinary Item action IDs are preserved. Distinct enchantment actions now use `castEnchantment-<itemId>`. Actor-native language and faction entries also have distinct action namespaces so Core's global action map cannot confuse their operations.

Known legacy rows in their original groups are adapted in prepared HUD data without writing Core layout storage. This adaptation preserves order and selection and does not reset layouts. An old enchantment shortcut moved into an arbitrary custom group cannot reliably be distinguished from an ordinary inventory shortcut; re-add the distinct enchantment action there. A later normal customization save remains Core's responsibility.

## Extension API

Access `game.modules.get("token-action-hud-uesrpg3ev4").api` after the module is ready.

- `registerBuildExtension(fn)` / `unregisterBuildExtension(fn)` register additive builders. Each normal build calls registered extensions once with `{handler, actor, token, actors, isMultiTokenSelection, delimiter}`. `actor` and `token` are null for multi-selection. Use `handler.addActions(actions, groupData)`; prefer `system: {actionTypeId, actionId}` for companion action routing.
- `invalidateCacheByActorId(actorId)`, `invalidateCacheByTokenId(tokenId)`, and `invalidateAllCaches()` retain their signatures as compatibility no-ops. There are no persistent action snapshots to invalidate. These methods do not request a render. Integrations that explicitly need a rebuild may call Core's `forceUpdateTokenActionHud` hook.
- `getAdapterDiagnostics()` returns current runtime-bridge capability information. A dispatched system handler is not proof that a roll or resource transaction completed; cancellation and system rules remain authoritative.

The module emits `tokenActionHud.uesrpg3ev4ApiReady` with its API. Debug logs are controlled by the module debug setting. Strict diagnostics provide user-visible dispatch problems without retrying alternative mechanical workflows.

See [maintenance notes](maintenance/update-notes.md) for implementation boundaries, inspection coverage, dependency findings, and rollback.

## Credit and license

Forked from the [Token Action HUD template](https://github.com/Larkinabout/fvtt-token-action-hud-template). Token Action HUD Core is maintained by Larkinabout.

Licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) and the [Foundry Virtual Tabletop module-development license](https://foundryvtt.com/article/license/).
