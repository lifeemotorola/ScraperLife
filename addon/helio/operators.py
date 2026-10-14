"""
operators.py
Operators for Blender addon Sun Setup.
"""

import re
import math
import datetime
import bpy

from . import sun_calc
from . import scene as scene_module
from .presets import ENVIRONMENT_PRESETS


# ---------------------------------------------------------------------------
# Parse GPS
# ---------------------------------------------------------------------------

def parse_gps(gps_string: str):
    """
    Parse GPS string in the format:
      - decimal degrees:  "50.087500, 14.421111"
      - degrees/minutes/seconds: 50°05'15.0\"N 14°25'16.0\"E

    Returns (lat, lon) or None on error.
    """
    gps_string = gps_string.strip()

    # Decimal degrees
    match = re.match(
        r'^([+-]?\d+\.?\d*)\s*,\s*([+-]?\d+\.?\d*)$',
        gps_string
    )
    if match:
        return float(match.group(1)), float(match.group(2))

    # Degrees/minutes/seconds
    match = re.match(
        r"(\d+)[°](\d+)['](\d+\.?\d*)[\"']([NS])\s+"
        r"(\d+)[°](\d+)['](\d+\.?\d*)[\"']([EW])",
        gps_string
    )
    if match:
        lat = (float(match.group(1))
               + float(match.group(2)) / 60
               + float(match.group(3)) / 3600)
        lon = (float(match.group(5))
               + float(match.group(6)) / 60
               + float(match.group(7)) / 3600)
        if match.group(4) == 'S':
            lat = -lat
        if match.group(8) == 'W':
            lon = -lon
        return lat, lon

    return None


# ---------------------------------------------------------------------------
# Operator: Parse GPS
# ---------------------------------------------------------------------------

class SUNSETUP_OT_parse_gps(bpy.types.Operator):
    bl_idname = "sunsetup.parse_gps"
    bl_label  = "Paste GPS"
    bl_description = "Parse GPS coordinates from input string"
    

    gps_input: bpy.props.StringProperty(
        name="GPS",
        description="Paste GPS coordinates",
        default="",
    )

    def invoke(self, context, event):
        self.gps_input = context.scene.sun_setup_props.gps_string
        return context.window_manager.invoke_props_dialog(self, width=400)

    def draw(self, context):
        self.layout.prop(self, "gps_input", text="GPS")

    def execute(self, context):
        props = context.scene.sun_setup_props
        result = parse_gps(self.gps_input)
        if result is None:
            self.report({'ERROR'}, "Unsupported GPS format.")
            return {'CANCELLED'}
        props.gps_string = self.gps_input
        props.latitude, props.longitude = result
        return {'FINISHED'}


# ---------------------------------------------------------------------------
# Operator: Today
# ---------------------------------------------------------------------------

class SUNSETUP_OT_today(bpy.types.Operator):
    bl_idname = "sunsetup.today"
    bl_label  = "Today"
    bl_description = "Set date to today's date"

    def execute(self, context):
        props = context.scene.sun_setup_props
        now = datetime.datetime.now()
        props.day   = now.day
        props.month = now.month
        props.year  = now.year
        return {'FINISHED'}


# ---------------------------------------------------------------------------
# Operator: Now
# ---------------------------------------------------------------------------

class SUNSETUP_OT_now(bpy.types.Operator):
    bl_idname = "sunsetup.now"
    bl_label  = "Now"
    bl_description = "Set time to current time"

    def execute(self, context):
        props = context.scene.sun_setup_props
        now = datetime.datetime.now()
        props.hours   = now.hour
        props.minutes = now.minute
        props.seconds = now.second
        return {'FINISHED'}


# ---------------------------------------------------------------------------
# Operator: Bake Animation
# ---------------------------------------------------------------------------

