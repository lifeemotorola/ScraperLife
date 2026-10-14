"""
panel.py
UI panel and properties for the Sun Setup addon.
"""

import bpy
import datetime
from bpy.props import (
    PointerProperty, BoolProperty, EnumProperty,
    StringProperty, FloatProperty, IntProperty,
)
from bpy.types import PropertyGroup

from .presets import ENVIRONMENT_ENUM_ITEMS

# Global factor for aligning labels
FACTOR = 0.4


def _redraw_all(context):
    for area in context.screen.areas:
        area.tag_redraw()

# ---------------------------------------------------------------------------
# Properties
# ---------------------------------------------------------------------------

class SunSetupProperties(PropertyGroup):

    sun_object: PointerProperty(
        name="Sun Object",
        description="Select an object of type Sun light",
        type=bpy.types.Object,
        poll=lambda self, obj: obj.type == 'LIGHT' and obj.data.type == 'SUN',
    )

    sky_model: EnumProperty(
        name="Sky Model",
        description="Select a sky model for the Sky Texture",
        items=[
            ('MULTIPLE_SCATTERING', "Multiple Scattering", "More accurate model, recommended"),
            ('SINGLE_SCATTERING',   "Single Scattering",   "Original Nishita model"),
        ],
        default='MULTIPLE_SCATTERING',
    )

    environment: EnumProperty(
        name="Environment",
        description="Preset for the environment affecting the Sky Texture parameters",
        items=ENVIRONMENT_ENUM_ITEMS,
        default='CITY',
    )

    show_north: BoolProperty(
        name="North",
        description="Show north indicator in the viewport",
        default=False,
        update=lambda self, context: _redraw_all(context),
    )

    use_refraction: BoolProperty(
        name="Refraction",
        description="Enable atmospheric refraction for accurate sunrise and sunset calculations",
        default=True,
    )

    north_offset: FloatProperty(
        name="North Offset",
        description="Offset of the scene's north from true north in degrees",
        default=0.0,
        min=-360.0,
        max=360.0,
        step=10,
        precision=2,
        update=lambda self, context: _redraw_all(context),
)

    # --- Location ---

    gps_string: StringProperty(
        name="GPS",
        default='0.000000, 0.000000',
        description="GPS coordinates in the format: 50.087500, 14.421111 or 50°05'15.0\"N 14°25'16.0\"E",
    )

    latitude: FloatProperty(
        name="Latitude",
        default=0.0,
        min=-90.0,
        max=90.0,
        precision=6,
    )

    longitude: FloatProperty(
        name="Longitude",
        default=0.0,
        min=-180.0,
        max=180.0,
        precision=6,
    )

    altitude: FloatProperty(
        name="Altitude",
        default=0.0,
        min=0.0,
        step=100,
        subtype='DISTANCE',
        unit='LENGTH',
    )

    # --- Time ---

    day: IntProperty(
        name="Day",
        default=datetime.datetime.now().day,
        min=1,
        max=31,
    )

    month: IntProperty(
        name="Month",
        default=datetime.datetime.now().month,
        min=1,
        max=12,
    )

    year: IntProperty(
        name="Year",
        default=datetime.datetime.now().year,
        min=1901,
        max=2099,
    )

    hours: IntProperty(
        name="Hours",
        default=12,
        min=0,
        max=23,
    )

    minutes: IntProperty(
        name="Minutes",
        default=0,
        min=0,
        max=59,
    )

    seconds: IntProperty(
        name="Seconds",
        default=0,
        min=0,
        max=59,
    )

    utc_override: BoolProperty(
        name="",
        description='Overwrite UTC Zone',
        default=False,
    )

    utczone: FloatProperty(
        name="UTC Zone",
        default=0.0,
        min=-12.0,
        max=14.0,
        precision=1,
        step=100,
    )

    utc_display: FloatProperty(
        name="UTC Display",
        default=0.0,
    )


    # --- Output Values (for display only) ---
    sunrise_display: StringProperty(
        name="Sunrise",
        default="--:--",
    )

    sunset_display: StringProperty(
        name="Sunset",
        default="--:--",
    )


    # --- Animation ---
    anim_from_h: IntProperty(name="From H", default=6, min=0, max=23)
    anim_from_m: IntProperty(name="From M", default=0, min=0, max=59)
    anim_from_s: IntProperty(name="From S", default=0, min=0, max=59)

    anim_to_h: IntProperty(name="To H", default=20, min=0, max=23)
    anim_to_m: IntProperty(name="To M", default=0, min=0, max=59)
    anim_to_s: IntProperty(name="To S", default=0, min=0, max=59)

    anim_step: IntProperty(
        name="Step (min)",
        description="Interval between frames in minutes",
        default=1,
        min=1,
        max=1439,
    )

    anim_interpolation: bpy.props.EnumProperty(
        name="Interpolation",
        description="Type of interpolation between keyframes",
        items=[
            ('LINEAR', "Linear", "Uniform motion (mathematically most accurate)"),
            ('CONSTANT', "Constant", "Step changes (suitable for comparison with photos)"),
            ('BEZIER', "Bezier", "Smooth, rounded motion (aesthetic)"),
        ],
        default='LINEAR'
    )


