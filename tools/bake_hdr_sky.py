#!/usr/bin/env python3
"""bake_hdr_sky.py — bake the Waterside sky into an HDR environment map.

The game used to light itself with a flat background colour, a hemisphere light and a
``FogExp2`` so dense that the far side of the platform dissolved into grey. That is what read
as "foggy": there was nothing for light to *come from*, so every surface was lit by the same
directionless wash. This script bakes a real high-dynamic-range sky instead — an equirectangular
Radiance ``.hdr`` file — which ``js/world/Environment.js`` loads through ``RGBELoader``, convolves
with ``PMREMGenerator`` and assigns to ``scene.environment``. Every material in the city then gets
image-based lighting: sky light from above, sun glare from the sun's actual direction, and ground
bounce from below.

    python3 tools/bake_hdr_sky.py                       # bake assets/textures/waterside_sky.hdr
    python3 tools/bake_hdr_sky.py --preset harmattan    # dusty dry-season sky
    python3 tools/bake_hdr_sky.py --check               # decode the file back and verify it
    npm run sky                                         # the same default bake

Why HDR and not a PNG skybox
----------------------------
A PNG caps every pixel at 1.0, so the sun and the sky next to it are the same brightness and the
tone mapper has nothing to work with. Radiance RGBE stores a float per channel as 3 bytes plus a
shared exponent, so the sun disc can sit at 40x the sky's brightness while the file stays small.
That range is the whole point: with ``ACESFilmicToneMapping`` the sun blows out to white, the sky
keeps its gradient, and skin tones stay mid-range instead of washing out.

Conventions (both verified against the three.js source in node_modules)
-----------------------------------------------------------------------
* ``equirectUv(dir) = (atan(dir.z, dir.x)/(2π) + 0.5, asin(dir.y)/π + 0.5)`` — so column ``c``
  is azimuth ``((c+0.5)/width - 0.5) * 2π`` with ``x = cos(a)``, ``z = sin(a)``, and row ``r`` is
  elevation ``asin`` of ``1 - (r+0.5)/height``.
* ``RGBELoader`` sets ``texture.flipY = true`` for float textures, which puts memory row 0 at
  ``v = 1`` — the zenith. Scanlines are therefore written **zenith first, nadir last**, which is
  also what the ``-Y H +X W`` header declares. Get this backwards and the sun rises out of the
  ground.
* The default sun direction is ``ClimateController``'s starting sun (``dayProgress = .61`` →
  ``position ≈ (-26.8, 32.4, 18)``), so the bright spot in the sky and the shadow-casting
  ``DirectionalLight`` agree the moment the game boots. The sun is static after that — the day
  cycle moves the light and the sky's *intensity*, not the baked sun's position.

Pure standard library: the RGBE encode/decode and the value noise are implemented here.
"""

from __future__ import annotations

import argparse
import math
import os
import struct
import sys

LOG_PREFIX = "[sky]"


def log(msg=""):
    print(f"{LOG_PREFIX} {msg}", flush=True)


def warn(msg):
    print(f"{LOG_PREFIX} WARNING {msg}", flush=True)


def die(msg, code=2):
    print(f"{LOG_PREFIX} ERROR {msg}", file=sys.stderr, flush=True)
    raise SystemExit(code)


# ==================================================================================================
# 1. Radiance RGBE — float RGB <-> 4 bytes (3 mantissas + shared exponent)
# ==================================================================================================

def float_to_rgbe(rgb):
    """Radiance `float2rgbe`: returns (r, g, b, e) bytes for one linear-RGB triplet."""
    red, green, blue = rgb
    brightest = max(red, green, blue)
    if brightest < 1e-32:
        return (0, 0, 0, 0)
    mantissa, exponent = math.frexp(brightest)      # brightest = mantissa * 2**exponent
    scale = mantissa * 256.0 / brightest
    return (
        min(255, int(red * scale)),
        min(255, int(green * scale)),
        min(255, int(blue * scale)),
        (exponent + 128) & 0xFF,
    )


def rgbe_to_float(rgbe):
    """Inverse of `float_to_rgbe`; used by --check to prove the round trip."""
    red, green, blue, exponent = rgbe
    if exponent == 0:
        return (0.0, 0.0, 0.0)
    scale = 2.0 ** (exponent - (128 + 8))
    return (red * scale, green * scale, blue * scale)


