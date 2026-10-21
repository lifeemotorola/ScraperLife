# Advanced House Builder 1.5.0 — Suahco4

**Maintainer and author: Suahco4.** The release number has been reset to **1.5.0** at the user's request. This is the unified-live-update release and retains the features from the earlier development builds labeled 1.6–1.8; it is not a rollback to their older feature sets.

## Install / upgrade
1. Save your Blender project.
2. Disable and remove the older installed Advanced House Builder extension. Because this release resets the version number below the previous development build, use a clean reinstall rather than relying on automatic upgrade ordering.
3. Install this ZIP using Preferences → Get Extensions → Install from Disk. Enable it and restart Blender.
4. In the 3D Viewport, press N and open **House Builder**.

Menu wording can vary between Blender versions. Alternatively, open advanced_house_builder.py in the Text Editor and Run Script once in a fresh Blender session. Do not run the script while the installed extension is enabled.

## Live throughout the add-on
- **Live Update is ON by default.** A one-time scene marker enables it for older saved scenes when this release first sees them. You can then pause it normally.
- Dimensions, floors, doors, windows, roofs, verandas, columns, textures, weathering and lamp controls all queue live updates.
- House, column and weather dropdown selections automatically apply their parameters. No Apply/Rebuild click is needed while Live Update is on. Existing buttons remain as manual fallbacks.
- House and texture search popups also apply immediately.
- **Follow selected house** automatically loads saved modeling parameters when selecting a different generated house. Only one house is edited at a time. The watcher polls about every 0.15 seconds; let the panel sync before adjusting a newly selected house.
- **Create first preview automatically** creates a house at the 3D cursor after the first modeling change when the scene contains no generated house. It does not build merely from opening the panel. If houses already exist and none is selected, select one or explicitly use Build New House to add another.
- The **Live update interval** defaults to 0.12 seconds. Multiple changes are coalesced without resetting the next scheduled deadline, so rebuilding can continue during slider dragging. Actual update speed is limited by geometry/material complexity and Blender's main thread; this is not a guaranteed continuous frame rate.
- Rebuilds defer while outside Object Mode, rendering, or playing animation. Resume Object Mode/stop playback to process the queued change.
- Live Update off pauses automatic rebuilding; dropdowns still load parameters, and Rebuild Selected House applies them manually.

Live mode covers this add-on's parameters, not every arbitrary Blender operation. Standard object transforms update directly in Blender. Hand-edited generated meshes, added modifiers and manual fixture changes are not converted back into procedural parameters and will be replaced on the next rebuild. Untagged props directly parented to the controller are preserved.

## Workflow
Choose a house preset first, then columns and finishes. With automatic preview enabled, your first change creates the initial house. To work with an existing house, select its controller or a generated child and wait for settings sync. Adjust controls or choose presets and watch the preview update. Build New House always creates an additional independent house; it is not needed for normal live editing.

The catalog selectors are choosers, not exact-match indicators after manual editing. Actual parameters are stored on the controller. Apply a house preset before choosing custom column and texture variants, because house presets reset those choices. Loading settings is guarded so it does not trigger an unwanted rebuild.

## Included features
- **50 house presets**: ten families of parameter-based rectangular house configurations, including Liberian reference-inspired bungalows, veranda homes and villas.
- **100 procedural texture presets**: ten surface families with ten color variants each, independently selectable for walls and roofs.
- **200 column presets**: ten profile families with twenty dimension/detail variations each; square, classical, fluted, decorative, Tuscan-inspired, Doric-inspired, octagonal, banded and spiral-fluted.
- One to twelve floors; wall/floor/foundation dimensions; real door/window openings without Boolean modifiers; frames, sills, mullions, door casing and handles.
- Hip, gable, shed and flat/parapet roofs; raised front verandas; optional arches, railings, security grilles, decorative wall bands and two-level balconies.
- Real geometric column flutes, adjustable plinths/capitals and optional continuous double-height veranda columns.
- Procedural moss/algae, rust, green patina, dirt, rain streaks, salt deposits, patchy wear and wet-look effects, with six weather presets.
- Automatic exterior modern/up-down/lantern fixtures, with real area lights and adjustable color/power.
- House collections/controllers, independent transforms, safe generated-object replacement and light/mesh cleanup.

