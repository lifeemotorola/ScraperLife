from . import custom_gizmos, icons, place_tool, transform_tool, dynamic_place_tool, preferences, localdb, dynamic_place, \
    scatter_tool, help_overlay


def register():
    preferences.register()
    icons.register()
    help_overlay.register()
    custom_gizmos.register()
    place_tool.register()
    transform_tool.register()
    dynamic_place_tool.register()
    dynamic_place.register()
    scatter_tool.register()
    localdb.register()


def unregister():
    localdb.unregister()
    scatter_tool.unregister()
    dynamic_place_tool.unregister()
    dynamic_place.unregister()
    transform_tool.unregister()
    place_tool.unregister()
    custom_gizmos.unregister()
    help_overlay.unregister()
    icons.unregister()
    preferences.unregister()
