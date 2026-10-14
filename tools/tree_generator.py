#!/usr/bin/env python3
"""tree_generator.py - make game tree models from the Easy Tree presets.

Easy Tree (addon/EasyTree) is a Blender 4.5+ add-on: it grows trees with Geometry Nodes inside
assets/assets.blend. This script does not run Blender. It rebuilds the same presets (the values in
addon/EasyTree/operators.py: trunk, numLevels, bLength, rAngle, thickness, rJitter, gravity,
twoOrThree, addLeaves) as a plain recursive branch generator, then writes one GLB per preset with the
add-on's CC0 bark and leaf textures. The game tints each tree per instance with a season colour, so
the GLBs carry no season.

    /tmp/treevenv/bin/python tools/tree_generator.py            # writes assets/Environment/trees/*.glb

Requires numpy, pillow and trimesh (pip install numpy pillow trimesh).
Output is Y-up, metres, base on y = 0 and centred on x/z = 0.
"""

import argparse
import math
import os
import sys

import numpy as np
from PIL import Image
import trimesh
from trimesh.visual.material import PBRMaterial
from trimesh.visual.texture import TextureVisuals

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEXTURES = os.path.join(ROOT, "addon", "EasyTree", "assets", "textures")
OUT_DIR = os.path.join(ROOT, "assets", "Environment", "trees")
TEXTURE_SIZE = 256

# Values from addon/EasyTree/operators.py (the presets). Anything not listed keeps DEFAULTS.
DEFAULTS = dict(trunk=3.0, numLevels=4, bLength=5.0, rAngle=0.6, rJitter=0.2, gravity=0.3,
                thickness=1.5, twoOrThree=0, addLeaves=True, height=8.0)
PRESETS = {
    "tall":  dict(trunk=5, numLevels=5, bLength=8, rAngle=0.698, thickness=3.0, height=9.0),
    "thin":  dict(trunk=2, numLevels=4, bLength=6, rAngle=0.523, thickness=1.8, height=7.0),
    "dead":  dict(trunk=1, numLevels=4, bLength=10, rAngle=0.41, rJitter=0.25, gravity=1.7,
                  thickness=1.8, twoOrThree=1, addLeaves=False, height=6.0),
    "large": dict(trunk=2, numLevels=6, bLength=8, rAngle=0.488, thickness=2.9, height=7.5),
}
UP = np.array([0.0, 1.0, 0.0])


def unit(v):
    n = np.linalg.norm(v)
    return v / n if n > 1e-9 else UP.copy()


def turn(direction, angle, azimuth):
    """Rotate `direction` by `angle` away from itself, around it at `azimuth`."""
    ref = np.array([1.0, 0.0, 0.0]) if abs(direction[0]) < 0.9 else np.array([0.0, 0.0, 1.0])
    u = unit(np.cross(direction, ref))
    v = np.cross(direction, u)
    return unit(direction * math.cos(angle) + (u * math.cos(azimuth) + v * math.sin(azimuth)) * math.sin(angle))


