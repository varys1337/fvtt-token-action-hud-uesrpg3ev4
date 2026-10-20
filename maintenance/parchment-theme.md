# Optional framed parchment preset

The `uesrpgParchment` style is registered through the companion's existing `SystemManager.registerStyles()`. It reuses Core 2.1.2's `tah-style-foundry-vtt-light` layout class. The existing `renderTokenActionHud` handler sets or removes `data-uesrpg-hud-theme="parchment"` on the pending HUD content from Core's current style setting, before attaching text fitting. Empty HUD content without a groups container is left unthemed. This uses the documented [ApplicationV2 render hook](https://foundryvtt.com/api/v14/functions/hookEvents.renderApplicationV2.html).

All parchment theme CSS is gated by that marker. There is no additional setting, application, listener, persistent theme state, or Core/system source edit. The stylesheet references the installed system's existing assets and inherits its design variables, with fallback colors and a serif fallback. The new choice is optional and does not write actor/Item data, migrate layouts, or change the manifest's compatibility verification.

## Revised appearance

Wood frames now enclose individual category buttons, nested category buttons, and the action-point tracker. Their faces use the same pale parchment texture as the character sheets, with parchment-red labels. The main HUD bar and expanded panels have transparent backgrounds and no external frame. The main bar's outer padding is removed, and expanded panels use Core's own spacing.

Action buttons have explicit parchment image backgrounds with light surface shading and subtle edge highlights. Their backgrounds take precedence over Core's toggle/active background shorthands so those states retain the texture, with red selected-state borders and an inset stripe. Headings remain transparent with a small light text shadow for contrast. Core still owns panel positioning, layout sizing, scrolling, and edit/visibility behavior.

The parchment URL is resolved explicitly relative to this module stylesheet, directly referencing `systems/uesrpg-3ev4/images/elements/backgrounds/pale_parchment.webp`. The system's relative `--uesrpg-parchment-url` is not inherited into the companion stylesheet. No artwork is copied or generated.

## Final spacing and state refinement

Core's collapse wrapper uses a fixed `left: -20px` offset, which is narrower than the themed control. The theme now overrides that offset with `left: auto; right: 100%; top: 0`. Its border-box width is the 24px control width plus the existing 6px theme gap. Right padding supplies that transparent gap inside the wrapper's hover area, so the pointer can cross between the first category and the external collapse control without leaving the HUD's hover descendants. The absolutely positioned wrapper does not consume category layout space or change saved HUD coordinates.

Collapse and expand share the same external position and 24px width by 36px height. Drag, lock, and edit controls use those dimensions too, with centered icons and the same 6px toolbar gap. Only the collapse wrapper receives a new display declaration; the buttons and toolbar retain Core's existing hover and `.tah-hidden` visibility rules. Core still owns the drag behavior. The external control requires enough space to the left of the HUD; no automatic repositioning is introduced.

The ordinary action hover/focus wash excludes active actions, preserving their red selected tint, border, and stripe. Category hover/open styling excludes native-disabled, `.disabled`, and `aria-disabled="true"` controls. Parchment images, wood frames, keyboard focus outlines, and partial-selection cues are retained. That spacing refinement changes only the theme stylesheet and these notes, with no new JavaScript, settings, or public API.

## HUD tooltip text alignment

The companion's base stylesheet justifies UESRPG HUD tooltip text using Core's `tah-tooltip` marker, including description paragraphs and lists inside its `tah-tooltip-wrapper`. Both the hover tooltip and locked tooltip selectors receive the same alignment, across HUD styles. `text-align-last: start` keeps short text and the final line aligned to the start. The feature heading and cost metadata no longer force right alignment.

The alignment adjustment is a CSS-only change. It leaves tooltip content generation, sanitization, positioning, timing, dimensions, and HUD handlers untouched; description enrichment is covered separately below. Other Foundry/system tooltips without Core's marker are outside the alignment selectors.

## Native document links in descriptions

The existing description paths for spells, talents, traits, powers, and cast-enchantment items share one async `#enrichTooltipDescription` helper in the action handler. It replaces the plain-text converter. It first checks Core's tooltip mode, returning before cleaning or document lookup for `none` and `nameOnly`. Full descriptions use [foundry.utils.cleanHTML](https://foundryvtt.com/api/v14/functions/foundry.utils.cleanHTML.html) followed by [TextEditor.implementation.enrichHTML](https://foundryvtt.com/api/v14/classes/foundry.applications.ux.TextEditor.html), with the current embedded Item as `relativeTo`.

