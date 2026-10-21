bl_info = {
    "name": "Advanced House Builder",
    "author": "Suahco4",
    "version": (1, 5, 0),
    "blender": (4, 2, 0),
    "location": "View3D > Sidebar > House Builder",
    "description": "Parametric multi-storey houses with real openings and editable meshes",
    "category": "Add Mesh",
}

import bpy
import math
import uuid
import hashlib
import time
from types import SimpleNamespace
from bpy.props import BoolProperty, EnumProperty, FloatProperty, IntProperty, PointerProperty, StringProperty
from mathutils import Matrix, Vector

TAG = "ahb_house_id"


# Stable catalogue IDs are saved on each house.
HOUSE_STYLES = [{'id': 'H01',
  'name': 'Monrovia Starter',
  'family': 'Compact Hip Bungalows',
  'settings': {'width': 8.0,
               'depth': 8.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.55,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 2,
               'window_width': 1.05,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.4,
               'veranda_width': 0.6,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': True,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H02',
  'name': 'Paynesville Compact',
  'family': 'Compact Hip Bungalows',
  'settings': {'width': 9.25,
               'depth': 9.1,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.61,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 3,
               'window_width': 1.17,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.55,
               'veranda_width': 0.6,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': True,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H03',
  'name': 'Brewerville Family',
  'family': 'Compact Hip Bungalows',
  'settings': {'width': 10.5,
               'depth': 10.2,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.67,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 4,
               'window_width': 1.29,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.6999999999999997,
               'veranda_width': 0.6,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': True,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H04',
  'name': 'Gardnersville Raised',
  'family': 'Compact Hip Bungalows',
  'settings': {'width': 11.75,
               'depth': 8.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.73,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 2,
               'window_width': 1.4100000000000001,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.8499999999999996,
               'veranda_width': 0.6,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': True,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H05',
  'name': 'Kakata Wide Eaves',
  'family': 'Compact Hip Bungalows',
  'settings': {'width': 13.0,
               'depth': 9.1,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.79,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 3,
               'window_width': 1.53,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 3.0,
               'veranda_width': 0.6,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': True,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H06',
  'name': 'Sinkor Veranda',
  'family': 'Full Veranda Bungalows',
  'settings': {'width': 10.0,
               'depth': 9.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.55,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 2,
               'window_width': 1.05,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.4,
               'veranda_width': 1.0,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': True,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H07',
  'name': 'Robertsfield Porch',
  'family': 'Full Veranda Bungalows',
  'settings': {'width': 11.25,
               'depth': 10.1,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.61,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 3,
               'window_width': 1.17,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.55,
               'veranda_width': 1.0,
               'porch_columns': 4,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': True,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H08',
  'name': 'Gbarnga Family Veranda',
  'family': 'Full Veranda Bungalows',
  'settings': {'width': 12.5,
               'depth': 11.2,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.67,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 4,
               'window_width': 1.29,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.6999999999999997,
               'veranda_width': 1.0,
               'porch_columns': 5,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': True,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H09',
  'name': 'Buchanan Long Porch',
  'family': 'Full Veranda Bungalows',
  'settings': {'width': 13.75,
               'depth': 9.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.73,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 2,
               'window_width': 1.4100000000000001,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.8499999999999996,
               'veranda_width': 1.0,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': True,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H10',
  'name': 'Harper Grand Veranda',
  'family': 'Full Veranda Bungalows',
  'settings': {'width': 15.0,
               'depth': 10.1,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.79,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 3,
               'window_width': 1.53,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 3.0,
               'veranda_width': 1.0,
               'porch_columns': 4,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': True,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H11',
  'name': 'Robertsport Breeze',
  'family': 'Coastal Bungalows',
  'settings': {'width': 9.0,
               'depth': 8.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.85,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 1.0,
               'windows_front': 3,
               'windows_side': 2,
               'window_width': 1.05,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'COASTAL',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.4,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H12',
  'name': 'Marshall Coast',
  'family': 'Coastal Bungalows',
  'settings': {'width': 10.25,
               'depth': 9.1,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.91,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 1.0,
               'windows_front': 3,
               'windows_side': 3,
               'window_width': 1.17,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'COASTAL',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.55,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H13',
  'name': 'Buchanan Seaside',
  'family': 'Coastal Bungalows',
  'settings': {'width': 11.5,
               'depth': 10.2,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.97,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 1.0,
               'windows_front': 3,
               'windows_side': 4,
               'window_width': 1.29,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'COASTAL',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.6999999999999997,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H14',
  'name': 'Greenville Coastal',
  'family': 'Coastal Bungalows',
  'settings': {'width': 12.75,
               'depth': 8.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 1.03,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 1.0,
               'windows_front': 4,
               'windows_side': 2,
               'window_width': 1.4100000000000001,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'COASTAL',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.8499999999999996,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H15',
  'name': 'Harper Raised Coast',
  'family': 'Coastal Bungalows',
  'settings': {'width': 14.0,
               'depth': 9.1,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 1.09,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 1.0,
               'windows_front': 4,
               'windows_side': 3,
               'window_width': 1.53,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'COASTAL',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 3.0,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H16',
  'name': 'Sinkor Column Villa',
  'family': 'Classical Villas',
  'settings': {'width': 11.0,
               'depth': 10.0,
               'floors': 2,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.55,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 2,
               'window_width': 1.05,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 3.0,
               'veranda_width': 0.72,
               'porch_columns': 4,
               'column_size': 0.4,
               'column_style': 'CLASSICAL',
               'porch_arches': True,
               'railings': True,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H17',
  'name': 'Paynesville Balcony Villa',
  'family': 'Classical Villas',
  'settings': {'width': 12.25,
               'depth': 11.1,
               'floors': 2,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.61,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 3,
               'window_width': 1.17,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 3.15,
               'veranda_width': 0.72,
               'porch_columns': 4,
               'column_size': 0.4,
               'column_style': 'CLASSICAL',
               'porch_arches': True,
               'railings': True,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H18',
  'name': 'Monrovia Classical',
  'family': 'Classical Villas',
  'settings': {'width': 13.5,
               'depth': 12.2,
               'floors': 2,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.67,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 4,
               'window_width': 1.29,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 3.3,
               'veranda_width': 0.72,
               'porch_columns': 4,
               'column_size': 0.4,
               'column_style': 'CLASSICAL',
               'porch_arches': True,
               'railings': True,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H19',
  'name': 'Brewerville Grand Villa',
  'family': 'Classical Villas',
  'settings': {'width': 14.75,
               'depth': 10.0,
               'floors': 2,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.73,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 2,
               'window_width': 1.4100000000000001,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 3.4,
               'veranda_width': 0.72,
               'porch_columns': 4,
               'column_size': 0.4,
               'column_style': 'CLASSICAL',
               'porch_arches': True,
               'railings': True,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H20',
  'name': 'Montserrado Residence',
  'family': 'Classical Villas',
  'settings': {'width': 16.0,
               'depth': 11.1,
               'floors': 2,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.79,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 3,
               'window_width': 1.53,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 3.4,
               'veranda_width': 0.72,
               'porch_columns': 4,
               'column_size': 0.4,
               'column_style': 'CLASSICAL',
               'porch_arches': True,
               'railings': True,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H21',
  'name': 'Capital Modern',
  'family': 'Modern Flat Roofs',
  'settings': {'width': 8.0,
               'depth': 9.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.55,
               'roof_style': 'FLAT',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 2,
               'window_width': 1.05,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'MODERN',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': False,
               'veranda_depth': 2.4,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H22',
  'name': 'Congo Town Terrace',
  'family': 'Modern Flat Roofs',
  'settings': {'width': 9.25,
               'depth': 10.1,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.61,
               'roof_style': 'FLAT',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 3,
               'window_width': 1.17,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'MODERN',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': False,
               'veranda_depth': 2.55,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H23',
  'name': 'Urban Parapet',
  'family': 'Modern Flat Roofs',
  'settings': {'width': 10.5,
               'depth': 11.2,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.67,
               'roof_style': 'FLAT',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 4,
               'window_width': 1.29,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'MODERN',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': False,
               'veranda_depth': 2.6999999999999997,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H24',
  'name': 'Minimal Family Home',
  'family': 'Modern Flat Roofs',
  'settings': {'width': 11.75,
               'depth': 9.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.73,
               'roof_style': 'FLAT',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 2,
               'window_width': 1.4100000000000001,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'MODERN',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': False,
               'veranda_depth': 2.8499999999999996,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H25',
  'name': 'Modern Tall Residence',
  'family': 'Modern Flat Roofs',
  'settings': {'width': 13.0,
               'depth': 10.1,
               'floors': 2,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.79,
               'roof_style': 'FLAT',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 3,
               'window_width': 1.53,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'MODERN',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': False,
               'veranda_depth': 3.0,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H26',
  'name': 'Tropical Shed Compact',
  'family': 'Shed Roof Homes',
  'settings': {'width': 8.0,
               'depth': 8.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.55,
               'roof_style': 'SHED',
               'roof_pitch': 12.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 2,
               'window_width': 1.05,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'MODERN',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.4,
               'veranda_width': 0.6,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H27',
  'name': 'Garden Mono Pitch',
  'family': 'Shed Roof Homes',
  'settings': {'width': 9.25,
               'depth': 9.1,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.61,
               'roof_style': 'SHED',
               'roof_pitch': 12.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 3,
               'window_width': 1.17,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'MODERN',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.55,
               'veranda_width': 0.6,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H28',
  'name': 'Raised Shed Home',
  'family': 'Shed Roof Homes',
  'settings': {'width': 10.5,
               'depth': 10.2,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.67,
               'roof_style': 'SHED',
               'roof_pitch': 12.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 4,
               'window_width': 1.29,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'MODERN',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.6999999999999997,
               'veranda_width': 0.6,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H29',
  'name': 'Wide Mono Pitch',
  'family': 'Shed Roof Homes',
  'settings': {'width': 11.75,
               'depth': 8.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.73,
               'roof_style': 'SHED',
               'roof_pitch': 12.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 2,
               'window_width': 1.4100000000000001,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'MODERN',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.8499999999999996,
               'veranda_width': 0.6,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H30',
  'name': 'Two Level Shed',
  'family': 'Shed Roof Homes',
  'settings': {'width': 13.0,
               'depth': 9.1,
               'floors': 2,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.79,
               'roof_style': 'SHED',
               'roof_pitch': 12.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 3,
               'window_width': 1.53,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'MODERN',
               'surface': 'PLASTER',
               'roof_surface': 'METAL',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 3.0,
               'veranda_width': 0.6,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H31',
  'name': 'Gable Starter',
  'family': 'Gable Cottages',
  'settings': {'width': 7.0,
               'depth': 8.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.55,
               'roof_style': 'GABLE',
               'roof_pitch': 35.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 2,
               'window_width': 1.05,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.4,
               'veranda_width': 0.65,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H32',
  'name': 'Garden Gable',
  'family': 'Gable Cottages',
  'settings': {'width': 8.25,
               'depth': 9.1,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.61,
               'roof_style': 'GABLE',
               'roof_pitch': 35.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 3,
               'window_width': 1.17,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.55,
               'veranda_width': 0.65,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H33',
  'name': 'Country Cottage',
  'family': 'Gable Cottages',
  'settings': {'width': 9.5,
               'depth': 10.2,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.67,
               'roof_style': 'GABLE',
               'roof_pitch': 35.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 4,
               'window_width': 1.29,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.6999999999999997,
               'veranda_width': 0.65,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H34',
  'name': 'Wide Gable Cottage',
  'family': 'Gable Cottages',
  'settings': {'width': 10.75,
               'depth': 8.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.73,
               'roof_style': 'GABLE',
               'roof_pitch': 35.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 2,
               'window_width': 1.4100000000000001,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.8499999999999996,
               'veranda_width': 0.65,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H35',
  'name': 'Two Storey Gable',
  'family': 'Gable Cottages',
  'settings': {'width': 12.0,
               'depth': 9.1,
               'floors': 2,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.79,
               'roof_style': 'GABLE',
               'roof_pitch': 35.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 3,
               'window_width': 1.53,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 3.0,
               'veranda_width': 0.65,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H36',
  'name': 'Brick Compact',
  'family': 'Brick Residences',
  'settings': {'width': 8.0,
               'depth': 9.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.55,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 2,
               'window_width': 1.05,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'BRICK',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.4,
               'veranda_width': 0.8,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H37',
  'name': 'Brick Family',
  'family': 'Brick Residences',
  'settings': {'width': 9.25,
               'depth': 10.1,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.61,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 3,
               'window_width': 1.17,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'BRICK',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.55,
               'veranda_width': 0.8,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H38',
  'name': 'Brick Veranda',
  'family': 'Brick Residences',
  'settings': {'width': 10.5,
               'depth': 11.2,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.67,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 4,
               'window_width': 1.29,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'BRICK',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.6999999999999997,
               'veranda_width': 0.8,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H39',
  'name': 'Brick Town Residence',
  'family': 'Brick Residences',
  'settings': {'width': 11.75,
               'depth': 9.0,
               'floors': 2,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.73,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 2,
               'window_width': 1.4100000000000001,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'BRICK',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.8499999999999996,
               'veranda_width': 0.8,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H40',
  'name': 'Brick Balcony Home',
  'family': 'Brick Residences',
  'settings': {'width': 13.0,
               'depth': 10.1,
               'floors': 2,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.79,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 3,
               'window_width': 1.53,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'BRICK',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 3.0,
               'veranda_width': 0.8,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': False,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H41',
  'name': 'Duplex Veranda Massing',
  'family': 'Multi Storey Tropical',
  'settings': {'width': 10.0,
               'depth': 10.0,
               'floors': 2,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.55,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 2,
               'window_width': 1.05,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.4,
               'veranda_width': 0.7,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': True,
               'railings': True,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H42',
  'name': 'Two Storey Tropical',
  'family': 'Multi Storey Tropical',
  'settings': {'width': 11.25,
               'depth': 11.1,
               'floors': 2,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.61,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 3,
               'window_width': 1.17,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.55,
               'veranda_width': 0.7,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': True,
               'railings': True,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H43',
  'name': 'Three Storey Tropical',
  'family': 'Multi Storey Tropical',
  'settings': {'width': 12.5,
               'depth': 12.2,
               'floors': 3,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.67,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 4,
               'window_width': 1.29,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.6999999999999997,
               'veranda_width': 0.7,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': True,
               'railings': True,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H44',
  'name': 'Columned Three Storey',
  'family': 'Multi Storey Tropical',
  'settings': {'width': 13.75,
               'depth': 10.0,
               'floors': 3,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.73,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 2,
               'window_width': 1.4100000000000001,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.8499999999999996,
               'veranda_width': 0.7,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'CLASSICAL',
               'porch_arches': True,
               'railings': True,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H45',
  'name': 'Urban Four Storey',
  'family': 'Multi Storey Tropical',
  'settings': {'width': 15.0,
               'depth': 11.1,
               'floors': 4,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.79,
               'roof_style': 'HIP',
               'roof_pitch': 28.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 3,
               'window_width': 1.53,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'PLASTER',
               'roof_surface': 'TILE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 3.0,
               'veranda_width': 0.7,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': True,
               'railings': True,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H46',
  'name': 'Timber Cabin',
  'family': 'Timber Retreats',
  'settings': {'width': 7.0,
               'depth': 8.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.55,
               'roof_style': 'GABLE',
               'roof_pitch': 32.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 2,
               'window_width': 1.05,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'TIMBER',
               'roof_surface': 'SHINGLE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.4,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H47',
  'name': 'Raised Timber Retreat',
  'family': 'Timber Retreats',
  'settings': {'width': 8.25,
               'depth': 9.1,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.61,
               'roof_style': 'GABLE',
               'roof_pitch': 32.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 3,
               'window_width': 1.17,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'TIMBER',
               'roof_surface': 'SHINGLE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.55,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H48',
  'name': 'Timber Porch Home',
  'family': 'Timber Retreats',
  'settings': {'width': 9.5,
               'depth': 10.2,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.67,
               'roof_style': 'GABLE',
               'roof_pitch': 32.0,
               'overhang': 0.65,
               'windows_front': 3,
               'windows_side': 4,
               'window_width': 1.29,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'TIMBER',
               'roof_surface': 'SHINGLE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.6999999999999997,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H49',
  'name': 'Wide Timber Lodge',
  'family': 'Timber Retreats',
  'settings': {'width': 10.75,
               'depth': 8.0,
               'floors': 1,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.73,
               'roof_style': 'GABLE',
               'roof_pitch': 32.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 2,
               'window_width': 1.4100000000000001,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'TIMBER',
               'roof_surface': 'SHINGLE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 2.8499999999999996,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': True,
               'balcony': False,
               'security_bars': True,
               'belt_courses': True}},
 {'id': 'H50',
  'name': 'Two Level Timber',
  'family': 'Timber Retreats',
  'settings': {'width': 12.0,
               'depth': 9.1,
               'floors': 2,
               'floor_height': 3.2,
               'wall_thickness': 0.22,
               'slab': 0.18,
               'foundation': 0.79,
               'roof_style': 'GABLE',
               'roof_pitch': 32.0,
               'overhang': 0.65,
               'windows_front': 4,
               'windows_side': 3,
               'window_width': 1.53,
               'window_height': 1.35,
               'sill_height': 0.9,
               'door_width': 1.1,
               'door_height': 2.2,
               'steps': True,
               'ground': True,
               'bevel': 0.012,
               'style': 'WARM',
               'surface': 'TIMBER',
               'roof_surface': 'SHINGLE',
               'texture_scale': 1.0,
               'veranda_enabled': True,
               'veranda_depth': 3.0,
               'veranda_width': 0.72,
               'porch_columns': 3,
               'column_size': 0.34,
               'column_style': 'SQUARE',
               'porch_arches': False,
               'railings': True,
               'balcony': True,
               'security_bars': True,
               'belt_courses': True}}]
TEXTURE_STYLES = [{'id': 'T001', 'name': 'Brick — Fired Red', 'kind': 'BRICK', 'color': (0.48, 0.12, 0.055)},
 {'id': 'T002', 'name': 'Brick — Rust', 'kind': 'BRICK', 'color': (0.38, 0.095, 0.04)},
 {'id': 'T003', 'name': 'Brick — Terracotta', 'kind': 'BRICK', 'color': (0.6, 0.24, 0.12)},
 {'id': 'T004', 'name': 'Brick — Chocolate', 'kind': 'BRICK', 'color': (0.19, 0.085, 0.045)},
 {'id': 'T005', 'name': 'Brick — Buff', 'kind': 'BRICK', 'color': (0.6, 0.45, 0.25)},
 {'id': 'T006', 'name': 'Brick — Sand', 'kind': 'BRICK', 'color': (0.7, 0.57, 0.38)},
 {'id': 'T007', 'name': 'Brick — Charcoal', 'kind': 'BRICK', 'color': (0.075, 0.08, 0.085)},
 {'id': 'T008', 'name': 'Brick — Rose', 'kind': 'BRICK', 'color': (0.6, 0.3, 0.24)},
 {'id': 'T009', 'name': 'Brick — Cream', 'kind': 'BRICK', 'color': (0.78, 0.7, 0.52)},
 {'id': 'T010', 'name': 'Brick — Weathered Brown', 'kind': 'BRICK', 'color': (0.27, 0.18, 0.12)},
 {'id': 'T011', 'name': 'Concrete Block — Raw Grey', 'kind': 'BLOCK', 'color': (0.32, 0.34, 0.35)},
 {'id': 'T012', 'name': 'Concrete Block — Ash', 'kind': 'BLOCK', 'color': (0.46, 0.47, 0.46)},
 {'id': 'T013', 'name': 'Concrete Block — Dark Grey', 'kind': 'BLOCK', 'color': (0.15, 0.17, 0.18)},
 {'id': 'T014', 'name': 'Concrete Block — Sand', 'kind': 'BLOCK', 'color': (0.55, 0.48, 0.36)},
 {'id': 'T015', 'name': 'Concrete Block — Cream', 'kind': 'BLOCK', 'color': (0.7, 0.65, 0.51)},
 {'id': 'T016', 'name': 'Concrete Block — Whitewash', 'kind': 'BLOCK', 'color': (0.82, 0.8, 0.73)},
 {'id': 'T017', 'name': 'Concrete Block — Warm Grey', 'kind': 'BLOCK', 'color': (0.42, 0.39, 0.34)},
 {'id': 'T018', 'name': 'Concrete Block — Earth', 'kind': 'BLOCK', 'color': (0.35, 0.27, 0.19)},
 {'id': 'T019', 'name': 'Concrete Block — Slate', 'kind': 'BLOCK', 'color': (0.2, 0.24, 0.27)},
 {'id': 'T020', 'name': 'Concrete Block — Pale Grey', 'kind': 'BLOCK', 'color': (0.62, 0.65, 0.65)},
 {'id': 'T021', 'name': 'Fine Plaster — Ivory', 'kind': 'PLASTER', 'color': (0.84, 0.79, 0.65)},
 {'id': 'T022', 'name': 'Fine Plaster — Peach', 'kind': 'PLASTER', 'color': (0.82, 0.5, 0.32)},
 {'id': 'T023', 'name': 'Fine Plaster — Cream', 'kind': 'PLASTER', 'color': (0.88, 0.79, 0.55)},
 {'id': 'T024', 'name': 'Fine Plaster — Sand', 'kind': 'PLASTER', 'color': (0.65, 0.52, 0.36)},
 {'id': 'T025', 'name': 'Fine Plaster — White', 'kind': 'PLASTER', 'color': (0.91, 0.9, 0.85)},
 {'id': 'T026', 'name': 'Fine Plaster — Mint', 'kind': 'PLASTER', 'color': (0.48, 0.7, 0.59)},
 {'id': 'T027', 'name': 'Fine Plaster — Sky Blue', 'kind': 'PLASTER', 'color': (0.4, 0.65, 0.78)},
 {'id': 'T028', 'name': 'Fine Plaster — Sage', 'kind': 'PLASTER', 'color': (0.4, 0.5, 0.34)},
 {'id': 'T029', 'name': 'Fine Plaster — Rose', 'kind': 'PLASTER', 'color': (0.75, 0.44, 0.4)},
 {'id': 'T030', 'name': 'Fine Plaster — Warm Grey', 'kind': 'PLASTER', 'color': (0.48, 0.45, 0.4)},
 {'id': 'T031', 'name': 'Coarse Stucco — Ivory', 'kind': 'STUCCO', 'color': (0.8, 0.74, 0.59)},
 {'id': 'T032', 'name': 'Coarse Stucco — Ochre', 'kind': 'STUCCO', 'color': (0.65, 0.43, 0.16)},
 {'id': 'T033', 'name': 'Coarse Stucco — Terracotta', 'kind': 'STUCCO', 'color': (0.63, 0.26, 0.13)},
 {'id': 'T034', 'name': 'Coarse Stucco — Taupe', 'kind': 'STUCCO', 'color': (0.4, 0.33, 0.26)},
 {'id': 'T035', 'name': 'Coarse Stucco — White', 'kind': 'STUCCO', 'color': (0.86, 0.85, 0.79)},
 {'id': 'T036', 'name': 'Coarse Stucco — Cream', 'kind': 'STUCCO', 'color': (0.78, 0.67, 0.43)},
 {'id': 'T037', 'name': 'Coarse Stucco — Peach', 'kind': 'STUCCO', 'color': (0.78, 0.46, 0.28)},
 {'id': 'T038', 'name': 'Coarse Stucco — Olive', 'kind': 'STUCCO', 'color': (0.33, 0.37, 0.2)},
 {'id': 'T039', 'name': 'Coarse Stucco — Grey', 'kind': 'STUCCO', 'color': (0.38, 0.4, 0.39)},
 {'id': 'T040', 'name': 'Coarse Stucco — Blue Grey', 'kind': 'STUCCO', 'color': (0.3, 0.42, 0.49)},
 {'id': 'T041', 'name': 'Cast Concrete — Natural', 'kind': 'CONCRETE', 'color': (0.32, 0.33, 0.32)},
 {'id': 'T042', 'name': 'Cast Concrete — Pale', 'kind': 'CONCRETE', 'color': (0.58, 0.6, 0.59)},
 {'id': 'T043', 'name': 'Cast Concrete — Charcoal', 'kind': 'CONCRETE', 'color': (0.1, 0.12, 0.13)},
 {'id': 'T044', 'name': 'Cast Concrete — Warm', 'kind': 'CONCRETE', 'color': (0.4, 0.36, 0.29)},
 {'id': 'T045', 'name': 'Cast Concrete — Cool', 'kind': 'CONCRETE', 'color': (0.3, 0.36, 0.4)},
 {'id': 'T046', 'name': 'Cast Concrete — Sandy', 'kind': 'CONCRETE', 'color': (0.5, 0.44, 0.32)},
 {'id': 'T047', 'name': 'Cast Concrete — White', 'kind': 'CONCRETE', 'color': (0.72, 0.73, 0.7)},
 {'id': 'T048', 'name': 'Cast Concrete — Brown', 'kind': 'CONCRETE', 'color': (0.27, 0.23, 0.18)},
 {'id': 'T049', 'name': 'Cast Concrete — Ash', 'kind': 'CONCRETE', 'color': (0.44, 0.45, 0.43)},
 {'id': 'T050', 'name': 'Cast Concrete — Slate', 'kind': 'CONCRETE', 'color': (0.18, 0.22, 0.25)},
 {'id': 'T051', 'name': 'Wood Grain — Mahogany', 'kind': 'WOOD', 'color': (0.28, 0.075, 0.035)},
 {'id': 'T052', 'name': 'Wood Grain — Teak', 'kind': 'WOOD', 'color': (0.42, 0.23, 0.075)},
 {'id': 'T053', 'name': 'Wood Grain — Iroko Inspired', 'kind': 'WOOD', 'color': (0.38, 0.26, 0.11)},
 {'id': 'T054', 'name': 'Wood Grain — Walnut', 'kind': 'WOOD', 'color': (0.18, 0.085, 0.035)},
 {'id': 'T055', 'name': 'Wood Grain — Oak', 'kind': 'WOOD', 'color': (0.55, 0.38, 0.16)},
 {'id': 'T056', 'name': 'Wood Grain — Pine', 'kind': 'WOOD', 'color': (0.68, 0.5, 0.23)},
 {'id': 'T057', 'name': 'Wood Grain — Cedar', 'kind': 'WOOD', 'color': (0.4, 0.17, 0.065)},
 {'id': 'T058', 'name': 'Wood Grain — Ebony', 'kind': 'WOOD', 'color': (0.045, 0.032, 0.025)},
 {'id': 'T059', 'name': 'Wood Grain — Weathered', 'kind': 'WOOD', 'color': (0.27, 0.25, 0.21)},
 {'id': 'T060', 'name': 'Wood Grain — Honey', 'kind': 'WOOD', 'color': (0.57, 0.3, 0.07)},
 {'id': 'T061', 'name': 'Timber Siding — Natural', 'kind': 'SIDING', 'color': (0.4, 0.22, 0.09)},
 {'id': 'T062', 'name': 'Timber Siding — Cedar', 'kind': 'SIDING', 'color': (0.45, 0.18, 0.07)},
 {'id': 'T063', 'name': 'Timber Siding — Dark Brown', 'kind': 'SIDING', 'color': (0.13, 0.065, 0.035)},
 {'id': 'T064', 'name': 'Timber Siding — Grey', 'kind': 'SIDING', 'color': (0.35, 0.37, 0.36)},
 {'id': 'T065', 'name': 'Timber Siding — White', 'kind': 'SIDING', 'color': (0.8, 0.8, 0.74)},
 {'id': 'T066', 'name': 'Timber Siding — Cream', 'kind': 'SIDING', 'color': (0.76, 0.68, 0.49)},
 {'id': 'T067', 'name': 'Timber Siding — Sage', 'kind': 'SIDING', 'color': (0.28, 0.4, 0.3)},
 {'id': 'T068', 'name': 'Timber Siding — Blue', 'kind': 'SIDING', 'color': (0.14, 0.29, 0.4)},
 {'id': 'T069', 'name': 'Timber Siding — Red', 'kind': 'SIDING', 'color': (0.4, 0.085, 0.045)},
 {'id': 'T070', 'name': 'Timber Siding — Black', 'kind': 'SIDING', 'color': (0.04, 0.045, 0.045)},
 {'id': 'T071', 'name': 'Cut Stone — Limestone', 'kind': 'STONE', 'color': (0.64, 0.6, 0.47)},
 {'id': 'T072', 'name': 'Cut Stone — Sandstone', 'kind': 'STONE', 'color': (0.62, 0.46, 0.27)},
 {'id': 'T073', 'name': 'Cut Stone — Granite Grey', 'kind': 'STONE', 'color': (0.4, 0.42, 0.4)},
 {'id': 'T074', 'name': 'Cut Stone — Basalt', 'kind': 'STONE', 'color': (0.12, 0.14, 0.14)},
 {'id': 'T075', 'name': 'Cut Stone — Travertine Inspired', 'kind': 'STONE', 'color': (0.7, 0.58, 0.4)},
 {'id': 'T076', 'name': 'Cut Stone — Warm Beige', 'kind': 'STONE', 'color': (0.58, 0.48, 0.34)},
 {'id': 'T077', 'name': 'Cut Stone — Pale Cream', 'kind': 'STONE', 'color': (0.79, 0.74, 0.6)},
 {'id': 'T078', 'name': 'Cut Stone — Rust Brown', 'kind': 'STONE', 'color': (0.36, 0.23, 0.13)},
 {'id': 'T079', 'name': 'Cut Stone — Slate Blue', 'kind': 'STONE', 'color': (0.22, 0.3, 0.34)},
 {'id': 'T080', 'name': 'Cut Stone — Weathered Grey', 'kind': 'STONE', 'color': (0.45, 0.44, 0.38)},
 {'id': 'T081', 'name': 'Corrugated Metal — Galvanized', 'kind': 'METAL', 'color': (0.55, 0.6, 0.63)},
 {'id': 'T082', 'name': 'Corrugated Metal — Charcoal', 'kind': 'METAL', 'color': (0.07, 0.085, 0.1)},
 {'id': 'T083', 'name': 'Corrugated Metal — Terracotta', 'kind': 'METAL', 'color': (0.42, 0.1, 0.04)},
 {'id': 'T084', 'name': 'Corrugated Metal — Forest Green', 'kind': 'METAL', 'color': (0.055, 0.2, 0.11)},
 {'id': 'T085', 'name': 'Corrugated Metal — Ocean Blue', 'kind': 'METAL', 'color': (0.045, 0.18, 0.3)},
 {'id': 'T086', 'name': 'Corrugated Metal — Cream', 'kind': 'METAL', 'color': (0.75, 0.68, 0.47)},
 {'id': 'T087', 'name': 'Corrugated Metal — Silver', 'kind': 'METAL', 'color': (0.72, 0.75, 0.78)},
 {'id': 'T088', 'name': 'Corrugated Metal — Copper Inspired', 'kind': 'METAL', 'color': (0.5, 0.23, 0.09)},
 {'id': 'T089', 'name': 'Corrugated Metal — White', 'kind': 'METAL', 'color': (0.85, 0.86, 0.82)},
 {'id': 'T090', 'name': 'Corrugated Metal — Burgundy', 'kind': 'METAL', 'color': (0.22, 0.035, 0.045)},
 {'id': 'T091', 'name': 'Ceramic Tile — Terracotta', 'kind': 'TILE', 'color': (0.5, 0.15, 0.06)},
 {'id': 'T092', 'name': 'Ceramic Tile — Rust', 'kind': 'TILE', 'color': (0.35, 0.07, 0.025)},
 {'id': 'T093', 'name': 'Ceramic Tile — Charcoal', 'kind': 'TILE', 'color': (0.06, 0.075, 0.08)},
 {'id': 'T094', 'name': 'Ceramic Tile — Chocolate', 'kind': 'TILE', 'color': (0.18, 0.07, 0.025)},
 {'id': 'T095', 'name': 'Ceramic Tile — Sand', 'kind': 'TILE', 'color': (0.63, 0.46, 0.25)},
 {'id': 'T096', 'name': 'Ceramic Tile — Cream', 'kind': 'TILE', 'color': (0.76, 0.68, 0.49)},
 {'id': 'T097', 'name': 'Ceramic Tile — Slate Blue', 'kind': 'TILE', 'color': (0.13, 0.23, 0.3)},
 {'id': 'T098', 'name': 'Ceramic Tile — Forest Green', 'kind': 'TILE', 'color': (0.07, 0.2, 0.12)},
 {'id': 'T099', 'name': 'Ceramic Tile — Burgundy', 'kind': 'TILE', 'color': (0.25, 0.035, 0.045)},
 {'id': 'T100', 'name': 'Ceramic Tile — Graphite', 'kind': 'TILE', 'color': (0.17, 0.19, 0.2)}]
HOUSE_BY_ID = {item["id"]: item for item in HOUSE_STYLES}
TEXTURE_BY_ID = {item["id"]: item for item in TEXTURE_STYLES}
HOUSE_ITEMS = [(v["id"], v["id"]+" · "+v["name"], v["family"]) for v in HOUSE_STYLES]
TEXTURE_ITEMS = [("CUSTOM","Custom — use surface controls","Use the original surface controls")] + [(v["id"],v["id"]+" · "+v["name"],v["kind"]+" procedural material") for v in TEXTURE_STYLES]


# 200 column parameter presets; geometry is created only when selected.
COLUMN_STYLES = [{'id': 'C001',
  'name': 'Square Pier — Compact',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.28,
               'plinth_height': 0.14,
               'flute_count': 8,
               'flute_depth': 0.025,
               'capital_flare': 1.15}},
 {'id': 'C002',
  'name': 'Square Pier — Slender',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.29,
               'plinth_height': 0.195,
               'flute_count': 10,
               'flute_depth': 0.033,
               'capital_flare': 1.18}},
 {'id': 'C003',
  'name': 'Square Pier — Balanced',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.3,
               'plinth_height': 0.25,
               'flute_count': 12,
               'flute_depth': 0.041,
               'capital_flare': 1.21}},
 {'id': 'C004',
  'name': 'Square Pier — Broad Base',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.31,
               'plinth_height': 0.305,
               'flute_count': 14,
               'flute_depth': 0.049,
               'capital_flare': 1.24}},
 {'id': 'C005',
  'name': 'Square Pier — Wide Capital',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.32,
               'plinth_height': 0.36,
               'flute_count': 16,
               'flute_depth': 0.057,
               'capital_flare': 1.27}},
 {'id': 'C006',
  'name': 'Square Pier — Raised Base',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.33,
               'plinth_height': 0.14,
               'flute_count': 18,
               'flute_depth': 0.065,
               'capital_flare': 1.3}},
 {'id': 'C007',
  'name': 'Square Pier — Fine Detail',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.34,
               'plinth_height': 0.195,
               'flute_count': 20,
               'flute_depth': 0.073,
               'capital_flare': 1.33}},
 {'id': 'C008',
  'name': 'Square Pier — Deep Detail',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.35,
               'plinth_height': 0.25,
               'flute_count': 22,
               'flute_depth': 0.081,
               'capital_flare': 1.36}},
 {'id': 'C009',
  'name': 'Square Pier — Porch',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.36,
               'plinth_height': 0.305,
               'flute_count': 24,
               'flute_depth': 0.089,
               'capital_flare': 1.39}},
 {'id': 'C010',
  'name': 'Square Pier — Veranda',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.37,
               'plinth_height': 0.36,
               'flute_count': 26,
               'flute_depth': 0.097,
               'capital_flare': 1.42}},
 {'id': 'C011',
  'name': 'Square Pier — Balcony',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.38,
               'plinth_height': 0.14,
               'flute_count': 28,
               'flute_depth': 0.025,
               'capital_flare': 1.45}},
 {'id': 'C012',
  'name': 'Square Pier — Entrance',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.39,
               'plinth_height': 0.195,
               'flute_count': 30,
               'flute_depth': 0.033,
               'capital_flare': 1.48}},
 {'id': 'C013',
  'name': 'Square Pier — Garden',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.4,
               'plinth_height': 0.25,
               'flute_count': 32,
               'flute_depth': 0.041,
               'capital_flare': 1.51}},
 {'id': 'C014',
  'name': 'Square Pier — Courtyard',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.41,
               'plinth_height': 0.305,
               'flute_count': 8,
               'flute_depth': 0.049,
               'capital_flare': 1.54}},
 {'id': 'C015',
  'name': 'Square Pier — Formal',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.42,
               'plinth_height': 0.36,
               'flute_count': 10,
               'flute_depth': 0.057,
               'capital_flare': 1.57}},
 {'id': 'C016',
  'name': 'Square Pier — Grand',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.43,
               'plinth_height': 0.14,
               'flute_count': 12,
               'flute_depth': 0.065,
               'capital_flare': 1.6}},
 {'id': 'C017',
  'name': 'Square Pier — Estate',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.44,
               'plinth_height': 0.195,
               'flute_count': 14,
               'flute_depth': 0.073,
               'capital_flare': 1.63}},
 {'id': 'C018',
  'name': 'Square Pier — Monument',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.45,
               'plinth_height': 0.25,
               'flute_count': 16,
               'flute_depth': 0.081,
               'capital_flare': 1.66}},
 {'id': 'C019',
  'name': 'Square Pier — Tall Profile',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.46,
               'plinth_height': 0.305,
               'flute_count': 18,
               'flute_depth': 0.089,
               'capital_flare': 1.69}},
 {'id': 'C020',
  'name': 'Square Pier — Signature',
  'family': 'Square Pier',
  'settings': {'column_style': 'SQUARE',
               'column_size': 0.47,
               'plinth_height': 0.36,
               'flute_count': 20,
               'flute_depth': 0.097,
               'capital_flare': 1.72}},
 {'id': 'C021',
  'name': 'Smooth Classical — Compact',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.28,
               'plinth_height': 0.14,
               'flute_count': 8,
               'flute_depth': 0.025,
               'capital_flare': 1.15}},
 {'id': 'C022',
  'name': 'Smooth Classical — Slender',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.29,
               'plinth_height': 0.195,
               'flute_count': 10,
               'flute_depth': 0.033,
               'capital_flare': 1.18}},
 {'id': 'C023',
  'name': 'Smooth Classical — Balanced',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.3,
               'plinth_height': 0.25,
               'flute_count': 12,
               'flute_depth': 0.041,
               'capital_flare': 1.21}},
 {'id': 'C024',
  'name': 'Smooth Classical — Broad Base',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.31,
               'plinth_height': 0.305,
               'flute_count': 14,
               'flute_depth': 0.049,
               'capital_flare': 1.24}},
 {'id': 'C025',
  'name': 'Smooth Classical — Wide Capital',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.32,
               'plinth_height': 0.36,
               'flute_count': 16,
               'flute_depth': 0.057,
               'capital_flare': 1.27}},
 {'id': 'C026',
  'name': 'Smooth Classical — Raised Base',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.33,
               'plinth_height': 0.14,
               'flute_count': 18,
               'flute_depth': 0.065,
               'capital_flare': 1.3}},
 {'id': 'C027',
  'name': 'Smooth Classical — Fine Detail',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.34,
               'plinth_height': 0.195,
               'flute_count': 20,
               'flute_depth': 0.073,
               'capital_flare': 1.33}},
 {'id': 'C028',
  'name': 'Smooth Classical — Deep Detail',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.35,
               'plinth_height': 0.25,
               'flute_count': 22,
               'flute_depth': 0.081,
               'capital_flare': 1.36}},
 {'id': 'C029',
  'name': 'Smooth Classical — Porch',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.36,
               'plinth_height': 0.305,
               'flute_count': 24,
               'flute_depth': 0.089,
               'capital_flare': 1.39}},
 {'id': 'C030',
  'name': 'Smooth Classical — Veranda',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.37,
               'plinth_height': 0.36,
               'flute_count': 26,
               'flute_depth': 0.097,
               'capital_flare': 1.42}},
 {'id': 'C031',
  'name': 'Smooth Classical — Balcony',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.38,
               'plinth_height': 0.14,
               'flute_count': 28,
               'flute_depth': 0.025,
               'capital_flare': 1.45}},
 {'id': 'C032',
  'name': 'Smooth Classical — Entrance',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.39,
               'plinth_height': 0.195,
               'flute_count': 30,
               'flute_depth': 0.033,
               'capital_flare': 1.48}},
 {'id': 'C033',
  'name': 'Smooth Classical — Garden',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.4,
               'plinth_height': 0.25,
               'flute_count': 32,
               'flute_depth': 0.041,
               'capital_flare': 1.51}},
 {'id': 'C034',
  'name': 'Smooth Classical — Courtyard',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.41,
               'plinth_height': 0.305,
               'flute_count': 8,
               'flute_depth': 0.049,
               'capital_flare': 1.54}},
 {'id': 'C035',
  'name': 'Smooth Classical — Formal',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.42,
               'plinth_height': 0.36,
               'flute_count': 10,
               'flute_depth': 0.057,
               'capital_flare': 1.57}},
 {'id': 'C036',
  'name': 'Smooth Classical — Grand',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.43,
               'plinth_height': 0.14,
               'flute_count': 12,
               'flute_depth': 0.065,
               'capital_flare': 1.6}},
 {'id': 'C037',
  'name': 'Smooth Classical — Estate',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.44,
               'plinth_height': 0.195,
               'flute_count': 14,
               'flute_depth': 0.073,
               'capital_flare': 1.63}},
 {'id': 'C038',
  'name': 'Smooth Classical — Monument',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.45,
               'plinth_height': 0.25,
               'flute_count': 16,
               'flute_depth': 0.081,
               'capital_flare': 1.66}},
 {'id': 'C039',
  'name': 'Smooth Classical — Tall Profile',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.46,
               'plinth_height': 0.305,
               'flute_count': 18,
               'flute_depth': 0.089,
               'capital_flare': 1.69}},
 {'id': 'C040',
  'name': 'Smooth Classical — Signature',
  'family': 'Smooth Classical',
  'settings': {'column_style': 'CLASSICAL',
               'column_size': 0.47,
               'plinth_height': 0.36,
               'flute_count': 20,
               'flute_depth': 0.097,
               'capital_flare': 1.72}},
 {'id': 'C041',
  'name': 'Fluted Round — Compact',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.28,
               'plinth_height': 0.14,
               'flute_count': 8,
               'flute_depth': 0.025,
               'capital_flare': 1.15}},
 {'id': 'C042',
  'name': 'Fluted Round — Slender',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.29,
               'plinth_height': 0.195,
               'flute_count': 10,
               'flute_depth': 0.033,
               'capital_flare': 1.18}},
 {'id': 'C043',
  'name': 'Fluted Round — Balanced',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.3,
               'plinth_height': 0.25,
               'flute_count': 12,
               'flute_depth': 0.041,
               'capital_flare': 1.21}},
 {'id': 'C044',
  'name': 'Fluted Round — Broad Base',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.31,
               'plinth_height': 0.305,
               'flute_count': 14,
               'flute_depth': 0.049,
               'capital_flare': 1.24}},
 {'id': 'C045',
  'name': 'Fluted Round — Wide Capital',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.32,
               'plinth_height': 0.36,
               'flute_count': 16,
               'flute_depth': 0.057,
               'capital_flare': 1.27}},
 {'id': 'C046',
  'name': 'Fluted Round — Raised Base',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.33,
               'plinth_height': 0.14,
               'flute_count': 18,
               'flute_depth': 0.065,
               'capital_flare': 1.3}},
 {'id': 'C047',
  'name': 'Fluted Round — Fine Detail',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.34,
               'plinth_height': 0.195,
               'flute_count': 20,
               'flute_depth': 0.073,
               'capital_flare': 1.33}},
 {'id': 'C048',
  'name': 'Fluted Round — Deep Detail',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.35,
               'plinth_height': 0.25,
               'flute_count': 22,
               'flute_depth': 0.081,
               'capital_flare': 1.36}},
 {'id': 'C049',
  'name': 'Fluted Round — Porch',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.36,
               'plinth_height': 0.305,
               'flute_count': 24,
               'flute_depth': 0.089,
               'capital_flare': 1.39}},
 {'id': 'C050',
  'name': 'Fluted Round — Veranda',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.37,
               'plinth_height': 0.36,
               'flute_count': 26,
               'flute_depth': 0.097,
               'capital_flare': 1.42}},
 {'id': 'C051',
  'name': 'Fluted Round — Balcony',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.38,
               'plinth_height': 0.14,
               'flute_count': 28,
               'flute_depth': 0.025,
               'capital_flare': 1.45}},
 {'id': 'C052',
  'name': 'Fluted Round — Entrance',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.39,
               'plinth_height': 0.195,
               'flute_count': 30,
               'flute_depth': 0.033,
               'capital_flare': 1.48}},
 {'id': 'C053',
  'name': 'Fluted Round — Garden',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.4,
               'plinth_height': 0.25,
               'flute_count': 32,
               'flute_depth': 0.041,
               'capital_flare': 1.51}},
 {'id': 'C054',
  'name': 'Fluted Round — Courtyard',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.41,
               'plinth_height': 0.305,
               'flute_count': 8,
               'flute_depth': 0.049,
               'capital_flare': 1.54}},
 {'id': 'C055',
  'name': 'Fluted Round — Formal',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.42,
               'plinth_height': 0.36,
               'flute_count': 10,
               'flute_depth': 0.057,
               'capital_flare': 1.57}},
 {'id': 'C056',
  'name': 'Fluted Round — Grand',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.43,
               'plinth_height': 0.14,
               'flute_count': 12,
               'flute_depth': 0.065,
               'capital_flare': 1.6}},
 {'id': 'C057',
  'name': 'Fluted Round — Estate',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.44,
               'plinth_height': 0.195,
               'flute_count': 14,
               'flute_depth': 0.073,
               'capital_flare': 1.63}},
 {'id': 'C058',
  'name': 'Fluted Round — Monument',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.45,
               'plinth_height': 0.25,
               'flute_count': 16,
               'flute_depth': 0.081,
               'capital_flare': 1.66}},
 {'id': 'C059',
  'name': 'Fluted Round — Tall Profile',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.46,
               'plinth_height': 0.305,
               'flute_count': 18,
               'flute_depth': 0.089,
               'capital_flare': 1.69}},
 {'id': 'C060',
  'name': 'Fluted Round — Signature',
  'family': 'Fluted Round',
  'settings': {'column_style': 'FLUTED',
               'column_size': 0.47,
               'plinth_height': 0.36,
               'flute_count': 20,
               'flute_depth': 0.097,
               'capital_flare': 1.72}},
 {'id': 'C061',
  'name': 'Fluted Square — Compact',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.28,
               'plinth_height': 0.14,
               'flute_count': 8,
               'flute_depth': 0.025,
               'capital_flare': 1.15}},
 {'id': 'C062',
  'name': 'Fluted Square — Slender',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.29,
               'plinth_height': 0.195,
               'flute_count': 10,
               'flute_depth': 0.033,
               'capital_flare': 1.18}},
 {'id': 'C063',
  'name': 'Fluted Square — Balanced',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.3,
               'plinth_height': 0.25,
               'flute_count': 12,
               'flute_depth': 0.041,
               'capital_flare': 1.21}},
 {'id': 'C064',
  'name': 'Fluted Square — Broad Base',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.31,
               'plinth_height': 0.305,
               'flute_count': 14,
               'flute_depth': 0.049,
               'capital_flare': 1.24}},
 {'id': 'C065',
  'name': 'Fluted Square — Wide Capital',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.32,
               'plinth_height': 0.36,
               'flute_count': 16,
               'flute_depth': 0.057,
               'capital_flare': 1.27}},
 {'id': 'C066',
  'name': 'Fluted Square — Raised Base',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.33,
               'plinth_height': 0.14,
               'flute_count': 18,
               'flute_depth': 0.065,
               'capital_flare': 1.3}},
 {'id': 'C067',
  'name': 'Fluted Square — Fine Detail',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.34,
               'plinth_height': 0.195,
               'flute_count': 20,
               'flute_depth': 0.073,
               'capital_flare': 1.33}},
 {'id': 'C068',
  'name': 'Fluted Square — Deep Detail',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.35,
               'plinth_height': 0.25,
               'flute_count': 22,
               'flute_depth': 0.081,
               'capital_flare': 1.36}},
 {'id': 'C069',
  'name': 'Fluted Square — Porch',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.36,
               'plinth_height': 0.305,
               'flute_count': 24,
               'flute_depth': 0.089,
               'capital_flare': 1.39}},
 {'id': 'C070',
  'name': 'Fluted Square — Veranda',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.37,
               'plinth_height': 0.36,
               'flute_count': 26,
               'flute_depth': 0.097,
               'capital_flare': 1.42}},
 {'id': 'C071',
  'name': 'Fluted Square — Balcony',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.38,
               'plinth_height': 0.14,
               'flute_count': 28,
               'flute_depth': 0.025,
               'capital_flare': 1.45}},
 {'id': 'C072',
  'name': 'Fluted Square — Entrance',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.39,
               'plinth_height': 0.195,
               'flute_count': 30,
               'flute_depth': 0.033,
               'capital_flare': 1.48}},
 {'id': 'C073',
  'name': 'Fluted Square — Garden',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.4,
               'plinth_height': 0.25,
               'flute_count': 32,
               'flute_depth': 0.041,
               'capital_flare': 1.51}},
 {'id': 'C074',
  'name': 'Fluted Square — Courtyard',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.41,
               'plinth_height': 0.305,
               'flute_count': 8,
               'flute_depth': 0.049,
               'capital_flare': 1.54}},
 {'id': 'C075',
  'name': 'Fluted Square — Formal',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.42,
               'plinth_height': 0.36,
               'flute_count': 10,
               'flute_depth': 0.057,
               'capital_flare': 1.57}},
 {'id': 'C076',
  'name': 'Fluted Square — Grand',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.43,
               'plinth_height': 0.14,
               'flute_count': 12,
               'flute_depth': 0.065,
               'capital_flare': 1.6}},
 {'id': 'C077',
  'name': 'Fluted Square — Estate',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.44,
               'plinth_height': 0.195,
               'flute_count': 14,
               'flute_depth': 0.073,
               'capital_flare': 1.63}},
 {'id': 'C078',
  'name': 'Fluted Square — Monument',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.45,
               'plinth_height': 0.25,
               'flute_count': 16,
               'flute_depth': 0.081,
               'capital_flare': 1.66}},
 {'id': 'C079',
  'name': 'Fluted Square — Tall Profile',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.46,
               'plinth_height': 0.305,
               'flute_count': 18,
               'flute_depth': 0.089,
               'capital_flare': 1.69}},
 {'id': 'C080',
  'name': 'Fluted Square — Signature',
  'family': 'Fluted Square',
  'settings': {'column_style': 'SQUARE_FLUTED',
               'column_size': 0.47,
               'plinth_height': 0.36,
               'flute_count': 20,
               'flute_depth': 0.097,
               'capital_flare': 1.72}},
 {'id': 'C081',
  'name': 'Decorative Round — Compact',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.28,
               'plinth_height': 0.14,
               'flute_count': 8,
               'flute_depth': 0.025,
               'capital_flare': 1.15}},
 {'id': 'C082',
  'name': 'Decorative Round — Slender',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.29,
               'plinth_height': 0.195,
               'flute_count': 10,
               'flute_depth': 0.033,
               'capital_flare': 1.18}},
 {'id': 'C083',
  'name': 'Decorative Round — Balanced',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.3,
               'plinth_height': 0.25,
               'flute_count': 12,
               'flute_depth': 0.041,
               'capital_flare': 1.21}},
 {'id': 'C084',
  'name': 'Decorative Round — Broad Base',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.31,
               'plinth_height': 0.305,
               'flute_count': 14,
               'flute_depth': 0.049,
               'capital_flare': 1.24}},
 {'id': 'C085',
  'name': 'Decorative Round — Wide Capital',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.32,
               'plinth_height': 0.36,
               'flute_count': 16,
               'flute_depth': 0.057,
               'capital_flare': 1.27}},
 {'id': 'C086',
  'name': 'Decorative Round — Raised Base',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.33,
               'plinth_height': 0.14,
               'flute_count': 18,
               'flute_depth': 0.065,
               'capital_flare': 1.3}},
 {'id': 'C087',
  'name': 'Decorative Round — Fine Detail',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.34,
               'plinth_height': 0.195,
               'flute_count': 20,
               'flute_depth': 0.073,
               'capital_flare': 1.33}},
 {'id': 'C088',
  'name': 'Decorative Round — Deep Detail',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.35,
               'plinth_height': 0.25,
               'flute_count': 22,
               'flute_depth': 0.081,
               'capital_flare': 1.36}},
 {'id': 'C089',
  'name': 'Decorative Round — Porch',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.36,
               'plinth_height': 0.305,
               'flute_count': 24,
               'flute_depth': 0.089,
               'capital_flare': 1.39}},
 {'id': 'C090',
  'name': 'Decorative Round — Veranda',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.37,
               'plinth_height': 0.36,
               'flute_count': 26,
               'flute_depth': 0.097,
               'capital_flare': 1.42}},
 {'id': 'C091',
  'name': 'Decorative Round — Balcony',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.38,
               'plinth_height': 0.14,
               'flute_count': 28,
               'flute_depth': 0.025,
               'capital_flare': 1.45}},
 {'id': 'C092',
  'name': 'Decorative Round — Entrance',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.39,
               'plinth_height': 0.195,
               'flute_count': 30,
               'flute_depth': 0.033,
               'capital_flare': 1.48}},
 {'id': 'C093',
  'name': 'Decorative Round — Garden',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.4,
               'plinth_height': 0.25,
               'flute_count': 32,
               'flute_depth': 0.041,
               'capital_flare': 1.51}},
 {'id': 'C094',
  'name': 'Decorative Round — Courtyard',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.41,
               'plinth_height': 0.305,
               'flute_count': 8,
               'flute_depth': 0.049,
               'capital_flare': 1.54}},
 {'id': 'C095',
  'name': 'Decorative Round — Formal',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.42,
               'plinth_height': 0.36,
               'flute_count': 10,
               'flute_depth': 0.057,
               'capital_flare': 1.57}},
 {'id': 'C096',
  'name': 'Decorative Round — Grand',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.43,
               'plinth_height': 0.14,
               'flute_count': 12,
               'flute_depth': 0.065,
               'capital_flare': 1.6}},
 {'id': 'C097',
  'name': 'Decorative Round — Estate',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.44,
               'plinth_height': 0.195,
               'flute_count': 14,
               'flute_depth': 0.073,
               'capital_flare': 1.63}},
 {'id': 'C098',
  'name': 'Decorative Round — Monument',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.45,
               'plinth_height': 0.25,
               'flute_count': 16,
               'flute_depth': 0.081,
               'capital_flare': 1.66}},
 {'id': 'C099',
  'name': 'Decorative Round — Tall Profile',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.46,
               'plinth_height': 0.305,
               'flute_count': 18,
               'flute_depth': 0.089,
               'capital_flare': 1.69}},
 {'id': 'C100',
  'name': 'Decorative Round — Signature',
  'family': 'Decorative Round',
  'settings': {'column_style': 'ORNATE',
               'column_size': 0.47,
               'plinth_height': 0.36,
               'flute_count': 20,
               'flute_depth': 0.097,
               'capital_flare': 1.72}},
 {'id': 'C101',
  'name': 'Tuscan Inspired — Compact',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.28,
               'plinth_height': 0.14,
               'flute_count': 8,
               'flute_depth': 0.025,
               'capital_flare': 1.15}},
 {'id': 'C102',
  'name': 'Tuscan Inspired — Slender',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.29,
               'plinth_height': 0.195,
               'flute_count': 10,
               'flute_depth': 0.033,
               'capital_flare': 1.18}},
 {'id': 'C103',
  'name': 'Tuscan Inspired — Balanced',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.3,
               'plinth_height': 0.25,
               'flute_count': 12,
               'flute_depth': 0.041,
               'capital_flare': 1.21}},
 {'id': 'C104',
  'name': 'Tuscan Inspired — Broad Base',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.31,
               'plinth_height': 0.305,
               'flute_count': 14,
               'flute_depth': 0.049,
               'capital_flare': 1.24}},
 {'id': 'C105',
  'name': 'Tuscan Inspired — Wide Capital',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.32,
               'plinth_height': 0.36,
               'flute_count': 16,
               'flute_depth': 0.057,
               'capital_flare': 1.27}},
 {'id': 'C106',
  'name': 'Tuscan Inspired — Raised Base',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.33,
               'plinth_height': 0.14,
               'flute_count': 18,
               'flute_depth': 0.065,
               'capital_flare': 1.3}},
 {'id': 'C107',
  'name': 'Tuscan Inspired — Fine Detail',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.34,
               'plinth_height': 0.195,
               'flute_count': 20,
               'flute_depth': 0.073,
               'capital_flare': 1.33}},
 {'id': 'C108',
  'name': 'Tuscan Inspired — Deep Detail',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.35,
               'plinth_height': 0.25,
               'flute_count': 22,
               'flute_depth': 0.081,
               'capital_flare': 1.36}},
 {'id': 'C109',
  'name': 'Tuscan Inspired — Porch',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.36,
               'plinth_height': 0.305,
               'flute_count': 24,
               'flute_depth': 0.089,
               'capital_flare': 1.39}},
 {'id': 'C110',
  'name': 'Tuscan Inspired — Veranda',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.37,
               'plinth_height': 0.36,
               'flute_count': 26,
               'flute_depth': 0.097,
               'capital_flare': 1.42}},
 {'id': 'C111',
  'name': 'Tuscan Inspired — Balcony',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.38,
               'plinth_height': 0.14,
               'flute_count': 28,
               'flute_depth': 0.025,
               'capital_flare': 1.45}},
 {'id': 'C112',
  'name': 'Tuscan Inspired — Entrance',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.39,
               'plinth_height': 0.195,
               'flute_count': 30,
               'flute_depth': 0.033,
               'capital_flare': 1.48}},
 {'id': 'C113',
  'name': 'Tuscan Inspired — Garden',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.4,
               'plinth_height': 0.25,
               'flute_count': 32,
               'flute_depth': 0.041,
               'capital_flare': 1.51}},
 {'id': 'C114',
  'name': 'Tuscan Inspired — Courtyard',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.41,
               'plinth_height': 0.305,
               'flute_count': 8,
               'flute_depth': 0.049,
               'capital_flare': 1.54}},
 {'id': 'C115',
  'name': 'Tuscan Inspired — Formal',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.42,
               'plinth_height': 0.36,
               'flute_count': 10,
               'flute_depth': 0.057,
               'capital_flare': 1.57}},
 {'id': 'C116',
  'name': 'Tuscan Inspired — Grand',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.43,
               'plinth_height': 0.14,
               'flute_count': 12,
               'flute_depth': 0.065,
               'capital_flare': 1.6}},
 {'id': 'C117',
  'name': 'Tuscan Inspired — Estate',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.44,
               'plinth_height': 0.195,
               'flute_count': 14,
               'flute_depth': 0.073,
               'capital_flare': 1.63}},
 {'id': 'C118',
  'name': 'Tuscan Inspired — Monument',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.45,
               'plinth_height': 0.25,
               'flute_count': 16,
               'flute_depth': 0.081,
               'capital_flare': 1.66}},
 {'id': 'C119',
  'name': 'Tuscan Inspired — Tall Profile',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.46,
               'plinth_height': 0.305,
               'flute_count': 18,
               'flute_depth': 0.089,
               'capital_flare': 1.69}},
 {'id': 'C120',
  'name': 'Tuscan Inspired — Signature',
  'family': 'Tuscan Inspired',
  'settings': {'column_style': 'TUSCAN',
               'column_size': 0.47,
               'plinth_height': 0.36,
               'flute_count': 20,
               'flute_depth': 0.097,
               'capital_flare': 1.72}},
 {'id': 'C121',
  'name': 'Doric Inspired — Compact',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.28,
               'plinth_height': 0.14,
               'flute_count': 8,
               'flute_depth': 0.025,
               'capital_flare': 1.15}},
 {'id': 'C122',
  'name': 'Doric Inspired — Slender',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.29,
               'plinth_height': 0.195,
               'flute_count': 10,
               'flute_depth': 0.033,
               'capital_flare': 1.18}},
 {'id': 'C123',
  'name': 'Doric Inspired — Balanced',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.3,
               'plinth_height': 0.25,
               'flute_count': 12,
               'flute_depth': 0.041,
               'capital_flare': 1.21}},
 {'id': 'C124',
  'name': 'Doric Inspired — Broad Base',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.31,
               'plinth_height': 0.305,
               'flute_count': 14,
               'flute_depth': 0.049,
               'capital_flare': 1.24}},
 {'id': 'C125',
  'name': 'Doric Inspired — Wide Capital',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.32,
               'plinth_height': 0.36,
               'flute_count': 16,
               'flute_depth': 0.057,
               'capital_flare': 1.27}},
 {'id': 'C126',
  'name': 'Doric Inspired — Raised Base',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.33,
               'plinth_height': 0.14,
               'flute_count': 18,
               'flute_depth': 0.065,
               'capital_flare': 1.3}},
 {'id': 'C127',
  'name': 'Doric Inspired — Fine Detail',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.34,
               'plinth_height': 0.195,
               'flute_count': 20,
               'flute_depth': 0.073,
               'capital_flare': 1.33}},
 {'id': 'C128',
  'name': 'Doric Inspired — Deep Detail',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.35,
               'plinth_height': 0.25,
               'flute_count': 22,
               'flute_depth': 0.081,
               'capital_flare': 1.36}},
 {'id': 'C129',
  'name': 'Doric Inspired — Porch',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.36,
               'plinth_height': 0.305,
               'flute_count': 24,
               'flute_depth': 0.089,
               'capital_flare': 1.39}},
 {'id': 'C130',
  'name': 'Doric Inspired — Veranda',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.37,
               'plinth_height': 0.36,
               'flute_count': 26,
               'flute_depth': 0.097,
               'capital_flare': 1.42}},
 {'id': 'C131',
  'name': 'Doric Inspired — Balcony',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.38,
               'plinth_height': 0.14,
               'flute_count': 28,
               'flute_depth': 0.025,
               'capital_flare': 1.45}},
 {'id': 'C132',
  'name': 'Doric Inspired — Entrance',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.39,
               'plinth_height': 0.195,
               'flute_count': 30,
               'flute_depth': 0.033,
               'capital_flare': 1.48}},
 {'id': 'C133',
  'name': 'Doric Inspired — Garden',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.4,
               'plinth_height': 0.25,
               'flute_count': 32,
               'flute_depth': 0.041,
               'capital_flare': 1.51}},
 {'id': 'C134',
  'name': 'Doric Inspired — Courtyard',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.41,
               'plinth_height': 0.305,
               'flute_count': 8,
               'flute_depth': 0.049,
               'capital_flare': 1.54}},
 {'id': 'C135',
  'name': 'Doric Inspired — Formal',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.42,
               'plinth_height': 0.36,
               'flute_count': 10,
               'flute_depth': 0.057,
               'capital_flare': 1.57}},
 {'id': 'C136',
  'name': 'Doric Inspired — Grand',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.43,
               'plinth_height': 0.14,
               'flute_count': 12,
               'flute_depth': 0.065,
               'capital_flare': 1.6}},
 {'id': 'C137',
  'name': 'Doric Inspired — Estate',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.44,
               'plinth_height': 0.195,
               'flute_count': 14,
               'flute_depth': 0.073,
               'capital_flare': 1.63}},
 {'id': 'C138',
  'name': 'Doric Inspired — Monument',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.45,
               'plinth_height': 0.25,
               'flute_count': 16,
               'flute_depth': 0.081,
               'capital_flare': 1.66}},
 {'id': 'C139',
  'name': 'Doric Inspired — Tall Profile',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.46,
               'plinth_height': 0.305,
               'flute_count': 18,
               'flute_depth': 0.089,
               'capital_flare': 1.69}},
 {'id': 'C140',
  'name': 'Doric Inspired — Signature',
  'family': 'Doric Inspired',
  'settings': {'column_style': 'DORIC',
               'column_size': 0.47,
               'plinth_height': 0.36,
               'flute_count': 20,
               'flute_depth': 0.097,
               'capital_flare': 1.72}},
 {'id': 'C141',
  'name': 'Octagonal — Compact',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.28,
               'plinth_height': 0.14,
               'flute_count': 8,
               'flute_depth': 0.025,
               'capital_flare': 1.15}},
 {'id': 'C142',
  'name': 'Octagonal — Slender',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.29,
               'plinth_height': 0.195,
               'flute_count': 10,
               'flute_depth': 0.033,
               'capital_flare': 1.18}},
 {'id': 'C143',
  'name': 'Octagonal — Balanced',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.3,
               'plinth_height': 0.25,
               'flute_count': 12,
               'flute_depth': 0.041,
               'capital_flare': 1.21}},
 {'id': 'C144',
  'name': 'Octagonal — Broad Base',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.31,
               'plinth_height': 0.305,
               'flute_count': 14,
               'flute_depth': 0.049,
               'capital_flare': 1.24}},
 {'id': 'C145',
  'name': 'Octagonal — Wide Capital',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.32,
               'plinth_height': 0.36,
               'flute_count': 16,
               'flute_depth': 0.057,
               'capital_flare': 1.27}},
 {'id': 'C146',
  'name': 'Octagonal — Raised Base',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.33,
               'plinth_height': 0.14,
               'flute_count': 18,
               'flute_depth': 0.065,
               'capital_flare': 1.3}},
 {'id': 'C147',
  'name': 'Octagonal — Fine Detail',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.34,
               'plinth_height': 0.195,
               'flute_count': 20,
               'flute_depth': 0.073,
               'capital_flare': 1.33}},
 {'id': 'C148',
  'name': 'Octagonal — Deep Detail',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.35,
               'plinth_height': 0.25,
               'flute_count': 22,
               'flute_depth': 0.081,
               'capital_flare': 1.36}},
 {'id': 'C149',
  'name': 'Octagonal — Porch',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.36,
               'plinth_height': 0.305,
               'flute_count': 24,
               'flute_depth': 0.089,
               'capital_flare': 1.39}},
 {'id': 'C150',
  'name': 'Octagonal — Veranda',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.37,
               'plinth_height': 0.36,
               'flute_count': 26,
               'flute_depth': 0.097,
               'capital_flare': 1.42}},
 {'id': 'C151',
  'name': 'Octagonal — Balcony',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.38,
               'plinth_height': 0.14,
               'flute_count': 28,
               'flute_depth': 0.025,
               'capital_flare': 1.45}},
 {'id': 'C152',
  'name': 'Octagonal — Entrance',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.39,
               'plinth_height': 0.195,
               'flute_count': 30,
               'flute_depth': 0.033,
               'capital_flare': 1.48}},
 {'id': 'C153',
  'name': 'Octagonal — Garden',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.4,
               'plinth_height': 0.25,
               'flute_count': 32,
               'flute_depth': 0.041,
               'capital_flare': 1.51}},
 {'id': 'C154',
  'name': 'Octagonal — Courtyard',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.41,
               'plinth_height': 0.305,
               'flute_count': 8,
               'flute_depth': 0.049,
               'capital_flare': 1.54}},
 {'id': 'C155',
  'name': 'Octagonal — Formal',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.42,
               'plinth_height': 0.36,
               'flute_count': 10,
               'flute_depth': 0.057,
               'capital_flare': 1.57}},
 {'id': 'C156',
  'name': 'Octagonal — Grand',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.43,
               'plinth_height': 0.14,
               'flute_count': 12,
               'flute_depth': 0.065,
               'capital_flare': 1.6}},
 {'id': 'C157',
  'name': 'Octagonal — Estate',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.44,
               'plinth_height': 0.195,
               'flute_count': 14,
               'flute_depth': 0.073,
               'capital_flare': 1.63}},
 {'id': 'C158',
  'name': 'Octagonal — Monument',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.45,
               'plinth_height': 0.25,
               'flute_count': 16,
               'flute_depth': 0.081,
               'capital_flare': 1.66}},
 {'id': 'C159',
  'name': 'Octagonal — Tall Profile',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.46,
               'plinth_height': 0.305,
               'flute_count': 18,
               'flute_depth': 0.089,
               'capital_flare': 1.69}},
 {'id': 'C160',
  'name': 'Octagonal — Signature',
  'family': 'Octagonal',
  'settings': {'column_style': 'OCTAGONAL',
               'column_size': 0.47,
               'plinth_height': 0.36,
               'flute_count': 20,
               'flute_depth': 0.097,
               'capital_flare': 1.72}},
 {'id': 'C161',
  'name': 'Banded Round — Compact',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.28,
               'plinth_height': 0.14,
               'flute_count': 8,
               'flute_depth': 0.025,
               'capital_flare': 1.15}},
 {'id': 'C162',
  'name': 'Banded Round — Slender',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.29,
               'plinth_height': 0.195,
               'flute_count': 10,
               'flute_depth': 0.033,
               'capital_flare': 1.18}},
 {'id': 'C163',
  'name': 'Banded Round — Balanced',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.3,
               'plinth_height': 0.25,
               'flute_count': 12,
               'flute_depth': 0.041,
               'capital_flare': 1.21}},
 {'id': 'C164',
  'name': 'Banded Round — Broad Base',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.31,
               'plinth_height': 0.305,
               'flute_count': 14,
               'flute_depth': 0.049,
               'capital_flare': 1.24}},
 {'id': 'C165',
  'name': 'Banded Round — Wide Capital',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.32,
               'plinth_height': 0.36,
               'flute_count': 16,
               'flute_depth': 0.057,
               'capital_flare': 1.27}},
 {'id': 'C166',
  'name': 'Banded Round — Raised Base',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.33,
               'plinth_height': 0.14,
               'flute_count': 18,
               'flute_depth': 0.065,
               'capital_flare': 1.3}},
 {'id': 'C167',
  'name': 'Banded Round — Fine Detail',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.34,
               'plinth_height': 0.195,
               'flute_count': 20,
               'flute_depth': 0.073,
               'capital_flare': 1.33}},
 {'id': 'C168',
  'name': 'Banded Round — Deep Detail',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.35,
               'plinth_height': 0.25,
               'flute_count': 22,
               'flute_depth': 0.081,
               'capital_flare': 1.36}},
 {'id': 'C169',
  'name': 'Banded Round — Porch',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.36,
               'plinth_height': 0.305,
               'flute_count': 24,
               'flute_depth': 0.089,
               'capital_flare': 1.39}},
 {'id': 'C170',
  'name': 'Banded Round — Veranda',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.37,
               'plinth_height': 0.36,
               'flute_count': 26,
               'flute_depth': 0.097,
               'capital_flare': 1.42}},
 {'id': 'C171',
  'name': 'Banded Round — Balcony',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.38,
               'plinth_height': 0.14,
               'flute_count': 28,
               'flute_depth': 0.025,
               'capital_flare': 1.45}},
 {'id': 'C172',
  'name': 'Banded Round — Entrance',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.39,
               'plinth_height': 0.195,
               'flute_count': 30,
               'flute_depth': 0.033,
               'capital_flare': 1.48}},
 {'id': 'C173',
  'name': 'Banded Round — Garden',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.4,
               'plinth_height': 0.25,
               'flute_count': 32,
               'flute_depth': 0.041,
               'capital_flare': 1.51}},
 {'id': 'C174',
  'name': 'Banded Round — Courtyard',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.41,
               'plinth_height': 0.305,
               'flute_count': 8,
               'flute_depth': 0.049,
               'capital_flare': 1.54}},
 {'id': 'C175',
  'name': 'Banded Round — Formal',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.42,
               'plinth_height': 0.36,
               'flute_count': 10,
               'flute_depth': 0.057,
               'capital_flare': 1.57}},
 {'id': 'C176',
  'name': 'Banded Round — Grand',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.43,
               'plinth_height': 0.14,
               'flute_count': 12,
               'flute_depth': 0.065,
               'capital_flare': 1.6}},
 {'id': 'C177',
  'name': 'Banded Round — Estate',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.44,
               'plinth_height': 0.195,
               'flute_count': 14,
               'flute_depth': 0.073,
               'capital_flare': 1.63}},
 {'id': 'C178',
  'name': 'Banded Round — Monument',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.45,
               'plinth_height': 0.25,
               'flute_count': 16,
               'flute_depth': 0.081,
               'capital_flare': 1.66}},
 {'id': 'C179',
  'name': 'Banded Round — Tall Profile',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.46,
               'plinth_height': 0.305,
               'flute_count': 18,
               'flute_depth': 0.089,
               'capital_flare': 1.69}},
 {'id': 'C180',
  'name': 'Banded Round — Signature',
  'family': 'Banded Round',
  'settings': {'column_style': 'BANDED',
               'column_size': 0.47,
               'plinth_height': 0.36,
               'flute_count': 20,
               'flute_depth': 0.097,
               'capital_flare': 1.72}},
 {'id': 'C181',
  'name': 'Spiral Fluted — Compact',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.28,
               'plinth_height': 0.14,
               'flute_count': 8,
               'flute_depth': 0.025,
               'capital_flare': 1.15}},
 {'id': 'C182',
  'name': 'Spiral Fluted — Slender',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.29,
               'plinth_height': 0.195,
               'flute_count': 10,
               'flute_depth': 0.033,
               'capital_flare': 1.18}},
 {'id': 'C183',
  'name': 'Spiral Fluted — Balanced',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.3,
               'plinth_height': 0.25,
               'flute_count': 12,
               'flute_depth': 0.041,
               'capital_flare': 1.21}},
 {'id': 'C184',
  'name': 'Spiral Fluted — Broad Base',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.31,
               'plinth_height': 0.305,
               'flute_count': 14,
               'flute_depth': 0.049,
               'capital_flare': 1.24}},
 {'id': 'C185',
  'name': 'Spiral Fluted — Wide Capital',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.32,
               'plinth_height': 0.36,
               'flute_count': 16,
               'flute_depth': 0.057,
               'capital_flare': 1.27}},
 {'id': 'C186',
  'name': 'Spiral Fluted — Raised Base',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.33,
               'plinth_height': 0.14,
               'flute_count': 18,
               'flute_depth': 0.065,
               'capital_flare': 1.3}},
 {'id': 'C187',
  'name': 'Spiral Fluted — Fine Detail',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.34,
               'plinth_height': 0.195,
               'flute_count': 20,
               'flute_depth': 0.073,
               'capital_flare': 1.33}},
 {'id': 'C188',
  'name': 'Spiral Fluted — Deep Detail',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.35,
               'plinth_height': 0.25,
               'flute_count': 22,
               'flute_depth': 0.081,
               'capital_flare': 1.36}},
 {'id': 'C189',
  'name': 'Spiral Fluted — Porch',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.36,
               'plinth_height': 0.305,
               'flute_count': 24,
               'flute_depth': 0.089,
               'capital_flare': 1.39}},
 {'id': 'C190',
  'name': 'Spiral Fluted — Veranda',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.37,
               'plinth_height': 0.36,
               'flute_count': 26,
               'flute_depth': 0.097,
               'capital_flare': 1.42}},
 {'id': 'C191',
  'name': 'Spiral Fluted — Balcony',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.38,
               'plinth_height': 0.14,
               'flute_count': 28,
               'flute_depth': 0.025,
               'capital_flare': 1.45}},
 {'id': 'C192',
  'name': 'Spiral Fluted — Entrance',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.39,
               'plinth_height': 0.195,
               'flute_count': 30,
               'flute_depth': 0.033,
               'capital_flare': 1.48}},
 {'id': 'C193',
  'name': 'Spiral Fluted — Garden',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.4,
               'plinth_height': 0.25,
               'flute_count': 32,
               'flute_depth': 0.041,
               'capital_flare': 1.51}},
 {'id': 'C194',
  'name': 'Spiral Fluted — Courtyard',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.41,
               'plinth_height': 0.305,
               'flute_count': 8,
               'flute_depth': 0.049,
               'capital_flare': 1.54}},
 {'id': 'C195',
  'name': 'Spiral Fluted — Formal',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.42,
               'plinth_height': 0.36,
               'flute_count': 10,
               'flute_depth': 0.057,
               'capital_flare': 1.57}},
 {'id': 'C196',
  'name': 'Spiral Fluted — Grand',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.43,
               'plinth_height': 0.14,
               'flute_count': 12,
               'flute_depth': 0.065,
               'capital_flare': 1.6}},
 {'id': 'C197',
  'name': 'Spiral Fluted — Estate',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.44,
               'plinth_height': 0.195,
               'flute_count': 14,
               'flute_depth': 0.073,
               'capital_flare': 1.63}},
 {'id': 'C198',
  'name': 'Spiral Fluted — Monument',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.45,
               'plinth_height': 0.25,
               'flute_count': 16,
               'flute_depth': 0.081,
               'capital_flare': 1.66}},
 {'id': 'C199',
  'name': 'Spiral Fluted — Tall Profile',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.46,
               'plinth_height': 0.305,
               'flute_count': 18,
               'flute_depth': 0.089,
               'capital_flare': 1.69}},
 {'id': 'C200',
  'name': 'Spiral Fluted — Signature',
  'family': 'Spiral Fluted',
  'settings': {'column_style': 'SPIRAL',
               'column_size': 0.47,
               'plinth_height': 0.36,
               'flute_count': 20,
               'flute_depth': 0.097,
               'capital_flare': 1.72}}]
