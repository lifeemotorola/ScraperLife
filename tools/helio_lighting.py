#!/usr/bin/env python3
"""helio_lighting.py — set a Blender scene's sun and sky for Monrovia with the Helio add-on.

Run it inside Blender 5.0+ (Helio's manifest requires 5.0.0). The project's `bpy` 4.2.0 pin
used by rig_and_animate.py cannot load Helio.

    blender --background --python tools/helio_lighting.py -- \\
        --date 2026-10-14 --time 12:00 [--blend out.blend]

What it does
------------
* Enables the vendored add-on in addon/helio/ and its bundled timezonefinderL wheel.
* Sets the scene's sun_setup_props to Monrovia (6.3005 N, 10.7969 W, UTC+0) and the date and
  time you pass.
* Calls Helio's Apply operator, which sets the Sun object and Sky Texture in the scene.
* Optionally saves the .blend, for lighting previews of the house and character scenes.

The game renders its own sky and lights with three.js, so Helio's output is not exported
into the GLB files. Use it for reference lighting only.
"""

import argparse
import datetime
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ADDON_DIR = os.path.join(ROOT, "addon", "helio")
WHEELS_DIR = os.path.join(ADDON_DIR, "wheels")

MONROVIA = {"latitude": 6.3005, "longitude": -10.7969, "utczone": 0.0}


def parse_args(argv):
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    else:
        argv = []
    parser = argparse.ArgumentParser(description="Apply Helio sun and sky for Monrovia.")
    parser.add_argument("--date", default=datetime.date.today().isoformat(), help="YYYY-MM-DD")
    parser.add_argument("--time", default="12:00", help="HH:MM local time in Monrovia (UTC+0)")
    parser.add_argument("--blend", default="", help="optional .blend path to save after applying")
    return parser.parse_args(argv)


def enable_helio():
    import bpy  # noqa: F401  (only importable inside Blender)

    if not os.path.isdir(ADDON_DIR):
        sys.exit(f"Helio not found at {ADDON_DIR}")
    if ADDON_DIR not in sys.path:
        sys.path.insert(0, os.path.dirname(ADDON_DIR))
    # Helio imports timezonefinderL from the wheel shipped next to it.
    for wheel in sorted(os.listdir(WHEELS_DIR)) if os.path.isdir(WHEELS_DIR) else []:
        if wheel.endswith(".whl") and os.path.join(WHEELS_DIR, wheel) not in sys.path:
            sys.path.insert(0, os.path.join(WHEELS_DIR, wheel))

    import helio  # noqa: F401
    helio.register()
    return helio


def main():
    import bpy

    args = parse_args(sys.argv)
    try:
        date = datetime.date.fromisoformat(args.date)
        hour, minute = (int(part) for part in args.time.split(":"))
    except ValueError as exc:
        sys.exit(f"bad --date or --time: {exc}")

    enable_helio()
    scene = bpy.context.scene
    props = scene.sun_setup_props
    props.latitude = MONROVIA["latitude"]
    props.longitude = MONROVIA["longitude"]
    props.utczone = MONROVIA["utczone"]
    props.year, props.month, props.day = date.year, date.month, date.day
    props.hours, props.minutes = hour, minute

    result = bpy.ops.sunsetup.apply()
    if "FINISHED" not in result:
        sys.exit(f"Helio apply did not finish: {result}")
    print(f"[helio] applied {date.isoformat()} {hour:02d}:{minute:02d} UTC+0 at Monrovia")

    if args.blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.blend))
        print(f"[helio] saved {os.path.abspath(args.blend)}")


if __name__ == "__main__":
    main()
