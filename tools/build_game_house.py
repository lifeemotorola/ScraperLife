#!/usr/bin/env python3
"""Build the game's house model: Homemaker design + porch, door and chimney.

1. Homemaker's rooms2ifc.py turns home maker/designs/game_house.rooms.json into IFC.
2. tools/ifc_to_glb.py converts that IFC (doors and windows included) into game-space parts.
3. This script adds the porch, steps and chimney, which Homemaker's rooms don't place,
   and writes one GLB, assets/Environment/homemaker-house.glb.

Run with a Python that has ifcopenshell, numpy, trimesh and Homemaker's requirements:
    python3 tools/build_game_house.py
IFC space: x across the front, y deep (front wall at y = 0, porch in front of it, y < 0),
z up. The conversion to game space is applied to every part, extras included.
"""
import os
import subprocess
import sys
import tempfile

import numpy as np
import trimesh

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))

import ifc_to_glb  # noqa: E402

RULES = os.path.join(ROOT, "home maker", "designs", "game_house.rooms.json")
ROOMS2IFC = os.path.join(ROOT, "home maker", "rooms2ifc.py")
OUT = os.path.join(ROOT, "assets", "Environment", "homemaker-house.glb")

DECK = [0x9c, 0x80, 0x68]
ROOF = [0x5a, 0x4a, 0x3e]
WHITE = [0xe8, 0xe2, 0xd0]
DOOR = [0x2e, 0x4d, 0x3a]
CHIMNEY = [0x7a, 0x4a, 0x3a]
STEP = [0xb8, 0xb0, 0xa0]


def rgb(colour):
    return [c / 255 for c in colour] + [1.0]


def box(lo, hi, colour):
    """An axis-aligned box in IFC space, as (verts, faces, colour) like ifc_to_glb parts."""
    lo, hi = np.array(lo, float), np.array(hi, float)
    mesh = trimesh.creation.box(extents=hi - lo)
    mesh.apply_translation((lo + hi) / 2)
    return np.asarray(mesh.vertices), np.asarray(mesh.faces), rgb(colour)


def extras():
    """Porch, steps and chimney. The front door is Homemaker's own "house entrance" (an IfcDoor
    from share/library.ifc), placed at the middle of the hall's front wall, x = 1.5."""
    parts = []
    # Porch over the hall's front wall: a deck, a roof on four posts, and two steps down.
    parts.append(box([-0.3, -2.6, 0.0], [3.3, 0.0, 0.18], DECK))
    parts.append(box([-0.5, -2.8, 2.9], [3.5, 0.2, 3.1], ROOF))
    for x in (0.0, 3.0):
        for y in (-2.5, -0.1):
            parts.append(box([x - 0.08, y - 0.08, 0.18], [x + 0.08, y + 0.08, 2.9], WHITE))
    parts.append(box([0.5, -3.2, 0.0], [2.5, -2.6, 0.09], STEP))
    parts.append(box([0.5, -3.6, 0.0], [2.5, -3.2, 0.04], STEP))
    # Chimney on the roof of the rear slope.
    parts.append(box([5.4, 4.2, 6.0], [6.2, 5.0, 8.9], CHIMNEY))
    return parts


def main():
    with tempfile.TemporaryDirectory() as tmp:
        ifc_path = os.path.join(tmp, "house.ifc")
        subprocess.run([sys.executable, ROOMS2IFC, RULES, ifc_path], check=True)
        parts = ifc_to_glb.build(ifc_path)
    parts += extras()
    meshes = []
    for verts, faces, colour in parts:
        mesh = trimesh.Trimesh(vertices=ifc_to_glb.to_game_space(verts), faces=faces, process=False)
        mesh.visual.face_colors = np.tile(np.round(np.array(colour) * 255).astype(np.uint8), (len(faces), 1))
        meshes.append(mesh)
    combined = trimesh.util.concatenate(meshes)
    bounds = combined.bounds
    combined.apply_translation([-(bounds[0][0] + bounds[1][0]) / 2, -bounds[0][1], -(bounds[0][2] + bounds[1][2]) / 2])
    combined.export(OUT)
    size = combined.bounds[1] - combined.bounds[0]
    print(f"wrote {OUT}: {len(combined.faces)} triangles, size {size[0]:.2f} x {size[1]:.2f} x {size[2]:.2f} m")


if __name__ == "__main__":
    main()