def rle_encode_scanline(scanline, width):
    """New-style Radiance RLE for one scanline: a 4-byte marker, then per-channel runs.

    Count-byte convention (matches three.js `RGBE_ReadPixels_RLE`): a count above 128 is a run
    of `count - 128` repeats, a count of 1..128 is that many literal bytes, and 0 is invalid.
    Literals are capped at 127 here so the file stays readable by decoders that use
    `count & 0x80` instead of `count > 128`.
    """
    out = bytearray((2, 2, (width >> 8) & 0xFF, width & 0xFF))
    for channel in range(4):
        values = bytes(scanline[pixel * 4 + channel] for pixel in range(width))
        position = 0
        while position < width:
            run_start = position
            run_value = values[position]
            while (position < width and values[position] == run_value
                   and position - run_start < 127):
                position += 1
            run_length = position - run_start
            if run_length > 2:
                out.append(0x80 | run_length)
                out.append(run_value)
                continue
            # Literal run: stop early if a long-enough run starts inside it.
            position = run_start
            literal = bytearray()
            while position < width and len(literal) < 127:
                ahead = 1
                while (position + ahead < width and values[position + ahead] == values[position]
                       and ahead < 127):
                    ahead += 1
                if ahead > 3:
                    break
                literal.append(values[position])
                position += 1
            out.append(len(literal))
            out.extend(literal)
    return bytes(out)


# ==================================================================================================
# 2. the sky model — gradient, sun, horizon haze, ground bounce, clouds
# ==================================================================================================

# Linear RGB radiance, roughly the scale real captured HDRIs sit at (sky ~1-2, sun ~60), so
# `scene.environmentIntensity = 1.0` means "full daylight" in js/world/Environment.js.
# Values above 1.0 are legal and necessary: that range is what makes this HDR.
PRESETS = {
    "coastal": {
        "zenith": (0.300, 0.720, 1.420),
        "horizon": (1.550, 1.950, 2.100),
        "haze": (2.350, 2.250, 1.950),
        "ground": (0.160, 0.190, 0.170),
        "sun": (1.00, 0.855, 0.660),
        "sunIntensity": 60.0,
        "sunDiscSharpness": 900.0,
        "cloud": 0.30,
    },
    "harmattan": {
        "zenith": (0.850, 0.780, 0.620),
        "horizon": (2.200, 1.850, 1.250),
        "haze": (2.600, 2.150, 1.400),
        "ground": (0.240, 0.200, 0.140),
        "sun": (1.00, 0.770, 0.470),
        "sunIntensity": 22.0,     # dust scatters the disc away
        "sunDiscSharpness": 260.0,
        "cloud": 0.42,
    },
    "overcast": {
        "zenith": (0.550, 0.620, 0.690),
        "horizon": (1.300, 1.390, 1.450),
        "haze": (1.500, 1.550, 1.570),
        "ground": (0.140, 0.150, 0.145),
        "sun": (0.95, 0.95, 0.93),
        "sunIntensity": 4.5,      # the sun is a bright patch, not a disc
        "sunDiscSharpness": 26.0,
        "cloud": 0.68,
    },
}


def hash_noise(x, y):
    """Deterministic 2D value noise in [0,1) — no RNG, no seed, same output every bake."""
    n = math.sin(x * 127.1 + y * 311.7) * 43758.5453123
    return n - math.floor(n)


def smooth_noise(x, y):
    xi, yi = math.floor(x), math.floor(y)
    fx, fy = x - xi, y - yi
    fx = fx * fx * (3 - 2 * fx)      # smoothstep
    fy = fy * fy * (3 - 2 * fy)
    a = hash_noise(xi, yi)
    b = hash_noise(xi + 1, yi)
    c = hash_noise(xi, yi + 1)
    d = hash_noise(xi + 1, yi + 1)
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy


def fbm(x, y, octaves=3):
    total, amplitude, frequency, span = 0.0, 0.5, 1.0, 0.0
    for _ in range(octaves):
        total += smooth_noise(x * frequency, y * frequency) * amplitude
        span += amplitude
        amplitude *= 0.5
        frequency *= 2.1
    return total / span


def direction_for(u, v):
    """Equirect UV -> unit direction, matching three.js `equirectUv` exactly."""
    azimuth = (u - 0.5) * 2 * math.pi
    elevation = (v - 0.5) * math.pi
    horizontal = math.cos(elevation)
    return (math.cos(azimuth) * horizontal, math.sin(elevation), math.sin(azimuth) * horizontal)


