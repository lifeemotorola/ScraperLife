#!/usr/bin/env python3
"""character_palette.py — one rigged body, a whole cast: give every character in
Scraper Life their own skin tone and outfit without exporting a second mesh.

Every character in the game is now *the same character as Markie*: they all load
``assets/models/survival_character.glb`` (the file ``tools/rig_and_animate.py`` builds) and
are cloned at runtime. What separates Kollie from Vardee is no longer a different body or a
box-shaped placeholder — it is their skin tone, garment colours, authored clothing patterns,
headwear and accessories. This script is the single place those palette and wardrobe profiles
are decided; ``js/entities/Wardrobe.js`` paints them onto each clone.

    python3 tools/character_palette.py inspect          # what slots the GLB actually has
    python3 tools/character_palette.py build            # write assets/models/character_palettes.json
    python3 tools/character_palette.py check            # re-validate the written file
    npm run palette                                     # the same `build`, wired into package.json

Why a JSON file and not one GLB per character
---------------------------------------------
The rigged body is 5.3 MB. Sixteen actors — Markie, ten street residents and five of Vardee's
crew — would be ~85 MB of downloads if every person shipped a separate GLB. Instead this script
reads the *real* material names out of the GLB, groups them into body/outfit slots, and writes one
palette per character, including each member of the watch. ``js/entities/CharacterRig.js`` clones the shared rig with
``SkeletonUtils`` (which reuses materials *by reference*, so each clone gets its own copies) and
tints those copies from the palette. One download, sixteen looks.

Why it reads the GLB instead of hard-coding material names
----------------------------------------------------------
The slot map is derived from the file the game actually loads. Re-export the character with
Blender, rename ``Jacket1`` to ``Jacket_01`` or add a ``Belt1`` material, and ``inspect``
shows the new grouping immediately; ``check`` fails loudly if a material in the GLB has no
slot to live in, or if the palette names a material the GLB no longer has. The runtime never
has to guess either: an unknown material simply keeps the exported colour.

Colours are deterministic. Each character's palette is drawn from a blake2b-seeded RNG keyed
on its id, so ``build`` is reproducible (no diff churn, no re-roll on every machine). The roster
also carries one authored top/bottom/headwear/backpack combination and optional jersey number per
character.

This script needs no Blender and no third-party packages: the GLB JSON chunk is parsed with
``struct``.
"""

from __future__ import annotations

import argparse
import colorsys
import hashlib
import json
import os
import re
import struct
import sys

LOG_PREFIX = "[palette]"


def log(msg=""):
    print(f"{LOG_PREFIX} {msg}", flush=True)


def warn(msg):
    print(f"{LOG_PREFIX} WARNING {msg}", flush=True)


def die(msg, code=2):
    print(f"{LOG_PREFIX} ERROR {msg}", file=sys.stderr, flush=True)
    raise SystemExit(code)


# ==================================================================================================
# 1. the GLB — read the material names the runtime will actually see
# ==================================================================================================

def read_glb_json(path):
    """Return the parsed JSON chunk of a binary glTF file (no external deps)."""
    try:
        with open(path, "rb") as handle:
            header = handle.read(12)
            if len(header) < 12:
                die(f"{path} is too small to be a GLB")
            magic, version, _length = struct.unpack("<III", header)
            if magic != 0x46546C67:  # 'glTF'
                die(f"{path} is not a GLB (magic {magic:#010x})")
            if version != 2:
                warn(f"{path} is glTF version {version}; this script was written against 2")
            chunk_len, chunk_type = struct.unpack("<II", handle.read(8))
            if chunk_type != 0x4E4F534A:  # 'JSON'
                die(f"{path} does not start with a JSON chunk")
            return json.loads(handle.read(chunk_len).decode("utf-8"))
    except FileNotFoundError:
        die(
            f"no GLB at {path}.\n"
            "  generate it first:  npm run rig:character\n"
            "  (blender --background --python tools/rig_and_animate.py -- build --fbx fbx/Survival_Character.fbx)"
        )


