#!/usr/bin/env python3
"""Convert an IFC building (from Homemaker's rooms2ifc.py) into a single GLB for the game.

IFC is Z-up in metres; the game is Y-up, so (x, y, z) becomes (x, z, -y). Each IFC
surface style becomes one glTF material, keeping its colour. Writes one mesh, centred
on X/Z and standing on y = 0, which HouseModel.js scales to each block's footprint.

Usage (needs ifcopenshell, numpy and trimesh):
    python3 tools/ifc_to_glb.py house.ifc assets/Environment/homemaker-house.glb
"""
import sys

import ifcopenshell
import ifcopenshell.geom
import numpy as np
import trimesh


# Classes that only describe the building (no visible surfaces) or that duplicate their children.
SKIP = {
    "IfcOpeningElement", "IfcSpace", "IfcAnnotation", "IfcSite", "IfcBuilding", "IfcBuildingStorey",
    "IfcFooting", "IfcElementAssembly", "IfcStructuralCurveConnection", "IfcStructuralSurfaceMember",
    "IfcStructuralCurveMember", "IfcStructuralPointConnection", "IfcStructuralAnalysisModel",
}


def build(ifc_path):
    # One product at a time: the whole-model iterator stalls on the structural members.
    model = ifcopenshell.open(ifc_path)
    settings = ifcopenshell.geom.settings()
    settings.set(settings.USE_WORLD_COORDS, True)
    parts = []
    for product in model.by_type("IfcProduct"):
        if product.is_a() in SKIP:
            continue
        try:
            shape = ifcopenshell.geom.create_shape(settings, product)
        except RuntimeError:
            continue  # no representation (for example an empty placeholder)
        geometry = shape.geometry
        verts = np.array(geometry.verts, dtype=float).reshape(-1, 3)
        faces = np.array(geometry.faces, dtype=np.int64).reshape(-1, 3)
        if len(faces) == 0:
            continue
        colour = [0.8, 0.8, 0.8, 1.0]
        if geometry.materials:
            diffuse = geometry.materials[0].diffuse
            # ifcopenshell exposes the colour as a sequence of R, G, B in `components`.
            rgb = list(diffuse.components)[:3]
            colour = [float(rgb[0]), float(rgb[1]), float(rgb[2]), 1.0]
        parts.append((verts, faces, colour))
    return parts


def to_game_space(verts):
    # IFC (x, y, z) Z-up -> game (x, z, -y) Y-up.
    return np.column_stack([verts[:, 0], verts[:, 2], -verts[:, 1]])


def main(ifc_path, glb_path):
    parts = build(ifc_path)
    if not parts:
        sys.exit(f"{ifc_path}: no geometry found")
    meshes = []
    for verts, faces, colour in parts:
        mesh = trimesh.Trimesh(vertices=to_game_space(verts), faces=faces, process=False)
        mesh.visual.face_colors = np.tile(np.round(np.array(colour) * 255).astype(np.uint8), (len(faces), 1))
        meshes.append(mesh)
    combined = trimesh.util.concatenate(meshes)
    # Centre on X/Z and stand on the ground, as the game expects.
    bounds = combined.bounds
    combined.apply_translation([-(bounds[0][0] + bounds[1][0]) / 2, -bounds[0][1], -(bounds[0][2] + bounds[1][2]) / 2])
    combined.export(glb_path)
    size = combined.bounds[1] - combined.bounds[0]
    print(f"wrote {glb_path}: {len(combined.faces)} triangles, size {size[0]:.2f} x {size[1]:.2f} x {size[2]:.2f} m")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
