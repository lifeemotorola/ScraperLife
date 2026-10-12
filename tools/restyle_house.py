#!/usr/bin/env python3
"""Restyle the old house COLLADA model (assets/Environment/old-house.dae).

The original file is never modified. Each run writes a new .dae next to it that
changes the house's design:

  * paint   - replace a material's texture with a solid colour (walls, porch, window)
  * texture - swap a material's texture image for another picture
  * scale   - stretch the whole house (width X, height Y, depth Z)

Standard library only (no pip installs needed).

Examples
--------
  # what is in the model?
  python3 tools/restyle_house.py inspect

  # one of the built-in looks
  python3 tools/restyle_house.py restyle --preset harbor-blue

  # custom: dark walls, red porch, taller house
  python3 tools/restyle_house.py restyle --wall-color '#3a3f44' --porch-color '#8b2e2e' \
      --scale 1 1.25 1 --out assets/Environment/old-house-tall.dae

  # keep the design but use a different wall picture
  python3 tools/restyle_house.py restyle --wall-texture my_bricks.jpg
"""

from __future__ import annotations

import argparse
import os
import sys
import xml.etree.ElementTree as ET

COLLADA_NS = "http://www.collada.org/2005/11/COLLADASchema"
ET.register_namespace("", COLLADA_NS)

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEFAULT_INPUT = os.path.join(REPO_ROOT, "assets", "Environment", "old-house.dae")
DEFAULT_OUTPUT_DIR = os.path.join(REPO_ROOT, "assets", "Environment")

# Material ids in the source file (see `inspect`).
MATERIAL_ROLES = {
    "wall": "Walls",
    "porch": "Porch",
    "window": "Window",
}

# Built-in looks. Each maps a role to a colour (or None to leave it untouched).
PRESETS = {
    "harbor-blue": {"wall": "#5b7f95", "porch": "#3d4b4f", "window": "#1f2a30"},
    "sand-stone": {"wall": "#d9c29a", "porch": "#8a6d4b", "window": "#3b3f3d"},
    "charcoal-modern": {"wall": "#3a3f44", "porch": "#1e2224", "window": "#15191c"},
    "rust-brick": {"wall": "#9a4a32", "porch": "#4a3428", "window": "#2a2622"},
}


def q(tag: str) -> str:
    return f"{{{COLLADA_NS}}}{tag}"