# ---------------------------------------------------------------------------
# Panel — Sun Setup (main)
# ---------------------------------------------------------------------------

class SUNSETUP_PT_main(bpy.types.Panel):
    bl_label       = "Setup"
    bl_idname      = "SUNSETUP_PT_main"
    bl_space_type  = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category    = "Helio"

    def draw(self, context):
        layout = self.layout
        props  = context.scene.sun_setup_props

        # Sun Object
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Sun Object")
        split.prop(props, "sun_object", text="", icon='LIGHT_SUN')

        # Sky Model
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Sky Model")
        split.prop(props, "sky_model", text="", icon='OUTLINER_DATA_VOLUME')

        # Environment
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Environment")
        split.prop(props, "environment", text="", icon='WORLD')

        # Refraction
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Use")
        split.prop(props, "use_refraction")

        layout.separator()

        # Show North
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Show")
        split.prop(props, "show_north")

        # North Offset
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="North Offset (°)")
        split.prop(props, "north_offset", text="")


# ---------------------------------------------------------------------------
# Panel — Location
# ---------------------------------------------------------------------------

class SUNSETUP_PT_location(bpy.types.Panel):
    bl_label       = "Location"
    bl_idname      = "SUNSETUP_PT_location"
    bl_space_type  = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category    = "Helio"
    bl_parent_id   = "SUNSETUP_PT_main"
    bl_options     = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        props  = context.scene.sun_setup_props

        # GPS — button opens dialog for pasting coordinates
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="GPS")
        row = split.row(align=True)
        row.operator("sunsetup.parse_gps", text=props.gps_string or "Paste GPS...", icon='WORLD')

        layout.separator()

        # Latitude
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Latitude")
        split.prop(props, "latitude", text="")

        # Longitude
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Longitude")
        split.prop(props, "longitude", text="")

        # Altitude
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Altitude")
        split.prop(props, "altitude", text="")


# ---------------------------------------------------------------------------
# Panel — Time
# ---------------------------------------------------------------------------