COLUMN_BY_ID = {v["id"]: v for v in COLUMN_STYLES}
COLUMN_ITEMS = [(v["id"],v["id"]+" · "+v["name"],v["family"]) for v in COLUMN_STYLES]


def material(name, color, roughness=0.6, metallic=0.0):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        mat.diffuse_color = color
    return mat


def textured_material(name, kind, color, scale=1.0, projection="ROOF"):
    """Self-contained metre-scale procedural surfaces; reusable named materials."""
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    def node(kind, x, y):
        n = nodes.new(kind)
        n.location = (x,y)
        return n
    out = node("ShaderNodeOutputMaterial",1000,100)
    bs = node("ShaderNodeBsdfPrincipled",740,100)
    links.new(bs.outputs["BSDF"],out.inputs["Surface"])
    bs.inputs["Roughness"].default_value = 0.7
    tex = node("ShaderNodeTexCoord",-1100,200)
    mapping = node("ShaderNodeVectorMath",-900,200)
    mapping.operation = "SCALE"
    links.new(tex.outputs["Object"], mapping.inputs[0])
    mapping.inputs[3].default_value = scale
    coord = mapping.outputs["Vector"]
    noise = node("ShaderNodeTexNoise",-650,-300)
    links.new(coord,noise.inputs["Vector"])
    noise.inputs["Scale"].default_value = 85
    noise.inputs["Detail"].default_value = 3
    ramp = node("ShaderNodeValToRGB",-50,200)
    ramp.color_ramp.elements[0].position = 0.18
    ramp.color_ramp.elements[0].color = tuple(v*0.55 for v in color)+(1,)
    ramp.color_ramp.elements[1].position = 0.82
    ramp.color_ramp.elements[1].color = tuple(min(1,v*1.22) for v in color)+(1,)
    links.new(noise.outputs["Fac"],ramp.inputs["Fac"])
    height = noise.outputs["Fac"]
    if kind in {"BRICK", "BLOCK", "STONE", "TILE", "SHINGLE"}:
        sep = node("ShaderNodeSeparateXYZ",-720,500)
        links.new(coord,sep.inputs[0])
        def brick(vector, y):
            n = node("ShaderNodeTexBrick",-350,y)
            links.new(vector,n.inputs["Vector"])
            n.inputs["Scale"].default_value = 1
            n.inputs["Color1"].default_value = tuple(v*0.75 for v in color)+(1,)
            n.inputs["Color2"].default_value = tuple(min(1,v*1.2) for v in color)+(1,)
            n.inputs["Mortar"].default_value = (0.27,0.25,0.22,1) if kind == "BRICK" else (0.025,0.03,0.035,1)
            n.inputs["Mortar Size"].default_value = 0.008 if kind == "BRICK" else 0.006
            n.inputs["Mortar Smooth"].default_value = 0.002
            n.inputs["Brick Width"].default_value = {"BRICK":0.24,"BLOCK":0.4,"STONE":0.55}.get(kind,0.32)
            n.inputs["Row Height"].default_value = {"BRICK":0.075,"BLOCK":0.2,"STONE":0.26}.get(kind,0.23)
            return n
        if projection == "WALL":
            # Project onto XZ / YZ and blend by local surface normal.
            projections = []
            for axis, y in [("X",600),("Y",900)]:
                combine = node("ShaderNodeCombineXYZ",-550,y)
                links.new(sep.outputs[axis],combine.inputs["X"])
                links.new(sep.outputs["Z"],combine.inputs["Y"])
                projections.append(brick(combine.outputs[0],y))
            geo = node("ShaderNodeNewGeometry",-1100,1050)
            trans = node("ShaderNodeVectorTransform",-900,1050)
            trans.vector_type = "NORMAL"
            trans.convert_from = "WORLD"
            trans.convert_to = "OBJECT"
            links.new(geo.outputs["Normal"],trans.inputs["Vector"])
            normal = node("ShaderNodeSeparateXYZ",-720,1100)
            links.new(trans.outputs[0],normal.inputs[0])
            absolute = node("ShaderNodeMath",-520,1200)
            absolute.operation = "ABSOLUTE"
            links.new(normal.outputs["X"],absolute.inputs[0])
            mix = node("ShaderNodeMixRGB",50,600)
            links.new(absolute.outputs[0],mix.inputs[0])
            links.new(projections[0].outputs["Color"],mix.inputs[1])
            links.new(projections[1].outputs["Color"],mix.inputs[2])
            links.new(mix.outputs[0],bs.inputs["Base Color"])
            mask = node("ShaderNodeMixRGB",50,850)
            links.new(absolute.outputs[0],mask.inputs[0])
            links.new(projections[0].outputs["Fac"],mask.inputs[1])
            links.new(projections[1].outputs["Fac"],mask.inputs[2])
            height = mask.outputs[0]
        else:
            pattern = brick(coord,500)
            links.new(pattern.outputs["Color"],bs.inputs["Base Color"])
            height = pattern.outputs["Fac"]
    elif kind in {"WOOD", "SIDING", "METAL"}:
        stretch = node("ShaderNodeVectorMath",-700,0)
        stretch.operation = "MULTIPLY"
        links.new(coord,stretch.inputs[0])
        stretch.inputs[1].default_value = (12,12,0.65) if kind == "WOOD" else (1,1,1)
        grain = node("ShaderNodeTexNoise",-430,0)
        links.new(stretch.outputs[0],grain.inputs["Vector"])
        grain.inputs["Scale"].default_value = 6
        grain.inputs["Detail"].default_value = 3
        links.new(grain.outputs["Fac"],ramp.inputs["Fac"])
        if kind in {"SIDING", "METAL"}:
            wave = node("ShaderNodeTexWave",-380,450)
            wave.wave_type = "BANDS"
            wave.bands_direction = "Z" if kind == "SIDING" else "X"
            wave.wave_profile = "SAW" if kind == "SIDING" else "SIN"
            wave.inputs["Scale"].default_value = 1.6 if kind == "SIDING" else 3.2
            wave.inputs["Distortion"].default_value = 0
            links.new(coord,wave.inputs["Vector"])
            height = wave.outputs["Fac"]
        else:
            height = grain.outputs["Fac"]
        links.new(ramp.outputs["Color"],bs.inputs["Base Color"])
        if kind == "METAL":
            bs.inputs["Metallic"].default_value = 0.8
            bs.inputs["Roughness"].default_value = 0.32
    else:
        links.new(ramp.outputs["Color"],bs.inputs["Base Color"])
    micro = node("ShaderNodeBump",250,-200)
    links.new(noise.outputs["Fac"],micro.inputs["Height"])
    micro.inputs["Strength"].default_value = 0.25
    micro.inputs["Distance"].default_value = 0.003
    bump = node("ShaderNodeBump",500,-50)
    links.new(micro.outputs["Normal"],bump.inputs["Normal"])
    links.new(height,bump.inputs["Height"])
    bump.inputs["Strength"].default_value = 0.5
    bump.inputs["Distance"].default_value = 0.018 if kind in {"BRICK","BLOCK","STONE","TILE","SHINGLE","SIDING","METAL"} else 0.004
    if kind in {"BRICK","BLOCK","STONE","TILE","SHINGLE"}:
        bump.invert = True  # Brick Fac is the mortar mask: recess it.
    links.new(bump.outputs["Normal"],bs.inputs["Normal"])
    if kind == "STUCCO":
        noise.inputs["Scale"].default_value = 28
        bump.inputs["Distance"].default_value = 0.018
        bs.inputs["Roughness"].default_value = 0.88
    elif kind == "CONCRETE":
        noise.inputs["Scale"].default_value = 45
        bs.inputs["Roughness"].default_value = 0.85
    elif kind == "PLASTER":
        noise.inputs["Scale"].default_value = 110
        bump.inputs["Distance"].default_value = 0.002
    elif kind == "TILE":
        bs.inputs["Roughness"].default_value = 0.3
    elif kind == "STONE":
        noise.inputs["Scale"].default_value = 55
        micro.inputs["Distance"].default_value = 0.008
        bs.inputs["Roughness"].default_value = 0.78
    return mat


