#!/usr/bin/env python3
"""sun_position.py — sun position over Monrovia for the game's lighting.

Plain Python, no Blender. The solar maths comes from the Helio add-on's sun_calc.py
(addon/helio/), loaded by file path so the add-on's Blender package is never imported.

    python3 tools/sun_position.py --date 2026-10-14 --time 12:00
    python3 tools/sun_position.py --date 2026-10-14 --track --json assets/sun/monrovia-2026-10-14.json

Conventions
-----------
* Location: Monrovia, Montserrado County, Liberia (6.3005 N, 10.7969 W), UTC+0.
* --time is local clock time in Monrovia (HH:MM).
* azimuth: degrees clockwise from north (0 = N, 90 = E, 180 = S, 270 = W).
* elevation: degrees above the horizon, corrected for atmospheric refraction.
* direction: unit vector in east, north, up order (x = east, y = north, z = up). The game's
  three.js axes are not wired to this yet.
"""

import argparse
import datetime
import importlib.util
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SUN_CALC = os.path.join(os.path.dirname(HERE), "addon", "helio", "sun_calc.py")

LATITUDE = 6.3005
LONGITUDE = -10.7969
TIMEZONE = 0.0  # Monrovia keeps UTC all year


def load_sun_calc():
    if not os.path.isfile(SUN_CALC):
        sys.exit(f"sun_calc.py not found at {SUN_CALC}")
    spec = importlib.util.spec_from_file_location("helio_sun_calc", SUN_CALC)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sun_at(sc, date, hour, minute, second=0):
    """Sun position for a local Monrovia time (UTC+0) on a given date."""
    utc_hour = hour + minute / 60 + second / 3600 - TIMEZONE
    jd = sc.julian_date(date.year, date.month, date.day, utc_hour)
    n = sc.days_since_j2000(jd)
    declination = sc.solar_declination(n)
    doy = sc.day_of_year(date.year, date.month, date.day)
    tst = sc.true_solar_time(hour, minute, second, LONGITUDE, TIMEZONE, doy)
    ha = sc.hour_angle(tst)
    elevation = sc.solar_elevation(LATITUDE, declination, ha)
    azimuth = sc.solar_azimuth(LATITUDE, declination, elevation, ha)
    apparent = elevation + sc.atmospheric_refraction(elevation)
    az_rad = math.radians(azimuth)
    el_rad = math.radians(apparent)
    direction = [
        math.cos(el_rad) * math.sin(az_rad),  # east
        math.cos(el_rad) * math.cos(az_rad),  # north
        math.sin(el_rad),                     # up
    ]
    return {
        "time": f"{hour:02d}:{minute:02d}",
        "azimuth": round(azimuth, 3),
        "elevation": round(apparent, 3),
        "direction": [round(v, 6) for v in direction],
        "above_horizon": apparent > 0,
    }


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Sun position over Monrovia.")
    parser.add_argument("--date", default=datetime.date.today().isoformat(), help="YYYY-MM-DD")
    parser.add_argument("--time", default="12:00", help="HH:MM local time in Monrovia")
    parser.add_argument("--track", action="store_true", help="whole day, every 30 minutes")
    parser.add_argument("--json", default="", help="write the result to this JSON file")
    return parser.parse_args(argv)


def main():
    args = parse_args(sys.argv[1:])
    try:
        date = datetime.date.fromisoformat(args.date)
        hour, minute = (int(part) for part in args.time.split(":"))
    except ValueError as exc:
        sys.exit(f"bad --date or --time: {exc}")
    sc = load_sun_calc()

    if args.track:
        samples = [sun_at(sc, date, h, m) for h in range(24) for m in (0, 30)]
        result = {"date": date.isoformat(), "location": {"lat": LATITUDE, "lon": LONGITUDE, "tz": TIMEZONE}, "samples": samples}
        for s in samples:
            if s["above_horizon"]:
                print(f"{s['time']}  az {s['azimuth']:7.2f}  el {s['elevation']:6.2f}")
    else:
        sample = sun_at(sc, date, hour, minute)
        result = {"date": date.isoformat(), "location": {"lat": LATITUDE, "lon": LONGITUDE, "tz": TIMEZONE}, "samples": [sample]}
        print(json.dumps(sample, indent=2))

    if args.json:
        out = os.path.abspath(args.json)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w", encoding="utf-8") as handle:
            json.dump(result, handle, indent=2)
            handle.write("\n")
        print(f"wrote {out}")


if __name__ == "__main__":
    main()