## Materials and weather
Use Material Preview or Rendered shading. Solid shading does not display shader patterns. No external image downloads or dependencies are required. These are procedural pattern/color variants, not photographic scans. Texture scale assumes one Blender unit equals one metre; larger values make details smaller. Scaling the controller stretches object-space textures.

Custom in a texture selector uses the original surface/palette settings. Moss and salt are biased by local house height and surface orientation; rain uses vertically stretched noise. Rust/patina affect hardware or METAL-family walls/roofs only. Glass stays clean. Wear is patchy rather than edge-detected. Effects are artistic shading, not physical corrosion, rain-flow simulation or falling plaster. Weathered copies preserve clean source materials. Changing settings can leave unused materials in the file; they are not automatically purged.

## Lamps
By default, two fixtures are sought near the entrance, with optional side/rear and upper-floor lights. Placement checks generated openings with corner/trim margins and may try above window heads. If no clear space is found, fixtures are skipped. It is a geometric heuristic, not a photometric/code-compliance calculation, and cannot account for arbitrary custom props.

Real illumination is easiest to evaluate in Rendered shading. In Material Preview enable Scene Lights. The add-on does not alter your world, sun, exposure, camera or render engine. Light-color choices are approximate RGB presets. Power is Blender light energy, not electrical bulb consumption. Disable actual lights to keep unlit fixtures, or disable exterior lamps to remove them on rebuild.

## Safety, undo and performance
Save before live editing. Timer-driven rebuilds do not create their own explicit undo steps; do not rely on undo/redo for live changes. For predictable operator-based undo, pause Live Update and use Rebuild Selected House. Rebuild replaces generated meshes/lights and their manual edits/modifiers. Transforming the controller is retained.

High floor/window counts, security grilles, railings and spiral/fluted columns can create many objects/vertices. Weathering adds shader nodes. Increase the interval, reduce details or pause live mode when working with complex houses. Rebuilds use snapshots of the scheduled parameters so later panel changes do not mutate an in-progress request.

## Scope
These presets are variations of a rectangular exterior house generator, not separate hand-modeled floor plans. Location-based names and classical-order labels are design inspirations, not claims of exact regional/historical authenticity. References are interpreted, not reproduced exactly. There are no room layouts, internal stairs/stair holes, plumbing, structural calculations or construction compliance checks. Walls comprise separate touching/overlapping cells rather than a single watertight shell. Blue glazing is opaque/reflective, not physically transparent.

Roof masses overlap rather than being engineered/Boolean-unioned. Roof textures use planar projection and may stretch on slopes. Classical capitals are geometric approximations, not sculpted acanthus. Balcony/column/beam connections may intersect. Verandas support at most two levels even on taller houses; stairs are straight. Site slabs do not automatically resize for very deep verandas. Dimensions are raw Blender units; Metric Unit Scale 1.0 gives metre-based dimensions.

## Validation status
The unified release passed Python syntax, archive integrity and isolated orchestration tests covering callback wiring for 65 modeling/preset fields, automatic house/column/weather choices, selection sync, first-preview creation, duplicate prevention, queued snapshots, fixed-deadline coalescing, pause and Object Mode deferral. These are mock tests, not a real Blender session.

Earlier component checks covered 50 house configurations, 100 texture definitions, 200 column presets, 400 column geometry variants, weather shader graph construction and 600 lamp placement configurations. None establishes Blender API compatibility, rendered quality or actual live UI behavior. **Blender 5.2 runtime compatibility remains unverified.**

The standalone Python script embeds all catalogs. CSV/JSON files and CATALOG_GUIDE.md are reference copies, not runtime dependencies.
