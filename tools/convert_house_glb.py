#!/usr/bin/env python3
"""Convert assets/Environment/old-house.dae into a compact GLB the game loads.

The COLLADA file is 4.7 MB of XML that the browser must parse on every visit, and its textures
are 2048 px JPEGs (5.6 MB together). The GLB keeps the same geometry, UVs and materials but:

  * stores the mesh as binary (no XML parse at startup);
  * resizes the wall and porch textures to --texture-size px (default 1024);
  * re-encodes every texture as JPEG, so the file stays small.

The vertices are baked into metres (the .dae's asset unit and its House node's 100x matrix), the
same size the COLLADA loader produced, so HouseModel.js can fit it onto each city block as before.

Requires trimesh and pycollada (plus pillow, numpy). In a venv:

    python3 -m venv /tmp/conv && /tmp/conv/bin/pip install trimesh pycollada pillow numpy
    /tmp/conv/bin/python tools/convert_house_glb.py

Then compress it (see tools/compress_models.sh), which the game requires:

    bash tools/compress_models.sh

The .dae is never modified; re-run both steps whenever it changes.
"""

from __future__ import annotations

import argparse
import io
import os
import sys

import numpy as np
import trimesh
from PIL import Image
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ENV_DIR = os.path.join(REPO_ROOT, "assets", "Environment")

# trimesh keeps the House node's uniform 100x matrix in the scene graph and leaves the vertices raw.
# The file's asset unit (<unit meter="0.0254"/>) is applied to the vertices, so the baked scale is
# 0.0254 * 100 = 2.54 and the result is in metres.
COLLADA_TO_METRES = 0.0254 * 100

# Geometry order in the .dae matches the material triangle counts: Walls 6524, Porch 18676, Window 224.
# trimesh names the geometries after the mesh; these indices are asserted against the triangle counts.
MATERIALS = [
    ("Walls", "List_1_dom_derevnja.jpg", 6524),
    ("Porch", "List_2_dom_derevnja.jpg", 18676),
    ("Window", "List_3_dom_derevnja.jpg", 224),
]


def load_texture(name: str, max_size: int) -> Image.Image:
    image = Image.open(os.path.join(ENV_DIR, name)).convert("RGB")
    if max(image.size) > max_size:
        image.thumbnail((max_size, max_size), Image.LANCZOS)
    return image


def jpeg_image(image: Image.Image) -> Image.Image:
    # Round-trip through JPEG so the embedded bytes are JPEG, not an 8-bit PNG.
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85, optimize=True)
    buffer.seek(0)
    encoded = Image.open(buffer)
    encoded.load()
    encoded.format = "JPEG"
    return encoded


def build(texture_size: int, output: str) -> None:
    scene = trimesh.load(os.path.join(ENV_DIR, "old-house.dae"), force="scene")
    meshes = list(scene.geometry.values())
    if len(meshes) != len(MATERIALS):
        sys.exit(f"expected {len(MATERIALS)} meshes in old-house.dae, found {len(meshes)}")

    out = trimesh.Scene()
    for mesh, (name, texture_name, triangles) in zip(meshes, MATERIALS):
        if len(mesh.faces) != triangles:
            sys.exit(f"{name}: expected {triangles} triangles, found {len(mesh.faces)}")
        texture = jpeg_image(load_texture(texture_name, texture_size))
        material = PBRMaterial(
            name=name,
            baseColorTexture=texture,
            baseColorFactor=[255, 255, 255, 255],
            metallicFactor=0.0,
            roughnessFactor=0.9,
            doubleSided=False,
        )
        mesh.apply_scale(COLLADA_TO_METRES)
        mesh.visual = TextureVisuals(uv=np.asarray(mesh.visual.uv), material=material)
        out.add_geometry(mesh, geom_name=name, node_name=name)

    os.makedirs(os.path.dirname(output), exist_ok=True)
    data = out.export(file_type="glb")
    with open(output, "wb") as handle:
        handle.write(data)
    bounds = out.bounds
    size = bounds[1] - bounds[0]
    print(f"wrote {output} ({len(data) / 1e6:.2f} MB)")
    print(f"size in metres: x={size[0]:.2f} y={size[1]:.2f} z={size[2]:.2f}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--texture-size", type=int, default=1024, help="max texture edge in px")
    parser.add_argument("--output", default=os.path.join(ENV_DIR, "old-house.glb"))
    args = parser.parse_args(argv)
    build(args.texture_size, args.output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