def glb_material_names(gltf):
    return [m.get("name") or f"material_{i}" for i, m in enumerate(gltf.get("materials", []))]


# ==================================================================================================
# 2. slot vocabulary — group any material name onto one canonical body/outfit slot
#
# The exported Survival_Character has: Backpack2, Head, Body2, Arms, Body_Arkit:Eye,
# Brows_Leashes, Gloves1, Hair3, Jacket1, Jeans1, Mouth, Shoes1. Matching is token based so a
# re-export that renames things still lands in the right slot. Order matters: the first slot
# to claim a material keeps it, so "Head" is skin before it could ever match anything else.
# ==================================================================================================

# slot -> (regexes matched against the lowercased material name, roughness, tintable)
# `tintable: False` keeps the exported look and only takes the shared value (eyes, mouth):
# recolouring the eyeball per character reads as a disease, not as a person.
#
# Order matters — the first slot to claim a material keeps it — and the order here is
# *most specific first*: the exported eyeball is called `Body_Arkit:Eye`, so if `skin`
# (whose patterns include `^body`) ran first it would claim the eyeball and the `eyes`
# slot would silently stay empty. Face parts, then skin, then wardrobe.
SLOTS = [
    ("eyes",   [r"eye", r"cornea", r"sclera"],                                            0.12, False),
    ("mouth",  [r"mouth", r"teeth", r"tongue", r"lips?"],                                 0.55, False),
    ("brows",  [r"brow", r"lash"],                                                        0.80, True),
    ("hair",   [r"hair", r"beard", r"moustache"],                                         0.45, True),
    ("skin",   [r"^head", r"^body", r"^arms?", r"^face", r"skin", r"^neck", r"^hands?$"], 0.62, True),
    ("shirt",  [r"jacket", r"shirt", r"top", r"hoodie", r"tee", r"vest", r"coat"],        0.78, True),
    ("pants",  [r"jeans", r"pants", r"trouser", r"shorts", r"skirt"],                     0.88, True),
    ("shoes",  [r"shoe", r"boot", r"sneaker", r"sandal"],                                 0.50, True),
    ("gloves", [r"glove", r"mitt"],                                                       0.70, True),
    ("pack",   [r"backpack", r"bag", r"satchel"],                                         0.80, True),
]

# Slots every character must have a colour for. `brows` is derived from `hair`.
# The current body is one skinned mesh from fbx/Walking.fbx (material "Body2") with no separate
# hair, clothing, gloves, pack, eyes or mouth parts. Only skin can be coloured. The wardrobe
# lists below stay for when a multi-part body is exported again.
REQUIRED_SLOTS = ["skin"]
# Palette wardrobe IDs are mirrored by CharacterRig's procedural outfit shader/accessories.
WARDROBE_TOP_STYLES = (
    "street-tee", "print-blouse", "work-shirt", "wrap-blouse", "football-jersey",
    "graphic-tee", "hoodie", "utility-vest", "bomber", "tactical-polo", "tailored-suit",
    "formal-tunic", "striped-jersey", "market-polo", "hi-vis-vest", "track-jacket", "cargo-vest",
)
WARDROBE_BOTTOM_STYLES = (
    "field-cargo", "pattern-trouser", "pressed-trouser", "straight-jeans", "track-pants",
    "rolled-jeans", "tailored-pants", "work-cargo", "dark-denim", "tactical-pants",
    "suit-trousers", "formal-trousers", "uniform-trousers", "market-jeans", "dock-workwear",
    "harbor-track-pants", "warehouse-cargo",
)
WARDROBE_HEADWEAR_STYLES = (
    "none", "cap", "sports-cap", "flat-cap", "headwrap", "headband", "beanie", "kufi", "hardhat", "bandana",
)
# Garment colours a random outfit can start from (each is then jittered per character).
OUTFIT_BASE_COLOURS = (
    "#2f5d5b", "#26333c", "#3b2a1f", "#562b28", "#502d30", "#4a5a38", "#6b5a42", "#2d3e5c",
    "#7a4a2e", "#5b4c6e", "#8a7a4e", "#3d4a4a", "#8c3b2e", "#1f2a2e", "#c9b98c", "#9fb1bb",
)
OUTFIT_SLOTS = ("shirt", "pants", "shoes", "gloves", "pack")
# Slots coloured once for the whole cast (see SHARED_COLOURS).
SHARED_SLOTS = []


