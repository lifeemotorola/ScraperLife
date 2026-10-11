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

## Checks

```bash
npm run check   # both of the below
```

* `npm run check:controls` — drives the real `InputManager`, `Player` and
  `Game.updateCamera` outside a browser and asserts, for every camera rig and camera angle,
  that the projected screen direction matches the pushed direction and that Markie faces
  the way he walks. This is the regression guard for the inverted analog.
* `npm run check:touch` — loads the real `index.html` in jsdom and fires synthetic pointer
  events at the pad, so the stick axes, the dead zone, multi-touch isolation and every
  `USE` / `PULSE` / `RUN` / `CAM` / `VOX` / `MAP` button stay wired to the game.