def sun_direction(azimuth_deg, elevation_deg):
    azimuth = math.radians(azimuth_deg)
    elevation = math.radians(elevation_deg)
    horizontal = math.cos(elevation)
    return (math.cos(azimuth) * horizontal, math.sin(elevation), math.sin(azimuth) * horizontal)


def sky_radiance(direction, preset, sun_dir):
    x, y, z = direction
    up = max(0.0, y)
    down = max(0.0, -y)

    # Sky dome: horizon colour at the horizon, zenith colour overhead.
    gradient = up ** 0.42
    colour = [preset["horizon"][i] + (preset["zenith"][i] - preset["horizon"][i]) * gradient
              for i in range(3)]

    # Horizon haze — a coastal city always has one, and it is what sells the distance.
    haze = math.exp(-abs(y) * 7.5)
    for i in range(3):
        colour[i] += preset["haze"][i] * haze * 0.42

    # Sun: a sharp HDR disc plus a wide glow. This is the only part of the map above 1.0,
    # and it is what gives metal, water and sweat a highlight with a direction.
    facing = max(0.0, x * sun_dir[0] + y * sun_dir[1] + z * sun_dir[2])
    disc = facing ** preset["sunDiscSharpness"]
    glow = facing ** 12.0
    for i in range(3):
        colour[i] += preset["sun"][i] * (disc * preset["sunIntensity"] + glow * preset["sunIntensity"] * 0.055)

    # Clouds: only above the horizon, thinning toward the zenith, so reflections have texture.
    if preset["cloud"] > 0 and up > 0.01:
        band = math.exp(-((up - 0.22) ** 2) / 0.035)
        density = max(0.0, fbm(x * 2.6 + 11.0, z * 2.6 + 7.0) - (1 - preset["cloud"])) / max(preset["cloud"], 1e-6)
        amount = min(1.0, density) * band * 0.55
        for i in range(3):
            colour[i] = colour[i] * (1 - amount) + (0.92 * preset["horizon"][i] + 0.35) * amount

    # Ground: dark water/asphalt at the nadir, brightening toward the horizon line where the
    # city reflects the sky back up. This is the fill light under every chin and backpack.
    if down > 0:
        bounce = math.exp(-down * 5.0)   # 1 at the horizon line, ~0 at the nadir
        for i in range(3):
            colour[i] = preset["ground"][i] + (preset["haze"][i] * 0.30 - preset["ground"][i]) * bounce
    return colour


def bake(preset_name, width, height, azimuth_deg, elevation_deg):
    if preset_name not in PRESETS:
        die(f"unknown preset '{preset_name}'; pick from {', '.join(PRESETS)}")
    preset = PRESETS[preset_name]
    sun_dir = sun_direction(azimuth_deg, elevation_deg)
    pixels = []
    for row in range(height):
        # Row 0 is the zenith: RGBELoader sets flipY = true, and -Y H +X W declares top-down.
        v = 1.0 - (row + 0.5) / height
        scanline = []
        for column in range(width):
            u = (column + 0.5) / width
            radiance = sky_radiance(direction_for(u, v), preset, sun_dir)
            scanline.extend(float_to_rgbe(radiance))
        pixels.append(rle_encode_scanline(scanline, width))
    return pixels, preset, sun_dir


def write_hdr(path, width, height, scanlines, meta):
    header = ["#?RADIANCE"]
    header += [f"# {line}" for line in meta]
    header += ["FORMAT=32-bit_rle_rgbe", "", f"-Y {height} +X {width}"]
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "wb") as handle:
        # Radiance headers are ASCII by convention; never let a stray character corrupt one.
        handle.write(("\n".join(header) + "\n").encode("ascii", "replace"))
        for scanline in scanlines:
            handle.write(scanline)


# ==================================================================================================
# 3. decode — so --check can prove the file is a valid HDR sky and not just a plausible blob
# ==================================================================================================