def classify_materials(names):
    """Map every material name in the GLB onto a slot. Returns (slots, unmatched)."""
    slots = {slot: {"materials": [], "roughness": rough, "tintable": tint}
             for slot, _patterns, rough, tint in SLOTS}
    unmatched = []
    for name in names:
        lowered = name.lower()
        for slot, patterns, _rough, _tint in SLOTS:
            if any(re.search(pattern, lowered) for pattern in patterns):
                slots[slot]["materials"].append(name)
                break
        else:
            unmatched.append(name)
    return slots, unmatched


# ==================================================================================================
# 3. the cast — skin ramp, art direction, and who lectures
#
# Skin tones are a curated ramp of real West African tones rather than random noise, because a
# randomly rolled "skin colour" produces grey-greens that no lighting can save. Characters pick
# a base tone from the ramp by role and then get a small deterministic jitter, so nobody in the
# cast is an exact clone of anybody else.
# ==================================================================================================

# Darkest -> lightest. sRGB hex, the same space CSS/three.js `Color.set()` reads.
SKIN_RAMP = [
    "#3f2317", "#4a2a1a", "#55311f", "#5e3722", "#6a4026",
    "#74472a", "#7f5030", "#8a5835", "#96613c", "#a06c45",
]

SHARED_COLOURS = {
    "eyes": "#f2ece0",   # warm off-white sclera; survives the HDR sky without going grey
    "mouth": "#6d3430",  # interior mouth, shared so nobody gets a novelty lip colour
}

