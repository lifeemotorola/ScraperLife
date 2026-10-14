"""
sun_calc.py
Calculation of the Sun's position based on the NOAA Solar Calculator algorithm.

Functions operate in degrees (as the NOAA algorithm).
"""

import math
import datetime


# ---------------------------------------------------------------------------
# Helper functions for degree-based trigonometry
# ---------------------------------------------------------------------------

def sind(x: float) -> float:
    """Sine of an angle in degrees."""
    return math.sin(math.radians(x))


def cosd(x: float) -> float:
    """Cosine of an angle in degrees."""
    return math.cos(math.radians(x))


def asind(x: float) -> float:
    """Arcsine — result in degrees."""
    return math.degrees(math.asin(x))


def acosd(x: float) -> float:
    """Arccosine — result in degrees."""
    return math.degrees(math.acos(x))


def tand(x: float) -> float:
    """Tangent of an angle in degrees."""
    return math.tan(math.radians(x))


# ---------------------------------------------------------------------------
# Sun Position Calculations
# ---------------------------------------------------------------------------

def julian_date(year: int, month: int, day: int, utc_hour: float) -> float:
    """
    Julian Date (JD).
    """
    JD = (367 * year
          - math.floor(7 * (year + math.floor((month + 9) / 12)) / 4)
          + math.floor(275 * month / 9)
          + day
          + 1721013.5
          + utc_hour / 24)
    return JD


def days_since_j2000(jd: float) -> float:
    """
    Number of days since the J2000.0 epoch.
    """
    return jd - 2451545.0


def solar_declination(n: float) -> float:
    """
    Solar declination in degrees.
    """
    epsilon = 23.439 - 0.0000004 * n
    g = 357.529 + 0.98560028 * n
    L = 280.459 + 0.98564736 * n
    lam = L + 1.915 * sind(g) + 0.020 * sind(2 * g)
    delta = asind(sind(epsilon) * sind(lam))
    return delta


def day_of_year(year: int, month: int, day: int) -> int:
    """
    Day of the year (1-365/366).
    """
    return datetime.date(year, month, day).timetuple().tm_yday


def equation_of_time(day_of_year: int, hour: float) -> float:
    """
    Equation of Time in minutes.
    """
    gamma = (2 * math.pi / 365) * (day_of_year - 1 + (hour - 12) / 24)
    eqtime = 229.18 * (0.000075
                       + 0.001868 * math.cos(gamma)
                       - 0.032077 * math.sin(gamma)
                       - 0.014615 * math.cos(2 * gamma)
                       - 0.040849 * math.sin(2 * gamma))
    return eqtime


def true_solar_time(hour: int, minute: int, second: int,
                    longitude: float, timezone: float,
                    day_of_year: int) -> float:
    """
    True Solar Time in minutes.
    """
    eqtime = equation_of_time(day_of_year, hour)
    time_offset = eqtime + 4 * longitude - 60 * timezone
    tst = hour * 60 + minute + second / 60 + time_offset
    return tst


def hour_angle(tst: float) -> float:
    """
    Hour Angle in degrees.
    """
    return tst / 4 - 180


def solar_elevation(latitude: float, declination: float, ha: float) -> float:
    """
    Solar Elevation in degrees.
    """
    cos_zenith = (sind(latitude) * sind(declination)
                  + cosd(latitude) * cosd(declination) * cosd(ha))

    # Technical adjustment: handle numerical precision errors
    cos_zenith = max(-1.0, min(1.0, cos_zenith))


    zenith = acosd(cos_zenith)
    elevation = 90.0 - zenith
    return elevation


def solar_azimuth(latitude: float, declination: float,
                  elevation: float, ha: float) -> float:
    """
    Solar Azimuth in degrees (0° = north, 90° = east).
    """
    zenith = 90.0 - elevation

    cos_azimuth = -(sind(latitude) * cosd(zenith) - sind(declination)) / \
                   (cosd(latitude) * sind(zenith))

    # Technical adjustment: handle numerical precision errors
    cos_azimuth = max(-1.0, min(1.0, cos_azimuth))

    # acosd() directly returns A for the morning
    azimuth = acosd(cos_azimuth)

    # Technical adjustment: quadrant correction for afternoon (ha > 0)
    if ha > 0:
        azimuth = 360.0 - azimuth
    return azimuth


