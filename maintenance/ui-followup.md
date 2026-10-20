# 1.3.1 HUD text and counter update

## Follow-up included in 1.4.0

The remaining fade had two independently confirmed causes in Foundry 14.369 source. Foundry applies inherited opacity to Core's `faded-ui` application even without a HUD rebuild. The companion now sets `--ui-fade-opacity: 1` only on the HUD root while its own tracker is present. This keeps this HUD opaque, including when idle or hover is temporarily lost; other Foundry UI fading preferences and Core's group/docked transitions remain unchanged.

Unlinked Actor updates also carry the owning ActorDelta's `_id`, which may differ from the synthetic Actor's ID. The AP matcher now accepts that exact ID only after checking the documented `Actor.isToken` / `Actor.token` context, the token's Actor UUID, and the delta's parent TokenDocument. Foreign IDs and additional mechanical changes still use normal refreshes. No undocumented `ActorDelta.syntheticActor` access is used.

These follow-up changes are included in release `v1.4.0`, together with the optional parchment preset and native tooltip document links. Validation remains source inspection only; archive packaging and publication do not provide runtime verification.

## Text fitting

Plain action names fit inside Core's existing button dimensions, including the space occupied by icons and badges. Names wrap to at most two complete lines and shrink only when overflowing. The font floor is 75% of the theme size, with a 10px minimum when the original size is at least 10px. Group labels retain one line. Compact buttons use a whole-line ellipsis when two lines cannot fit; existing rich tooltips remain intact and full text remains accessible.

One resize observer and a cancelable animation frame coalesce fitting after rendering, visibility/size changes, and font loading. Close, canvas teardown, and the next render restore the fitter's owned styles/attributes and disconnect old observers. No HUD rebuild is requested by fitting.

## AP control refresh

The user explicitly approved one exception to the original no-dependency-monkeypatch rule: a narrow runtime adapter around the current Core HUD instance's public `isValidActorOrItemUpdate` method. No Core or system source file is edited.

The existing AP queue still validates actor/token context and permissions, rereads document values, clamps to document maximums, and awaits `Actor.update`. The adapter records only the in-flight Actor UUID and expected numeric AP value. A matching update containing only `system.action_points.value`, optional matching Actor or verified owning ActorDelta `_id`, and optional `_stats` metadata updates the companion counter without Core's full HUD rebuild. The supplemental Actor/ActorDelta refresh bridge recognizes the same strict match.

The original filter runs with its original receiver and arguments. All other values, extra fields, unknown payloads, unrelated documents, and failures use normal Core refresh behavior. Document hooks and broadcasts remain enabled. The adapter restores its prior method descriptor on close/teardown when still installed; an interposed third-party wrapper is retained and the old adapter becomes transparent. No persistent counter or actor flag is added.

### Limits of the narrow exception

Core supplies no event provenance to this filter, so concurrent identical updates to the same Actor and AP value cannot be distinguished while the local write is pending. Late notifications after that write finishes, derived-field changes, or separate Token/Item/ActiveEffect updates retain full refreshes. Synthetic Actor notifications with foreign or unverified identity envelopes retain normal refresh behavior. These are conservative fallbacks, not broad refresh suppression.

## Utility attack counter

The existing Utility group includes a read-only `Attacks used/current limit` action for a single authoritative token/combat context. It reuses the same per-build system tracker view as attack badges. The system's unlimited limit displays as infinity. The row is omitted when context is unavailable; neither click dispatches mechanics or writes a counter. Existing layouts are not reset.

## Inspection and rollback

Validation remains source inspection only. No tests, syntax execution, builds, benchmarks, or live Foundry checks were performed. Actual font rendering, hook timing, and runtime usability remain unverified. The manifest verification claim was not increased.

Restore the [1.3.0 module archive](https://github.com/varys1337/fvtt-token-action-hud-uesrpg3ev4/releases/download/v1.3.0/module.zip) by closing the world/server and replacing this companion folder's contents. Reload the client afterward. There is no actor/Item migration or layout-storage rewrite to reverse.