WEATHER_FIELDS = ("moss", "rust", "oxidation", "dirt", "streaks", "salt", "wear", "wetness")
WEATHER_PRESETS = {
    "FRESH": ("Fresh / Clean", (0,0,0,0,0,0,0,0)),
    "TROPICAL": ("Tropical Damp", (.6,.15,.1,.35,.6,.15,.15,.4)),
    "COASTAL": ("Coastal Salt Air", (.2,.5,.55,.25,.4,.6,.3,.15)),
    "AGED": ("Aged / Neglected", (.7,.55,.4,.65,.75,.4,.6,.1)),
    "RUSTED": ("Rusty Metal", (.05,.9,.2,.35,.45,.1,.3,.05)),
    "RAIN": ("Rain Soaked", (.3,.1,.05,.2,.8,.05,.1,.8)),
}
WEATHER_ITEMS = [(key,name,"") for key,(name,values) in WEATHER_PRESETS.items()]


def weathered_material(base, role, settings, metallic_surface=False):
    """Copy-on-write procedural overlays: never modify the clean source material."""
    if not settings.env_enabled or role == "glass": return base
    amounts={k:getattr(settings,"env_"+k)*settings.env_strength for k in WEATHER_FIELDS}
    if not any(amounts.values()): return base
    key=(base.name,role,metallic_surface,settings.env_seed,settings.env_scale,
         settings.env_ground_height,tuple(amounts.items()))
    digest=hashlib.sha1(repr(key).encode()).hexdigest()[:20]
    name="AHB Weather "+digest
    cached=bpy.data.materials.get(name)
    if cached is not None: return cached
    mat=base.copy()
    mat.name=name
    nodes,links=mat.node_tree.nodes,mat.node_tree.links
    bs=next((n for n in nodes if n.type=="BSDF_PRINCIPLED"),None)
    if bs is None: return mat
    def node(kind,label):
        n=nodes.new(kind)
        n.label="Weather · "+label
        n.location=(1200+(len(nodes)%5)*220,-400-(len(nodes)//5)*80)
        return n
    def bind(value,socket):
        if isinstance(value,(int,float,tuple,list)):
            socket.default_value=value
        else: links.new(value,socket)
    def math_node(op,a,b=0):
        n=node("ShaderNodeMath",op)
        n.operation=op
        bind(a,n.inputs[0]);bind(b,n.inputs[1])
        return n.outputs[0]
    def source(socket):
        if socket.is_linked:return socket.links[0].from_socket
        if socket.type=="RGBA":
            n=node("ShaderNodeRGB","original color")
            n.outputs[0].default_value=socket.default_value
        else:
            n=node("ShaderNodeValue","original value")
            n.outputs[0].default_value=socket.default_value
        return n.outputs[0]
    def mix(a,b,f,mode="MIX"):
        n=node("ShaderNodeMixRGB","surface overlay")
        n.blend_type=mode
        bind(f,n.inputs[0]);bind(a,n.inputs[1]);bind(b,n.inputs[2])
        return n.outputs[0]
    def noise(vector,scale):
        n=node("ShaderNodeTexNoise","patch variation")
        links.new(vector,n.inputs["Vector"])
        n.inputs["Scale"].default_value=scale
        n.inputs["Detail"].default_value=3
        return n.outputs["Fac"]
    def threshold(value,lo,hi):
        n=node("ShaderNodeMapRange","coverage mask")
        bind(value,n.inputs["Value"])
        n.inputs["From Min"].default_value=lo
        n.inputs["From Max"].default_value=hi
        n.clamp=True
        return n.outputs["Result"]
    coord=node("ShaderNodeTexCoord","object-space position")
    shift=node("ShaderNodeVectorMath","seed offset")
    shift.operation="ADD"
    links.new(coord.outputs["Object"],shift.inputs[0])
    seed=settings.env_seed
    shift.inputs[1].default_value=(seed*.713,seed*1.137,seed*.391)
    scaled=node("ShaderNodeVectorMath","effect size")
    scaled.operation="SCALE"
    links.new(shift.outputs[0],scaled.inputs[0])
    scaled.inputs[3].default_value=settings.env_scale
    vector=scaled.outputs[0]
    patches=threshold(noise(vector,2.2),.38,.72)
    fine=threshold(noise(vector,32),.55,.78)
    separate=node("ShaderNodeSeparateXYZ","house-local height")
    links.new(coord.outputs["Object"],separate.inputs[0])
    lower=math_node("SUBTRACT",1,math_node("DIVIDE",separate.outputs["Z"],settings.env_ground_height))
    lower=math_node("MAXIMUM",0,lower)
    lower=math_node("MINIMUM",1,lower)
    geo=node("ShaderNodeNewGeometry","surface orientation")
    trans=node("ShaderNodeVectorTransform","local normal")
    trans.vector_type="NORMAL";trans.convert_from="WORLD";trans.convert_to="OBJECT"
    links.new(geo.outputs["Normal"],trans.inputs["Vector"])
    normal=node("ShaderNodeSeparateXYZ","upward surfaces")
    links.new(trans.outputs[0],normal.inputs[0])
    upward=math_node("MAXIMUM",0,normal.outputs["Z"])
    damp=math_node("MAXIMUM",lower,math_node("MULTIPLY",upward,.7))
    # A little sparse moss can grow beyond the ground band as well.
    damp=math_node("MAXIMUM",damp,.12)
    streak_mapping=node("ShaderNodeVectorMath","vertical rain trails")
    streak_mapping.operation="MULTIPLY"
    links.new(vector,streak_mapping.inputs[0])
    streak_mapping.inputs[1].default_value=(7,7,.12)
    rain=threshold(noise(streak_mapping.outputs[0],3),.5,.72)
    vertical=math_node("SUBTRACT",1,upward)
    color=source(bs.inputs["Base Color"])
    rough=source(bs.inputs["Roughness"])
    metal=source(bs.inputs["Metallic"])
    height=0.0
    corrosion=0.0
    def apply(effect,mask,tint,relief=0):
        nonlocal color,height,corrosion
        amount=amounts[effect]
        if amount<=0:return 0.0
        factor=math_node("MULTIPLY",mask,min(1,amount))
        color=mix(color,tint,factor)
        if relief:
            height=math_node("ADD",height,math_node("MULTIPLY",factor,relief))
        return factor
    apply("dirt",patches,(.075,.055,.035,1),.15)
    apply("streaks",math_node("MULTIPLY",rain,vertical),(.085,.08,.065,1),.05)
    apply("salt",math_node("MULTIPLY",patches,lower),(.78,.76,.66,1),.25)
    apply("moss",math_node("MULTIPLY",patches,damp),(.055,.13,.018,1),.7)
    if metallic_surface:
        r=apply("rust",patches,(.31,.075,.018,1),.65)
        o=apply("oxidation",fine,(.055,.32,.23,1),.35)
        corrosion=math_node("MAXIMUM",r,o)
        metal=math_node("MULTIPLY",metal,math_node("SUBTRACT",1,corrosion))
    apply("wear",fine,(.48,.44,.36,1),-.4)
    wet=math_node("MULTIPLY",patches,min(1,amounts["wetness"]))
    color=mix(color,(.42,.46,.43,1),wet,"MULTIPLY")
    rough=math_node("MAXIMUM",rough,math_node("MULTIPLY",patches,min(1,max(amounts["moss"],amounts["dirt"],amounts["salt"])*.9)))
    rough=math_node("MAXIMUM",rough,math_node("MULTIPLY",corrosion,.9))
    rough=math_node("MULTIPLY",rough,math_node("SUBTRACT",1,math_node("MULTIPLY",wet,.75)))
    old_normal=bs.inputs["Normal"].links[0].from_socket if bs.inputs["Normal"].is_linked else None
    bump=node("ShaderNodeBump","weather surface relief")
    bind(height,bump.inputs["Height"])
    bump.inputs["Strength"].default_value=.35
    bump.inputs["Distance"].default_value=.015
    if old_normal is not None: links.new(old_normal,bump.inputs["Normal"])
    links.new(color,bs.inputs["Base Color"])
    links.new(rough,bs.inputs["Roughness"])
    links.new(metal,bs.inputs["Metallic"])
    links.new(bump.outputs["Normal"],bs.inputs["Normal"])
    mat["ahb_weather_source"]=base.name
    return mat


def palette(style, surface="PLASTER", scale=1.0, roof_surface="AUTO", wall_preset="CUSTOM", roof_preset="CUSTOM", weather=None):
    colors = {
        "MODERN": ((0.83,0.85,0.82), (0.09,0.12,0.15)),
        "WARM": ((0.72,0.52,0.33), (0.23,0.075,0.04)),
        "COASTAL": ((0.72,0.83,0.84), (0.15,0.23,0.29)),
    }
    wall, roof = colors[style]
    wall_kind, roof_kind = {"BRICK":("BRICK","TILE"),
                            "PLASTER":("PLASTER","METAL"),
                            "TIMBER":("SIDING","SHINGLE")}[surface]
    if roof_surface != "AUTO": roof_kind = roof_surface
    if surface == "BRICK": wall = (0.48,0.15,0.07)
    if surface == "TIMBER": wall = (0.36,0.19,0.075)
    if wall_preset in TEXTURE_BY_ID:
        entry=TEXTURE_BY_ID[wall_preset]
        wall_kind,wall=entry["kind"],entry["color"]
    if roof_preset in TEXTURE_BY_ID:
        entry=TEXTURE_BY_ID[roof_preset]
        roof_kind,roof=entry["kind"],entry["color"]
    prefix = f"AHB Textured v4 {wall_preset} {roof_preset} {style} {surface} {roof_surface} {scale:.4f} "
    mats = {
        "wall": textured_material(prefix+"Wall",wall_kind,wall,scale,projection="WALL"),
        "roof": textured_material(prefix+"Roof",roof_kind,roof,scale),
        "trim": material("AHB Painted Trim",(0.91,0.9,0.82,1),0.4),
        "floor": textured_material(prefix+"Floor","WOOD",(0.32,0.21,0.12),scale),
        "base": textured_material(prefix+"Concrete","CONCRETE",(0.29,0.3,0.31),scale),
        "door": textured_material(prefix+"Door","WOOD",(0.25,0.11,0.04),scale),
        "metal": material("AHB Hardware",(0.23,0.25,0.28,1),0.25,0.8),
        "glass": material("AHB Blue Glazing",(0.12,0.32,0.42,1),0.13,0.35),
    }

    if weather is not None and weather.env_enabled:
        for role,base in list(mats.items()):
            is_metal=(role=="metal" or (role=="wall" and wall_kind=="METAL") or (role=="roof" and roof_kind=="METAL"))
            mats[role]=weathered_material(base,role,weather,is_metal)
    return mats


def lamp_color(code):
    return {"WARM":(1.0,.68,.35),"NEUTRAL":(1.0,.9,.75),"COOL":(.7,.83,1.0)}[code]


def lamp_emission(code, strength):
    name=f"AHB Lamp Glow {code} {strength:.3f}"
    cached=bpy.data.materials.get(name)
    if cached is not None:return cached
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    bs=mat.node_tree.nodes.get("Principled BSDF")
    color=lamp_color(code)
    bs.inputs["Base Color"].default_value=(*color,1)
    bs.inputs["Emission Color"].default_value=(*color,1)
    bs.inputs["Emission Strength"].default_value=strength
    bs.inputs["Roughness"].default_value=.25
    mat.diffuse_color=(*color,1)
    return mat


def lamp_positions(length, openings, z, fixture_width, fixture_height, targets):
    """Choose wall-clear fixture centres, with aperture/trim/corner clearance."""
    half=fixture_width/2
    corner=.22+half
    spans=[(-length/2+corner,length/2-corner)]
    margin=.12
    for l,r,low,high in openings:
        if z+fixture_height/2 < low-margin or z-fixture_height/2 > high+margin:
            continue
        a,b=l-half-margin,r+half+margin
        result=[]
        for left,right in spans:
            if b<=left or a>=right:result.append((left,right));continue
            if a>left:result.append((left,min(a,right)))
            if b<right:result.append((max(b,left),right))
        spans=result
    chosen=[]
    for target in targets:
        candidates=[]
        for l,r in spans:
            if r-l<.015:continue
            candidates.extend([max(l,min(r,target)),(l+r)/2,l,r])
        candidates=[u for u in candidates if all(abs(u-v)>max(.65,fixture_width+.25) for v in chosen)]
        if candidates:chosen.append(min(candidates,key=lambda u:abs(u-target)))
    return chosen


class Builder:
    def __init__(self, collection, root, mats, bevel):
        self.collection = collection
        self.root = root
        self.mats = mats
        self.bevel = bevel

    def mesh(self, name, vertices, faces, mat, bevel=False):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        self.collection.objects.link(obj)
        obj.parent = self.root
        obj[TAG] = self.root[TAG]
        obj.data.materials.append(self.mats[mat])
        if bevel and self.bevel > 0:
            mod = obj.modifiers.new("Soft architectural edges", "BEVEL")
            mod.width = self.bevel
            mod.segments = 2
        return obj

    def box(self, name, center, size, mat, bevel=False):
        x, y, z = center
        a, b, c = (v / 2 for v in size)
        verts = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
                 (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
        faces = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
        return self.mesh(name, verts, faces, mat, bevel)

    def facade_box(self, name, side, u, v, depth_offset, size, mat, bevel=False):
        # u runs along the facade, v is height; depth_offset points outward.
        width, depth, height = size
        if side in ("Front", "Back"):
            y = (-1 if side == "Front" else 1) * (self.depth / 2 + depth_offset)
            return self.box(name, (u, y, v), (width, depth, height), mat, bevel)
        x = (-1 if side == "Left" else 1) * (self.width / 2 + depth_offset)
        return self.box(name, (x, u, v), (depth, width, height), mat, bevel)

    def wall(self, side, length, bottom, top, openings, thickness):
        # Partition the wall in u/z. Cells inside an opening are omitted:
        # openings remain genuine holes without fragile Boolean modifiers.
        us = sorted(set([-length/2, length/2] + [a for o in openings for a in o[:2]]))
        zs = sorted(set([bottom, top] + [a for o in openings for a in o[2:]]))
        for i, (a, b) in enumerate(zip(us, us[1:])):
            for j, (c, d) in enumerate(zip(zs, zs[1:])):
                u, v = (a+b)/2, (c+d)/2
                if any(l < u < r and low < v < high for l, r, low, high in openings):
                    continue
                self.facade_box(f"{side} wall {i}.{j}", side, u, v, -thickness/2,
                                (b-a, thickness, d-c), "wall")

    def window(self, side, u, bottom, width, height, p):
        f = min(0.075, width/8, height/8)
        mid = bottom + height/2
        for sign in (-1, 1):
            self.facade_box(side + " window jamb", side, u+sign*(width-f)/2, mid,
                            -p.wall_thickness/2, (f, p.wall_thickness+0.04, height), "trim", True)
            self.facade_box(side + " window rail", side, u, mid+sign*(height-f)/2,
                            -p.wall_thickness/2, (width-2*f, p.wall_thickness+0.04, f), "trim", True)
        self.facade_box(side + " glazing", side, u, mid, -p.wall_thickness*0.38,
                        (width-2*f, 0.025, height-2*f), "glass")
        self.facade_box(side + " mullion", side, u, mid, -p.wall_thickness*0.3,
                        (f*0.65, 0.055, height-2*f), "trim")
        self.facade_box(side + " sill", side, u, bottom-0.035, 0.045,
                        (width+0.18, 0.3, 0.07), "trim", True)

    def wall_lamp(self, side, u, z, p):
        style=p.lamp_style
        width=.28 if style=="LANTERN" else .18
        height=.42 if style=="LANTERN" else .32
        self.facade_box("Lamp wall backplate",side,u,z,.035,(width,.07,height),"metal",True)
        if style=="LANTERN":
            self.facade_box("Lantern luminous body",side,u,z,.19,(width*.7,.2,height*.72),"lamp_glow",True)
            for sign in (-1,1):
                self.facade_box("Lantern frame",side,u+sign*width*.38,z,.31,(.025,.025,height*.83),"metal",True)
                self.facade_box("Lantern cap",side,u,z+sign*height*.45,.19,(width*1.16,.3,.06),"metal",True)
        elif style=="UPDOWN":
            self.facade_box("Up down sconce casing",side,u,z,.12,(width,.18,height),"metal",True)
            for sign in (-1,1):
                self.facade_box("Sconce end diffuser",side,u,z+sign*(height/2+.005),.12,(width*.8,.14,.015),"lamp_glow")
        else:
            self.facade_box("Modern wall diffuser",side,u,z,.09,(width*.72,.06,height*.78),"lamp_glow",True)
            self.facade_box("Modern sconce rain hood",side,u,z+height*.48,.09,(width*1.2,.2,.04),"metal",True)
        if not p.lamp_lights:return
        outward={"Front":(0,-1,0),"Back":(0,1,0),"Left":(-1,0,0),"Right":(1,0,0)}[side]
        if side in ("Front","Back"):
            position=(u,outward[1]*(self.depth/2+.36),z-.07)
        else:
            position=(outward[0]*(self.width/2+.36),u,z-.07)
        directions=[-1,1] if style=="UPDOWN" else [-1]
        for vertical in directions:
            light=bpy.data.lights.new("Exterior wall lamp","AREA")
            light.energy=p.lamp_power/len(directions)
            light.color=lamp_color(p.lamp_color)
            light.shape="DISK"
            light.size=.16
            obj=bpy.data.objects.new("Wall lamp light",light)
            self.collection.objects.link(obj)
            obj.parent=self.root
            obj[TAG]=self.root[TAG]
            obj.location=(position[0],position[1],position[2]+(.17 if vertical==1 else -.07))
            direction=Vector((outward[0]*.65,outward[1]*.65,vertical))
            obj.rotation_euler=direction.to_track_quat("-Z","Y").to_euler()

    def auto_lamps(self,side,length,bottom,top,openings,door_center,p):
        if not p.lamps_enabled:return
        if side!="Front" and not p.lamp_security:return
        fw=.28 if p.lamp_style=="LANTERN" else .18
        fh=.42 if p.lamp_style=="LANTERN" else .32
        z=max(bottom+fh/2+.2,min(bottom+p.lamp_height,top-fh/2-.16))
        targets=[door_center-max(.9,p.door_width*.85),door_center+max(.9,p.door_width*.85)] if side=="Front" else [0]
        positions=lamp_positions(length,openings,z,fw,fh,targets)
        if len(positions)<len(targets):
            # Try the clear wall band above window heads if the requested height is crowded.
            higher=top-fh/2-.16
            alternatives=lamp_positions(length,openings,higher,fw,fh,targets)
            if len(alternatives)>len(positions):z,positions=higher,alternatives
        for u in positions:self.wall_lamp(side,u,z,p)

    def security_grille(self,side,u,bottom,width,height):
        n=max(2,math.ceil(width/0.17))
        for i in range(n+1):
            self.facade_box("Window security vertical",side,u-width/2+width*i/n,
                            bottom+height/2,0.075,(0.018,0.025,height),"metal")
        for z in (bottom+0.08,bottom+height/2,bottom+height-0.08):
            self.facade_box("Window security horizontal",side,u,z,0.075,(width,0.025,0.018),"metal")

    def door(self, u, base, p):
        w, h = p.door_width, p.door_height
        self.facade_box("Entrance door", "Front", u, base+h/2, -p.wall_thickness/2,
                        (w-0.1, 0.075, h-0.06), "door", True)
        for sign in (-1, 1):
            self.facade_box("Door casing", "Front", u+sign*(w-0.05)/2, base+h/2,
                            0.025, (0.075, 0.12, h), "trim", True)
        self.facade_box("Door lintel trim", "Front", u, base+h, 0.025,
                        (w+0.05, 0.12, 0.09), "trim", True)
        self.facade_box("Door handle", "Front", u+w*0.3, base+1.0, 0.04,
                        (0.04, 0.08, 0.18), "metal", True)

    def wedge(self, name, cross_section, y0, y1, mat):
        n = len(cross_section)
        verts = [(x, y0, z) for x,z in cross_section] + [(x,y1,z) for x,z in cross_section]
        faces = [tuple(range(n)), tuple(range(2*n-1,n-1,-1))]
        faces += [(i, i+n, (i+1)%n+n, (i+1)%n) for i in range(n)]
        return self.mesh(name, verts, faces, mat)

    def hip_roof(self, cx, cy, width, depth, eave, pitch, overhang, name):
        a, b = width/2+overhang, depth/2+overhang
        slope = math.tan(math.radians(pitch))
        low = eave-overhang*slope
        high = low+min(a,b)*slope
        verts = [(cx-a,cy-b,low),(cx+a,cy-b,low),
                 (cx+a,cy+b,low),(cx-a,cy+b,low)]
        if abs(a-b) < 0.001:
            verts.append((cx,cy,high))
            faces = [(0,1,4),(1,2,4),(2,3,4),(3,0,4)]
        elif a > b:
            verts += [(cx-(a-b),cy,high),(cx+(a-b),cy,high)]
            faces = [(0,1,5,4),(1,2,5),(2,3,4,5),(3,0,4)]
        else:
            verts += [(cx,cy-(b-a),high),(cx,cy+(b-a),high)]
            faces = [(0,1,4),(1,2,5,4),(2,3,5),(3,0,4,5)]
        obj = self.mesh(name,verts,faces,"roof")
        solid = obj.modifiers.new("Roof thickness", "SOLIDIFY")
        solid.thickness = 0.12
        solid.offset = -1
        for y in (-b,b):
            self.box(name+" fascia",(cx,cy+y,low-0.07),(2*a,0.1,0.18),"trim",True)
        for x in (-a,a):
            self.box(name+" fascia",(cx+x,cy,low-0.07),(0.1,2*b,0.18),"trim",True)

    def column(self, x, y, bottom, top, size, style, plinth=0.22,
               flutes=16, flute_depth=0.06, capital_flare=1.35):
        total=top-bottom
        plinth=min(plinth,total*0.2)
        if style == "SQUARE":
            self.box("Veranda square column",(x,y,(bottom+top)/2),(size,size,total),"wall",True)
            for z in (bottom+0.07,top-0.07):
                self.box("Column capital / base",(x,y,z),(size*capital_flare,size*capital_flare,0.14),"trim",True)
            return
        self.box("Column raised square plinth",(x,y,bottom+plinth/2),
                 (size*1.65,size*1.65,plinth),"base",True)
        bottom+=plinth
        h=top-bottom
        cap=size*capital_flare/2
        # Stepped base, tapered shaft and spreading capital. All z levels scale
        # with height, keeping profiles valid for both storey and giant columns.
        profile=[(0,size*.7),(.025*h,size*.7),(.035*h,size*.61),
                 (.05*h,size*.61),(.065*h,size*.51),(.085*h,size*.49),
                 (.87*h,size*.42),(.885*h,size*.47),(.9*h,size*.48),
                 (.915*h,size*.56),(.935*h,cap),(.97*h,cap),(h,cap*1.03)]
        if style == "ORNATE":
            profile=[(0,size*.72),(.025*h,size*.72),(.035*h,size*.6),
                     (.045*h,size*.65),(.06*h,size*.52),(.08*h,size*.49),
                     (.83*h,size*.42),(.845*h,size*.49),(.855*h,size*.43),
                     (.87*h,size*.55),(.89*h,cap*.9),(.91*h,cap*.8),
                     (.93*h,cap),(.95*h,cap*1.06),(.97*h,cap),(h,cap*1.08)]
        if style == "TUSCAN":
            profile=[(0,size*.62),(.035*h,size*.62),(.06*h,size*.5),
                     (.085*h,size*.48),(.9*h,size*.42),(.93*h,size*.48),
                     (.96*h,cap),(h,cap)]
        elif style == "DORIC":
            profile=[(0,size*.63),(.035*h,size*.63),(.06*h,size*.5),
                     (.085*h,size*.49),(.87*h,size*.42),(.89*h,size*.48),
                     (.92*h,cap*.92),(.955*h,cap),(h,cap)]
        elif style == "OCTAGONAL":
            profile=[(0,size*.7),(.04*h,size*.7),(.07*h,size*.5),
                     (.9*h,size*.44),(.93*h,cap),(.97*h,cap),(h,cap)]
        elif style == "SPIRAL":
            # Intermediate shaft rings are required for truly helical grooves.
            for k in range(1,64):
                f=.085+(.87-.085)*k/64
                r=size*(.49-.07*k/64)
                profile.append((f*h,r))
            profile.sort(key=lambda ring:ring[0])
        elif style == "BANDED":
            # Raised collars along the shaft are part of the lathed mesh.
            for f in (.22,.4,.58,.76):
                radius=size*(.49-(f-.085)/(.87-.085)*.07)
                profile.extend([(f*h,radius),((f+.008)*h,radius+size*.11),
                                ((f+.028)*h,radius+size*.11),((f+.036)*h,radius)])
            profile.sort(key=lambda ring:ring[0])
        square=style == "SQUARE_FLUTED"
        fluted=style in {"FLUTED","SQUARE_FLUTED","ORNATE","DORIC","SPIRAL"}
        # Six vertices per groove resolve recessed flutes as real mesh geometry.
        per_side=max(12,math.ceil(flutes/4)*6)
        n=4*per_side if square else (8 if style=="OCTAGONAL" else max(48,flutes*6))
        verts=[]
        for z,r in profile:
            shaft=(.079*h <= z <= .871*h) if style!="ORNATE" else (.079*h <= z <= .831*h)
            depth=flute_depth if fluted and shaft else 0
            for i in range(n):
                if square:
                    edge=i//per_side
                    t=(i%per_side)/per_side
                    # Recess each flat face while retaining its straight corners.
                    recess=depth*size*math.sin(math.pi*max(2,round(flutes/4))*t)**2
                    px,py=(2*t-1)*r,-r+recess
                    for _ in range(edge):px,py=-py,px
                else:
                    angle=2*math.pi*i/n
                    phase=flutes*(z/h)*2*math.pi*.25 if style=="SPIRAL" else 0
                    radius=r-depth*size*(.5-.5*math.cos(flutes*angle-phase))
                    px,py=radius*math.cos(angle),radius*math.sin(angle)
                verts.append((x+px,y+py,bottom+z))
        faces=[tuple(range(n-1,-1,-1)),tuple((len(profile)-1)*n+i for i in range(n))]
        faces += [(j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i)
                  for j in range(len(profile)-1) for i in range(n)]
        # Do not bevel the fine flute edges: doing so is costly and can close grooves.
        self.mesh("Column "+style.replace("_"," ").title(),verts,faces,"trim")
        self.box("Column top abacus",(x,y,top-.025),
                 (2*cap*1.08,2*cap*1.08,.05),"trim",True)

    def rail(self, start, end, base):
        a,b=Vector(start),Vector(end)
        length=(b-a).length
        if length < 0.2: return
        for z in (base+0.14,base+0.9):
            size=(length,0.045,0.045) if abs(a.y-b.y)<0.001 else (0.045,length,0.045)
            self.box("Veranda railing rail",((a.x+b.x)/2,(a.y+b.y)/2,z),size,"metal")
        n=max(2,math.ceil(length/0.14))
        for i in range(n+1):
            pt=a.lerp(b,i/n)
            self.box("Veranda railing picket",(pt.x,pt.y,base+0.52),(0.022,0.022,0.76),"metal")

    def veranda(self, p):
        width=p.width*p.veranda_width
        depth=p.veranda_depth
        wall_y=-p.depth/2
        front=wall_y-depth
        col_y=front+0.2
        count=min(p.porch_columns,max(2,int((width-0.46)/(p.column_size+0.5))+1))
        xs=[-width/2+0.23+(width-0.46)*i/(count-1) for i in range(count)]
        # Closest bay to centre is left open as the ground-level entrance.
        entry=min(range(len(xs)-1),key=lambda i:abs((xs[i]+xs[i+1])/2))
        levels=min(p.floors,2) if p.balcony else 1
        for level in range(levels):
            base=p.foundation+level*p.floor_height
            deck=base+p.slab
            top=base+p.floor_height
            self.box("Raised veranda deck",(0,wall_y-depth/2,base+p.slab/2),
                     (width,depth,p.slab),"base",True)
            if level==0:
                self.box("Veranda foundation",(0,wall_y-depth/2,p.foundation/2),
                         (width,depth,p.foundation),"base",True)
            giant=p.tall_columns and levels==2
            if not giant or level==0:
                column_top=top-0.12+(p.floor_height if giant else 0)
                for x in xs:
                    self.column(x,col_y,deck,column_top,p.column_size,p.column_style,
                                p.plinth_height,p.flute_count,p.flute_depth,p.capital_flare)
            if p.porch_arches:
                for left,right in zip(xs,xs[1:]):
                    l,r=left+p.column_size/2,right-p.column_size/2
                    # Curved underside with solid spandrel above, not a floating arc.
                    spring=top-0.7
                    section=[(l,top)]
                    section += [(l+(r-l)*i/20,spring+0.48*math.sin(math.pi*i/20)) for i in range(21)]
                    section += [(r,top)]
                    self.wedge("Arched veranda beam",section,col_y-0.15,col_y+0.15,"wall")
            else:
                self.box("Veranda beam",(0,col_y,top-0.14),(width,0.32,0.28),"trim",True)
            if p.railings:
                for i,(l,r) in enumerate(zip(xs,xs[1:])):
                    if level==0 and i==entry: continue
                    self.rail((l,col_y,0),(r,col_y,0),deck)
                for x in (xs[0],xs[-1]):
                    self.rail((x,col_y,0),(x,wall_y,0),deck)
        roof_eave=p.foundation+levels*p.floor_height
        # Rear part overlaps main roof: deliberate intersecting roof masses.
        self.hip_roof(0,wall_y-depth/2+0.15,width,depth+0.3,
                      roof_eave,p.roof_pitch,min(p.overhang,0.6),"Veranda hip roof")
        if p.steps:
            l,r=xs[entry],xs[entry+1]
            width_step=max(0.6,r-l-p.column_size)
            rise=p.foundation+p.slab
            n=max(1,math.ceil(rise/0.17))
            for k in range(n):
                run=(n-k)*0.3
                h=rise*(k+1)/n
                self.box("Veranda entry step",((l+r)/2,front-run/2,h/2),
                         (width_step,run,h),"base",True)

    def roof(self, p, eave):
        w, d, t = p.width, p.depth, p.wall_thickness
        if p.roof_style == "HIP":
            self.hip_roof(0,0,w,d,eave,p.roof_pitch,p.overhang,"Main hipped roof")
            return
        a, b = w/2+p.overhang, d/2+p.overhang
        thickness = 0.14
        if p.roof_style == "FLAT":
            self.box("Flat roof slab", (0,0,eave+0.09), (2*a,2*b,0.18), "roof", True)
            for y in (-d/2, d/2):
                self.box("Parapet", (0,y,eave+0.36), (w,t,0.55), "wall", True)
            for x in (-w/2, w/2):
                self.box("Parapet", (x,0,eave+0.36), (t,d-2*t,0.55), "wall", True)
            return
        slope = math.tan(math.radians(p.roof_pitch))
        if p.roof_style == "GABLE":
            ridge = eave+w/2*slope
            low = ridge-a*slope
            for sign in (-1, 1):
                x = sign*a
                section = [(0,ridge),(x,low),(x,low+thickness),(0,ridge+thickness)]
                # Keep the section counterclockwise for outward normals.
                if sign < 0:
                    section.reverse()
                self.wedge("Pitched roof", section, -b, b, "roof")
            section = [(-w/2,eave),(w/2,eave),(0,ridge)]
            self.wedge("Front gable", section, -d/2, -d/2+t, "wall")
            self.wedge("Back gable", section, d/2-t, d/2, "wall")
        else:
            # Shed roof rises left to right. End infills close the attic volume.
            low = eave-p.overhang*slope
            high = eave+(w+p.overhang)*slope
            section = [(-a,low),(a,high),(a,high+thickness),(-a,low+thickness)]
            self.wedge("Shed roof", section, -b,b,"roof")
            triangle = [(-w/2,eave),(w/2,eave),(w/2,eave+w*slope)]
            self.wedge("Front shed infill",triangle,-d/2,-d/2+t,"wall")
            self.wedge("Back shed infill",triangle,d/2-t,d/2,"wall")
            self.box("High side infill", (w/2-t/2,0,eave+w*slope/2),
                     (t,d-2*t,w*slope), "wall")


# Live updates are coalesced/throttled on Blender's main thread, including during dragging.
_PENDING = {}
_LOADING = False
_LIVE_BUSY = False


def live_tick():
    global _LIVE_BUSY
    if not _PENDING:return None
    now=time.monotonic()
    for scene_name,(house_id,due,snapshot) in list(_PENDING.items()):
        if now<due:continue
        _PENDING.pop(scene_name,None)
        scene=bpy.data.scenes.get(scene_name)
        if scene is None or not hasattr(scene,"ahb_settings"):continue
        p=scene.ahb_settings
        if not p.live_update:continue
        root=next((o for o in scene.objects if o.get("ahb_root") and o.get(TAG)==house_id),None)
        creating=house_id is None
        if root is None and not creating:continue
        if creating and (not p.auto_preview or any(o.get("ahb_root") for o in scene.objects)):
            continue
        if bpy.context.mode!="OBJECT" or bpy.app.is_job_running("RENDER") or (bpy.context.screen and bpy.context.screen.is_animation_playing):
            _PENDING[scene_name]=(house_id,now+.2,snapshot)
            continue
        try:
            _LIVE_BUSY=True
            was_active=root is not None and find_root(bpy.context.active_object)==root
            params=SimpleNamespace(**snapshot)
            if creating:
                new_root,collection=construct(SimpleNamespace(scene=scene),params)
                new_root.location=scene.cursor.location
            else:
                new_root=replace_house(SimpleNamespace(scene=scene),params,root)
            if (creating or was_active) and bpy.context.scene==scene:
                for obj in bpy.context.selected_objects:obj.select_set(False)
                new_root.select_set(True)
                bpy.context.view_layer.objects.active=new_root
            p.live_status="Live preview updated"
        except Exception as exc:
            p.live_status="Update failed: "+str(exc)
            print("Suahco4 House Builder:",p.live_status)
        finally:
            _LIVE_BUSY=False
    return .05 if _PENDING else None


def settings_changed(self,context):
    if _LOADING or _LIVE_BUSY or context is None:return
    scene=self.id_data
    if not isinstance(scene,bpy.types.Scene):return
    if not self.live_update:
        _PENDING.pop(scene.name,None)
        self.live_status="Live preview paused"
        return
    root=find_root(context.active_object)
    if root is None or root.name not in scene.objects:
        if not self.auto_preview or any(o.get("ahb_root") for o in scene.objects):
            self.live_status="Select the house to adjust"
            return
        house_id=None
    else:house_id=root[TAG]
    snapshot={key:getattr(self,key) for key in FIELDS}
    pending=_PENDING.get(scene.name)
    due=pending[1] if pending is not None and pending[0]==house_id else time.monotonic()+self.live_delay
    _PENDING[scene.name]=(house_id,due,snapshot)
    self.live_status="Live update queued..."
    if not bpy.app.timers.is_registered(live_tick):
        bpy.app.timers.register(live_tick,first_interval=.05)


def house_choice_changed(self,context):
    if not _LOADING and not _LIVE_BUSY and context is not None:
        apply_catalog_house(context,self.house_library)


def column_choice_changed(self,context):
    if not _LOADING and not _LIVE_BUSY and context is not None:
        apply_column_catalog(context,self.column_library)


def weather_choice_changed(self,context):
    if not _LOADING and not _LIVE_BUSY and context is not None:
        apply_weather_catalog(context)


_LAST_SELECTION=None


def selection_watch():
    """Selection sync only; does not generate geometry or monitor arbitrary edits."""
    global _LOADING,_LAST_SELECTION
    if _LOADING or _LIVE_BUSY:return .15
    context=bpy.context
    scene=context.scene
    if scene is None or not hasattr(scene,"ahb_settings"):return .15
    p=scene.ahb_settings
    # Enable the new default once for scenes saved with an older release.
    if scene.get("ahb_live_release")!="1.5-unified":
        _LOADING=True
        try:
            p.live_update=True
            scene["ahb_live_release"]="1.5-unified"
        finally:_LOADING=False
    if context.mode!="OBJECT":return .15
    root=find_root(context.active_object)
    token=(scene.name,root[TAG]) if root is not None else None
    if token!=_LAST_SELECTION:
        _LAST_SELECTION=token
        if root is not None and p.auto_sync:
            pending=_PENDING.get(scene.name)
            if pending is None or pending[0]!=root[TAG]:
                _LOADING=True
                try:
                    for key in FIELDS:
                        value=root.get("ahb_"+key)
                        if value is not None:setattr(p,key,value)
                    p.live_status="Selected house settings synced"
                finally:_LOADING=False
    return .15


class AHBSettings(bpy.types.PropertyGroup):
    auto_preview: BoolProperty(name="Create first preview automatically", description="Create the first house when a modeling setting changes in a scene without generated houses", default=True, update=settings_changed)
    auto_sync: BoolProperty(name="Follow selected house", description="Automatically load parameters when selecting a different generated house", default=True)

    lamps_enabled: BoolProperty(name="Exterior wall lamps", default=True)
    lamp_style: EnumProperty(name="Lamp design", items=[("MODERN","Modern sconce",""),("UPDOWN","Up / down sconce",""),("LANTERN","Classic lantern","")])
    lamp_security: BoolProperty(name="Side & rear security lamps", default=True)
    lamp_upper: BoolProperty(name="Lamps on upper floors", default=False)
    lamp_height: FloatProperty(name="Mounting height above floor", default=2.35, min=1.6, max=4.5, unit="LENGTH")
    lamp_lights: BoolProperty(name="Enable actual lights", default=True)
    lamp_power: FloatProperty(name="Power per fixture (W)", default=60, min=0, max=1000)
    lamp_color: EnumProperty(name="Light color", items=[("WARM","Warm amber",""),("NEUTRAL","Neutral warm white",""),("COOL","Cool white","")])
    lamp_glow: FloatProperty(name="Diffuser glow", default=3, min=0, max=25)

    env_enabled: BoolProperty(name="Enable Weathering", default=False)
    env_strength: FloatProperty(name="Overall intensity", default=1.0, min=0, max=1)
    env_scale: FloatProperty(name="Pattern scale", default=1.0, min=0.1, max=8)
    env_seed: IntProperty(name="Variation seed", default=0, min=0, max=9999)
    env_ground_height: FloatProperty(name="Damp / salt band height", default=2.0, min=0.2, max=10, unit="LENGTH")
    env_moss: FloatProperty(name="Moss / algae", default=0.35, min=0, max=1)
    env_rust: FloatProperty(name="Rust on metal", default=0.25, min=0, max=1)
    env_oxidation: FloatProperty(name="Green metal patina", default=0.15, min=0, max=1)
    env_dirt: FloatProperty(name="Dirt / grime", default=0.25, min=0, max=1)
    env_streaks: FloatProperty(name="Rain streaks", default=0.35, min=0, max=1)
    env_salt: FloatProperty(name="Salt / efflorescence", default=0.15, min=0, max=1)
    env_wear: FloatProperty(name="Surface wear", default=0.15, min=0, max=1)
    env_wetness: FloatProperty(name="Wet look", default=0.1, min=0, max=1)
    env_preset: EnumProperty(name="Weather preset", items=WEATHER_ITEMS, default="TROPICAL", update=weather_choice_changed)

    house_library: EnumProperty(name="House style (50)", items=HOUSE_ITEMS, update=house_choice_changed)
    texture_library: EnumProperty(name="Wall texture (100)", items=TEXTURE_ITEMS, default="CUSTOM")
    roof_texture_library: EnumProperty(name="Roof texture (100)", items=TEXTURE_ITEMS, default="CUSTOM")

    veranda_enabled: BoolProperty(name="Front veranda", default=True)
    veranda_depth: FloatProperty(name="Veranda depth", default=2.4, min=1.2, max=5, unit="LENGTH")
    veranda_width: FloatProperty(name="Veranda width ratio", default=0.72, min=0.4, max=1)
    porch_columns: IntProperty(name="Columns", default=4, min=2, max=8)
    column_size: FloatProperty(name="Column width", default=0.32, min=0.18, max=0.55, unit="LENGTH")
    column_library: EnumProperty(name="Column preset (200)", items=COLUMN_ITEMS, update=column_choice_changed)
    column_style: EnumProperty(name="Column style", items=[("SQUARE","Square piers",""),("CLASSICAL","Round classical",""),("FLUTED","Fluted round — reference 1",""),("SQUARE_FLUTED","Fluted square — reference 2",""),("ORNATE","Decorative round — reference 3",""),("TUSCAN","Tuscan inspired",""),("DORIC","Doric inspired",""),("OCTAGONAL","Octagonal",""),("BANDED","Banded round",""),("SPIRAL","Spiral fluted","")])
    plinth_height: FloatProperty(name="Column plinth height", default=0.22, min=0.08, max=0.9, unit="LENGTH")
    flute_count: IntProperty(name="Flute count", default=16, min=8, max=32)
    flute_depth: FloatProperty(name="Flute depth ratio", default=0.06, min=0.01, max=0.14)
    capital_flare: FloatProperty(name="Capital spread", default=1.35, min=1.1, max=1.8)
    tall_columns: BoolProperty(name="Double-height front columns", description="Use continuous front columns across a two-level veranda", default=False)
    porch_arches: BoolProperty(name="Arched porch beams", default=True)
    railings: BoolProperty(name="Veranda railings", default=True)
    balcony: BoolProperty(name="Two-level veranda", default=False)
    security_bars: BoolProperty(name="Window security bars", default=True)
    belt_courses: BoolProperty(name="Decorative wall bands", default=True)

    live_update: BoolProperty(name="Live Update", description="Automatically rebuild the selected house after settings change; generated mesh edits are replaced", default=True, update=settings_changed)
    live_delay: FloatProperty(name="Live update interval", description="Coalescing interval: updates continue while dragging as rebuild speed permits", default=0.12, min=0.05, max=2, subtype="TIME")
    live_status: StringProperty(name="Status", default="Ready")

    surface: EnumProperty(name="Surface preset", items=[("BRICK","Brick + Roof Tiles",""),("PLASTER","Plaster + Metal Roof",""),("TIMBER","Timber + Shingles","")], default="PLASTER")
    roof_surface: EnumProperty(name="Roof surface", items=[("AUTO","Match wall preset",""),("TILE","Roof tiles",""),("METAL","Corrugated metal",""),("SHINGLE","Shingles","")])
    texture_scale: FloatProperty(name="Texture scale", description="Larger values make surface details smaller", default=1.0, min=0.25, max=4.0)

    width: FloatProperty(name="Width", default=10, min=4, max=100, unit="LENGTH")
    depth: FloatProperty(name="Depth", default=8, min=4, max=100, unit="LENGTH")
    floors: IntProperty(name="Floors", default=2, min=1, max=12)
    floor_height: FloatProperty(name="Storey height", default=3.1, min=2.6, max=6, unit="LENGTH")
    wall_thickness: FloatProperty(name="Wall thickness", default=0.22, min=0.1, max=0.6, unit="LENGTH")
    slab: FloatProperty(name="Slab thickness", default=0.18, min=0.08, max=0.4, unit="LENGTH")
    foundation: FloatProperty(name="Foundation height", default=0.45, min=0.1, max=2, unit="LENGTH")
    roof_style: EnumProperty(name="Roof", items=[("HIP","Hip — four slopes",""),("GABLE","Gable",""),("SHED","Shed",""),("FLAT","Flat with parapet","")])
    roof_pitch: FloatProperty(name="Pitch (degrees)", default=30, min=5, max=60)
    overhang: FloatProperty(name="Overhang", default=0.45, min=0.05, max=1.5, unit="LENGTH")
    windows_front: IntProperty(name="Front / back bays", default=4, min=1, max=16)
    windows_side: IntProperty(name="Side bays", default=3, min=1, max=16)
    window_width: FloatProperty(name="Window width", default=1.25, min=0.4, max=3, unit="LENGTH")
    window_height: FloatProperty(name="Window height", default=1.35, min=0.5, max=3, unit="LENGTH")
    sill_height: FloatProperty(name="Sill height", default=0.9, min=0.3, max=2, unit="LENGTH")
    door_width: FloatProperty(name="Door width", default=1.1, min=0.7, max=2, unit="LENGTH")
    door_height: FloatProperty(name="Door height", default=2.2, min=1.8, max=3, unit="LENGTH")
    steps: BoolProperty(name="Entrance steps", default=True)
    ground: BoolProperty(name="Site slab", default=True)
    bevel: FloatProperty(name="Edge bevel", default=0.012, min=0, max=0.04, unit="LENGTH")
    style: EnumProperty(name="Palette", items=[("MODERN","Modern",""),("WARM","Warm",""),("COASTAL","Coastal","")])


FIELDS = [key for key in AHBSettings.__annotations__ if key not in {"live_update", "live_delay", "live_status", "house_library", "column_library", "auto_preview", "auto_sync"}]
for _field in FIELDS:
    if _field!="env_preset":
        AHBSettings.__annotations__[_field].keywords["update"] = settings_changed


def find_root(obj):
    while obj:
        if obj.get("ahb_root"):
            return obj
        obj = obj.parent
    return None


def remove_generated_object(obj):
    kind=obj.type
    data=obj.data if kind in {"MESH","LIGHT"} else None
    bpy.data.objects.remove(obj,do_unlink=True)
    if data is not None and data.users==0:
        if kind=="MESH":bpy.data.meshes.remove(data)
        elif kind=="LIGHT":bpy.data.lights.remove(data)


def remove_collection(collection):
    # Only called for a generated collection, never scene-wide selection deletion.
    for obj in list(collection.objects):
        remove_generated_object(obj)
    bpy.data.collections.remove(collection)


def construct(context, p):
    collection = bpy.data.collections.new("House")
    context.scene.collection.children.link(collection)
    root = bpy.data.objects.new("House Controller", None)
    collection.objects.link(root)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 1.0
    root["ahb_root"] = True
    root[TAG] = str(uuid.uuid4())
    for key in FIELDS:
        root["ahb_"+key] = getattr(p, key)
    try:
        b = Builder(collection, root, palette(p.style, p.surface, p.texture_scale, p.roof_surface, p.texture_library, p.roof_texture_library, weather=p), p.bevel)
        b.width, b.depth = p.width, p.depth
        if p.lamps_enabled:
            b.mats["lamp_glow"]=lamp_emission(p.lamp_color,p.lamp_glow if p.lamp_lights else 0)
        w,d,t = p.width,p.depth,p.wall_thickness
        b.box("Foundation", (0,0,p.foundation/2), (w+0.28,d+0.28,p.foundation), "base", True)
        if p.ground:
            b.box("Site slab", (0,0,-0.075), (w+5,d+5,0.15), "base", True)
        for floor in range(p.floors):
            base = p.foundation+floor*p.floor_height
            b.box("Floor slab %02d" % (floor+1), (0,0,base+p.slab/2), (w,d,p.slab), "floor")
            bottom, top = base+p.slab, base+p.floor_height
            for side, length, requested in [("Front",w,p.windows_front),("Back",w,p.windows_front),
                                             ("Left",d,p.windows_side),("Right",d,p.windows_side)]:
                # Leave generous corner piers and at least 0.20 m between apertures.
                count = min(requested, max(1, int((length-0.8)/0.8)))
                spacing = (length-0.8)/count
                ww = min(p.window_width, spacing-0.25)
                wh = min(p.window_height, top-bottom-0.5)
                sill = min(p.sill_height, top-bottom-wh-0.2)
                wb = bottom+max(0.15,sill)
                centers = [-length/2+0.4+spacing*(i+0.5) for i in range(count)]
                door_index = min(range(count), key=lambda i: abs(centers[i]))
                openings = []
                for i,u in enumerate(centers):
                    if side == "Front" and (floor == 0 or (floor == 1 and p.veranda_enabled and p.balcony)) and i == door_index:
                        dw = min(p.door_width, spacing-0.2)
                        dh = min(p.door_height, top-bottom-0.15)
                        # Door methods read a lightweight adapter for clamped dimensions.
                        class DoorSpec: pass
                        spec = DoorSpec()
                        spec.door_width, spec.door_height, spec.wall_thickness = dw,dh,t
                        openings.append((u-dw/2,u+dw/2,bottom,bottom+dh))
                        b.door(u,bottom,spec)
                        if p.steps and floor == 0 and not p.veranda_enabled:
                            rise = bottom
                            n = max(1, math.ceil(rise/0.18))
                            for k in range(n):
                                run = (n-k)*0.28+0.3
                                height = rise*(k+1)/n
                                b.box("Entry step", (u,-d/2-run/2,height/2),
                                      (dw+0.6,run,height),"base",True)
                    else:
                        openings.append((u-ww/2,u+ww/2,wb,wb+wh))
                        b.window(side,u,wb,ww,wh,p)
                        if p.security_bars:
                            b.security_grille(side,u,wb,ww,wh)
                b.wall(side,length,bottom,top,openings,t)
                if floor==0 or p.lamp_upper:
                    b.auto_lamps(side,length,bottom,top,openings,centers[door_index],p)
        if p.belt_courses:
            for level in range(p.floors+1):
                z=p.foundation+level*p.floor_height
                for y in (-d/2,d/2):
                    b.box("Facade belt course",(0,y,z),(w+0.1,t+0.1,0.12),"trim",True)
                for x in (-w/2,w/2):
                    b.box("Side belt course",(x,0,z),(t+0.1,d,0.12),"trim",True)
        b.roof(p,p.foundation+p.floors*p.floor_height)
        if p.veranda_enabled:
            b.veranda(p)
        return root, collection
    except Exception:
        remove_collection(collection)
        raise


def replace_house(context, p, old):
    old_id = old[TAG]
    transform, name = old.matrix_world.copy(), old.name
    root, collection = construct(context, p)
    # Keep the identifier stable so queued adjustments still target this house.
    new_id = root[TAG]
    for obj in collection.objects:
        if obj.get(TAG) == new_id:
            obj[TAG] = old_id
    root.matrix_world = transform
    bpy.context.view_layer.update()
    for child in list(old.children):
        if child.get(TAG) != old_id:
            world = child.matrix_world.copy()
            child.parent = root
            child.matrix_world = world
    old_collections = list(old.users_collection)
    for obj in list(bpy.data.objects):
        if obj.get(TAG) == old_id and obj.name not in collection.objects:
            remove_generated_object(obj)
    for col in old_collections:
        if not col.objects and not col.children:
            bpy.data.collections.remove(col)
    root.name = name
    return root


class AHB_OT_build(bpy.types.Operator):
    bl_idname = "ahb.build"
    bl_label = "Build New House"
    bl_description = "Create a house at the 3D cursor using the panel settings"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        if context.mode != "OBJECT":
            self.report({"WARNING"}, "Switch to Object Mode first")
            return {"CANCELLED"}
        try:
            root, collection = construct(context, context.scene.ahb_settings)
            root.location = context.scene.cursor.location
            for obj in context.selected_objects:
                obj.select_set(False)
            root.select_set(True)
            context.view_layer.objects.active = root
        except Exception as exc:
            self.report({"ERROR"}, "Build failed: " + str(exc))
            return {"CANCELLED"}
        return {"FINISHED"}


class AHB_OT_rebuild(bpy.types.Operator):
    bl_idname = "ahb.rebuild"
    bl_label = "Rebuild Selected House"
    bl_description = "Replace generated geometry; manual mesh edits will be lost"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        return context.mode == "OBJECT" and find_root(context.active_object) is not None

    def execute(self, context):
        old = find_root(context.active_object)
        _PENDING.pop(context.scene.name, None)
        try:
            root = replace_house(context, context.scene.ahb_settings, old)
        except Exception as exc:
            self.report({"ERROR"}, "Rebuild failed: " + str(exc))
            return {"CANCELLED"}
        for obj in context.selected_objects:
            obj.select_set(False)
        root.select_set(True)
        context.view_layer.objects.active = root
        return {"FINISHED"}


class AHB_OT_load(bpy.types.Operator):
    bl_idname = "ahb.load_settings"
    bl_label = "Load Selected House Settings"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        return find_root(context.active_object) is not None

    def execute(self, context):
        global _LOADING
        root = find_root(context.active_object)
        _PENDING.pop(context.scene.name, None)
        _LOADING = True
        try:
            for key in FIELDS:
                value = root.get("ahb_"+key)
                if value is not None:
                    setattr(context.scene.ahb_settings,key,value)
            context.scene.ahb_settings.live_status = "Settings loaded"
        finally:
            _LOADING = False
        return {"FINISHED"}


class AHB_OT_preset(bpy.types.Operator):
    bl_idname = "ahb.liberian_preset"
    bl_label = "Apply Liberian Design Preset"
    bl_description = "Set house parameters from the reference-inspired style; build or enable Live Update to see it"
    bl_options = {"REGISTER", "UNDO"}
    design: EnumProperty(items=[("BUNGALOW","Hip-roof Bungalow",""),("VERANDA","Veranda Bungalow",""),("VILLA","Two-storey Villa","")])

    def execute(self,context):
        global _LOADING
        p=context.scene.ahb_settings
        values=dict(width=12.0,depth=10.0,floors=1,floor_height=3.2,
                    foundation=0.55,roof_style="HIP",roof_pitch=27.0,overhang=0.65,
                    surface="PLASTER",roof_surface="METAL",texture_library="CUSTOM",roof_texture_library="CUSTOM",style="WARM",veranda_enabled=True,
                    veranda_depth=2.4,veranda_width=0.65,porch_columns=3,
                    column_size=0.34,column_style="SQUARE",porch_arches=True,
                    railings=False,balcony=False,security_bars=True,belt_courses=True,
                    windows_front=3,windows_side=3,window_width=1.3,
                    window_height=1.35,sill_height=0.9,steps=True)
        if self.design=="VERANDA":
            values.update(width=13.0,depth=10.0,veranda_width=1.0,porch_columns=4,
                          veranda_depth=2.6,railings=True,roof_pitch=25.0,foundation=0.65,roof_surface="TILE")
        elif self.design=="VILLA":
            values.update(width=14.0,depth=11.0,floors=2,veranda_width=0.62,
                          porch_columns=4,column_style="CLASSICAL",column_size=0.4,
                          balcony=True,railings=True,foundation=0.85,
                          veranda_depth=3.0,roof_pitch=30.0,style="MODERN",roof_surface="TILE")
        _PENDING.pop(context.scene.name,None)
        _LOADING=True
        try:
            for key,value in values.items(): setattr(p,key,value)
        finally:
            _LOADING=False
        settings_changed(p,context)
        self.report({"INFO"},"Preset loaded. Build a house or enable Live Update on the selected house.")
        return {"FINISHED"}


def apply_catalog_house(context, choice):
    global _LOADING
    p=context.scene.ahb_settings
    entry=HOUSE_BY_ID[choice]
    _PENDING.pop(context.scene.name,None)
    _LOADING=True
    try:
        p.house_library=choice
        p.plinth_height=.22
        p.flute_count=16
        p.flute_depth=.06
        p.capital_flare=1.35
        p.tall_columns=False
        for key,value in entry["settings"].items(): setattr(p,key,value)
        p.texture_library="CUSTOM"
        p.roof_texture_library="CUSTOM"
    finally:
        _LOADING=False
    settings_changed(p,context)


class AHB_OT_catalog_apply(bpy.types.Operator):
    bl_idname="ahb.catalog_apply"
    bl_label="Apply House Style"
    bl_description="Load the selected preset; build a new house or use Live Update to update the selected house"
    bl_options={"REGISTER","UNDO"}
    def execute(self,context):
        apply_catalog_house(context,context.scene.ahb_settings.house_library)
        self.report({"INFO"},"Style loaded; Build New House or use Live Update")
        return {"FINISHED"}


class AHB_OT_search_house(bpy.types.Operator):
    bl_idname="ahb.search_house"
    bl_label="Search 50 House Styles"
    bl_property="choice"
    bl_options={"REGISTER","UNDO"}
    choice: EnumProperty(items=HOUSE_ITEMS)
    def invoke(self,context,event):
        context.window_manager.invoke_search_popup(self)
        return {"RUNNING_MODAL"}
    def execute(self,context):
        apply_catalog_house(context,self.choice)
        return {"FINISHED"}


class AHB_OT_search_texture(bpy.types.Operator):
    bl_idname="ahb.search_texture"
    bl_label="Search 100 Texture Presets"
    bl_property="choice"
    bl_options={"REGISTER","UNDO"}
    choice: EnumProperty(items=TEXTURE_ITEMS)
    target: EnumProperty(items=[("WALL","Wall",""),("ROOF","Roof","")], options={"HIDDEN"})
    def invoke(self,context,event):
        context.window_manager.invoke_search_popup(self)
        return {"RUNNING_MODAL"}
    def execute(self,context):
        prop="texture_library" if self.target=="WALL" else "roof_texture_library"
        setattr(context.scene.ahb_settings,prop,self.choice)
        return {"FINISHED"}


class AHB_OT_column_preset(bpy.types.Operator):
    bl_idname="ahb.column_preset"
    bl_label="Apply Reference Column Design"
    bl_options={"REGISTER","UNDO"}
    design: EnumProperty(items=[("FLUTED","Reference 1: Tall Fluted Round",""),("SQUARE_FLUTED","Reference 2: Fluted Square",""),("ORNATE","Reference 3: Decorative Round","")])
    def execute(self,context):
        global _LOADING
        p=context.scene.ahb_settings
        _PENDING.pop(context.scene.name,None)
        _LOADING=True
        try:
            p.veranda_enabled=True
            p.column_style=self.design
            p.column_size=.46 if self.design=="FLUTED" else .4
            p.plinth_height=.48 if self.design=="FLUTED" else .3
            p.flute_count=20 if self.design=="FLUTED" else 16
            p.flute_depth=.065
            p.capital_flare=1.6 if self.design=="ORNATE" else 1.4
            p.tall_columns=self.design=="FLUTED"
            if p.tall_columns:
                p.floors=max(2,p.floors)
                p.balcony=True
        finally:
            _LOADING=False
        settings_changed(p,context)
        self.report({"INFO"},"Column design loaded; build or rebuild with Live Update")
        return {"FINISHED"}


def apply_column_catalog(context, choice):
    global _LOADING
    p=context.scene.ahb_settings
    _PENDING.pop(context.scene.name,None)
    _LOADING=True
    try:
        p.column_library=choice
        p.veranda_enabled=True
        for key,value in COLUMN_BY_ID[choice]["settings"].items():
            setattr(p,key,value)
    finally:
        _LOADING=False
    settings_changed(p,context)


class AHB_OT_catalog_column(bpy.types.Operator):
    bl_idname="ahb.catalog_column"
    bl_label="Apply Column Preset"
    bl_description="Apply the selected column design without changing floors or veranda layout"
    bl_options={"REGISTER","UNDO"}
    def execute(self,context):
        apply_column_catalog(context,context.scene.ahb_settings.column_library)
        self.report({"INFO"},"Column preset loaded; build or rebuild with Live Update")
        return {"FINISHED"}


class AHB_OT_search_column(bpy.types.Operator):
    bl_idname="ahb.search_column"
    bl_label="Search 200 Column Designs"
    bl_property="choice"
    bl_options={"REGISTER","UNDO"}
    choice: EnumProperty(items=COLUMN_ITEMS)
    def invoke(self,context,event):
        context.window_manager.invoke_search_popup(self)
        return {"RUNNING_MODAL"}
    def execute(self,context):
        apply_column_catalog(context,self.choice)
        return {"FINISHED"}


def apply_weather_catalog(context):
    global _LOADING
    p=context.scene.ahb_settings
    _PENDING.pop(context.scene.name,None)
    _LOADING=True
    try:
        p.env_enabled=True
        p.env_strength=1.0
        for key,value in zip(WEATHER_FIELDS,WEATHER_PRESETS[p.env_preset][1]):
            setattr(p,"env_"+key,value)
    finally:_LOADING=False
    settings_changed(p,context)


class AHB_OT_weather_preset(bpy.types.Operator):
    bl_idname="ahb.weather_preset"
    bl_label="Apply Weather Preset"
    bl_options={"REGISTER","UNDO"}
    def execute(self,context):
        apply_weather_catalog(context)
        return {"FINISHED"}


class AHB_PT_panel(bpy.types.Panel):
    bl_label = "Advanced House Builder"
    bl_idname = "AHB_PT_panel"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "House Builder"

    def draw(self, context):
        layout = self.layout
        p = context.scene.ahb_settings
        library=layout.box()
        library.label(text="House Library — 50 Presets",icon="HOME")
        library.prop(p,"house_library",text="")
        row=library.row(align=True)
        row.operator("ahb.catalog_apply",text="Apply Style")
        row.operator("ahb.search_house",text="Search",icon="VIEWZOOM")
        textures=layout.box()
        textures.label(text="Texture Library — 100 Presets")
        textures.prop(p,"texture_library",text="Walls")
        op=textures.operator("ahb.search_texture",text="Search Wall Textures",icon="VIEWZOOM")
        op.target="WALL"
        textures.prop(p,"roof_texture_library",text="Roof")
        op=textures.operator("ahb.search_texture",text="Search Roof Textures",icon="VIEWZOOM")
        op.target="ROOF"
        textures.label(text="Custom uses surface controls below.")
        presets=layout.box()
        presets.label(text="Liberian Reference Styles", icon="HOME")
        for code,label in [("BUNGALOW","Hip-roof Bungalow"),("VERANDA","Veranda Bungalow"),("VILLA","Two-storey Villa")]:
            op=presets.operator("ahb.liberian_preset",text=label)
            op.design=code
        columns=layout.box()
        columns.label(text="Column Library — 200 Presets")
        columns.prop(p,"column_library",text="")
        row=columns.row(align=True)
        row.operator("ahb.catalog_column",text="Apply Column")
        row.operator("ahb.search_column",text="Search",icon="VIEWZOOM")
        columns.separator()
        columns.label(text="Column Reference Designs")
        for code,label in [("FLUTED","1 · Tall Fluted Round"),("SQUARE_FLUTED","2 · Fluted Square"),("ORNATE","3 · Decorative Round")]:
            op=columns.operator("ahb.column_preset",text=label)
            op.design=code
        live = layout.box()
        live.prop(p, "live_update", toggle=True, icon="FILE_REFRESH")
        if p.live_update:
            live.prop(p, "live_delay")
            live.label(text=p.live_status)
            live.prop(p,"auto_sync")
            live.prop(p,"auto_preview")
            live.label(text="All add-on modeling controls update live.")
        env=layout.box()
        env.label(text="Environment & Weathering")
        env.prop(p,"env_enabled",toggle=True)
        row=env.row(align=True)
        row.prop(p,"env_preset",text="")
        row.operator("ahb.weather_preset",text="Apply")
        if p.env_enabled:
            for key in ["env_strength","env_scale","env_seed","env_ground_height"]+["env_"+k for k in WEATHER_FIELDS]:
                env.prop(p,key)
            env.label(text="Rust / patina affect metal surfaces only.")
        layout.label(text="Dimensions use Blender units", icon="INFO")
        for label, fields in [
            ("Structure",["width","depth","floors","floor_height","wall_thickness","slab","foundation"]),
            ("Roof",["roof_style","roof_pitch","overhang"]),
            ("Windows",["windows_front","windows_side","window_width","window_height","sill_height"]),
            ("Liberian Veranda",["veranda_enabled","veranda_depth","veranda_width","porch_columns","column_size","column_style","plinth_height","flute_count","flute_depth","capital_flare","tall_columns","porch_arches","railings","balcony","security_bars","belt_courses"]),
            ("Automatic Wall Lamps",["lamps_enabled","lamp_style","lamp_security","lamp_upper","lamp_height","lamp_lights","lamp_power","lamp_color","lamp_glow"]),
            ("Procedural Textures",["surface","roof_surface","texture_scale"]),
            ("Entrance & Finish",["door_width","door_height","steps","ground","style","bevel"]),
        ]:
            box = layout.box()
            box.label(text=label)
            for key in fields:
                row = box.row()
                row.enabled = key != "roof_pitch" or p.roof_style != "FLAT"
                row.prop(p,key)
        layout.operator("ahb.build", icon="HOME")
        layout.separator()
        layout.operator("ahb.load_settings", icon="IMPORT")
        layout.operator("ahb.rebuild", icon="FILE_REFRESH")
        layout.label(text="Rebuild replaces generated mesh edits.", icon="ERROR")


CLASSES = (AHBSettings, AHB_OT_build, AHB_OT_rebuild, AHB_OT_load, AHB_OT_preset, AHB_OT_catalog_apply, AHB_OT_search_house, AHB_OT_search_texture, AHB_OT_column_preset, AHB_OT_catalog_column, AHB_OT_search_column, AHB_OT_weather_preset, AHB_PT_panel)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    bpy.types.Scene.ahb_settings = PointerProperty(type=AHBSettings)
    if not bpy.app.timers.is_registered(selection_watch):
        bpy.app.timers.register(selection_watch,first_interval=.15,persistent=True)


def unregister():
    global _LAST_SELECTION
    _LAST_SELECTION=None
    _PENDING.clear()
    if bpy.app.timers.is_registered(selection_watch):
        bpy.app.timers.unregister(selection_watch)
    if bpy.app.timers.is_registered(live_tick):
        bpy.app.timers.unregister(live_tick)
    if hasattr(bpy.types.Scene,"ahb_settings"):
        del bpy.types.Scene.ahb_settings
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)


if __name__ == "__main__":
    register()