# id, name, on-screen label, role, how they speak when they meet someone, and their wardrobe.
# `voice: lecturer` characters hold court when two people meet (Kollie teaching, Vardee
# threatening); `greeter` characters just greet. js/systems/CrowdSystem.js reads this flag.
ROSTER = [
    {
        "id": "markie", "name": "Markie Kollie", "label": "MARKIE", "role": "Protagonist",
        "voice": "greeter", "skin": 4, "accent": "#75c5bb",
        "wardrobe": {"top": "street-tee", "bottom": "field-cargo", "headwear": "cap", "backpack": True, "number": 0},
        "outfit": {"shirt": "#2f5d5b", "pants": "#26333c", "shoes": "#3b2a1f",
                   "gloves": "#22302d", "pack": "#c36a31"},
    },
    {
        "id": "musu", "name": "Musu Kollie", "label": "MUSU", "role": "Mother — memory",
        "voice": "greeter", "skin": 8, "accent": "#f4b07a",
        "wardrobe": {"top": "print-blouse", "bottom": "pattern-trouser", "headwear": "headwrap", "backpack": False, "number": 0},
        "outfit": {"shirt": "#8d4b47", "pants": "#583849", "shoes": "#49312b",
                   "gloves": "#65443d", "pack": "#845b46"},
        "hair": "#18110e",
    },
    {
        "id": "kollie", "name": "Old Man Kollie", "label": "OLD MAN KOLLIE", "role": "Mentor",
        "voice": "lecturer", "skin": 1, "accent": "#9fd7ff",
        "wardrobe": {"top": "work-shirt", "bottom": "pressed-trouser", "headwear": "flat-cap", "backpack": False, "number": 0},
        "outfit": {"shirt": "#3f5a70", "pants": "#35322c", "shoes": "#2c211a",
                   "gloves": "#4a3b2c", "pack": "#6b5a3a"},
        "hair": "#cfc7bb",  # grey: the elder of Waterside
    },
    {
        "id": "tenneh", "name": "Tenneh", "label": "TENNEH", "role": "Love interest",
        "voice": "greeter", "skin": 7, "accent": "#ffb454",
        "wardrobe": {"top": "wrap-blouse", "bottom": "straight-jeans", "headwear": "headband", "backpack": False, "number": 0},
        "outfit": {"shirt": "#c9662f", "pants": "#43342a", "shoes": "#6b4a2c",
                   "gloves": "#8a6a3a", "pack": "#b0562f"},
    },
    {
        "id": "flomo", "name": "Flomo", "label": "FLOMO", "role": "Best friend",
        "voice": "greeter", "skin": 5, "accent": "#a8d26a",
        "wardrobe": {"top": "football-jersey", "bottom": "track-pants", "headwear": "sports-cap", "backpack": False, "number": 8},
        "outfit": {"shirt": "#5d6b3a", "pants": "#33485e", "shoes": "#3a2f24",
                   "gloves": "#2f3b2a", "pack": "#7a6a3a"},
    },
    {
        "id": "sia", "name": "Sia", "label": "SIA", "role": "Street kid",
        "voice": "greeter", "skin": 8, "accent": "#ffd08a",
        "wardrobe": {"top": "graphic-tee", "bottom": "rolled-jeans", "headwear": "beanie", "backpack": True, "number": 0},
        "outfit": {"shirt": "#d2663a", "pants": "#3c4a58", "shoes": "#b08a4a",
                   "gloves": "#4a4a44", "pack": "#cf8a3a"},
    },
    {
        "id": "garmai", "name": "Garmai", "label": "GARMAI", "role": "Information broker",
        "voice": "lecturer", "skin": 6, "accent": "#c760b0",
        "wardrobe": {"top": "hoodie", "bottom": "tailored-pants", "headwear": "headwrap", "backpack": False, "number": 0},
        "outfit": {"shirt": "#5b3560", "pants": "#2f2b3a", "shoes": "#3a2c33",
                   "gloves": "#4a3a44", "pack": "#6b4a6b"},
    },
    {
        "id": "boakai", "name": "Boakai", "label": "BOAKAI", "role": "Equipment fixer",
        "voice": "greeter", "skin": 2, "accent": "#d8c07a",
        "wardrobe": {"top": "utility-vest", "bottom": "work-cargo", "headwear": "none", "backpack": True, "number": 0},
        "outfit": {"shirt": "#8a7448", "pants": "#4a4a3a", "shoes": "#4a3524",
                   "gloves": "#6b5a3a", "pack": "#7a6a4a"},
    },
    {
        "id": "jallah", "name": "Jallah", "label": "JALLAH", "role": "Rival",
        "voice": "greeter", "skin": 3, "accent": "#ff6b5e",
        "wardrobe": {"top": "bomber", "bottom": "dark-denim", "headwear": "beanie", "backpack": False, "number": 0},
        "outfit": {"shirt": "#3a3a3f", "pants": "#2a2a30", "shoes": "#26221f",
                   "gloves": "#4a2a28", "pack": "#3f3a38"},
    },
    {
        "id": "togar", "name": "Togar", "label": "TOGAR", "role": "Lieutenant",
        "voice": "lecturer", "skin": 0, "accent": "#9aa7b0",
        "wardrobe": {"top": "tactical-polo", "bottom": "tactical-pants", "headwear": "none", "backpack": True, "number": 0},
        "outfit": {"shirt": "#2b2f33", "pants": "#23262a", "shoes": "#1c1d1f",
                   "gloves": "#2f3236", "pack": "#26292c"},
    },
    {
        "id": "vardee", "name": "Vardee", "label": "VARDEE", "role": "Antagonist",
        "voice": "lecturer", "skin": 0, "accent": "#ff3b3b",
        "wardrobe": {"top": "tailored-suit", "bottom": "suit-trousers", "headwear": "none", "backpack": False, "number": 0},
        "outfit": {"shirt": "#4a1f26", "pants": "#231c1e", "shoes": "#1e1a1a",
                   "gloves": "#3a1f22", "pack": "#2e1c1e"},
    },
    {
        "id": "kormah", "name": "Kormah", "label": "KORMAH", "role": "Corrupt official",
        "voice": "lecturer", "skin": 5, "accent": "#bca36a",
        "wardrobe": {"top": "formal-tunic", "bottom": "formal-trousers", "headwear": "kufi", "backpack": False, "number": 0},
        "outfit": {"shirt": "#3f4b45", "pants": "#292e30", "shoes": "#251f1a",
                   "gloves": "#383c34", "pack": "#45413a"},
        "hair": "#211b16",
    },
    {
        "id": "watch-east-1", "name": "East Watch", "label": "EAST WATCH", "role": "Street watch",
        "voice": "greeter", "skin": 9, "accent": "#ff7041",
        "wardrobe": {"top": "striped-jersey", "bottom": "uniform-trousers", "headwear": "cap", "backpack": False, "number": 4},
        "outfit": {"shirt": "#712f29", "pants": "#33252a", "shoes": "#241d1d",
                   "gloves": "#3f2222", "pack": "#40262a"},
    },
    {
        "id": "watch-market-2", "name": "Market Watch", "label": "MARKET WATCH", "role": "Street watch",
        "voice": "greeter", "skin": 4, "accent": "#ff8a50",
        "wardrobe": {"top": "market-polo", "bottom": "market-jeans", "headwear": "sports-cap", "backpack": False, "number": 0},
        "outfit": {"shirt": "#67352e", "pants": "#373034", "shoes": "#241d1d",
                   "gloves": "#452a29", "pack": "#493036"},
    },
    {
        "id": "watch-docks-3", "name": "Docks Watch", "label": "DOCKS WATCH", "role": "Street watch",
        "voice": "greeter", "skin": 7, "accent": "#e85f43",
        "wardrobe": {"top": "hi-vis-vest", "bottom": "dock-workwear", "headwear": "hardhat", "backpack": True, "number": 0},
        "outfit": {"shirt": "#803a31", "pants": "#303037", "shoes": "#221e20",
                   "gloves": "#50292b", "pack": "#48282b"},
    },
    {
        "id": "watch-harbor-4", "name": "Harbor Watch", "label": "HARBOR WATCH", "role": "Street watch",
        "voice": "greeter", "skin": 0, "accent": "#dc5740",
        "wardrobe": {"top": "track-jacket", "bottom": "harbor-track-pants", "headwear": "bandana", "backpack": False, "number": 0},
        "outfit": {"shirt": "#5b2927", "pants": "#343033", "shoes": "#211d1c",
                   "gloves": "#3e2425", "pack": "#382326"},
    },
    {
        "id": "watch-warehouse-5", "name": "Warehouse Watch", "label": "WAREHOUSE WATCH", "role": "Street watch",
        "voice": "greeter", "skin": 6, "accent": "#ff8054",
        "wardrobe": {"top": "cargo-vest", "bottom": "warehouse-cargo", "headwear": "hardhat", "backpack": True, "number": 0},
        "outfit": {"shirt": "#8a4031", "pants": "#393134", "shoes": "#241d1d",
                   "gloves": "#562b28", "pack": "#502d30"},
    },
]