class SUNSETUP_OT_bake_animation(bpy.types.Operator):
    bl_idname = "sunsetup.bake_animation"
    bl_label  = "Bake Animation"
    bl_description = "Bake sun position and sky parameters as keyframes for the specified time range"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        scene = context.scene
        props = scene.sun_setup_props
        sun_obj = props.sun_object

        if sun_obj is None:
            self.report({'ERROR'}, "No Sun light object selected.")
            return {'CANCELLED'}

        # 1. Parameters from panel
        lat, lon = props.latitude, props.longitude
        year, month, day = props.year, props.month, props.day
        altitude = props.altitude
        north_offset = props.north_offset
        sky_model = props.sky_model
        use_refraction = props.use_refraction

        # Date validation
        try:
            datetime.date(props.year, props.month, props.day)
        except ValueError:
            self.report({'ERROR'}, f"Invalid date: {props.day}. {props.month}. {props.year}")
            return {'CANCELLED'}

        # Check manual/automatic UTC offset
        if props.utc_override: # manual
            effective_timezone = props.utczone
        else:
            auto_utc_offset = sun_calc.get_utc_offset(lat, lon, year, month, day) # automatic (calculated)
            effective_timezone = auto_utc_offset if auto_utc_offset is not None else props.utczone

        from_min = props.anim_from_h * 60 + props.anim_from_m + props.anim_from_s / 60
        to_min   = props.anim_to_h   * 60 + props.anim_to_m   + props.anim_to_s   / 60
        step_min = props.anim_step

        if from_min >= to_min:
            self.report({'ERROR'}, "From must be earlier than To.")
            return {'CANCELLED'}

        env = ENVIRONMENT_PRESETS.get(props.environment, ENVIRONMENT_PRESETS['CITY'])

        # 2. cycle baking through frames and setting up Sky Texture and Sun light
        current_frame = 1
        t = from_min
        
        while t <= to_min:
            scene.frame_set(current_frame)

            hour   = int(t // 60)
            minute = int(t % 60)
            second = int((t * 60) % 60)
            utc_hour = hour + minute / 60 + second / 3600 - effective_timezone

            jd         = sun_calc.julian_date(year, month, day, utc_hour)
            n          = sun_calc.days_since_j2000(jd)
            decl       = sun_calc.solar_declination(n)
            doy        = sun_calc.day_of_year(year, month, day)
            tst        = sun_calc.true_solar_time(hour, minute, second, lon, effective_timezone, doy)
            ha         = sun_calc.hour_angle(tst)
            elevation  = sun_calc.solar_elevation(lat, decl, ha)
            azimuth    = sun_calc.solar_azimuth(lat, decl, elevation, ha)

            refraction = sun_calc.atmospheric_refraction(elevation) if use_refraction else 0.0
            elevation_apparent = elevation + refraction

            cct      = sun_calc.elevation_to_cct(elevation_apparent)
            strength = sun_calc.elevation_to_strength(elevation_apparent, altitude)
            energy   = strength * 1000.0
            exposure = sun_calc.elevation_to_exposure(elevation_apparent)
            sky_str  = sun_calc.elevation_to_sky_strength(elevation_apparent)

            # 3. Write to scene (Calling functions from scene.py)
            sky_node = scene_module.setup_sky_texture(
                sky_model     = sky_model,
                elevation_rad = math.radians(elevation_apparent),
                rotation_rad  = math.radians(azimuth + north_offset),
                altitude      = altitude,
                sky_strength  = sky_str,
                air           = env['air'],
                aerosols      = env['aerosols'],
                ozone         = env['ozone'],
            )

            if sky_node:
                sky_node.sun_intensity = 0.0001 # very low intensity to ensure the sun disc is visible without affecting overall lighting too much
            
            scene_module.setup_sun_light(
                sun_obj            = sun_obj,
                elevation_apparent = elevation_apparent,
                azimuth            = azimuth,
                north_offset       = north_offset,
                cct                = cct,
                energy             = energy,
                exposure           = exposure,
            )

            # 4. KEYFRAMING
            sun_obj.keyframe_insert(data_path="rotation_euler")
            sun_obj.data.keyframe_insert(data_path="energy")
            sun_obj.data.keyframe_insert(data_path="temperature")
            sun_obj.data.keyframe_insert(data_path="exposure")

            world = scene.world
            if world and world.node_tree:
                bg_node = world.node_tree.nodes.get("Background")
                if bg_node:
                    bg_node.inputs[1].default_value = sky_str
                    bg_node.inputs[1].keyframe_insert(data_path="default_value")
                
                sky_node_anim = world.node_tree.nodes.get("Sky Texture")
                if sky_node_anim:
                    sky_node_anim.keyframe_insert(data_path="sun_elevation")
                    sky_node_anim.keyframe_insert(data_path="sun_rotation")

            t += step_min
            current_frame += 1

        scene.frame_start = 1
        scene.frame_end   = current_frame - 1
        scene.frame_set(1)

        # 5. Interpolation
        interpolation_type = props.anim_interpolation
        anim_targets = [sun_obj, sun_obj.data, scene.world.node_tree]

        for target in anim_targets:
            if not (target and hasattr(target, "animation_data") and target.animation_data):
                continue
            action = target.animation_data.action
            if not action:
                continue
            for layer in action.layers:
                for strip in layer.strips:
                    for slot in action.slots:
                        cb = strip.channelbag(slot)
                        if not cb:
                            continue
                        for fcurve in cb.fcurves:
                            for kp in fcurve.keyframe_points:
                                kp.interpolation = interpolation_type
                            fcurve.update()

        self.report({'INFO'}, f"Bake completed: {current_frame - 1} frames.")
        return {'FINISHED'}


# ---------------------------------------------------------------------------
# Operator: Clear Animation
# ---------------------------------------------------------------------------

class SUNSETUP_OT_clear_animation(bpy.types.Operator):
    bl_idname = "sunsetup.clear_animation"
    bl_label  = "Clear Animation"
    bl_description = "Remove all keyframes baked by Helio from sun object and world"
    bl_options = {'REGISTER', 'UNDO'}

    def execute(self, context):
        props = context.scene.sun_setup_props
        
        # Objects to clear
        targets = []
        if props.sun_object: 
            targets.append(props.sun_object)
            targets.append(props.sun_object.data)
        if context.scene.world: 
            targets.append(context.scene.world)
            if context.scene.world.node_tree:
                targets.append(context.scene.world.node_tree)
        
        # IMPORTANT: We also add the scene itself to clear the old "bad" exposure
        targets.append(context.scene)

        for obj in targets:
            if hasattr(obj, "animation_data") and obj.animation_data:
                obj.animation_data_clear()
        
        # Reset scene exposure to 0 (for safety, if any keys remain)
        context.scene.view_settings.exposure = 0.0
        
        # Return the scene to its current state according to the panel
        bpy.ops.sunsetup.apply()
        
        for area in context.screen.areas:
            area.tag_redraw()

        self.report({'INFO'}, "Animation cleared, scene exposure reset.")
        return {'FINISHED'}


# ---------------------------------------------------------------------------
# Operator: Apply
# ---------------------------------------------------------------------------

class SUNSETUP_OT_apply(bpy.types.Operator):
    bl_idname = "sunsetup.apply"
    bl_label  = "Apply"
    bl_description = "Apply settings"

    def execute(self, context):
        props = context.scene.sun_setup_props

        # --- GPS ---
        lat = props.latitude
        lon = props.longitude

        # --- Time ---
        year     = props.year
        month    = props.month
        day      = props.day
        hour     = props.hours
        minute   = props.minutes
        second   = props.seconds
        timezone = props.utczone
        altitude = props.altitude

        # Date validation
        try:
            datetime.date(props.year, props.month, props.day)
        except ValueError:
            self.report({'ERROR'}, f"Invalid date: {props.day}. {props.month}. {props.year}")
            return {'CANCELLED'}

        # Check manual/automatic UTC offset
        if props.utc_override: # manual
            effective_timezone = props.utczone
        else:
            auto_utc_offset = sun_calc.get_utc_offset(lat, lon, year, month, day, hour, minute, second) # automatic (calculated)
            # Fallback for manual settings if API call fails
            if auto_utc_offset is not None:
                effective_timezone = auto_utc_offset
            else:
                effective_timezone = props.utczone

        # Save UTC offset to props for display in the panel
        props.utc_display = effective_timezone

        utc_hour = hour + minute / 60 + second / 3600 - effective_timezone

        jd        = sun_calc.julian_date(year, month, day, utc_hour)
        n         = sun_calc.days_since_j2000(jd)
        decl      = sun_calc.solar_declination(n)
        doy       = sun_calc.day_of_year(year, month, day)
        tst       = sun_calc.true_solar_time(hour, minute, second, lon, effective_timezone, doy)
        ha        = sun_calc.hour_angle(tst)
        elevation = sun_calc.solar_elevation(lat, decl, ha)
        azimuth   = sun_calc.solar_azimuth(lat, decl, elevation, ha)

        # Atmospheric refraction
        if props.use_refraction:
            refraction = sun_calc.atmospheric_refraction(elevation)
        else:
            refraction = 0.0
        elevation_apparent = elevation + refraction

        # CCT, intensity and exposure correction
        cct      = sun_calc.elevation_to_cct(elevation_apparent)
        strength = sun_calc.elevation_to_strength(elevation_apparent, altitude)
        energy = strength * 1000.0  # kW/m² → W/m²
        exposure = sun_calc.elevation_to_exposure(elevation_apparent)

        # Sunrise and sunset times
        vychod_min, zapad_min = sun_calc.sunrise_sunset_utc(year, month, day, lat, lon)
        if vychod_min is not None:
            vychod_local = vychod_min + effective_timezone * 60
            zapad_local  = zapad_min  + effective_timezone * 60
            vh, vm, vs   = sun_calc.minutes_to_hms(vychod_local)
            zh, zm, zs   = sun_calc.minutes_to_hms(zapad_local)

            # Save to props for display in the panel
            props.sunrise_display = f"{vh:02d}:{vm:02d}:{vs:02d}"
            props.sunset_display  = f"{zh:02d}:{zm:02d}:{zs:02d}"
        else:
            props.sunrise_display = "--:--"
            props.sunset_display  = "--:--"

        # Environment Presets
        env = ENVIRONMENT_PRESETS.get(props.environment, ENVIRONMENT_PRESETS['CITY'])
        air      = env['air']
        aerosols = env['aerosols']
        ozone    = env['ozone']

        # Sky Texture setup
        sky_strength = sun_calc.elevation_to_sky_strength(elevation_apparent)
        sky_node = scene_module.setup_sky_texture(
            sky_model     = props.sky_model,
            elevation_rad = math.radians(elevation_apparent),
            rotation_rad  = math.radians(azimuth + props.north_offset),
            altitude      = altitude,
            sky_strength  = sky_strength,
            air           = air,
            aerosols      = aerosols,
            ozone         = ozone,
        )
        
        if sky_node:
            sky_node.sun_intensity = 0.0001 # very low intensity to ensure the sun disc is visible without affecting overall lighting too much

        # Sun light setup
        sun_obj = props.sun_object
        if sun_obj is None:
            self.report({'WARNING'}, "No sun light object selected.")
        else:
            scene_module.setup_sun_light(
                sun_obj            = sun_obj,
                elevation_apparent = elevation_apparent,
                azimuth            = azimuth,
                north_offset       = props.north_offset,
                cct                = cct,
                energy             = energy,
                exposure           = exposure,
            )

        scene_module.redraw_viewport()

        # --- Logging ---
        print("\n" + "=" * 55)
        print(" Helio - Calculate solar position and set up lighting")
        print("=" * 55)
        print(f"\n Input:")
        print(f"   GPS:       {lat:.6f}°, {lon:.6f}°")
        print(f"   Date:     {day}.{month}.{year}  {hour:02d}:{minute:02d}  UTC{effective_timezone:+.0f}")
        print(f"   Altitude:  {altitude:.0f} m")
        print(f"   Environment: {env['label']}")
        print(f"\n Output:")
        print(f"   Elevation: {elevation:.2f}°  (apparent: {elevation_apparent:.2f}°)")
        print(f"   Refraction: {refraction * 60:.2f}'  ({refraction:.4f}°)")
        print(f"   Azimuth:   {azimuth:.2f}°")
        print(f"   CCT:       {cct:.0f} K")
        print(f"   Intensity: {strength:.3f} kW/m²  ({energy:.0f} W/m²)")
        print(f"   Exposure:  {exposure:.2f}")
        
        if vychod_min is not None:
            print(f"   Sunrise:   {props.sunrise_display}")
            print(f"   Sunset:    {props.sunset_display}")
        else:
            print(f"   Sunrise/sunset: polar day or night")

        if sky_node:
            print(f"\n Sky Texture setup:")
            print(f"   Model:     {sky_node.sky_type}")
            print(f"   Elevation: {math.degrees(sky_node.sun_elevation):.2f}°")
            print(f"   Rotation:  {math.degrees(sky_node.sun_rotation):.2f}°")
            print(f"   Altitude:  {sky_node.altitude:.0f} m")
            print(f"   Air:       {sky_node.air_density:.2f}")
            print(f"   Aerosols:  {sky_node.aerosol_density:.2f}")
            print(f"   Ozone:     {sky_node.ozone_density:.2f}")
            print(f"   Strength:  {sky_strength:.3f}")

        if sun_obj:
            r = sun_obj.rotation_euler
            print(f"\n Sun light '{sun_obj.name}' setup:")
            print(f"   Rotation:  ({math.degrees(r.x):.1f}°, 0.0°, {math.degrees(r.z):.1f}°)")
            print(f"   Temperature: {sun_obj.data.temperature:.0f} K")
            print(f"   Energy:    {sun_obj.data.energy:.0f} W/m²")
        print("\n" + "=" * 55 + "\n")

        return {'FINISHED'}


# ---------------------------------------------------------------------------
# List of classes to register
# ---------------------------------------------------------------------------

classes = [
    SUNSETUP_OT_parse_gps,
    SUNSETUP_OT_today,
    SUNSETUP_OT_now,
    SUNSETUP_OT_apply,
    SUNSETUP_OT_bake_animation,
    SUNSETUP_OT_clear_animation,
]
