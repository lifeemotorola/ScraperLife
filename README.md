# ScraperLife

**Scraper Life — A Markie Story.** A playable 3D vertical slice: a third-person action
adventure set in Waterside, Monrovia, built with three.js + Vite and deployable to
Cloudflare Workers.

## Run

```bash
npm install
npm run dev      # http://localhost:5173 (also serves the LAN URL for phone testing)
npm run build
npm run deploy   # vite build + wrangler deploy
```

## Controls

| Desktop | Touch (Android/iOS) | Action |
| --- | --- | --- |
| `W A S D` / arrows | left thumbstick | move (camera-relative) |
| `Shift` | hold `RUN` | sprint |
| `Space` | `PULSE` | scrap pulse |
| `E` | `USE` | interact / pick up |
| drag the view | drag the view | look around |
| `C` | `CAM` | cycle camera view (also recenters behind Markie) |
| `M` | `MAP` | platform map |
| `V` | `VOX` | toggle character voices |

## Conventions that keep the camera and the pad in agreement

These are load-bearing; breaking one of them is what made the Android stick feel inverted.

* **Forward is +Z.** `Player.group.rotation.y = atan2(dir.x, dir.z)` turns the character's
  local `+Z` into the walking direction, so every humanoid's front (and the player's
  backpack, at `-Z`) is authored facing `+Z`. `assets/textures/markie.dae` is authored
  facing `+X` and is corrected by `DAE_FORWARD_YAW` when it loads.
* **The camera sits behind that `+Z`**, hence negative Z offsets in `CAMERA_MODES`.
* **Stick/key input is read in the camera's yaw frame** (`InputManager.getMovement()` +
  `setCameraYaw`). "Up" therefore always walks away from the camera — up the screen — at
  any camera angle, and "right" always walks right.
* **The camera yaw is not welded to Markie's facing.** Dragging looks around; `CAM`
  recenters behind him. Welding them made him run at the camera and made the stick read
  backwards as soon as he turned.

## Character

`fbx/Survival_Character.fbx` is the authored character: 110 skinned bones, eleven meshes,
**no animation at all**. `tools/rig_and_animate.py` turns it into the file the game loads —
`assets/models/survival_character.glb` plus a `survival_character.character.json` manifest —
and it is worth reading as a pipeline rather than as an exporter:

```bash
python3 tools/rig_and_animate.py inspect --fbx fbx/Survival_Character.fbx      # what is in there
python3 tools/rig_and_animate.py build    --fbx fbx/Survival_Character.fbx      # rig + clips + GLB
python3 tools/rig_and_animate.py build    --fbx fbx/Survival_Character.fbx \
        --retarget-from fbx/mechanic.fbx --retarget-clip dance --dry-run        # peek at a transfer
```

* **Normalise first.** Every object transform is baked into the bone and mesh data, then the
  character is scaled to `--height 2.3` (the same number `NPC.baseHeight` uses), dropped so the
  feet sit on `z=0`, and yawed so it faces **-Y**. The glTF Y-up conversion turns that `-Y` into
  three.js `+Z`, which is the axis `Player.update` already aims with `atan2(dir.x, dir.z)` — so
  no `DAE_FORWARD_YAW`-style correction is needed, and the manifest records `forward.extraYaw: 0`
  for anything authored some other way.
* **Walk and run are solved, not keyed.** The stance foot's position is authored frame by frame
  and two-bone IK puts the knee and ankle where that foot has to be, so the foot cannot sink
  through the floor or slide across it; the pelvis height falls out of the supporting leg's reach,
  which is where the bob comes from. `--fps`, `--clips`, `--height`, `--yaw`, `--decimate` and
  `--no-morphs` are the knobs; `CLIPS` in the script is where a new one is added.
* **GLB, not FBX.** three.js' FBX loader does not handle this file's skins; the exporter writes
  one glTF animation per Blender action, named exactly after the clip, which is what
  `AnimationMixer` and `js/entities/CharacterRig.js` key off. The manifest — not the code — holds
  the state map (`sprint` → `run`, `interact` → `grab`), so re-exporting with different clip names
  needs no JS edit. `npm run build` copies both files into `dist/` as hashed assets.
* **Size.** `--no-morphs` ships 5.5 MB (the 93 facial shape keys cost another 3.6 MB on their own,
  and nothing drives them yet); `--decimate 0.5` takes the base mesh to 3.9 MB. Keep
  `export_apply` off when you change the flags — shape keys cannot survive a mesh that was
  triangulated on the way out.
* **Retargeting** (`--retarget-from`) samples *joint directions and twist* off another rig
  instead of matrices, so a differently-rolled or Y-up donor still drives this one. It refuses to
  produce a frozen pose: if the donor action's channels hold a single value it stops and says so —
  which is currently the case for `fbx/cgtrader_optimized_rp_manuel_animated_001_dancing.fbx`,
  whose 19 takes the FBX importer in `bpy` 4.2 flattens to two keys each. Re-export such a donor
  from Blender and it will transfer.

## Checks

```bash
npm run check   # all three of the below
```

* `npm run check:controls` — drives the real `InputManager`, `Player` and
  `Game.updateCamera` outside a browser and asserts, for every camera rig and camera angle,
  that the projected screen direction matches the pushed direction and that Markie faces
  the way he walks. This is the regression guard for the inverted analog.
* `npm run check:touch` — loads the real `index.html` in jsdom and fires synthetic pointer
  events at the pad, so the stick axes, the dead zone, multi-touch isolation and every
  `USE` / `PULSE` / `RUN` / `CAM` / `VOX` / `MAP` button stay wired to the game.
* `npm run check:character` — loads the exported GLB through the real `GLTFLoader`, then asserts
  the conventions the game is built on: feet on `y=0`, height equal to the manifest, **+Z** as the
  forward axis (toe joint ahead of the ankle joint), every state mapped to a clip, clip durations
  and key times on the requested `fps` grid, and — measured from the *deformed* skin — that the
  silhouette stays on the floor and keeps its height while the walk clip plays. It skips quietly
  when `assets/models/` has not been generated yet.