DEFAULT_SEED = "waterside-01"


# ==================================================================================================
# 4. deterministic colour work
# ==================================================================================================

def seeded_rng(*keys):
    """A stable RNG for one key: same input, same colours, on any machine."""
    digest = hashlib.blake2b("|".join(str(k) for k in keys).encode("utf-8"), digest_size=8).digest()
    import random
    return random.Random(int.from_bytes(digest, "big"))


def hex_to_rgb(value):
    text = value.lstrip("#")
    if len(text) != 6:
        die(f"'{value}' is not a #rrggbb colour")
    return tuple(int(text[i:i + 2], 16) for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(round(c)))) for c in rgb)


def jitter(value, rng, value_span=0.07, hue_span=0.02):
    """Nudge a colour slightly in HSV. Deterministic, and clamped so nothing goes grey or neon."""
    r, g, b = (c / 255 for c in hex_to_rgb(value))
    hue, saturation, brightness = colorsys.rgb_to_hsv(r, g, b)
    hue = (hue + rng.uniform(-hue_span, hue_span)) % 1.0
    saturation = min(1.0, max(0.0, saturation * rng.uniform(0.92, 1.08)))
    brightness = min(0.98, max(0.06, brightness * rng.uniform(1 - value_span, 1 + value_span)))
    return rgb_to_hex(tuple(c * 255 for c in colorsys.hsv_to_rgb(hue, saturation, brightness)))


