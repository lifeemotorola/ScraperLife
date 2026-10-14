"""
Helio — Sun & Sky in Perfect Balance.
Addon for automatic lighting of the scene in Blender.

Calculates the position of the Sun based on GPS coordinates, date and time
according to the NOAA Solar Calculator and sets up the Sky Texture
and Sun light including color temperature and intensity.

Author: Michal Dolanský
Version: 1.1.1
Blender: 5.0+
"""


import bpy
from bpy.props import PointerProperty

from . import sun_calc   # noqa: F401
from . import scene      # noqa: F401
from . import presets    # noqa: F401
from . import operators
from . import panel


# ---------------------------------------------------------------------------
# Register
# ---------------------------------------------------------------------------

def register():
    # Registration of panels and properties
    for cls in panel.classes:
        bpy.utils.register_class(cls)

    # Registration of operators
    for cls in operators.classes:
        bpy.utils.register_class(cls)

    # Addition of properties to the scene
    bpy.types.Scene.sun_setup_props = PointerProperty(type=panel.SunSetupProperties)

    from . import scene
    scene.register_north_handler()


def unregister():
    # Removal of properties from the scene
    del bpy.types.Scene.sun_setup_props

    # Removal of operators
    for cls in reversed(operators.classes):
        bpy.utils.unregister_class(cls)

    # Removal of panels and properties
    for cls in reversed(panel.classes):
        bpy.utils.unregister_class(cls)

    scene.unregister_north_handler()


if __name__ == "__main__":
    register()