The explicit [enrichment options](https://foundryvtt.com/api/v14/interfaces/foundry.EnrichmentOptions.html) are `documents: true`, `links: true`, `rolls: false`, `embeds: false`, `custom: false`, and `secrets: false`. Document resolution, labels, access checks, and click handling remain with Foundry. There are no added event listeners, automatic tooltip locks, retention timers, hover-time requests, or persistent enrichment caches.

The enriched fragment retains rich markup and native anchor attributes. Only inline foreground/background colors, text alignment, and equivalent legacy presentation attributes are cleared to let tooltip contrast and justification apply. Shared `uesrpg-tah-rich-description` markup scopes native link styling in the companion stylesheet; existing feature styles now cover both hover and locked tooltips. Native document icons are retained. No tooltip is added to an action type that previously lacked a description.

Each existing group awaits its own ordered `Promise.all` results before sending actions to Core. Feature action/tooltip helpers and the cast-enchantment builder now return promises, and their callers await them. Each built feature action is reused in its legacy and activation-aware groups, retaining the existing group and sorting behavior. Feature activation headings, cost/usage badges, and the escaped cast-enchantment guidance remain intact.

Empty descriptions retain their existing behavior. A missing source Item, cleaning error, enrichment rejection, or presentation-processing error returns the localized `tooltipDescriptionUnavailable` message and existing debug-gated diagnostics. No unprocessed description is used as an error fallback, and a failed tooltip does not reject its group build. No document fields, action identifiers, roll handlers, Core/system files, or manifest compatibility claims are changed.

## Validation performed

Source inspection only for this refinement: positioning arithmetic, control dimensions, icon spacing, theme selector isolation, Core's hover/hidden-state rules, and active/disabled selector precedence. The supplied screenshots show earlier iterations, including the overlapping collapse control; the final spacing refinement has not been observed in Foundry. No tests, builds, JavaScript execution, or live Foundry checks were performed. Visual appearance, pointer behavior, and runtime theme switching remain unverified.

The tooltip alignment change was also reviewed by source inspection only, against Core's tooltip markup and paragraph/list alignment selectors. Live tooltip rendering and locked tooltip behavior remain unverified.

Document-link enrichment was reviewed by source inspection of every async call site, the native enrichment options, source Item lookup, presentation-only HTML processing, safe fallback/localization, and scoped link styling. Language JSON was parsed. No tests, builds, JavaScript execution, or live Foundry checks were performed. Actual reference resolution, native link activation, permissions, and rich tooltip layout remain unverified in Foundry.

## Runtime acceptance checklist — not yet performed

- On Foundry 14.368+, the Style selector contains exactly one **UESRPG Parchment (Framed)** entry and leaves the existing selection unchanged until explicitly selected.
- Select the preset, save and close settings, and reload: the choice persists. Switch to Foundry Light, Dark, Custom, and a docked preset, saving and closing each time: the parchment marker and appearance disappear, and each previous style works normally.
- In both Foundry light and dark interface themes, parchment, text, icons, subgroup headings, character labels, counters, and dark tooltips remain readable. Check hover, active, disabled, partial-selection, and keyboard-focus cues.
- Hover feature and other HUD descriptions with multiple wrapped lines: text is justified, while final/short lines and feature heading/cost metadata start at the left in English. Check paragraphs, preserved line breaks, lists, name-only tooltips, and locked tooltips. Tooltip placement, delay, action clicks, and unrelated Foundry tooltips must retain their existing behavior.
- With Full tooltips, check the supplied spell's compendium Journal Entry Page references: labels replace the raw UUID syntax, and native link interaction opens the intended pages. Also check world-document, relative, already-enriched, and multiple references, including feature and enchantment descriptions.
- Check missing/inaccessible references, source Item deletion, empty/malformed descriptions, and an enrichment failure. Native permissions must remain authoritative; a failed description must not remove the HUD's other actions or display unprocessed HTML. Unrevealed secrets stay excluded, and tooltip preparation must not evaluate inline rolls or embed documents.
- Check italic text, paragraphs, lists, tables, line breaks, colored editor content, and long link labels in hover/locked tooltips and both Foundry themes. Names-only/disabled modes skip enrichment. Existing feature headings/badges, enchantment guidance, action clicks, resource updates, refreshes, and theme switching retain their behavior.
- The canvas is visible behind the HUD bar, in its gaps, and behind expanded panels. There is no enclosing wooden rectangle or beige panel fill; each category and the action-point tracker has its own complete wood frame. Paper grain is visible on category/action/resource/utility buttons, including active and hovered actions.
- Check the collapsed HUD, upward/downward panels, nested subgroups, empty groups, grid/non-grid layouts, custom group widths, long labels, icons, and counters at HUD scales 0.5, 1, and 2. Frame artwork must not obscure content, intercept clicks, cut off scrolling, or change panel placement unexpectedly.
- At HUD scales 0.5, 1, and 2, collapse/expand remains outside the bar, separated from the first category by the scaled 6px gap. Hovering controls and repeated collapse/expand cycles must not move the first category or the external control.
- Move the pointer across the transparent gap in both directions: collapse stays available. Drag, lock, and edit controls align with the 36px categories and retain a scaled 6px toolbar gap, including unlocked mode. Hidden controls remain hidden.
- Hover and focus active actions: their selected tint, border, and stripe persist. Native-disabled, `.disabled`, and `aria-disabled="true"` category controls receive no enabled hover/open highlight. Focus and partial-selection cues remain visible where applicable.
- Drag, lock/unlock, edit groups/actions, collapse/expand subgroups, and execute actions. Core's customization and drop indicators remain usable; unrelated applications and other styles remain visually unchanged.
- Use the action-point tracker in both directions and resource shortcuts, including an unavailable/read-only actor context. Values, permissions, and refresh behavior must remain document-driven.

## Appearance rollback

Select the previous Core style, then save and close settings. This removes the theme marker on the next HUD render; no data or layout rollback is required. To remove the feature entirely, restore the companion files changed for this addition and remove its new stylesheet/documentation, then reload the client. No Core or system files need restoring. These changes are included in release `v1.4.0`; source archive packaging does not provide live Foundry verification.