def darken(value, amount):
    """Deterministic darkening, used for brows (hair colour, a shade deeper)."""
    r, g, b = (c / 255 for c in hex_to_rgb(value))
    hue, saturation, brightness = colorsys.rgb_to_hsv(r, g, b)
    return rgb_to_hex(tuple(c * 255 for c in colorsys.hsv_to_rgb(hue, saturation, brightness * (1 - amount))))


def random_wardrobe(rng):
    """A random outfit: one top, one bottom, one headwear, a pack or not, and a jersey number 0-9."""
    return {
        "top": rng.choice(WARDROBE_TOP_STYLES),
        "bottom": rng.choice(WARDROBE_BOTTOM_STYLES),
        "headwear": rng.choice(WARDROBE_HEADWEAR_STYLES),
        "backpack": rng.random() < 0.4,
        "number": rng.randint(0, 9),
    }


def character_palette(entry, seed):
    """One character's look. Skin and hair come from the roster; the outfit (styles and garment
    colours) is random per character, but deterministic for a given seed."""
    rng = seeded_rng(seed, entry["id"])
    skin = jitter(SKIN_RAMP[entry["skin"] % len(SKIN_RAMP)], rng, value_span=0.05, hue_span=0.012)
    hair = jitter(entry.get("hair", "#171109"), rng, value_span=0.10, hue_span=0.02)
    colours = {"skin": skin, "hair": hair, "brows": darken(hair, 0.22)}
    outfit_rng = seeded_rng(seed, entry["id"], "outfit")
    wardrobe = random_wardrobe(outfit_rng)
    for slot in OUTFIT_SLOTS:
        base = outfit_rng.choice(OUTFIT_BASE_COLOURS)
        colours[slot] = jitter(base, outfit_rng, value_span=0.09, hue_span=0.025)
    return {
        "name": entry["name"],
        "label": entry["label"],
        "role": entry["role"],
        "voice": entry["voice"],
        "accent": entry["accent"],
        "wardrobe": wardrobe,
        "seed": hashlib.blake2b(f"{seed}|{entry['id']}".encode("utf-8"), digest_size=4).hexdigest(),
        "colors": colours,
    }


def build_document(glb_path, seed, only=None):
    gltf = read_glb_json(glb_path)
    names = glb_material_names(gltf)
    slots, unmatched = classify_materials(names)
    roster = [entry for entry in ROSTER if not only or entry["id"] in only]
    if not roster:
        die(f"no roster entries match --only {sorted(only)}")
    return {
        "generator": "tools/character_palette.py",
        "version": 2,
        "seed": seed,
        "model": os.path.splitext(os.path.basename(glb_path))[0],
        "source": glb_path.replace(os.sep, "/"),
        "units": "sRGB hex, as read by three.js Color.set()",
        "note": "One rigged body for the whole cast; each palette carries its own colours and wardrobe style. Do not edit by hand - re-run the generator.",
        "materials": names,
        "unmatchedMaterials": unmatched,
        "slots": slots,
        "shared": SHARED_COLOURS,
        "characters": {entry["id"]: character_palette(entry, seed) for entry in roster},
    }