class SUNSETUP_PT_time(bpy.types.Panel):
    bl_label       = "Time"
    bl_idname      = "SUNSETUP_PT_time"
    bl_space_type  = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category    = "Helio"
    bl_parent_id   = "SUNSETUP_PT_main"
    bl_options     = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        props  = context.scene.sun_setup_props

        # Date
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Day")
        split.prop(props, "day", text="")

        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Month")
        split.prop(props, "month", text="")

        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Year")
        split.prop(props, "year", text="")

        split = layout.split(factor=FACTOR)
        split.label(text="")
        split.operator("sunsetup.today", text="Today")

        layout.separator()

        # Time
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Hours")
        split.prop(props, "hours", text="")

        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Minutes")
        split.prop(props, "minutes", text="")

        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Seconds")
        split.prop(props, "seconds", text="")

        split = layout.split(factor=FACTOR)
        split.label(text="")
        split.operator("sunsetup.now", text="Now")

        layout.separator()

        # UTC Zone
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Set UTC Zone")

        row = split.row(align=True)
        row.prop(props, "utc_override", text="")

        sub = row.row(align=True)
        sub.enabled = props.utc_override
        sub.prop(props, "utczone", text="")

        layout.separator()

        # Show Local / UTC
        utc_h = props.hours - int(props.utc_display)
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Local")
        split.alignment = 'LEFT'
        split.label(text=f"{props.hours:02d}:{props.minutes:02d}:{props.seconds:02d}")
        
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="UTC Zone")
        split.alignment = 'LEFT'
        if props.utc_override:
            split.label(text=f"UTC{props.utczone:+.0f} (manual)")
        else:
            split.label(text=f"UTC{props.utc_display:+.0f} (auto)")

        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="UTC")
        split.alignment = 'LEFT'
        split.label(text=f"{utc_h % 24:02d}:{props.minutes:02d}:{props.seconds:02d}")

        layout.separator()

        # Sunrise / Sunset (after Apply)
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Local Sunrise")
        split.alignment = 'LEFT'
        split.label(text=props.sunrise_display)

        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Local Sunset")
        split.alignment = 'LEFT'
        split.label(text=props.sunset_display)

# ---------------------------------------------------------------------------
# Panel — Animation
# ---------------------------------------------------------------------------

class SUNSETUP_PT_animation(bpy.types.Panel):
    bl_label       = "Animation"
    bl_idname      = "SUNSETUP_PT_animation"
    bl_space_type  = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category    = "Helio"
    bl_parent_id   = "SUNSETUP_PT_main"
    bl_options     = {'DEFAULT_CLOSED'}

    def draw(self, context):
        layout = self.layout
        props  = context.scene.sun_setup_props

        # From (H:M:S)
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="From (H:M:S)")
        row = split.row(align=True)
        row.prop(props, "anim_from_h", text="")
        row.prop(props, "anim_from_m", text="")
        row.prop(props, "anim_from_s", text="")

        # To (H:M:S)
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="To (H:M:S)")
        row = split.row(align=True)
        row.prop(props, "anim_to_h", text="")
        row.prop(props, "anim_to_m", text="")
        row.prop(props, "anim_to_s", text="")

        # Step (min)
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Step (min)")
        split.prop(props, "anim_step", text="")

        # Interpolation
        split = layout.split(factor=FACTOR)
        split.alignment = 'RIGHT'
        split.label(text="Interpolation")
        split.prop(props, "anim_interpolation", text="")

        # Bake / Clear buttons
        layout.separator()
        layout.operator("sunsetup.bake_animation", text="Bake Animation", icon='RENDER_ANIMATION')
        layout.operator("sunsetup.clear_animation", text="Clear Animation", icon='TRASH')


# ---------------------------------------------------------------------------
# Panel — Apply (bez header, always visible)
# ---------------------------------------------------------------------------

class SUNSETUP_PT_apply(bpy.types.Panel):
    bl_label       = ""
    bl_idname      = "SUNSETUP_PT_apply"
    bl_space_type  = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category    = "Helio"
    bl_parent_id   = "SUNSETUP_PT_main"
    bl_options     = {'HIDE_HEADER'}

    def draw(self, context):
        self.layout.operator("sunsetup.apply", text="Apply", icon='CHECKMARK')


# ---------------------------------------------------------------------------
# List of classes for registration
# ---------------------------------------------------------------------------

classes = [
    SunSetupProperties,
    SUNSETUP_PT_main,
    SUNSETUP_PT_location,
    SUNSETUP_PT_time,
    SUNSETUP_PT_animation,
    SUNSETUP_PT_apply,
]
