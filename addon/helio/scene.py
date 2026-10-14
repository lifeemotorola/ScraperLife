"""
scene.py
Scene manipulation — setting up Sky Texture and Sun light.
"""

import math
import bpy


# ---------------------------------------------------------------------------
# Sky Texture
# ---------------------------------------------------------------------------

def setup_sky_texture(
    sky_model:        str,
    elevation_rad:    float,
    rotation_rad:     float,
    altitude:         float,
    sky_strength:     float,
    air:              float,
    aerosols:         float,
    ozone:            float,
) -> bpy.types.Node | None:
    """
    Sets up the Sky Texture in the world shader node tree.

    If the node tree does not exist, it will be created. If the Sky Texture node
    does not exist, it will be added and connected to the Background node.

    Returns the sky_node or None on error.
    """
    scene = bpy.context.scene

    # Ensure a World object exists
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")

    world = scene.world

    if world.node_tree is None:
        world.use_nodes = True

    node_tree = world.node_tree
    nodes     = node_tree.nodes
    links     = node_tree.links

    # Find or create the Sky Texture node
    sky_node = nodes.get("Sky Texture")
    if sky_node is None:
        sky_node          = nodes.new(type='ShaderNodeTexSky')
        sky_node.name     = "Sky Texture"
        sky_node.location = (-300, 0)

        bg_node = nodes.get("Background")
        if bg_node:
            links.new(sky_node.outputs["Color"], bg_node.inputs["Color"])

    # Set Background strength
    bg_node = nodes.get("Background")
    if bg_node:
        bg_node.inputs[1].default_value = sky_strength

    # Set Sky Texture parameters
    sky_node.sky_type      = sky_model
    sky_node.sun_elevation = elevation_rad
    sky_node.sun_rotation  = rotation_rad
    sky_node.altitude      = altitude
    sky_node.air_density     = air
    sky_node.aerosol_density = aerosols
    sky_node.ozone_density   = ozone

    return sky_node


# ---------------------------------------------------------------------------
# Sun light
# ---------------------------------------------------------------------------

def setup_sun_light(
    sun_obj:            bpy.types.Object,
    elevation_apparent: float,
    azimuth:            float,
    north_offset:       float,
    cct:                float,
    energy:             float,
    exposure:           float,
) -> None:
    """
    Sets up the rotation, color temperature, and intensity of the Sun light object.

    Parameters:
        sun_obj:            Object of type LIGHT/SUN
        elevation_apparent: Apparent elevation in degrees
        azimuth:            Azimuth in degrees (0° = North, 90° = East)
        north_offset:       North offset in degrees
        cct:                Correlated Color Temperature in Kelvin
        energy:             Intensity in W/m²
        exposure:           Exposure compensation
    """
    rot_x = math.radians(90.0 - elevation_apparent)
    rot_z = math.radians(180.0 - azimuth - north_offset)

    sun_obj.rotation_euler       = (rot_x, 0.0, rot_z)
    sun_obj.data.use_temperature = True
    sun_obj.data.temperature     = cct
    sun_obj.data.energy          = energy
    sun_obj.data.exposure        = exposure


# ---------------------------------------------------------------------------
# Redraw Viewport
# ---------------------------------------------------------------------------

def redraw_viewport() -> None:
    """Redraws all areas of the viewport."""
    for area in bpy.context.screen.areas:
        area.tag_redraw()


import gpu
from gpu_extras.batch import batch_for_shader

_north_handler = None

def _draw_north_indicator():
    """Draws a north indicator in the viewport."""
    props = bpy.context.scene.sun_setup_props
    if not props.show_north:
        return

    angle = math.radians(props.north_offset)
    length = 100.0

    # North direction — Y-axis rotated by north_offset
    dx = math.sin(angle) * length
    dy = math.cos(angle) * length

    # Line points
    tip   = (dx, dy, 0.0)
    base  = (0.0, 0.0, 0.0)


    coords = [
        base, tip,
    ]

    shader = gpu.shader.from_builtin('UNIFORM_COLOR')
    batch  = batch_for_shader(shader, 'LINES', {"pos": coords})

    gpu.state.line_width_set(2.5)
    shader.bind()
    shader.uniform_float("color", (0.0, 1.0, 0.5, 1.0))  # Bright green
    batch.draw(shader)
    gpu.state.line_width_set(1.0)


def register_north_handler():
    global _north_handler
    if _north_handler is None:
        _north_handler = bpy.types.SpaceView3D.draw_handler_add(
            _draw_north_indicator, (), 'WINDOW', 'POST_VIEW'
        )


def unregister_north_handler():
    global _north_handler
    if _north_handler is not None:
        bpy.types.SpaceView3D.draw_handler_remove(_north_handler, 'WINDOW')
        _north_handler = None