def parse_hex_colour(value: str) -> tuple[float, float, float]:
    text = value.strip().lstrip("#")
    if len(text) != 6:
        raise argparse.ArgumentTypeError(f"colour must look like #RRGGBB, got {value!r}")
    try:
        r, g, b = (int(text[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"colour must look like #RRGGBB, got {value!r}") from exc
    return r, g, b


def load(path: str) -> ET.ElementTree:
    return ET.parse(path)


class HouseModel:
    """Thin helper around the COLLADA tree for the lookups this tool needs."""

    def __init__(self, tree: ET.ElementTree):
        self.tree = tree
        self.root = tree.getroot()
        self.materials = {m.get("id"): m for m in self.root.iter(q("material"))}
        self.effects = {e.get("id"): e for e in self.root.iter(q("effect"))}
        self.images = {i.get("id"): i for i in self.root.iter(q("image"))}

    def effect_for_material(self, material_id: str) -> ET.Element:
        material = self.materials.get(material_id)
        if material is None:
            raise KeyError(f"material {material_id!r} not found")
        instance = material.find(q("instance_effect"))
        effect_id = instance.get("url").lstrip("#")
        return self.effects[effect_id]

    def diffuse_of(self, material_id: str) -> ET.Element:
        effect = self.effect_for_material(material_id)
        for shader in effect.iter():
            if shader.tag in (q("phong"), q("lambert"), q("blinn")):
                diffuse = shader.find(q("diffuse"))
                if diffuse is not None:
                    return diffuse
        raise KeyError(f"no diffuse channel for material {material_id!r}")

    def set_colour(self, material_id: str, rgb: tuple[float, float, float]) -> None:
        diffuse = self.diffuse_of(material_id)
        for child in list(diffuse):
            diffuse.remove(child)
        color = ET.SubElement(diffuse, q("color"), {"sid": "diffuse"})
        color.text = f"{rgb[0]:.6f} {rgb[1]:.6f} {rgb[2]:.6f} 1.000000"

    def set_texture_file(self, material_id: str, image_path: str) -> None:
        diffuse = self.diffuse_of(material_id)
        texture = diffuse.find(q("texture"))
        if texture is None:
            raise KeyError(f"material {material_id!r} has no texture to swap")
        image = self.images.get(texture.get("texture"))
        if image is None:
            raise KeyError(f"image {texture.get('texture')!r} not found")
        init_from = image.find(q("init_from"))
        init_from.text = image_path

    def scale_house(self, sx: float, sy: float, sz: float) -> None:
        """Multiply the House node's transform so the whole building stretches."""
        for node in self.root.iter(q("node")):
            if node.get("id") != "House":
                continue
            matrix = node.find(q("matrix"))
            values = [float(v) for v in matrix.text.split()]
            # COLLADA matrices are row-major 4x4; the scale lives on the diagonal.
            values[0] *= sx
            values[5] *= sy
            values[10] *= sz
            matrix.text = " ".join(f"{v:.6f}" for v in values)
            return
        raise KeyError("House node not found in visual scene")

    def describe(self) -> list[str]:
        lines = []
        for material_id in self.materials:
            try:
                diffuse = self.diffuse_of(material_id)
            except KeyError:
                lines.append(f"  {material_id}: (no diffuse channel)")
                continue
            texture = diffuse.find(q("texture"))
            if texture is not None:
                image = self.images.get(texture.get("texture"))
                source = image.find(q("init_from")).text if image is not None else "?"
                lines.append(f"  {material_id}: texture -> {source}")
            else:
                color = diffuse.find(q("color"))
                lines.append(f"  {material_id}: colour {color.text if color is not None else '?'}")
        return lines


def cmd_inspect(args: argparse.Namespace) -> int:
    model = HouseModel(load(args.input))
    print(f"Model: {args.input}")
    print("Materials:")
    print("\n".join(model.describe()))
    print("Roles:", ", ".join(f"{role}={mat}" for role, mat in MATERIAL_ROLES.items()))
    return 0


def resolve_choices(args: argparse.Namespace) -> dict:
    """Merge preset colours with explicit overrides. Explicit flags win."""
    colours: dict[str, tuple[float, float, float] | None] = {}
    if args.preset:
        for role, hex_value in PRESETS[args.preset].items():
            colours[role] = parse_hex_colour(hex_value)
    for role in MATERIAL_ROLES:
        value = getattr(args, f"{role}_color")
        if value is not None:
            colours[role] = value
    return colours


def cmd_restyle(args: argparse.Namespace) -> int:
    colours = resolve_choices(args)
    textures = {role: getattr(args, f"{role}_texture") for role in MATERIAL_ROLES}
    textures = {role: path for role, path in textures.items() if path}
    scale = args.scale
    if not colours and not textures and scale == (1.0, 1.0, 1.0):
        print("Nothing to change: pass --preset, a --<role>-color/--<role>-texture, or --scale.")
        return 2

    if args.out is None:
        name = args.name or args.preset or "custom"
        args.out = os.path.join(DEFAULT_OUTPUT_DIR, f"old-house-{name}.dae")
    out_path = os.path.abspath(args.out)
    if os.path.abspath(args.input) == out_path:
        print("Refusing to overwrite the original model; pick a different --out.")
        return 2

    model = HouseModel(load(args.input))
    # Paint first, then texture swaps, so an explicit texture wins over a colour for the same role.
    for role, rgb in colours.items():
        if rgb is not None and role not in textures:
            model.set_colour(MATERIAL_ROLES[role], rgb)
    for role, path in textures.items():
        image_abs = os.path.abspath(path)
        if not os.path.isfile(image_abs):
            print(f"Texture not found: {path}")
            return 2
        rel = os.path.relpath(image_abs, os.path.dirname(out_path)).replace(os.sep, "/")
        model.set_texture_file(MATERIAL_ROLES[role], rel)
    if scale != (1.0, 1.0, 1.0):
        model.scale_house(*scale)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    model.tree.write(out_path, encoding="utf-8", xml_declaration=True)
    print(f"Wrote {out_path}")
    print("\n".join(HouseModel(load(out_path)).describe()))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_inspect = sub.add_parser("inspect", help="list the materials and their textures/colours")
    p_inspect.add_argument("--input", default=DEFAULT_INPUT)
    p_inspect.set_defaults(func=cmd_inspect)

    p = sub.add_parser("restyle", help="write a restyled copy of the house")
    p.add_argument("--input", default=DEFAULT_INPUT, help="source .dae (default: the original house)")
    p.add_argument("--out", help="output .dae path (default: assets/Environment/old-house-<name>.dae)")
    p.add_argument("--name", help="suffix for the default output name")
    p.add_argument("--preset", choices=sorted(PRESETS), help="built-in colour scheme")
    for role in MATERIAL_ROLES:
        p.add_argument(f"--{role}-color", type=parse_hex_colour, metavar="#RRGGBB",
                       help=f"solid colour for the {role} material (replaces its texture)")
        p.add_argument(f"--{role}-texture", metavar="IMAGE",
                       help=f"image file to use for the {role} material")
    p.add_argument("--scale", nargs=3, type=float, default=(1.0, 1.0, 1.0), metavar=("X", "Y", "Z"),
                   help="stretch the whole house (e.g. 1 1.25 1 makes it 25%% taller)")
    p.set_defaults(func=cmd_restyle)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if getattr(args, "scale", None) is not None and isinstance(args.scale, list):
        args.scale = tuple(args.scale)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