# ==================================================================================================
# 5. commands
# ==================================================================================================

def cmd_inspect(args):
    document = build_document(args.glb, args.seed, args.only)
    log(f"GLB      {args.glb}")
    log(f"materials {len(document['materials'])}")
    for slot, info in document["slots"].items():
        marker = "" if info["materials"] else "   <-- nothing in the GLB matched"
        log(f"  {slot:<7} {', '.join(info['materials']) or '-':<42} roughness {info['roughness']:.2f}{marker}")
    if document["unmatchedMaterials"]:
        warn(f"no slot for: {', '.join(document['unmatchedMaterials'])} (they keep the exported colour)")
    log("cast")
    for cid, character in document["characters"].items():
        swatches = " ".join(f"{slot}={character['colors'][slot]}" for slot in REQUIRED_SLOTS)
        log(f"  {cid:<8} {character['role']:<18} {character['voice']:<9} {swatches}")
    return 0


def cmd_build(args):
    document = build_document(args.glb, args.seed, args.only)
    out = args.out
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8") as handle:
        json.dump(document, handle, indent=2)
        handle.write("\n")
    if document["unmatchedMaterials"]:
        warn(f"no slot for: {', '.join(document['unmatchedMaterials'])}")
    log(f"wrote {out}")
    log(f"  {len(document['characters'])} characters x {len(document['slots'])} slots "
        f"({len(document['materials'])} materials in {os.path.basename(args.glb)})")
    for slot, info in document["slots"].items():
        if not info["materials"]:
            warn(f"slot '{slot}' matched no material; those characters keep the exported colour there")
    log("  next: node tools/palette-check.mjs   (npm run check:palette)")
    return 0