# ---------------------------------------------------------------------------
# Atmospheric Refraction
# ---------------------------------------------------------------------------

def atmospheric_refraction(elevation: float) -> float:
    """
    Atmospheric Refraction correction in degrees.
    Uses Sæmundsson's formula (Meeus, 1991):

    For elevation below -0.575°, refraction is unpredictable — returns 0.
    """
    if elevation <= -0.575:
        return 0.0

    R = 1.02 / tand(elevation + 10.3 / (elevation + 5.11))
    return R / 60.0

# ---------------------------------------------------------------------------
# Color Temperature (CCT)
# ---------------------------------------------------------------------------

def elevation_to_cct(elevation: float) -> float:
    """
    Approximate color temperature (CCT) in Kelvin based on solar elevation.
    Uses smoothstep interpolation for smooth transitions.
    """
    if elevation <= -10.0:
        return 12000.0
    elif elevation <= -6.0:
        return smoothstep(12000.0, 9000.0, (elevation + 10.0) / 4.0)
    elif elevation <= 0.0:
        return smoothstep(9000.0, 2000.0, (elevation + 6.0) / 6.0)
    elif elevation <= 5.0:
        return smoothstep(2000.0, 3500.0, elevation / 5.0)
    elif elevation <= 20.0:
        return smoothstep(3500.0, 5000.0, (elevation - 5.0) / 15.0)
    elif elevation <= 45.0:
        return smoothstep(5000.0, 5500.0, (elevation - 20.0) / 25.0)
    else:
        return smoothstep(5500.0, 6500.0, min((elevation - 45.0) / 45.0, 1.0))



# ---------------------------------------------------------------------------
# Radiation intensity
# ---------------------------------------------------------------------------

def elevation_to_strength(elevation: float, altitude: float = 0.0) -> float:
    """
    Direct solar radiation intensity in kW/m² based on solar elevation.
    Uses Kasten's Air Mass formula with altitude correction.
    """
    if elevation <= 0.0:
        return 0.0

    h_km = altitude / 1000.0

    # Kasten's Air Mass formula with atmospheric curvature correction
    am = 1.0 / (sind(elevation)
                + 0.50572 * (96.07995 - elevation) ** (-1.6364))

    # With altitude correction
    intensity = 1.353 * ((1 - 0.14 * h_km) * (0.7 ** (am ** 0.678))
                         + 0.14 * h_km)
    return intensity


def elevation_to_exposure(elevation: float) -> float:
    """
    Exposure correction for Sun light based on elevation.
    Uses approximate values derived from measurements and visual approximation.
    """
    if elevation <= 32.75:
        return -6.0
    elif elevation <= 36.14:
        return smoothstep(-6.0, -6.3, (elevation - 32.75) / 3.39)
    elif elevation <= 40.70:
        return smoothstep(-6.3, -6.6, (elevation - 36.14) / 4.56)
    elif elevation <= 47.73:
        return smoothstep(-6.6, -6.8, (elevation - 40.70) / 7.03)
    elif elevation <= 55.30:
        return smoothstep(-6.8, -7.0, (elevation - 47.73) / 7.57)
    else:
        return -7.0


def elevation_to_sky_strength(elevation: float) -> float:
    """
    Sky Texture Background Strength based on elevation.
    Values derived from measurements and visual approximation.

    Astronomical twilight begins below -18° — sky is black.
    Peak intensity occurs around -3° to -6° (blue hour).
    After sunrise, intensity drops rapidly — Sunlight takes over illumination.
    """
    if elevation <= -18.0:
        return 0.0
    elif elevation <= -12.9:
        return smoothstep(0.0, 0.3, (elevation + 18.0) / 5.1)
    elif elevation <= -8.17:
        return smoothstep(0.3, 2.0, (elevation + 12.9) / 4.73)
    elif elevation <= -6.62:
        return smoothstep(2.0, 3.95, (elevation + 8.17) / 1.55)
    elif elevation <= -3.3:
        return smoothstep(3.95, 3.0, (elevation + 6.62) / 3.32)
    elif elevation <= -1.1:
        return smoothstep(3.0, 0.7, (elevation + 3.3) / 2.2)
    elif elevation <= 1.24:
        return smoothstep(0.7, 0.3, (elevation + 1.1) / 2.34)
    elif elevation <= 3.83:
        return smoothstep(0.3, 0.2, (elevation - 1.24) / 2.59)
    elif elevation <= 8.56:
        return smoothstep(0.2, 0.2, (elevation - 3.83) / 4.73)
    elif elevation <= 19.4:
        return smoothstep(0.2, 0.12, (elevation - 8.56) / 10.84)
    elif elevation <= 22.9:
        return smoothstep(0.12, 0.1, (elevation - 19.4) / 3.5)
    elif elevation <= 39.4:
        return smoothstep(0.1, 0.03, (elevation - 22.9) / 16.5)
    else:
        return 0.03


