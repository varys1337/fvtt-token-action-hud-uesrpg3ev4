# 1.3.0 maintenance notes

## Baselines and validation boundary

Implementation is confined to this companion. Baselines inspected: UESRPG v14.3.1, Token Action HUD Core 2.1.2, the official Foundry v14 API (14.368), and Foundry 14.369 release notes. No dependency source files were edited and no world/document migration was introduced.

The user selected source inspection only. No tests, syntax execution, builds, benchmarks, or live Foundry actions were performed. Runtime usability, measured performance, and compatibility verification remain unverified. The existing manifest verification claim was not increased. These statements describe implementation validation; source archive packaging and GitHub publication do not provide runtime validation.

## Three reversible change groups

1. **Compatibility and dispatch:** correct the Core API-series handshake and dependency versions; use metadata-based action dispatch with a legacy decoding boundary; preserve modifiers and actor/token UUID identity; contain asynchronous failures; restore specialized feature/profession routing; use DialogV2 and native UI fallbacks. Shared utility and localization contracts are included with this group.
2. **Build/refresh and tracker correctness:** remove cross-build clones/records, retain per-build Item indexes, restore extensions, split multi-selection builds, normalize v14's keyed condition registry, supplement only missing/rejected Core refresh events, and read system attack counters without writing them. Replace the tracker integration and adapt legacy action rows through Core's public pre-render hook.
3. **Presentation and documentation:** remove copied Core layout/theme geometry, retain companion-specific accessible styling, escape generated text contexts, and document behavior, verification limits, and dependency gaps.

The initial local implementation supplied three ordered review patches outside the module package; those local review artifacts are separate from GitHub release assets. The preserved original ZIP is the authoritative rollback snapshot. Applying/reversing those review patches was not executed as part of inspection-only validation.

Patch order: `01-compatibility-dispatch.patch`, `02-build-refresh-tracker.patch`, then `03-presentation-documentation.patch`. Shared-file edits are staged across that order; deploy the complete stack. These review boundaries are not independently runtime-verified releases.

## Confirmed changes

Generated actions carry `system.actionTypeId` and `system.actionId`. Core's reused roll-handler instance is snapshotted before awaiting. One companion error boundary owns asynchronous dispatch failures. The companion does not add per-action combat callbacks or retry a different mechanic after a potentially side-effecting dispatch.

Core's group-ID list is no longer misclassified as a partial build. No cross-build action records or callback snapshots are stored. The published invalidation methods remain compatible no-ops. Extension callbacks run once on normal builds; multi-selection context intentionally has no representative singular actor.

The refresh bridge handles relevant effect updates, Item-owned effects, ActorDelta lifecycle, combatant creation/deletion, multi-selection updates rejected by Core, and relevant token identity changes. It ignores movement-only changes, rechecks queued relevance, and never schedules from render/force-update callbacks. Core remains responsible for debouncing/serializing its own rebuilds.

Manual AP changes use document updates, permission checks, fresh document reads, and a local edit queue. Close/teardown clears pending UI work and invalidates queued edits from the old lifecycle. No module flag counter, chat-button backup, attack increment, or timer-based attack-count guess remains.

Deselection immediately invalidates the previous token context. With no controlled token, dispatch and manual AP editing require the HUD actor to match the current assigned character rather than a retained Core actor.

Attack display reads the public system `AttackTracker.getTrackerViewState` for the exact token/combatant and requested limit context. Counts, round transitions, costs, rule gates, and resource/feature/equipment mechanics remain system-owned.

The tracker uses Core's pending ApplicationV2 render element and group metadata. It has only companion data attributes, is positioned before Utility or appended when Utility is absent, and does not participate as a saved editable Core group. Core continues to own its HUD/settings application architecture.

Cast-enchantment, native language, and native faction UI IDs are namespaced when different operations could otherwise share Core's global action ID. Known-group runtime compatibility is idempotent and performs no layout-storage writes. Arbitrary custom-group raw IDs remain inherently ambiguous.

## Dependency findings

### UESRPG: canonical enchantment API

The inspected public HUD bridge does not expose a canonical enchantment-casting endpoint. The old companion called private sheet handlers and probed hypothetical method names. This update opens the system actor sheet instead. A future system API should wrap the existing enchantment workflow and preserve stored slot configuration, skip-test options, cost pools, and targeting gates. Generic Cast Magic is not an equivalent substitute.