class TreeBuilder:
    def __init__(self, params, seed):
        self.p = {**DEFAULTS, **params}
        self.rng = np.random.default_rng(seed)
        self.bark = {"v": [], "uv": [], "f": []}
        self.leaves = {"v": [], "uv": [], "f": []}
        self.tips = []

    def tube(self, start, end, r0, r1, v0, v1, sides=6):
        d = unit(end - start)
        base = np.cross(d, np.array([1.0, 0.0, 0.0]) if abs(d[0]) < 0.9 else np.array([0.0, 0.0, 1.0]))
        base = unit(base)
        side = np.cross(d, base)
        out = self.bark
        offset = len(out["v"])
        for ring, (centre, radius, vcoord) in enumerate([(start, r0, v0), (end, r1, v1)]):
            for s in range(sides):
                a = 2 * math.pi * s / sides
                out["v"].append(centre + (base * math.cos(a) + side * math.sin(a)) * radius)
                out["uv"].append([s / sides, vcoord])
        for s in range(sides):
            a, b = offset + s, offset + (s + 1) % sides
            c, dd = a + sides, b + sides
            out["f"] += [[a, c, b], [b, c, dd]]

    def leaf_card(self, centre, size):
        a = unit(self.rng.normal(size=3))
        b = unit(np.cross(a, self.rng.normal(size=3)))
        out = self.leaves
        offset = len(out["v"])
        for sx, sy, uv in [(-1, -1, (0, 0)), (1, -1, (1, 0)), (1, 1, (1, 1)), (-1, 1, (0, 1))]:
            out["v"].append(centre + a * sx * size / 2 + b * sy * size / 2)
            out["uv"].append(list(uv))
        out["f"] += [[offset, offset + 1, offset + 2], [offset, offset + 2, offset + 3]]

    def grow(self, start, direction, length, radius, level, v_start):
        p = self.p
        end = start + direction * length
        v_end = v_start + length / 2.0
        self.tube(start, end, radius, radius * 0.7, v_start, v_end)
        if level >= p["numLevels"]:
            self.tips.append(end)
            return
        count = 3 if p["twoOrThree"] == 1 else 2
        for i in range(count):
            azimuth = 2 * math.pi * i / count + level * 0.7 + self.rng.uniform(-0.4, 0.4)
            angle = p["rAngle"] * (1 + self.rng.uniform(-p["rJitter"], p["rJitter"]))
            child = turn(direction, angle, azimuth)
            child = unit(child + np.array([0.0, -p["gravity"] * 0.12, 0.0]))
            self.grow(end, child, length * 0.72, radius * 0.62, level + 1, v_end)

    def build(self, leaf_size):
        p = self.p
        trunk_length = p["trunk"] * 0.9
        self.grow(np.zeros(3), UP.copy(), trunk_length, p["thickness"] * 0.09, 0, 0.0)
        if p["addLeaves"]:
            for tip in self.tips:
                for _ in range(7):
                    self.leaf_card(tip + self.rng.normal(scale=0.25, size=3), leaf_size)
        return self

    def normalised(self, target_height):
        everything = [np.array(self.bark["v"]).reshape(-1, 3)]
        if len(self.leaves["v"]):
            everything.append(np.array(self.leaves["v"]).reshape(-1, 3))
        allv = np.vstack(everything)
        lo = allv.min(axis=0)
        scale = target_height / (allv[:, 1].max() - lo[1])
        centre_x = (allv[:, 0].max() + allv[:, 0].min()) / 2
        centre_z = (allv[:, 2].max() + allv[:, 2].min()) / 2
        offset = np.array([centre_x, lo[1], centre_z])
        for part in (self.bark, self.leaves):
            if len(part["v"]):
                part["v"] = (np.array(part["v"]).reshape(-1, 3) - offset) * scale
        return self


def load_texture(name, size=TEXTURE_SIZE):
    return Image.open(os.path.join(TEXTURES, name)).convert("RGB").resize((size, size), Image.LANCZOS)


def leaf_texture():
    colour = load_texture("LeafSet017_1K-JPG_Color.jpg")
    opacity = Image.open(os.path.join(TEXTURES, "LeafSet017_1K-JPG_Opacity.jpg")).convert("L")
    opacity = opacity.resize(colour.size, Image.LANCZOS)
    colour.putalpha(opacity)
    return colour


def make_scene(tree):
    bark_mesh = trimesh.Trimesh(vertices=np.array(tree.bark["v"]), faces=np.array(tree.bark["f"]), process=False)
    bark_mesh.visual = TextureVisuals(uv=np.array(tree.bark["uv"]), material=PBRMaterial(
        name="bark", baseColorTexture=load_texture("Bark001_2K-JPG_Color.jpg"), doubleSided=False,
        roughnessFactor=0.95, metallicFactor=0.0))
    meshes = {"bark": bark_mesh}
    if len(tree.leaves["v"]):
        leaf_mesh = trimesh.Trimesh(vertices=np.array(tree.leaves["v"]), faces=np.array(tree.leaves["f"]), process=False)
        leaf_mesh.visual = TextureVisuals(uv=np.array(tree.leaves["uv"]), material=PBRMaterial(
            name="leaves", baseColorTexture=leaf_texture(), alphaMode="MASK", alphaCutoff=0.5,
            doubleSided=True, roughnessFactor=0.9, metallicFactor=0.0))
        meshes["leaves"] = leaf_mesh
    scene = trimesh.Scene()
    for name, mesh in meshes.items():
        scene.add_geometry(mesh, node_name=name, geom_name=name)
    return scene


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", default=OUT_DIR)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    for name, params in PRESETS.items():
        leaf_size = 1.3 if name == "large" else 0.9
        tree = TreeBuilder(params, args.seed).build(leaf_size).normalised(params["height"])
        path = os.path.join(args.out, f"tree_{name}.glb")
        make_scene(tree).export(path, file_type="glb")
        print(f"wrote {os.path.relpath(path, ROOT)}: {len(tree.bark['f'])} bark faces, "
              f"{len(tree.leaves['f'])} leaf faces, {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main(sys.argv[1:])