# ---------------------------------------------------------------------------
# Sunrise and Sunset
# ---------------------------------------------------------------------------
 
def sunrise_sunset_utc(year: int, month: int, day: int,
                       latitude: float, longitude: float) -> tuple:
    """
    Calculation of sunrise and sunset in minutes from midnight UTC.
    Based on the NOAA Solar Calculator algorithm.
 
    Returns (sunrise_minutes, sunset_minutes).
    If the Sun does not rise or set (polar day/night), returns None.
 
    The value 90.833° accounts for:
      - atmospheric refraction (~0.567°)
      - solar disk radius (~0.267°)
    """
    doy  = day_of_year(year, month, day)
    n    = days_since_j2000(julian_date(year, month, day, 12.0))
    decl = solar_declination(n)
    eqt  = equation_of_time(doy, 12.0)
 
    # Hour angle at sunrise/sunset
    cos_ha = (cosd(90.833) / (cosd(latitude) * cosd(decl))
              - sind(latitude) * sind(decl) / (cosd(latitude) * cosd(decl)))
 
    # Polar day or night
    if cos_ha < -1.0 or cos_ha > 1.0:
        return None, None
 
    ha_sunrise = acosd(cos_ha)
 
    # Time in minutes from midnight UTC
    sunrise = 720 - 4 * (longitude + ha_sunrise) - eqt
    sunset  = 720 - 4 * (longitude - ha_sunrise) - eqt
 
    return sunrise, sunset
 
 
def minutes_to_hms(minutes: float) -> tuple:
    """
    Conversion of minutes from midnight to (hours, minutes, seconds).
    """
    minutes = minutes % (24 * 60)
    h = int(minutes // 60)
    m = int(minutes % 60)
    s = int((minutes * 60) % 60)
    return h, m, s

# ---------------------------------------------------------------------------
# Automatic UTC Offset Determination via GPS Coordinates
# ---------------------------------------------------------------------------

def get_utc_offset(latitude: float, longitude: float,
                   year: int, month: int, day: int,
                   hour: int = 12, minute: int = 0, second: int = 0):
    """
    Automatically determines the UTC offset (whole hours) for the given GPS coordinates and date.
    Takes into account daylight saving time and standard time.

    Dependencies bundled in the libs/ folder of the addon

    Returns an integer or None on error.
    """
    try:
        from timezonefinderL import TimezoneFinder
        from zoneinfo import ZoneInfo
        from datetime import datetime

        tf = TimezoneFinder()
        tz_name = tf.timezone_at(lat=latitude, lng=longitude)

        if tz_name is None:
            print(f"  WARNING: Timezone not found for "
                  f"({latitude:.4f}, {longitude:.4f}). "
                  f"Use TIMEZONE_OVERRIDE.")
            return None

        tz = ZoneInfo(tz_name)
        local_dt = datetime(year, month, day, hour, minute, second, tzinfo=tz)
        offset_hours = int(local_dt.utcoffset().total_seconds() / 3600)

        return offset_hours

    except ImportError as e:
        print(f"  ERROR importing: {e}")
        print(f"  Check that wheels contain 'timezonefinderL' "
              f"and 'importlib_resources'.")
        return None
    except Exception as e:
        print(f"  ERROR occurred while determining the timezone: {e}")
        return None


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
def smoothstep(a: float, b: float, t: float) -> float:
    """
    Smoothstep interpolation for smooth transitions between endpoints.
    """
    t = max(0.0, min(1.0, t))
    t = t * t * (3 - 2 * t)
    return a + (b - a) * t