### UESRPG: explicit linked-token context

The public HUD helper resolves a supplied token but invokes the existing actor sheet without consistently applying that token context. Combat handlers may then read the sheet token. The companion passes exact token context and rejects ambiguous shared linked-actor spatial execution; it does not patch sheets or import system internals. The system must honor its explicit token argument to remove this limitation.

### Core: asynchronous companion dispatch

Core 2.1.2 invokes companion `handleActionClick` without awaiting it; per-action callbacks also lose the original event. The companion now owns its asynchronous error boundary and avoids those callbacks. Awaiting extension dispatch is an upstream Core improvement, not a companion monkeypatch.

### Foundry: overlay-only status presentation

The official v14 API documents `Actor.toggleStatusEffect(statusId, {active, overlay})`, including creation options. It does not document the old Token `overlayEffect` storage or guarantee changing only the overlay of an existing effect with creation options. The companion removes those field accesses and opens the native Token HUD for overlay management.

## Source-review scenarios

Inspection traces normal and assigned-character HUD context; supported/mixed selections; off/intersection/union shared actions; exact linked/unlinked token identity; modifier/right-click dispatch; feature setting precedence; synthetic profession details; confirmation cancellation; selection changes; permissions; missing capabilities; and asynchronous rejection paths.

Build/lifecycle review covers repeated builds without retained snapshots, extension invocation, meaningful usage-vs-uses display precedence, keyed condition registries, nested/flattened/zero-valued changes, Item-owned effects, ActorDelta and combatant changes, supplemental-refresh recursion avoidance, teardown, and pending render elements.

Presentation review covers removed/renamed Utility groups, existing saved row selection/order, distinct alternate-action IDs, Core theme ownership, and escaped literal markup. These are source-review scenarios, not executed test results.

Document-derived badge text remains plain text for Core's Handlebars output, with separately escaped tooltip titles. Feature tooltips and generated chat markup escape extracted text, names, and decoded labels before interpolation.

## GitHub release packaging

Release tag: `v1.3.0`. The release contains `module.json` and `module.zip`. The archive contains the manifest at its root, runtime scripts, language data, styles, README, changelog, and maintenance notes. The workflow checks the tag and manifest URLs before packaging and uploads assets to that existing release. It does not compile, minify, test, or execute module code.

The original snapshot and review-patch paths below refer to the maintainer's local implementation artifacts, not downloadable release assets. The existing template development tool configuration is retained; the manifest loads `scripts/init.js` directly and release packaging does not invoke Rollup.

## Rollback snapshot

Original module package preserved before edits:

`C:/Temp/token-action-hud-uesrpg3ev4-before-update-20261019-111638.zip`

SHA-256: `CAF71A5152E9AC234EF74DF3A6C35FB4BA68FE3D83FCFB250865CCDEE8BA2847`

To restore the original, close the Foundry world/server, retain a copy of the updated folder, and replace the companion folder's contents with the snapshot contents. Replacement matters because extracting over the updated folder would retain newly added files. This rollback does not alter actor/Item data or Core layout storage because the update introduces no persistent migration. Do not restore the system or Core folders; they were not edited.

## Primary sources

- [Official Foundry v14 API](https://foundryvtt.com/api/v14/index.html)
- [Actor status API](https://foundryvtt.com/api/v14/classes/foundry.documents.Actor.html#togglestatuseffect)
- [Keyed status registry](https://foundryvtt.com/api/v14/variables/CONFIG.statusEffects.html)
- [ApplicationV2 render hook](https://foundryvtt.com/api/v14/functions/hookEvents.renderApplicationV2.html)
- [DialogV2](https://foundryvtt.com/api/v14/classes/foundry.applications.api.DialogV2.html)
- [UESRPG HUD bridge](https://github.com/varys1337/uesrpg-3ev4/blob/main/src/integrations/token-action-hud/api.js)
- [Core 2.1.2 release](https://github.com/Larkinabout/fvtt-token-action-hud-core/releases/tag/2.1.2)
- [Core integration guide](https://github.com/Larkinabout/fvtt-token-action-hud-core/wiki/Core-Changes-for-System-Module-Developers)