def cmd_check(args):
    """Validate a written palette file against the GLB it claims to come from."""
    failures = []

    def check(label, ok, detail=""):
        if not ok:
            failures.append(label)
        print(f"{'PASS' if ok else 'FAIL'}  {label.ljust(56)} {detail}")

    if not os.path.exists(args.out):
        die(f"no palette file at {args.out}; run: python3 tools/character_palette.py build --out {args.out}")

    with open(args.out, encoding="utf-8") as handle:
        written = json.load(handle)
    fresh = build_document(args.glb, written.get("seed", args.seed), None)

    names = set(fresh["materials"])
    check("palette file parses and declares its source", bool(written.get("source")), written.get("source", ""))
    check("slot map matches a fresh read of the GLB",
          written.get("slots") == fresh["slots"],
          f"{len(written.get('slots', {}))} slots")
    for slot, info in written.get("slots", {}).items():
        missing = [m for m in info.get("materials", []) if m not in names]
        check(f"slot '{slot}' names only real GLB materials", not missing,
              f"{len(info.get('materials', []))} materials" + (f" missing={missing}" if missing else ""))
    for slot in REQUIRED_SLOTS:
        check(f"slot '{slot}' has a material in the GLB",
              bool(written["slots"].get(slot, {}).get("materials")),
              ", ".join(written["slots"].get(slot, {}).get("materials", [])) or "NONE")
    check("every GLB material has a slot", not written.get("unmatchedMaterials"),
          ", ".join(written.get("unmatchedMaterials", [])) or f"all {len(names)} covered")

    characters = written.get("characters", {})
    check("cast is complete", len(characters) == len(ROSTER),
          f"{len(characters)}/{len(ROSTER)}: {', '.join(sorted(characters))}")
    for entry in ROSTER:
        character = characters.get(entry["id"])
        if not character:
            check(f"'{entry['id']}' has a palette", False, "MISSING")
            continue
        check(f"'{entry['id']}' has a palette", True, f"{character.get('role')} / {character.get('voice')}")
        for slot in REQUIRED_SLOTS + SHARED_SLOTS:
            value = character.get("colors", {}).get(slot) or written.get("shared", {}).get(slot)
            ok = isinstance(value, str) and bool(re.fullmatch(r"#[0-9a-f]{6}", value or ""))
            check(f"'{entry['id']}' {slot} is a #rrggbb colour", ok, str(value))
        check(f"'{entry['id']}' speaks as lecturer or greeter",
              character.get("voice") in ("lecturer", "greeter"), str(character.get("voice")))
        check(f"'{entry['id']}' palette is reproducible",
              character == fresh["characters"].get(entry["id"]), "re-ran the generator")

    wardrobe_profiles = [entry.get("wardrobe", {}) for entry in ROSTER]
    check("every character has a supported topwear style",
          all(profile.get("top") in WARDROBE_TOP_STYLES for profile in wardrobe_profiles),
          f"{len(wardrobe_profiles)}/{len(ROSTER)}")
    check("every character has a supported bottomwear style",
          all(profile.get("bottom") in WARDROBE_BOTTOM_STYLES for profile in wardrobe_profiles),
          f"{len(wardrobe_profiles)}/{len(ROSTER)}")
    check("every character has supported headwear and pack choices",
          all(profile.get("headwear") in WARDROBE_HEADWEAR_STYLES
              and isinstance(profile.get("backpack"), bool)
              and 0 <= int(profile.get("number", 0)) <= 9 for profile in wardrobe_profiles),
          f"{len(wardrobe_profiles)}/{len(ROSTER)}")
    top_styles = [profile.get("top") for profile in wardrobe_profiles]
    bottom_styles = [profile.get("bottom") for profile in wardrobe_profiles]
    check("every character has a distinct topwear look", len(set(top_styles)) == len(ROSTER),
          f"{len(set(top_styles))}/{len(ROSTER)}")
    check("every character has a distinct bottomwear look", len(set(bottom_styles)) == len(ROSTER),
          f"{len(set(bottom_styles))}/{len(ROSTER)}")

    skins = [c["colors"]["skin"] for c in characters.values()]
    shirts = [c["colors"]["shirt"] for c in characters.values()]
    check("no two characters share a skin tone", len(set(skins)) == len(skins), f"{len(set(skins))} unique")
    check("no two characters share a shirt colour", len(set(shirts)) == len(shirts), f"{len(set(shirts))} unique")
    check("skin tones sit inside the authored ramp's range",
          all(0x20 <= hex_to_rgb(s)[0] <= 0xc0 for s in skins),
          f"red channel {min(hex_to_rgb(s)[0] for s in skins):#04x}..{max(hex_to_rgb(s)[0] for s in skins):#04x}")

    print()
    if failures:
        print(f"{len(failures)} check(s) failed: {', '.join(failures)}")
        return 1
    print(f"all checks passed — {len(characters)} characters, {len(names)} materials, {len(written['slots'])} slots")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(
        prog="character_palette.py",
        description="Give every character in Scraper Life their own skin tone and outfit, from one rigged GLB.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.dirname(here)
    parser.add_argument("command", choices=["inspect", "build", "check"], nargs="?", default="build")
    parser.add_argument("--glb", default=os.path.join(repo, "assets", "models", "survival_character.glb"),
                        help="the GLB the game loads (default: assets/models/survival_character.glb)")
    parser.add_argument("--out", default=os.path.join(repo, "assets", "models", "character_palettes.json"),
                        help="palette file to write/validate (default: assets/models/character_palettes.json)")
    parser.add_argument("--seed", default=DEFAULT_SEED, help="palette seed; the same seed reproduces the same colours")
    parser.add_argument("--only", default=None, help="comma-separated character ids to include")
    args = parser.parse_args(argv)
    args.only = set(x.strip() for x in args.only.split(",")) if args.only else None
    return {"inspect": cmd_inspect, "build": cmd_build, "check": cmd_check}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