def read_hdr(path):
    """Decode an RLE Radiance file back to (width, height, rows-of-linear-RGB), top row first."""
    with open(path, "rb") as handle:
        blob = handle.read()
    if not blob.startswith(b"#?RADIANCE"):
        die(f"{path} does not start with the #?RADIANCE magic")

    # The header is ASCII text and ends with the "-Y H +X W" line; the very next byte is the
    # first RLE scanline. Walking the lines is the only safe way to find that boundary -
    # searching for a blank line lands on the empty line after FORMAT, inside the header.
    lines = []
    cursor = 0
    width = height = None
    declared_format = None
    while width is None:
        if cursor >= len(blob):
            die(f"{path} header never declared a -Y H +X W scanline order")
        end = blob.index(b"\n", cursor)
        line = blob[cursor:end].decode("ascii", "replace").rstrip("\r")
        cursor = end + 1
        lines.append(line)
        if line.startswith("FORMAT="):
            declared_format = line.split("=", 1)[1].strip()
        elif line.startswith("-Y "):
            parts = line.split()
            height, width = int(parts[1]), int(parts[3])
    header = "\n".join(lines)
    if declared_format != "32-bit_rle_rgbe":
        die(f"{path} declares FORMAT={declared_format}, not 32-bit_rle_rgbe")
    body = blob[cursor:]

    rows = []
    offset = 0
    for _ in range(height):
        if body[offset] != 2 or body[offset + 1] != 2:
            die(f"{path} scanline at offset {offset} is not new-style RLE")
        scanline_width = (body[offset + 2] << 8) | body[offset + 3]
        if scanline_width != width:
            die(f"{path} declares width {width} but a scanline says {scanline_width}")
        offset += 4
        channels = []
        for _channel in range(4):
            values = bytearray()
            while len(values) < width:
                count = body[offset]
                offset += 1
                if count == 0:
                    die(f"{path} has a zero-length RLE count in scanline channel")
                if count > 128:                     # a run of (count - 128) repeats
                    repeats = count - 128
                    values.extend([body[offset]] * repeats)
                    offset += 1
                else:                               # that many literal bytes
                    values.extend(body[offset:offset + count])
                    offset += count
            if len(values) != width:
                die(f"{path} scanline channel decoded to {len(values)} values, expected {width}")
            channels.append(values)
        row = []
        for pixel in range(width):
            row.append(rgbe_to_float((channels[0][pixel], channels[1][pixel],
                                      channels[2][pixel], channels[3][pixel])))
        rows.append(row)
    if offset != len(body):
        warn(f"{offset} of {len(body)} bytes consumed; trailing data ignored")
    return width, height, rows, header


def cmd_bake(args):
    scanlines, preset, sun_dir = bake(args.preset, args.width, args.height,
                                      args.sun_azimuth, args.sun_elevation)
    meta = [
        f"Baked by tools/bake_hdr_sky.py - preset {args.preset}",
        f"sun azimuth {args.sun_azimuth:.1f}deg elevation {args.sun_elevation:.1f}deg "
        f"intensity {preset['sunIntensity']:.1f} (HDR)",
        "equirectangular; row 0 = zenith; matches three.js equirectUv + RGBELoader flipY",
        "consumed by js/world/Environment.js via RGBELoader -> PMREMGenerator -> scene.environment",
    ]
    write_hdr(args.out, args.width, args.height, scanlines, meta)
    size = os.path.getsize(args.out)
    log(f"wrote {args.out}  {args.width}x{args.height}  {size / 1024:.0f} KB  preset={args.preset}")
    log(f"  sun direction ({sun_dir[0]:+.3f}, {sun_dir[1]:+.3f}, {sun_dir[2]:+.3f})  "
        f"disc peak {preset['sunIntensity']:.0f}x sky")
    log("  next: node tools/lighting-check.mjs   (npm run check:lighting)")
    return 0


