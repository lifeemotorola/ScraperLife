"""
presets.py
Presets for the Sky Texture.

Values for Air, Aerosols and Ozone are empirical approximations based on
qualitative differences in atmospheric composition according to the environment type

Default values for Blender (1.0) correspond to urban environments.

Only CITY preset corresponds to the default Blender setup.
Other presets are visual approximations without claim to physical accuracy.
"""

ENVIRONMENT_PRESETS = {
    'CITY': {
        'label':    "City",
        'air':      1.0,
        'aerosols': 1.0,
        'ozone':    1.0,
    },
    'COUNTRYSIDE': {
        'label':    "Countryside",
        'air':      1.0,
        'aerosols': 0.3,
        'ozone':    1.0,
    },
    'MOUNTAINS': {
        'label':    "Mountains",
        'air':      0.7,
        'aerosols': 0.1,
        'ozone':    0.8,
    },
    'DESERT': {
        'label':    "Desert",
        'air':      1.0,
        'aerosols': 1.5,
        'ozone':    0.8,
    },
    'COAST': {
        'label':    "Coast",
        'air':      1.0,
        'aerosols': 0.5,
        'ozone':    1.1,
    },
}

# Enum items for Blender EnumProperty
ENVIRONMENT_ENUM_ITEMS = [
    (key, preset['label'], "")
    for key, preset in ENVIRONMENT_PRESETS.items()
]
