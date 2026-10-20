> [!WARNING]
> ## AI-Assisted Development Disclaimer
>
> This Foundry VTT module  was developed with extensive AI assistance across implementation, debugging, testing, and code-side review workflows.
>
> The author does not personally understand or cannot explain every component of the shipped codebase; nevertheless, the author accepts full responsibility for all code included in this project and its maintenance. Software execution was heavily AI-assisted, but package direction, architecture oversight, UX intent, and release responsibility were human-led. The author's role in this project was primarily that of project lead and UX designer: defining the system vision, directing the workflow, setting priorities, shaping feature scope, making high-level architectural decisions, and determining the user-experience design of the final system.
>
> Some visual UI elements and presentation assets were assembled from licensed or stock source materials and manually edited by the author. Where AI-assisted visual processing was used, it was limited to post-processing and editing human-made source assets rather than generating standalone artwork.

## Token Action HUD UESRPG 3ev4

A UESRPG companion for Token Action HUD Core, providing combat, skill, inventory, spell, feature, condition, and resource shortcuts.


## Optional parchment theme

After installing this update, reload the Foundry client. Open **Configure Settings**, select **Token Action HUD Core**, and choose **UESRPG Parchment (Framed)** in its **Style** selector. Save and close the settings to refresh the HUD. The choice uses Core's existing client setting; it does not change other clients' selections or replace your current style automatically.

The preset uses the UESRPG system's parchment texture, Cyrodiil font, and wood frames around each individual category button, including the action-point tracker. The HUD bar and expanded category panels are transparent, with no surrounding beige fill or external frame. Action buttons, resources, and utility controls use parchment faces, with red headings and selected-state accents. The texture stays visible in either Foundry interface theme, and the existing dark tooltips retain their contrast. This preset is a floating HUD style; Core's docked styles remain separate choices. Core's **Custom** style editor continues to configure its own **Custom** preset.

To roll back the appearance, choose your previous style in the same selector, then save and close the settings. No actor data or saved layout is migrated. The artwork and font are referenced from the installed `uesrpg-3ev4` system rather than copied into this module.

Source inspection is the only validation performed for this addition. Live Foundry appearance and interaction remain unverified; see [the acceptance checklist](maintenance/parchment-theme.md).

## Document links in description tooltips

With Core's tooltips set to **Full**, existing spell, talent, trait, power, and cast-enchantment descriptions use Foundry's native enrichment to display document references such as `@UUID[...]{Persuade}` as links. Paragraphs, emphasis, lists, and tables are retained. Link interaction follows Foundry's existing hover/locked-tooltip workflow; no extra pinning or click handling is added.

Inline rolls, embedded content, custom enrichers, and unrevealed secret blocks are excluded from tooltip enrichment. Names-only and disabled modes skip enrichment. A failed description displays **Description unavailable.** without aborting the action build or displaying its unprocessed source. The change does not alter item descriptions, permissions, or action mechanics. Source inspection only; live link opening remains unverified.

## Credit and license

Forked from the [Token Action HUD template](https://github.com/Larkinabout/fvtt-token-action-hud-template). Token Action HUD Core is maintained by Larkinabout.

Licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/) and the [Foundry Virtual Tabletop module-development license](https://foundryvtt.com/article/license/).