def cmd_check(args):
    failures = []

    def check(label, ok, detail=""):
        if not ok:
            failures.append(label)
        print(f"{'PASS' if ok else 'FAIL'}  {label.ljust(56)} {detail}")

    if not os.path.exists(args.out):
        die(f"no sky at {args.out}; run: python3 tools/bake_hdr_sky.py --out {args.out}")

    width, height, rows, header = read_hdr(args.out)
    check("file is a Radiance RGBE map", "#?RADIANCE" in header and "FORMAT=32-bit_rle_rgbe" in header,
          f"{width}x{height}, {os.path.getsize(args.out) / 1024:.0f} KB")
    # The bake records its preset in the header; the dynamic range a sky can have depends on it,
    # so the expectation is read from the file instead of assumed.
    preset = "coastal"
    for line in header.splitlines():
        if "preset " in line:
            named = line.split("preset", 1)[1].strip()
            preset = named if named in PRESETS else preset
    min_range = {"coastal": 40.0, "harmattan": 25.0, "overcast": 12.0}[preset]
    check("declared size matches the decoded pixels",
          len(rows) == height and all(len(row) == width for row in rows), f"{len(rows)} rows x {len(rows[0])} px")

    luminance = lambda rgb: 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
    flat = [luminance(pixel) for row in rows for pixel in row]
    brightest = max(flat)
    darkest = min(flat)
    mean = sum(flat) / len(flat)
    check("the map is genuinely HDR (peak above 1.0)", brightest > 1.0, f"peak {brightest:.1f}")
    check("the sun is the brightest thing in the map", brightest > mean * 3,
          f"peak {brightest:.1f} vs mean {mean:.3f}")
    check("shadows stay dark (not a flat wash)", darkest < 0.25, f"min {darkest:.4f}")
    check(f"dynamic range spans at least {min_range:.0f}:1 for the '{preset}' sky",
          brightest > darkest * min_range + 1e-6,
          f"{brightest / max(darkest, 1e-6):.0f}:1")

    # Zenith must be above the horizon's brightness, otherwise the map is upside down and the
    # sun would light the streets from underground.
    zenith = luminance(rows[0][width // 2])
    horizon = luminance(rows[height // 2][width // 2])
    nadir = luminance(rows[-1][width // 2])
    check("row 0 is the zenith (brighter than the ground)", zenith > nadir,
          f"zenith {zenith:.3f} vs nadir {nadir:.3f}")
    check("sky is above the horizon band, ground below", zenith > 0 and nadir < zenith,
          f"{zenith:.3f} / {horizon:.3f} / {nadir:.3f}")

    # Find the brightest pixel and convert it back to an azimuth/elevation with the same
    # formulas the bake used: the sun must be where the game's DirectionalLight says it is.
    peak_row, peak_column = 0, 0
    peak = -1.0
    for row_index, row in enumerate(rows):
        for column_index, pixel in enumerate(row):
            value = luminance(pixel)
            if value > peak:
                peak, peak_row, peak_column = value, row_index, column_index
    found_azimuth = math.degrees(math.atan2(
        direction_for((peak_column + 0.5) / width, 1 - (peak_row + 0.5) / height)[2],
        direction_for((peak_column + 0.5) / width, 1 - (peak_row + 0.5) / height)[0],
    )) % 360
    found_elevation = math.degrees(math.asin(
        direction_for((peak_column + 0.5) / width, 1 - (peak_row + 0.5) / height)[1]))
    tolerance = 360 / width + 1.0
    check("the sun sits at the requested azimuth",
          abs((found_azimuth - args.sun_azimuth + 180) % 360 - 180) < tolerance,
          f"found {found_azimuth:.1f}deg, wanted {args.sun_azimuth:.1f}deg")
    check("the sun sits at the requested elevation (above the horizon)",
          abs(found_elevation - args.sun_elevation) < 180 / height + 1.0 and found_elevation > 0,
          f"found {found_elevation:.1f}deg, wanted {args.sun_elevation:.1f}deg")

    print()
    if failures:
        print(f"{len(failures)} check(s) failed: {', '.join(failures)}")
        return 1
    print(f"all checks passed — {width}x{height}, peak {brightest:.1f}, mean {mean:.3f}, "
          f"sun at {found_azimuth:.0f}deg/{found_elevation:.0f}deg")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="bake_hdr_sky.py",
        description="Bake an equirectangular HDR sky for Scraper Life's image-based lighting.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(here)
    parser.add_argument("command", choices=["bake", "check"], nargs="?", default="bake")
    parser.add_argument("--out", default=os.path.join(repo, "assets", "textures", "waterside_sky.hdr"))
    parser.add_argument("--preset", default="coastal", choices=sorted(PRESETS))
    parser.add_argument("--width", type=int, default=512, help="equirect width (default 512)")
    parser.add_argument("--height", type=int, default=256, help="equirect height (default 256)")
    parser.add_argument("--sun-azimuth", type=float, default=146.0,
                        help="degrees; atan2(z, x) of the sun direction (default 146 = ClimateController's start)")
    parser.add_argument("--sun-elevation", type=float, default=45.0,
                        help="degrees above the horizon (default 45 = ClimateController's start)")
    args = parser.parse_args(argv)
    if args.width < 8 or args.width > 0x7FFF:
        die("--width must be between 8 and 32767 for Radiance RLE scanlines")
    if args.height < 4:
        die("--height must be at least 4")
    return {"bake": cmd_bake, "check": cmd_check}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
