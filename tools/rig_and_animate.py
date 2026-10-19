#!/usr/bin/env python3
"""rig_and_animate.py — make an FBX character usable by Scraper Life: rig it, animate it,
export a GLB the engine can actually load.

The character in ``fbx/Survival_Character.fbx`` is a 160-bone deform rig with 52 facial
shape keys and **zero animation curves** — which is exactly why the game still shows the
grey placeholder humanoid. This script closes that gap in one headless pass:

    inspect   read-only report: meshes, bones, shape keys, clips, deform vs helper bones
    rig       build a humanoid armature + skin weights for a mesh that has none
    animate   author the clips the game drives (idle/walk/run/pulse/...) and/or retarget
              animation that already lives in another FBX onto this skeleton
    build     rig (if needed) + animate + export GLB + write the runtime manifest

Run it either through the Blender binary or through the ``bpy`` wheel — both land on the
same code path, since every Blender call goes through ``bpy``:

    blender --background --python tools/rig_and_animate.py -- build --fbx fbx/Survival_Character.fbx
    pip install bpy==4.2.0 && python3 tools/rig_and_animate.py build --fbx fbx/Survival_Character.fbx

GLB (not FBX) is the runtime format: three.js' glTF loader handles skins, morph targets and
animation channels from a single file, and ``assets/models/<name>.character.json`` records
the clip names, loop modes and facing offset so ``js/entities/CharacterRig.js`` never has to
guess.

Two conventions in this repo drive ``normalise()``:
  * forward is +Z in the game (``Player.group.rotation.y = atan2(dir.x, dir.z)``). The glTF
    exporter's Y-up conversion turns Blender's -Y into three.js +Z, so the rig is authored
    facing **-Y** here and needs no runtime yaw correction (unlike the old DAE, which needed
    ``DAE_FORWARD_YAW``).
  * the character must stand ``--height`` (default 2.3, matching ``NPC.baseHeight``) units
    tall with its feet on z=0, otherwise ``matchCharacterHeights()`` rescales every NPC from a
    model measured in centimetres.

Both are baked into the *data* (bone positions and mesh vertices), never into an object
transform — a transformed skin root node is the classic way to get a skinned mesh that renders
at the right size but animates at the wrong one.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import struct
import sys
import time

try:
    import bpy
except ImportError as exc:  # pragma: no cover - environment guidance
    sys.exit(
        "rig_and_animate.py drives Blender from python, but `import bpy` failed (%s).\n"
        "  option A: blender --background --python tools/rig_and_animate.py -- <args>\n"
        "  option B: pip install bpy==4.2.0    (python 3.11, linux-x86-64)\n"
        % exc
    )

from mathutils import Matrix, Quaternion, Vector  # noqa: E402  (mathutils ships with bpy)

# Armature space after normalise(): -Y is the direction the character looks, +Z is up.

LOG_PREFIX = "[rig]"
VERBOSE = False


def log(msg=""):
    print(f"{LOG_PREFIX} {msg}", flush=True)


def vlog(msg=""):
    if VERBOSE:
        print(f"{LOG_PREFIX}     {msg}", flush=True)


def warn(msg):
    print(f"{LOG_PREFIX} WARNING {msg}", flush=True)


def die(msg, code=2):
    print(f"{LOG_PREFIX} ERROR {msg}", file=sys.stderr, flush=True)
    raise SystemExit(code)


# ==================================================================================================
# 1. bone vocabulary — map any humanoid rig onto one canonical skeleton
#
# Everything downstream (auto-rig, procedural clips, retargeting) talks to canonical slots
# only, so a Quaternius rig, a Mixamo rig and a hand-named rig all eat the same clip data.
# Matching is token based: "Bip001 L UpperArm", "upperarm_l", "rp_manuel_upperarm_l" and
# "Arm_Upper.L" normalise to the key `upperarm` plus a side.
# ==================================================================================================

# Slots a clip may drive. Order matters: the first bone to claim a slot keeps it, so the
# more specific names (spine_01) win before the loose ones (spine) elsewhere.
SLOTS = [
    "hips", "spine", "chest", "upper_chest", "neck", "head",
    "left_eye", "right_eye", "jaw",
    "left_shoulder", "left_upper_arm", "left_lower_arm", "left_hand",
    "right_shoulder", "right_upper_arm", "right_lower_arm", "right_hand",
    "left_up_leg", "left_leg", "left_foot", "left_toe",
    "right_up_leg", "right_leg", "right_foot", "right_toe",
]

# slot -> regexes matched against the normalised bone key (see `bone_keys`).
# Torso split for the many-segment rigs: spine_01 -> spine, spine_02 -> chest, everything
# above that -> upper_chest, which keeps 2-segment and 5-segment spines consistent.
SLOT_PATTERNS = {
    "hips": [r"pelvis", r"hips?", r"abdomenparent", r"root1"],
    "spine": [r"spine1?", r"abdomen", r"waist", r"lumbar1", r"spine0"],
    "chest": [r"spine2", r"spine1", r"chest", r"thorax1", r"lumbar2"],
    "upper_chest": [r"spine[345]", r"thorax2", r"upperchest", r"cabinet", r"ribcage"],
    "neck": [r"neck1?", r"neck2", r"cervical", r"head1"],
    "head": [r"head", r"skull", r"cranium"],
    "left_eye": [r"eye"],
    "right_eye": [r"eye"],
    "jaw": [r"jaw", r"mandible"],
    "left_shoulder": [r"clavicle", r"shoulder", r"scapula", r"scapular"],
    "right_shoulder": [r"clavicle", r"shoulder", r"scapula", r"scapular"],
    "left_upper_arm": [r"upperarm", r"uarm", r"armupper", r"arm1", r"arm", r"shoulderarm"],
    "right_upper_arm": [r"upperarm", r"uarm", r"armupper", r"arm1", r"arm", r"shoulderarm"],
    "left_lower_arm": [r"lowerarm", r"forearm", r"farm", r"arm2", r"harm"],
    "right_lower_arm": [r"lowerarm", r"forearm", r"farm", r"arm2", r"harm"],
    "left_hand": [r"hand", r"wrist"],
    "right_hand": [r"hand", r"wrist"],
    "left_up_leg": [r"upleg", r"upperleg", r"thigh", r"uleg", r"leg1", r"femur", r"circle"],
    "right_up_leg": [r"upleg", r"upperleg", r"thigh", r"uleg", r"leg1", r"femur", r"circle"],
    "left_leg": [r"lowerleg", r"calf", r"shin", r"leg2", r"leg", r"tibia", r"crus"],
    "right_leg": [r"lowerleg", r"calf", r"shin", r"leg2", r"leg", r"tibia", r"crus"],
    "left_foot": [r"foot", r"ankle", r"leg3", r"tarsals"],
    "right_foot": [r"foot", r"ankle", r"leg3", r"tarsals"],
    "left_toe": [r"ball", r"toe", r"toebase", r"metatarsal", r"foot1"],
    "right_toe": [r"ball", r"toe", r"toebase", r"metatarsal", r"foot1"],
}
_LIMB_SLOTS = {s for s in SLOTS if s.startswith(("left_", "right_"))}

# Which slot sits *below* each slot in the skeleton. Bone local +Y is not the limb direction on
# every rig (this character's `thigh_l` is a short bone rolled to point backward, with the real
# leg running through its twist children), so joints - not bone axes - are what the IK and the
# retargeter aim at. This table defines "the next joint down" for each slot.
CANON_CHILD = {
    "hips": "spine", "spine": "chest", "chest": "upper_chest", "upper_chest": "neck",
    "neck": "head", "head": None,
    "left_shoulder": "left_upper_arm", "left_upper_arm": "left_lower_arm",
    "left_lower_arm": "left_hand", "left_hand": None,
    "right_shoulder": "right_upper_arm", "right_upper_arm": "right_lower_arm",
    "right_lower_arm": "right_hand", "right_hand": None,
    "left_up_leg": "left_leg", "left_leg": "left_foot", "left_foot": "left_toe", "left_toe": None,
    "right_up_leg": "right_leg", "right_leg": "right_foot", "right_foot": "right_toe", "right_toe": None,
}
CANON_PARENT = {v: k for k, v in CANON_CHILD.items() if v}

# Bones that exist to help an animator (twist/corrective/IK/end nubs) instead of a clip:
# they keep their skin weights but are never a canonical match and never keyframed.
DERIVED_RE = re.compile(
    r"twist|correct|corr|_ik$|^ik_|ikfoot|ikhand|_fk$|fake|pole|target|effector|helper|guid|"
    r"nub|_end$|_fwd|_bck|_out|_in$|latissimus|_pec|scap|triceps|biceps|kneeback|_knee$|_elbow$|"
    r"eyelid|brow|cheek|lip|ear$|nose|teeth|tongue|wrist_|metacarpal|centerofmass|interaction|"
    r"ik_hand|ik_foot", re.I,
)
NEVER_POSE_RE = re.compile(
    r"^ik_|^fk_|center_of_mass|^interaction$|_corrective|_twist|_end$|_pec$|_out$|_in$|_fwd$|_bck$",
    re.I,
)
FINGER_RE = re.compile(r"thumb|index|middle|ring|pinky|finger|metacarpal", re.I)


def tokens_of(name):
    """'rp_manuel_upperarm_l' -> ['rp','manuel','upperarm','l'], splitting camelCase too."""
    spaced = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", re.sub(r"\.\d+$", "", str(name)))
    return [t for t in re.split(r"[^0-9a-zA-Z]+", spaced.lower()) if t]


def side_of(name):
    """'left'|'right'|None from .L / _l / (L) / left_* conventions."""
    toks = tokens_of(name)
    low = str(name).lower()
    if "left" in toks or low.endswith(".l") or low.endswith("_l") or low.endswith("_l.001"):
        return "left"
    if "right" in toks or low.endswith(".r") or low.endswith("_r"):
        return "right"
    if toks and toks[-1] in ("l", "r") and toks.count(toks[-1]) == 1:
        return "left" if toks[-1] == "l" else "right"
    if len(toks) > 1 and toks[0] in ("l", "r") and toks.count(toks[0]) == 1:
        return "left" if toks[0] == "l" else "right"
    m = re.search(r"[\(\[]([lr])[\)\]]", low)
    return {"l": "left", "r": "right"}[m.group(1)] if m else None


def bone_keys(name, prefix=()):
    """Normalised comparison keys for a bone name (several spellings of the same idea)."""
    toks = tokens_of(name)
    if prefix and toks[:len(prefix)] == list(prefix):
        toks = toks[len(prefix):]
    core = [t for t in toks if t not in ("left", "right")]
    if core and core[-1] in ("l", "r"):
        core = core[:-1]
    elif core and core[0] in ("l", "r") and len(core) > 1:
        core = core[1:]
    digits_stripped = [re.sub(r"^0+(?=\d)", "", t) for t in core]
    joined = "".join(core)
    return {joined, "".join(digits_stripped), "_".join(digits_stripped), "-".join(digits_stripped)}


def is_derived(name):
    """Twist / corrective / IK / end-nub bones: skinned, but never posed by a clip."""
    flat = "".join(t for t in tokens_of(name) if not t.isdigit())
    return bool(DERIVED_RE.search(str(name))) or bool(DERIVED_RE.search(flat))


def is_poseable(name):
    return not NEVER_POSE_RE.search(str(name))


def match_slot(name, keys, side):
    """Canonical slot for one bone, or None. `keys` from bone_keys(), `side` from side_of()."""
    if is_derived(name):
        return None
    for slot in SLOTS:
        patterns = SLOT_PATTERNS.get(slot)
        if not patterns:
            continue
        slot_side = slot.split("_", 1)[0] if slot in _LIMB_SLOTS else None
        if slot_side:
            if side != slot_side:
                continue
        elif side:
            continue  # a sided bone can never be a centre slot
        for pat in patterns:
            rex = re.compile(rf"^(?:{pat})$")
            if any(rex.fullmatch(k) for k in keys):
                # finger bones match the bare `*1`/`*2` patterns; keep them out of limbs
                if slot.endswith(("upper_arm", "lower_arm")) and FINGER_RE.search(name):
                    continue
                if slot.endswith("_toe") and FINGER_RE.search(name) and not re.search(r"foot|toe|ball", name, re.I):
                    continue
                return slot
    return None


def shared_object_prefix(names, max_tokens=8):
    """Leading tokens shared by nearly every bone name: the mesh/object prefix FBX exporters
    weld onto bones (`rp_manuel_..._dancing_upperarm_l`). Ignoring it is what lets one set of
    patterns match both a bare `upperarm_l` and a prefixed one."""
    lists = [tokens_of(n) for n in names]
    if len(lists) < 8:
        return []
    need = 0.9 * len(lists)
    prefix = []
    for i in range(min(max(len(t) for t in lists), max_tokens)):
        col = {}
        for t in lists:
            if i < len(t):
                col[t[i]] = col.get(t[i], 0) + 1
        tok, hits = max(col.items(), key=lambda kv: kv[1]) if col else (None, 0)
        if hits >= need and tok:
            prefix.append(tok)
        else:
            break
    return prefix


def _score(mapping):
    """How much of a usable humanoid we found. Limb joints matter most: a clip that cannot
    find a knee or an elbow is not animatable, so those dominate the score."""
    limbs = sum(1 for k in mapping if k.endswith(("upper_arm", "lower_arm", "up_leg", "leg", "foot", "toe", "hand")))
    return (limbs, len(mapping))


def map_bones(bones, armature_name=""):
    """{canonical slot -> bone name}. `bones` = armature.data.bones or pose.bones.

    The shared object prefix is unknown ahead of time (`rp_manuel_..._dancing_upperarm_l`
    versus a bare `upperarm_l`), so every plausible prefix length is tried and the mapping
    that resolves the most limb joints wins. That is what keeps this working on rigs whose
    names embed digits, which a naive prefix scan would stop at.
    """
    bones = list(bones)
    names = [b.name for b in bones]
    prefix = shared_object_prefix(names)
    by_name = {b.name: b for b in bones}
    best = {}
    for length in range(len(prefix) + 1):
        cut = tuple(prefix[:length])
        taken = {}
        scored = []
        for name in names:
            if not is_poseable(name) or is_derived(name):
                continue
            keys = bone_keys(name, cut)
            slot = match_slot(name, keys, side_of(name))
            if slot:
                # rank: canonical slot priority first, then the shortest name wins the slot
                scored.append((SLOTS.index(slot), len(name), name, slot))
        scored.sort()
        for _, _, name, slot in scored:
            if slot not in taken and name not in taken.values():
                taken[slot] = name
        if "head" in taken and "neck" not in taken:
            head = by_name.get(taken["head"])
            if head is not None and head.parent is not None and is_poseable(head.parent.name):
                taken["neck"] = head.parent.name
        if "hips" not in taken:
            for b in bones:
                if b.parent is None and not is_derived(b.name) and is_poseable(b.name):
                    taken["hips"] = b.name
                    break
        if _score(taken) > _score(best):
            best = taken
    return best


def bone_path(bones, start, end):
    """Bones from `start` up to (excluding) `end`, ordered parent first. Used to spread a
    bend across every torso/neck segment a rig actually has."""
    if not start:
        return []
    cur = bones.get(end) if end else None
    if cur is None:
        return [start]
    chain = []
    while cur is not None and cur.name != start:
        chain.append(cur.name)
        cur = cur.parent
    if cur is None:
        return [start]
    chain.append(start)
    chain.reverse()
    return chain


def torso_chain(bones, slots):
    """Every spine segment between the hips and the neck. The neck itself is left out on
    purpose: clips pose it separately, and a torso lean that also bent the neck reads as a
    character noding while he walks."""
    if "spine" not in slots:
        return [slots["hips"]] if "hips" in slots else []
    end = slots.get("neck") or slots.get("head")
    chain = bone_path(bones, slots["spine"], end)
    if chain and end in chain:
        chain.remove(end)
    return [n for n in chain if is_poseable(n)] or [slots["spine"]]


def chain_of(bones, start_slot, end_slot, slots):
    start = slots.get(start_slot)
    end = slots.get(end_slot)
    if not start:
        return []
    if not end:
        return [start]
    return [n for n in bone_path(bones, start, end) if is_poseable(n)] or [start]


# ==================================================================================================
# 2. scene plumbing
# ==================================================================================================

def ensure_addons():
    """The FBX + glTF add-ons are not always on in a stock build (and never are in the wheel)."""
    try:
        import addon_utils
    except ImportError:  # pragma: no cover
        return
    for module in ("io_scene_fbx", "io_scene_gltf2"):
        if module not in bpy.context.preferences.addons:
            try:
                addon_utils.enable(module, default_set=True, persistent=False)
            except Exception as exc:  # pragma: no cover - add-on may be bundled differently
                warn(f"could not enable {module}: {exc}")
    if not hasattr(bpy.ops.import_scene, "fbx"):
        die("no FBX importer in this Blender build (looked for io_scene_fbx)")


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block_kind in (bpy.data.meshes, bpy.data.armatures, bpy.data.actions,
                       bpy.data.materials, bpy.data.images):
        for block in list(block_kind):
            if block.users == 0:
                block_kind.remove(block)


def import_fbx(path, anim=False):
    """Import an FBX and return the objects it added."""
    before = {o.name for o in bpy.data.objects}
    kwargs = dict(filepath=path, use_anim=anim, use_apply_transform=True)
    try:
        bpy.ops.import_scene.fbx(**kwargs)
    except TypeError:
        # older/newer importers rename the transform options
        bpy.ops.import_scene.fbx(filepath=path, use_anim=anim)
    return [o for o in bpy.data.objects if o.name not in before]


def find_armature(objs):
    arms = [o for o in objs if o.type == "ARMATURE"]
    if not arms:
        return None
    # the biggest skeleton wins (donor files sometimes ship a control rig too)
    return max(arms, key=lambda a: len(a.data.bones))


def meshes_of(objs, armature):
    out = []
    for o in objs:
        if o.type != "MESH":
            continue
        mod = next((m for m in o.modifiers if m.type == "ARMATURE"), None)
        if mod is None or mod.object is None or mod.object == armature:
            out.append(o)
    return out


def _armature_local(armature, obj):
    """World -> armature space, tolerating a degenerate object matrix (some FBX roots carry
    scale 0 on an empty, which makes the inverse fail)."""
    if armature is None:
        return obj.matrix_world
    try:
        return armature.matrix_world.inverted() @ obj.matrix_world
    except ValueError:
        return obj.matrix_world


def measure_z(armature, meshes):
    bounds = mesh_z_bounds(armature, meshes)
    return None if bounds is None else [c[0] for c in [bounds[2]]] + [bounds[2][1]]


def armature_space_height(armature, meshes):
    """Tallest point of the character, in armature-space units. A cm-authored rig and a m-authored
    rig are both just numbers until --height bakes the scale, which is what keeps one set of clip
    amplitudes valid on either. `armature` may be None (the auto-rigger measures a bare mesh), and
    a rig with no usable mesh falls back to its bone extents.
    """
    zs = measure_z(armature, meshes)
    if zs is None and armature is not None:
        zs = [b.head_local.z for b in armature.data.bones] + [b.tail_local.z for b in armature.data.bones]
    if not zs:
        return 0.0
    return (max(zs) - min(zs)) or 1.0


def mesh_z_bounds(armature, meshes):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = deps.objects.get(armature.name) if armature else None
    xs, ys, zs = [], [], []
    for o in meshes:
        eo = deps.objects.get(o.name)
        if eo is None:
            continue
        m = _armature_local(ev, eo)
        for corner in eo.bound_box:
            p = m @ Vector(corner)
            xs.append(p.x); ys.append(p.y); zs.append(p.z)
    if not zs and armature is not None:
        for b in armature.data.bones:
            for pt in (b.head_local, b.tail_local):
                xs.append(pt.x); ys.append(pt.y); zs.append(pt.z)
    if not zs:
        return None
    return (min(xs), max(xs)), (min(ys), max(ys)), (min(zs), max(zs))


def strip_constraints(armature, label=""):
    """Clips must survive a bake that only writes FK channels, so live rig constraints
    (IK, stretch, copy-transform) are removed and every pose bone becomes its own master.
    Skin weights are untouched, which is what keeps twist/corrective bones deforming."""
    n = 0
    for pb in armature.pose.bones:
        while pb.constraints:
            pb.constraints.remove(pb.constraints[0]); n += 1
    vlog(f"constraints removed from {armature.name}{label}: {n}")
    return n


def trim_non_deform_bones(armature, meshes):
    """A bone with no vertex group contributes nothing to the skin; glTF's export_def_bones
    then drops it, so helper/IK/aim bones cost zero bytes in the game."""
    weighted = set()
    for o in meshes:
        for vg in o.vertex_groups:
            weighted.add(vg.name)
    kept = 0
    for bone in armature.data.bones:
        bone.use_deform = bone.name in weighted
        kept += 1 if bone.use_deform else 0
    vlog(f"deform bones kept: {kept}/{len(armature.data.bones)} of {armature.name}")
    return kept


def pose_bone_map(armature, slots):
    return {slot: armature.pose.bones[name] for slot, name in slots.items() if name in armature.pose.bones}


# ==================================================================================================
# 3. auto-rig: a humanoid armature for a mesh that arrived without one
#
# Standard proportions are enough for a game humanoid once we know the total height and
# whether the arms stick out (T-pose) or hang (A-pose) - that decides where the elbows go and
# therefore whether the walk cycle reads as legs moving or as a body sliding.
# ==================================================================================================

LIMB_FRACTIONS = {          # fraction of overall height, measured from the feet
    "hips": 0.53, "spine": 0.60, "chest": 0.69, "upper_chest": 0.75,
    "neck": 0.82, "head": 0.87, "head_top": 1.0,
    "shoulder_z": 0.79, "shoulder_x": 0.16,
    "elbow_z": 0.79, "wrist_z": 0.79,
    "upleg_x": 0.10, "knee_z": 0.285, "ankle_z": 0.075, "toe_len": 0.145,
    "upperarm_len": 0.17, "lowerarm_len": 0.15, "hand_len": 0.075,
}


def detect_arm_pose(meshes, height):
    """'T' when the arms hold out level with the shoulders, else 'A'."""
    if not meshes or height <= 0:
        return "A"
    deps = bpy.context.evaluated_depsgraph_get()
    span_at_shoulder = 0.0
    span_total = 0.0
    zs = [LIMB_FRACTIONS["shoulder_z"] * height]
    for o in meshes:
        eo = deps.objects.get(o.name)
        if eo is None:
            continue
        me = eo.data
        for v in me.vertices:
            p = eo.matrix_world @ v.co
            span_total = max(span_total, abs(p.x))
            if abs(p.z - zs[0]) < 0.075 * height:
                span_at_shoulder = max(span_at_shoulder, abs(p.x))
    if span_at_shoulder > 0.34 * height:
        return "T"
    if span_total > 0.45 * height:
        return "T"
    return "A"


def build_humanoid_armature(name, height, arm_pose="A"):
    """Create an armature whose bones are already named in the canonical vocabulary, so
    map_bones() resolves it without a special case."""
    data = bpy.data.armatures.new(f"{name}_rig")
    rig = bpy.data.objects.new(f"{name}_rig", data)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    for o in bpy.context.selected_objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = data.edit_bones
    h = height

    def bone(bone_name, head, tail, parent=None, connect=False):
        b = eb.new(bone_name)
        b.head = Vector(head); b.tail = Vector(tail)
        b.use_deform = True
        if parent:
            b.parent = eb.get(parent)
            b.use_connect = connect
        return b

    f = LIMB_FRACTIONS
    bone("pelvis", (0, 0, f["hips"] * h), (0, 0, f["spine"] * h))
    bone("spine_01", (0, 0, f["spine"] * h), (0, 0, f["chest"] * h), "pelvis", True)
    bone("spine_02", (0, 0, f["chest"] * h), (0, 0, f["upper_chest"] * h), "spine_01", True)
    bone("spine_03", (0, 0, f["upper_chest"] * h), (0, 0, f["neck"] * h), "spine_02", True)
    bone("neck_01", (0, 0, f["neck"] * h), (0, 0, f["head"] * h), "spine_03", True)
    bone("head", (0, 0, f["head"] * h), (0, 0, f["head_top"] * h), "neck_01", True)

    upper, lower, hand = f["upperarm_len"] * h, f["lowerarm_len"] * h, f["hand_len"] * h
    tilt = 0.0 if arm_pose == "T" else math.radians(35)
    dy, dz = math.cos(tilt), -math.sin(tilt)
    for side, sign in (("l", 1.0), ("r", -1.0)):
        sx = f["shoulder_x"] * h
        bone(f"clavicle_{side}", (sign * 0.02 * h, 0, f["shoulder_z"] * h), (sign * sx, 0, f["shoulder_z"] * h))
        sh = (sign * sx, 0, f["shoulder_z"] * h)
        el = (sign * (sx + upper * dy), 0, f["shoulder_z"] * h + upper * dz)
        wr = (el[0] + lower * dy, 0, el[2] + lower * dz)
        hd = (wr[0] + hand * dy, 0, wr[2] + hand * dz)
        bone(f"upperarm_{side}", sh, el, f"clavicle_{side}")
        bone(f"lowerarm_{side}", el, wr, f"upperarm_{side}", True)
        bone(f"hand_{side}", wr, hd, f"lowerarm_{side}", True)
        lx = f["upleg_x"] * h
        hip = (sign * lx, 0, f["hips"] * h)
        knee = (sign * lx, 0, f["knee_z"] * h)
        ankle = (sign * lx, 0, f["ankle_z"] * h)
        toe = (sign * lx, -f["toe_len"] * h, 0.01 * h)
        bone(f"thigh_{side}", hip, knee, "pelvis")
        bone(f"calf_{side}", knee, ankle, f"thigh_{side}", True)
        bone(f"foot_{side}", ankle, toe, f"calf_{side}", True)
        bone(f"ball_{side}", toe, (toe[0], toe[1] - 0.05 * h, toe[2]), f"foot_{side}", True)
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


# ==================================================================================================
# 4. skinning, and normalising height + facing into the data
# ==================================================================================================

def _segment_closest(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return a + ab * t


def manual_weights(mesh, rig, bones, influences=4):
    """Inverse-distance weights onto the nearest bones. Used when Blender's bone-heat solver
    refuses (non-manifold shells from an FBX are common) and for very low-poly meshes, where
    heat weighting glues a hand to the whole arm."""
    groups = {name: mesh.vertex_groups.get(name) or mesh.vertex_groups.new(name=name) for name in bones}
    for g in mesh.vertex_groups:
        if g.name not in groups:
            g.add([], 0.0, "REPLACE")
    rest = {n: rig.data.bones[n] for n in bones if n in rig.data.bones}
    for v in mesh.data.vertices:
        scored = []
        for name, bone in rest.items():
            head = rig.matrix_world @ bone.head_local
            tail = rig.matrix_world @ bone.tail_local
            near = _segment_closest(v.co, head, tail)
            dist = (v.co - near).length
            scored.append((dist, name))
        scored.sort()
        keep = scored[:influences]
        total = sum(1.0 / (d * d + 1e-4) for d, _ in keep) or 1.0
        for dist, name in keep:
            groups[name].add([v.index], (1.0 / (dist * dist + 1e-4)) / total, "ADD")
    return len(mesh.data.vertices)


def skin_meshes(rig, meshes, slots, prefer="auto"):
    """Parent the meshes to the armature with weights. `prefer='auto'` tries bone heat first
    and falls back to distance weights per mesh, so an unprintable shell never leaves a
    completely rigid limb."""
    if not meshes:
        return {}
    bone_names = [b.name for b in rig.data.bones if not is_derived(b.name) or b.use_deform]
    result = {}
    for mesh in meshes:
        for o in bpy.context.selected_objects:
            o.select_set(False)
        mesh.select_set(True)
        rig.select_set(True)
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode="OBJECT")
        heat_ok = False
        if prefer in ("auto", "heat"):
            try:
                before = {g.name for g in mesh.vertex_groups}
                bpy.ops.object.parent_set(type="ARMATURE_AUTO")
                heat_ok = len({g.name for g in mesh.vertex_groups} - before) > 0 or len(mesh.vertex_groups) > 0
            except Exception as exc:  # pragma: no cover - operator refuses on odd geometry
                warn(f"bone-heat weighting failed on {mesh.name}: {exc}")
                heat_ok = False
        if not heat_ok:
            # bind by hand, then weight by bone proximity: no mesh is left rigid
            if mesh.parent is None:
                mesh.parent = rig
                mesh.matrix_parent_inverse = rig.matrix_world.inverted()
            mod = next((m for m in mesh.modifiers if m.type == "ARMATURE"), None)
            if mod is None:
                mod = mesh.modifiers.new("Armature", "ARMATURE")
            mod.object = rig
            n = manual_weights(mesh, rig, bone_names)
            result[mesh.name] = f"distance weights ({n} verts)"
            continue
        result[mesh.name] = "bone heat"
    return result


def measured_facing(rig, slots):
    """Yaw (radians) still needed to bring the character to looking along -Y.

    Ankle -> toe is the one signal that cannot be faked by bone roll: whatever the naming,
    the toes point where the feet point. The toe bone's own axis is not usable - in this
    character's rig `ball_l` runs sideways across the foot - so the head-to-head vector is
    what gets compared. A rig with no foot bones returns None and keeps its authored facing,
    which is what --yaw is for.
    """
    bones = rig.data.bones
    vecs = []
    for toe_slot, foot_slot in (("left_toe", "left_foot"), ("right_toe", "right_foot")):
        toe, foot = bones.get(slots.get(toe_slot, "")), bones.get(slots.get(foot_slot, ""))
        if toe is not None and foot is not None:
            vecs.append(toe.head_local - foot.head_local)
    if not vecs:
        toe = bones.get(slots.get("left_toe", "") or slots.get("right_toe", ""))
        if toe is not None:
            vecs.append(toe.tail_local - toe.head_local)
    if not vecs:
        return None
    v = sum((Vector((d.x, d.y, 0.0)) for d in vecs), Vector((0, 0, 0)))
    if v.length < 1e-5:
        return None
    return -math.pi / 2.0 - math.atan2(v.y, v.x)


def collapse_object_transforms(rig, meshes):
    """Bake every world transform into the data of the rig and its meshes.

    FBX importers routinely park the centimetres-to-metres factor on a root *empty*, so the
    armature object's own matrix is identity while its world matrix is scaled 100x. Applying
    object transforms alone would then leave bone data in centimetres and mesh data in metres,
    which is how a character ends up at the right height and the wrong proportions (or vice
    versa). Detaching from the parent chain first - while preserving each world matrix - makes
    armature space == world == metres for every rig, which is what the pose writer and the
    retargeter both assume.
    """
    targets = [o for o in [rig] + list(meshes) if o is not None]
    saved = [(o, o.matrix_world.copy(), o.parent, o.matrix_parent_inverse.copy()) for o in targets]
    for o, _mw, _p, _i in saved:
        o.parent = None
    bpy.context.view_layer.update()
    for o, mw, _p, _i in saved:
        o.matrix_world = mw
    _select(rig, meshes)
    try:
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    except Exception as exc:  # pragma: no cover
        warn(f"could not collapse object transforms: {exc}")
    for o, _mw, parent, _inv in saved:
        if o is not rig and parent is not None and rig is not None:
            o.parent = rig                      # keep the bind structure the exporter likes
            o.matrix_parent_inverse = Matrix.Identity(4)
    bpy.context.view_layer.update()
    return rig.matrix_world.to_scale(), rig.matrix_world.to_quaternion()


def _select(rig, meshes):
    bpy.ops.object.mode_set(mode="OBJECT")
    for o in bpy.context.selected_objects:
        o.select_set(False)
    if rig is not None:
        rig.select_set(True)
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.context.view_layer.update()


def normalise(rig, meshes, height=None, yaw=None, ground=True):
    """Bake uniform scale, a facing yaw and a ground offset into the bones and mesh data.

    Deliberately *not* left on the armature object: a skin root node carrying transform is how
    you end up with a character that renders at the right size and animates at the wrong one.
    """
    collapse_object_transforms(rig, meshes)
    before = mesh_z_bounds(rig, meshes)
    if before is None:
        warn("no mesh bounds; skipping height/facing normalisation")
        return {"height": None, "yaw": 0.0}
    (xmin, xmax), (ymin, ymax), (zmin, zmax) = before
    cur_h = zmax - zmin
    info = {"measuredHeight": cur_h}
    scale = (height / cur_h) if (height and cur_h > 1e-6) else 1.0
    if yaw is None:
        auto = measured_facing(rig, map_bones(rig.data.bones, rig.name))
        yaw = 0.0 if auto is None else auto
        info["yawSource"] = "toe bones" if auto is not None else "assumed authored facing -Y"
    else:
        info["yawSource"] = "--yaw override"
    dz = -zmin * scale if ground else 0.0
    mat = Matrix.Translation(Vector((0, 0, dz))) @ Matrix.Rotation(yaw, 4, "Z") @ Matrix.Scale(scale, 4)
    rig.matrix_world = mat @ rig.matrix_world
    for mesh in meshes:
        mesh.matrix_world = mat @ mesh.matrix_world
    _select(rig, meshes)
    try:
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    except Exception as exc:  # pragma: no cover
        warn(f"transform_apply failed ({exc}); leaving the transform on the objects")
    after = mesh_z_bounds(rig, meshes)
    if height and after:
        got = after[2][1] - after[2][0]
        if abs(got - height) > 0.02 * height:
            # The mesh data and the bone data were authored in different frames (a "geometries"
            # empty, or a scale factor only some objects inherit), so no single factor can fix
            # both. Better to stop here than to ship a character that renders at one size and
            # animates at another.
            die(
                f"{rig.name}: the mesh bounds and the skeleton disagree - normalising to "
                f"{height} gave {round(got, 3)}. Re-export the FBX with all object transforms "
                f"applied (Blender: select rig + meshes, Ctrl-A > All Transforms), or drop "
                f"--keep-source-anims and retarget instead.", 1)
    info["yawApplied"] = yaw
    if after:
        info["height"] = round(after[2][1] - after[2][0], 4)
        info["feetZ"] = round(after[2][0], 5)
        info["spanX"] = round(after[0][1] - after[0][0], 4)
    return info


# ==================================================================================================
# 5. pose writer
#
# Clips are authored as world-space *changes* to a bone - a delta rotation about an axis
# through the joint, or an aim direction - then resolved down the parent chain by hand. Nothing
# here knows a bone's local axes, which is what lets one clip drive a 2-segment or a 5-segment
# spine, a T-pose or an A-pose rig. `apply()` walks the skeleton parent-first, so a child bone
# (e.g. the calf, whose head sits below the thigh's tail in this rig) always follows its
# parent exactly.
# ==================================================================================================

FORWARD_Y = Vector((0, -1, 0))   # the way the character looks, once normalise() is done
UP = Vector((0, 0, 1))
BONE_Y = Vector((0, 1, 0))




def signed_angle(a, b, axis):
    """Signed angle from a to b about `axis`. mathutils' Vector.angle_signed is 2D only, so
    the 3D version needs the cross-product sign test."""
    ang = a.angle(b)
    return -ang if a.cross(b).dot(axis) < 0 else ang


class PoseWriter:
    def __init__(self, rig, slots, options=None):
        self.rig = rig
        self.data = rig.data
        self.slots = dict(slots)
        self.options = options or {}
        self.pose = {b.name: b for b in rig.pose.bones}
        order, seen = [], set()

        def visit(bone):
            if bone.name in seen:
                return
            if bone.parent is not None:
                visit(bone.parent)
            seen.add(bone.name)
            order.append(bone.name)

        for bone in self.data.bones:
            visit(bone)
        self.order = order                       # parent first: FK needs that order
        self.rel, self.rest, self.dir, self.bone_length = {}, {}, {}, {}
        for bone in self.data.bones:
            rest = bone.matrix_local.copy()
            self.rest[bone.name] = rest
            self.rel[bone.name] = bone.parent.matrix_local.inverted() @ rest if bone.parent else rest
            d = bone.tail_local - bone.head_local
            self.dir[bone.name] = d.normalized() if d.length > 1e-8 else Vector((0, 0, 1))
            self.bone_length[bone.name] = d.length
        self.joint = {slot: Vector(self.data.bones[name].head_local) for slot, name in self.slots.items()}
        self.chain_dir = {}
        for bone in self.data.bones:
            d = None
            for slot, name in self.slots.items():
                if name != bone.name:
                    continue
                child = CANON_CHILD.get(slot)
                if child and child in self.slots:
                    v = self.data.bones[self.slots[child]].head_local - bone.head_local
                    if v.length > 1e-6:
                        d = v.normalized()
            self.chain_dir[bone.name] = d if d is not None else (
                (bone.tail_local - bone.head_local).normalized() if (bone.tail_local - bone.head_local).length > 1e-8 else Vector((0, 0, 1)))
        self.offset_rest = {}     # head of a descendant joint, in this bone's own rest frame
        self.twist_kids = self._collect_twist_kids()
        self._q, self._d, self._aim, self._posed = {}, {}, {}, {}
        # FBX rigs can land a non-zero rest offset in matrix_basis; every frame is written as a
        # delta from that, so an unkeyed channel never drifts.
        self.rest_basis = {b.name: b.matrix_basis.copy() for b in self.pose.values()}
        self.animated = set()
        for pb in self.pose.values():
            pb.rotation_mode = "QUATERNION"
        self.height = max((b.tail_local.z for b in self.data.bones), default=1.0)
        hips = self.slots.get("hips")
        self.hips_z = self.data.bones[hips].head_local.z if hips else self.height * 0.53
        feet = [self.data.bones[self.slots[s]].head_local.z for s in ("left_foot", "right_foot") if s in self.slots]
        self.foot_z = (max(feet) if feet else self.hips_z * 0.07)   # ankle height above the floor
        self.unit = max(self.hips_z, 1e-4)       # a leg-length scale, so bobs survive a reskin
        bpy.context.view_layer.objects.active = rig
        bpy.ops.object.mode_set(mode="POSE")
        bpy.ops.object.mode_set(mode="OBJECT")

    # -- rig introspection -------------------------------------------------------------------
    def _collect_twist_kids(self):
        """`calf_twist_02_l`-style bones must follow their parent's twist or the forearm rolls
        inside the skin while the main bone turns. Their own weights stay, so this is the only
        thing that keeps a twist-bone rig from looking like a melting candle."""
        out = {}
        for bone in self.data.bones:
            if bone.parent is None or not is_derived(bone.name):
                continue
            if not re.search(r"twist|correct|corr", bone.name, re.I):
                continue
            out.setdefault(bone.parent.name, []).append(bone.name)
        return out

    def bone(self, slot_or_name):
        name = self.slots.get(slot_or_name, slot_or_name)
        return name if name in self.pose else None

    def head(self, slot):
        name = self.bone(slot)
        return Vector(self.data.bones[name].head_local) if name else None

    def joint_chain(self, hip_slot, knee_slot, ankle_slot):
        """Real joint centres, taken from bone heads rather than bone lengths: on this
        character the thigh bone stops halfway down the leg because a twist bone owns the
        rest of it, so a length-based IK would solve the wrong triangle."""
        hip, knee, ankle = (self.head(s) for s in (hip_slot, knee_slot, ankle_slot))
        if None in (hip, knee, ankle):
            return None
        return hip, knee, ankle

    def joint_offset(self, name, descendant):
        """Rest vector from this bone's head to a descendant joint's head, in this bone's
        unposed frame. Walking the parent chain (rather than assuming a direct child) is what
        lets the IK aim a bone whose real joint is two twist bones further down."""
        cached = self.offset_rest.get((name, descendant))
        if cached is not None:
            return cached
        chain, cur = [], self.data.bones.get(descendant)
        while cur is not None and cur.name != name:
            chain.append(cur)
            cur = cur.parent
        if cur is None:
            return None
        off = Vector((0, 0, 0))
        for bone in reversed(chain):
            off = (bone.parent.matrix_local.inverted() @ bone.matrix_local).translation if bone.parent else bone.matrix_local.translation
            # accumulate: translate the running offset up through each parent's rest frame
        off = self.data.bones[descendant].head_local - self.data.bones[name].head_local
        # express in `name`'s rest frame
        off = self.rest[name].inverted().to_3x3() @ off
        self.offset_rest[(name, descendant)] = off
        return off

    def hinge(self, bone_name, toward="front"):
        """Flexion axis of a joint: perpendicular to the limb and to the sagittal plane, signed
        so a positive angle moves the *next joint* toward `toward`."""
        d = self.chain_dir[bone_name]
        target = FORWARD_Y if toward == "front" else -FORWARD_Y
        axis = d.cross(target)
        if axis.length < 0.15:
            axis = Vector((1, 0, 0))
        axis.normalize()
        if (Quaternion(axis, 0.2) @ d).dot(target) < d.dot(target):
            axis = -axis
        return axis

    def axis_for(self, bone_name, kind):
        if kind == "twist":
            return self.chain_dir[bone_name].copy()
        if kind == "pitch":
            return Vector((1, 0, 0))
        if kind == "yaw":
            return Vector((0, 0, 1))
        if kind == "roll":
            return Vector((0, 1, 0))
        if kind == "flex_back":
            return self.hinge(bone_name, "back")
        return self.hinge(bone_name, "front")

    # -- mutation ----------------------------------------------------------------------------
    def rot(self, slot, kind="flex", angle=0.0, toward="front"):
        """Delta rotation, applied about the joint (the bone head) in armature space."""
        name = self.bone(slot)
        if name is None or abs(angle) < 1e-7:
            return
        axis = self.axis_for(name, "flex_back" if kind == "flex" and toward == "back" else kind)
        self._q[name] = Quaternion(axis.normalized(), angle) @ self._q.get(name, Quaternion())
        self.animated.add(name)

    def aim(self, slot, direction, twist=0.0):
        """Swing a bone so the *joint below it* travels along `direction` (armature space).
        Length is preserved, so this is exactly the primitive both IK and retargeting need:
        the posed limb points where it is told to point regardless of how the rig rolls its
        bones. Twist is then rolled about the new axis, which is how a source animation's
        forearm rotation survives onto a rig with different bone roll."""
        name = self.bone(slot)
        if name is None or direction.length < 1e-8:
            return
        child = CANON_CHILD.get(slot)
        want = Vector(direction).normalized()
        q = Quaternion(want, twist) if abs(twist) > 1e-7 else None
        self._aim[name] = (want, q, child)
        self.animated.add(name)

    def loc(self, slot, offset):
        name = self.bone(slot)
        if name is None:
            return
        self._d[name] = Vector(self._d.get(name, Vector())) + Vector(offset)
        self.animated.add(name)

    def chain_rot(self, chain, kind, angle, weight=None, toward="front"):
        """Spread one bend over every segment the rig actually has (five spine bones get a
        fifth each) so a 5-spine rig does not bend like a board at one vertebra."""
        chain = [c for c in chain if c]
        if not chain:
            return
        if weight is None:
            lens = [max(self.bone_length.get(c, 1.0), 1e-4) for c in chain]
            tot = sum(lens)
            weight = [x / tot for x in lens]
        for name, w in zip(chain, weight):
            self.rot(name, kind, angle * w, toward=toward)

    def apply(self):
        """Resolve the pending deltas into pose channels, parent first. Idempotent.

        Only `rotation_quaternion` (plus `location` for bones that are told to move) is written.
        Setting `pb.matrix` instead would also rewrite every bone's location channel, and since
        those channels are not keyed, the evaluated pose would then reuse whatever the *last*
        frame left there - which is how a walk cycle ends up with its hands at z=9.
        """
        ident = Matrix.Identity(4)
        self._posed = {}
        for name in self.order:
            pb = self.pose[name]
            parent = pb.parent.name if pb.parent else None
            base = self._posed.get(parent, ident) @ self.rel[name]
            R = None
            aim = self._aim.get(name)
            if aim is not None:
                want, tq, child = aim
                off = self.joint_offset(name, self.slots.get(child, "")) if child else None
                if off is None:
                    off = base.to_3x3() @ BONE_Y * max(self.bone_length.get(name, 1.0), 1e-4)
                have = base.to_3x3() @ off
                if have.length > 1e-8:
                    R = Vector(have).normalized().rotation_difference(want)
                    if tq is not None:
                        R = tq @ R
            q = self._q.get(name)
            if q is not None:
                R = q if R is None else q @ R
            desired = base
            if R is not None:
                h = base.translation
                desired = Matrix.Translation(h) @ R.to_matrix().to_4x4() @ Matrix.Translation(-h) @ base
            d = self._d.get(name)
            if d is not None:
                desired.translation = desired.translation + Vector(d)
            loc, rot, _scale = (base.inverted() @ desired).decompose()
            rest = self.rest_basis[name]
            pb.rotation_quaternion = rest.to_quaternion() @ rot if rest.determinant() else rot
            pb.location = rest.translation + loc
            pb.scale = (1.0, 1.0, 1.0)
            self._posed[name] = desired
            if name in self.twist_kids:
                spin = self._spin_of(name, base, desired)
                if abs(spin) > 1e-4:
                    for kid in self.twist_kids[name]:
                        if kid in self.pose:
                            self._q[kid] = Quaternion(self.dir[kid], spin) @ self._q.get(kid, Quaternion())
                            self.animated.add(kid)

    def clear(self):
        """Pending pose deltas are frame-scoped: ClipBuilder.frames() calls this before every
        frame, so apply() itself never throws the pose away (a second apply() for the ground
        pass has to reproduce the same pose, not the rest pose)."""
        self._q, self._d, self._aim, self.animated = {}, {}, {}, set()

    def _spin_of(self, name, base_m, posed_m):
        """Twist (roll) a bone gained this frame, about its own axis. Measured against the
        unposed-but-parent-posed frame rather than against the rest pose, so a child of a
        rotated hip does not inherit the parent's motion a second time."""
        dirv = self.chain_dir[name]
        if dirv.length < 1e-8:
            return 0.0
        a = base_m.to_3x3() @ Vector((1, 0, 0))
        b = posed_m.to_3x3() @ Vector((1, 0, 0))
        a = a - a.dot(dirv) * dirv
        b = b - b.dot(dirv) * dirv
        if a.length < 1e-4 or b.length < 1e-4:
            return 0.0
        return signed_angle(a.normalized(), b.normalized(), dirv)

    def foot_dip(self):
        """How far the foot joints have sunk below where they sit in the rest pose (0 = none).

        Compared against rest rather than against z=0, and using joint heads only: bone axes in
        this rig point sideways/backwards, so a "tail" estimate would report a foot buried
        0.8 m deep on every frame. The soles are on z=0 after normalise(), so a joint at its
        rest height is a foot exactly on the floor.
        """
        dip = 0.0
        for slot in ("left_toe", "left_foot", "right_toe", "right_foot"):
            name = self.bone(slot)
            if name is None:
                continue
            posed = self._posed.get(name)
            if posed is None:
                continue
            dip = min(dip, posed.translation.z - self.rest[name].translation.z)
        return dip

    def key(self, frame, extra_locations=(), lift_to_ground=False):
        """Write frame `frame` into the active action. `lift_to_ground` shifts the pelvis up
        when a foot would otherwise end the frame under the floor - a safety net for the
        one-shot FK clips, which do not author foot contact the way the gait clips do."""
        self.apply()
        moved = set(self._d)
        if lift_to_ground:
            dip = self.foot_dip()
            if dip < -1e-6:
                hips = self.bone("hips")
                if hips:
                    # add to the authored bob, never replace it
                    self._d[hips] = Vector(self._d.get(hips, Vector())) + Vector((0, 0, -dip))
                    self.apply()
                    moved.add(hips)
        loc_keys = ({self.bone(s) for s in extra_locations} | set(moved)) - {None}
        for name in self.order:
            pb = self.pose[name]
            if name in self.animated:
                pb.keyframe_insert("rotation_quaternion", frame=frame)
                if name in loc_keys:
                    pb.keyframe_insert("location", frame=frame)

    def finish(self, interpolation="LINEAR", easing=True):
        act = self.rig.animation_data.action if self.rig.animation_data else None
        if not act:
            return 0
        for fc in act.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = interpolation
        return len(act.fcurves)


# ==================================================================================================
# 6. the clip library - what Scraper Life drives
#
# Legs are written as *foot placement solved by two-bone IK* rather than as hip/knee angles.
# That is the whole trick behind a game walk cycle: the stance foot's position is authored
# directly, so it cannot sink through the floor or slide across it, and the pelvis height falls
# out of the reach of the supporting leg instead of being a hand-tuned bob. The same code with
# bigger stride / lift / duty numbers produces the run.
#
# Arms, spine and head are plain FK deltas. Every looping clip keys its first frame again at
# the end so LoopRepeat has no seam.
# ==================================================================================================


def deg(a):
    return math.radians(a)


class ClipBuilder:
    """Frame clock and curve shapes shared by every clip."""

    def __init__(self, pw, slots, fps=30.0, seconds=1.0, loop=True, frame_start=1):
        self.pw = pw
        self.slots = slots
        self.fps = fps
        self.loop = loop
        self.frame_start = frame_start
        self.count = max(2, int(round(seconds * fps)))
        self.total = self.count + 1
        self.t = 0.0
        self.i = 0

    def frames(self):
        for i in range(self.total):
            self.i = i
            self.t = i / self.count
            self.pw.clear()
            yield i

    @property
    def frame(self):
        return self.frame_start + self.i

    def key(self, extra_locations=(), ground=True):
        self.pw.key(self.frame, extra_locations=extra_locations, lift_to_ground=ground)

    def wave(self, cycles=1.0, phase=0.0):
        return math.sin(2 * math.pi * (cycles * self.t + phase))

    def ramp(self, a, b):
        """0 -> 1 across the interval [a, b], smoothstepped, clamped outside."""
        if self.t <= a:
            return 0.0
        if self.t >= b:
            return 1.0
        x = (self.t - a) / max(b - a, 1e-6)
        return x * x * (3 - 2 * x)

    def bump(self, centre, width):
        """One gaussian: foot strikes, fist pumps, the pulse's release."""
        x = (self.t - centre) / max(width, 1e-6)
        return math.exp(-x * x)

    def chain(self, start, end):
        return chain_of(self.pw.data.bones, start, end, self.slots)

    def torso(self):
        return torso_chain(self.pw.data.bones, self.slots)

    # -- the gait solver ----------------------------------------------------------------------
    def leg_segments(self, side):
        """(upper, lower) lengths from the actual joint centres, not from bone lengths: on this
        character the thigh bone stops halfway down the leg because a twist bone owns the rest
        of it, so a length-based solve would bend the knee in mid-shin."""
        chain = self.pw.joint_chain(f"{side}_up_leg", f"{side}_leg", f"{side}_foot")
        if chain is None:
            return None
        hip, knee, ankle = chain
        upper, lower = (knee - hip).length, (ankle - knee).length
        if upper < 1e-6 or lower < 1e-6:
            return None
        return hip, knee, ankle, upper, lower

    def leg_hip_z(self, side, offset, lift, bend):
        """Hip height at which this leg just reaches the authored foot position. The stance
        leg drives the pelvis, which is where a walk's bob comes from - no fudge factor."""
        seg = self.leg_segments(side)
        if seg is None:
            return None
        hip, knee, ankle, upper, lower = seg
        reach = (upper + lower) * bend
        rho = math.hypot(offset.x, offset.y)
        if rho >= reach:
            rho = reach * 0.985
        vertical = math.sqrt(max(reach * reach - rho * rho, 1e-6))
        return self.pw.foot_z + lift + vertical

    def solve_leg(self, side, offset, lift, hip, bend=0.985, knee_pole=-FORWARD_Y):
        """Two-bone IK: the foot position is authored, the joints fall out of it. Because the
        foot is the input, it can neither sink through the floor nor slide across it."""
        pw = self.pw
        seg = self.leg_segments(side)
        if seg is None:
            return
        rest_hip, rest_knee, rest_ankle, upper, lower = seg
        ankle = Vector((hip.x + offset.x, hip.y + offset.y, pw.foot_z + lift))
        down = ankle - hip
        span = down.length
        reach = (upper + lower) * bend
        if span < 1e-6:
            return
        if span > reach:                       # too far: pull the target in, keep the direction
            down = down.normalized() * reach
            ankle = hip + down
            span = reach
        dn = down.normalized()
        perp = knee_pole - knee_pole.dot(dn) * dn
        perp = Vector((perp.x, perp.y, 0.0))
        if perp.length < 1e-6:
            perp = Vector((0, 1, 0))
        perp.normalize()
        along = (upper * upper - lower * lower + span * span) / (2 * span)
        h = math.sqrt(max(upper * upper - along * along, 0.0))
        knee = hip + dn * along + perp * h
        pw.aim(f"{side}_up_leg", (knee - hip).normalized())
        pw.aim(f"{side}_leg", (ankle - knee).normalized())
        toe_slot, foot_slot = f"{side}_toe", f"{side}_foot"
        if foot_slot in pw.slots and False:
            # the ankle->toe axis is what holds a foot flat; the toe bone's own axis runs
            # sideways across the foot in this rig and would roll it onto its side
            toe = pw.data.bones.get(pw.slots.get(toe_slot, ""))
            toe_len = (toe.head_local - rest_ankle).length if toe else 0.12 * pw.unit
            toe_len = max(toe_len, 0.05 * pw.unit)
            flat = ankle.z <= pw.foot_z + 1e-5
            toe_z = 0.0 if flat else max(ankle.z - toe_len * 0.55, 0.0)
            aim_to = Vector((ankle.x, ankle.y - toe_len, toe_z))
            d = aim_to - ankle
            if d.length > 1e-8:
                pw.aim(foot_slot, Vector((0.0, d.y, d.z)).normalized())
            if toe_slot in pw.slots:
                pw.aim(toe_slot, Vector((0, -1, 0.06 if flat else -0.30)))

    def arms(self, swing, bend, phase, extra_twist=0.0):
        """Counter-swinging arms: opposite to the same-side leg, elbow trailing."""
        pw = self.pw
        for side, sgn in (("left", 1.0), ("right", -1.0)):
            s = math.sin(phase + (0.0 if side == "left" else math.pi))
            pw.rot(f"{side}_upper_arm", "flex", -swing * s, toward="front")
            pw.rot(f"{side}_lower_arm", "flex", bend + bend * 0.35 * max(0.0, -s), toward="front")
            pw.rot(f"{side}_shoulder", "flex", -swing * 0.13 * s, toward="front")
            pw.rot(f"{side}_upper_arm", "twist", extra_twist * s, toward="front")


CLIPS = {}


def clip(name, seconds, loop=True, note=""):
    def deco(fn):
        CLIPS[name] = {"fn": fn, "seconds": seconds, "loop": loop, "note": note}
        return fn
    return deco


@clip("idle", 4.4, True, "standing breathing loop with a slow weight shift")
def clip_idle(b: ClipBuilder):
    pw, torso = b.pw, b.torso()
    for _ in b.frames():
        breathe = b.wave(1.0)
        slow = b.wave(0.5, 0.15)
        pw.chain_rot(torso, "flex", deg(1.2) * breathe, toward="front")
        pw.chain_rot(torso, "yaw", deg(1.4) * slow, toward="front")
        pw.rot("neck", "flex", deg(-1.0) * breathe, toward="front")
        pw.rot("head", "flex", deg(-1.4) * breathe, toward="front")
        pw.rot("head", "yaw", deg(2.8) * b.wave(0.25, 0.35), toward="front")
        for side, sgn in (("left", 1.0), ("right", -1.0)):
            pw.rot(f"{side}_shoulder", "flex", deg(0.9) * breathe, toward="front")
            pw.rot(f"{side}_upper_arm", "flex", deg(1.8) * breathe + deg(0.8) * slow * sgn, toward="front")
            pw.rot(f"{side}_lower_arm", "flex", deg(5.0) + deg(2.4) * breathe, toward="front")
            pw.rot(f"{side}_upper_arm", "twist", deg(1.4) * slow, toward="front")
            pw.rot(f"{side}_up_leg", "flex", deg(1.0) * slow * sgn, toward="front")
            pw.rot(f"{side}_leg", "flex", deg(1.4) * slow * sgn, toward="back")
        pw.rot("hips", "roll", deg(0.8) * slow, toward="front")
        pw.loc("hips", (0, 0, 0.006 * pw.unit * breathe))
        b.key(extra_locations=["hips"])


@clip("walk", 1.06, True, "in-place foot-contact walk; the game owns translation")
def clip_walk(b: ClipBuilder):
    pw, torso = b.pw, b.torso()
    stride, lift, duty, bend = 0.30 * pw.unit, 0.12 * pw.unit, 0.62, 0.982
    for _ in b.frames():
        ph = 2 * math.pi * b.t
        feet = {}
        for side in ("left", "right"):
            w = (b.t + (0.0 if side == "left" else 0.5)) % 1.0
            stance = w < duty
            if stance:
                s = w / duty
                y, z = stride - 2 * stride * s, 0.0
            else:
                s = (w - duty) / (1.0 - duty)
                y, z = -stride + 2 * stride * s, lift * math.sin(math.pi * s) ** 0.7
            feet[side] = (Vector((0, y, 0)), z, stance)
        needs = [b.leg_hip_z(side, off, z, bend) for side, (off, z, stance) in feet.items() if stance]
        hips_z = max([n for n in needs if n is not None], default=pw.hips_z)
        hip = Vector((0.012 * pw.unit * math.sin(ph), 0, hips_z))
        for side, (off, z, _stance) in feet.items():
            b.solve_leg(side, off, z, hip=hip, bend=bend)
        pw.loc("hips", (hip.x, 0, hips_z - pw.hips_z))
        pw.rot("hips", "roll", deg(-2.6) * math.sin(ph), toward="front")
        pw.rot("hips", "yaw", deg(3.2) * math.sin(ph), toward="front")
        pw.chain_rot(torso, "flex", deg(3.2), toward="front")
        pw.chain_rot(torso, "yaw", deg(-3.8) * math.sin(ph), toward="front")
        pw.rot("head", "yaw", deg(2.2) * math.sin(ph), toward="front")
        pw.rot("neck", "flex", deg(-1.8), toward="front")
        b.arms(deg(23.0), deg(15.0), ph, extra_twist=deg(6.0))
        b.key(extra_locations=["hips"])


@clip("run", 0.72, True, "sprint: forward lean, high knees, a real flight phase")
def clip_run(b: ClipBuilder):
    pw, torso = b.pw, b.torso()
    stride, lift, duty, bend = 0.44 * pw.unit, 0.34 * pw.unit, 0.36, 0.95
    for _ in b.frames():
        ph = 2 * math.pi * b.t
        feet = {}
        for side in ("left", "right"):
            w = (b.t + (0.0 if side == "left" else 0.5)) % 1.0
            stance = w < duty
            if stance:
                s = w / duty
                y, z = stride - 2 * stride * s, 0.006 * lift * math.sin(math.pi * s)
            else:
                s = (w - duty) / (1.0 - duty)
                y, z = -stride + 2 * stride * s, lift * math.sin(math.pi * s) ** 0.55
            feet[side] = (Vector((0, y, 0)), z, stance)
        needs = [n for n in (b.leg_hip_z(side, off, z, bend) for side, (off, z, stance) in feet.items() if stance) if n is not None]
        flight = [n for n in (b.leg_hip_z(side, off, z, bend) for side, (off, z, stance) in feet.items()) if n is not None]
        hips_z = max(needs) if needs else (min(flight) - 0.02 * pw.unit if flight else pw.hips_z)
        hips_z = min(hips_z, pw.hips_z + 0.06 * pw.unit)      # no pogo stick
        hip = Vector((0, 0, hips_z))
        for side, (off, z, _stance) in feet.items():
            b.solve_leg(side, off, z, hip=hip, bend=bend)
        pw.loc("hips", (0, 0, hips_z - pw.hips_z))
        pw.rot("hips", "roll", deg(-3.0) * math.sin(ph), toward="front")
        pw.rot("hips", "yaw", deg(5.2) * math.sin(ph), toward="front")
        pw.chain_rot(torso, "flex", deg(9.5), toward="front")
        pw.chain_rot(torso, "yaw", deg(-6.4) * math.sin(ph), toward="front")
        pw.rot("neck", "flex", deg(-5.5), toward="front")
        pw.rot("head", "flex", deg(-3.0) + deg(1.6) * math.sin(2 * ph), toward="front")
        b.arms(deg(42.0), deg(76.0), ph, extra_twist=deg(-20.0))
        b.key(extra_locations=["hips"])


@clip("jump", 1.05, False, "crouch, take off, tuck, land and settle")
def clip_jump(b: ClipBuilder):
    for _ in b.frames():
        crouch = b.ramp(0.0, 0.18) * (1.0 - b.ramp(0.60, 0.78))
        launch = b.ramp(0.16, 0.30) * (1.0 - b.ramp(0.42, 0.60))
        tuck = b.ramp(0.28, 0.42) * (1.0 - b.ramp(0.52, 0.66))
        land = b.ramp(0.60, 0.76) * (1.0 - b.ramp(0.84, 1.0))
        dip = max(crouch, land)
        for side in ("left", "right"):
            b.pw.rot(f"{side}_up_leg", "flex", deg(50.0) * dip + deg(30.0) * tuck - deg(16.0) * launch, toward="front")
            b.pw.rot(f"{side}_leg", "flex", deg(58.0) * dip + deg(94.0) * tuck, toward="back")
            b.pw.rot(f"{side}_foot", "pitch", deg(24.0) * launch + deg(18.0) * dip - deg(16.0) * tuck, toward="front")
            b.pw.rot(f"{side}_upper_arm", "flex", deg(120.0) * launch + deg(56.0) * tuck - deg(36.0) * dip, toward="front")
            b.pw.rot(f"{side}_lower_arm", "flex", deg(26.0) + deg(30.0) * tuck, toward="front")
        b.pw.chain_rot(b.torso(), "flex", deg(19.0) * dip - deg(9.0) * launch, toward="front")
        b.pw.rot("head", "flex", deg(-8.0) * dip + deg(10.0) * launch, toward="front")
        rise = b.ramp(0.18, 0.40) - b.ramp(0.44, 0.66)
        b.pw.loc("hips", (0, 0, (-0.14 * dip + 0.5 * rise) * b.pw.unit))
        b.key(extra_locations=["hips"])


@clip("pulse", 1.15, False, "scrap pulse (Space/PULSE): wind up, sweep out, recover")
def clip_pulse(b: ClipBuilder):
    for _ in b.frames():
        wind = b.ramp(0.0, 0.30) * (1.0 - b.ramp(0.42, 0.52))
        burst = b.ramp(0.42, 0.52) * (1.0 - b.ramp(0.62, 0.86))
        settle = b.ramp(0.62, 0.95)
        for side in ("left", "right"):
            b.pw.rot(f"{side}_upper_arm", "flex", deg(94.0) * wind + deg(-116.0) * burst, toward="front")
            b.pw.rot(f"{side}_upper_arm", "twist", deg(30.0) * burst - deg(12.0) * wind, toward="front")
            b.pw.rot(f"{side}_lower_arm", "flex", deg(62.0) * wind + deg(-50.0) * burst, toward="front")
            b.pw.rot(f"{side}_hand", "flex", deg(-18.0) * burst, toward="front")
            b.pw.rot(f"{side}_leg", "flex", deg(9.0) * wind + deg(13.0) * settle, toward="back")
            b.pw.rot(f"{side}_foot", "pitch", deg(-8.0) * settle, toward="front")
        b.pw.chain_rot(b.torso(), "flex", deg(-10.0) * wind + deg(15.0) * burst, toward="front")
        b.pw.rot("head", "flex", deg(-13.0) * wind + deg(19.0) * burst, toward="front")
        b.pw.loc("hips", (0, 0, (-0.05 * wind + 0.03 * burst - 0.02 * settle) * b.pw.unit))
        b.key(extra_locations=["hips"])


@clip("hit", 0.52, False, "takes pressure from Vardee's crew: recoil and guard")
def clip_hit(b: ClipBuilder):
    for _ in b.frames():
        snap = b.ramp(0.0, 0.18) * (1.0 - b.ramp(0.38, 0.72))
        recover = b.ramp(0.30, 1.0)
        for side in ("left", "right"):
            b.pw.rot(f"{side}_upper_arm", "flex", deg(-44.0) * snap + deg(20.0) * recover, toward="front")
            b.pw.rot(f"{side}_lower_arm", "flex", deg(68.0) * snap, toward="front")
            b.pw.rot(f"{side}_up_leg", "flex", deg(-16.0) * snap, toward="front")
            b.pw.rot(f"{side}_leg", "flex", deg(24.0) * snap, toward="back")
        b.pw.chain_rot(b.torso(), "flex", deg(-21.0) * snap + deg(6.0) * recover, toward="front")
        b.pw.chain_rot(b.torso(), "roll", deg(6.0) * snap, toward="front")
        b.pw.rot("head", "flex", deg(-19.0) * snap, toward="front")
        b.pw.rot("jaw", "flex", deg(8.0) * snap, toward="front")
        b.pw.loc("hips", (0, 0.05 * b.pw.unit * snap, -0.04 * b.pw.unit * snap))
        b.key(extra_locations=["hips"])


@clip("grab", 0.92, False, "reach down and lift a piece of scrap (E / USE)")
def clip_grab(b: ClipBuilder):
    for _ in b.frames():
        reach = b.ramp(0.0, 0.34) * (1.0 - b.ramp(0.56, 0.70))
        lift = b.ramp(0.30, 0.52) * (1.0 - b.ramp(0.66, 0.92))
        b.pw.rot("right_upper_arm", "flex", deg(72.0) * reach + deg(18.0) * lift, toward="front")
        b.pw.rot("right_lower_arm", "flex", deg(26.0) * reach + deg(34.0) * lift, toward="front")
        b.pw.rot("right_hand", "flex", deg(24.0) * reach, toward="front")
        b.pw.rot("left_upper_arm", "flex", deg(-12.0) * reach, toward="front")
        b.pw.rot("left_lower_arm", "flex", deg(18.0) * reach, toward="front")
        b.pw.chain_rot(b.torso(), "flex", deg(14.0) * reach - deg(4.0) * lift, toward="front")
        b.pw.chain_rot(b.torso(), "yaw", deg(-6.0) * reach, toward="front")
        b.pw.rot("head", "flex", deg(12.0) * reach, toward="front")
        b.pw.rot("right_up_leg", "flex", deg(-10.0) * reach, toward="front")
        b.pw.rot("right_leg", "flex", deg(14.0) * reach + deg(10.0) * lift, toward="back")
        b.pw.loc("hips", (0, 0, -0.03 * b.pw.unit * reach))
        b.key(extra_locations=["hips"])


@clip("celebrate", 1.7, False, "chapter closed: both fists up, small hop")
def clip_celebrate(b: ClipBuilder):
    for _ in b.frames():
        up = b.ramp(0.05, 0.28) * (1.0 - b.ramp(0.72, 0.96))
        pumps = math.sin(2 * math.pi * (3.0 * b.t + 0.1)) * up
        for side in ("left", "right"):
            b.pw.rot(f"{side}_upper_arm", "flex", deg(148.0) * up + deg(10.0) * pumps, toward="front")
            b.pw.rot(f"{side}_upper_arm", "twist", deg(24.0) * up * (1.0 if side == "left" else -1.0), toward="front")
            b.pw.rot(f"{side}_lower_arm", "flex", deg(50.0) * up - deg(26.0) * pumps, toward="front")
            b.pw.rot(f"{side}_leg", "flex", deg(20.0) * b.bump(0.30, 0.10) + deg(14.0) * b.bump(0.62, 0.10), toward="back")
            b.pw.rot(f"{side}_foot", "pitch", deg(-16.0) * (b.bump(0.30, 0.10) + b.bump(0.62, 0.10)), toward="front")
        b.pw.chain_rot(b.torso(), "flex", deg(-10.0) * up, toward="front")
        b.pw.rot("head", "flex", deg(-14.0) * up, toward="front")
        hop = b.bump(0.34, 0.11) + b.bump(0.66, 0.11)
        b.pw.loc("hips", (0, 0, 0.09 * b.pw.unit * hop - 0.02 * b.pw.unit * up))
        b.key(extra_locations=["hips"])


def set_action(rig, action):
    """Make `action` the active action of `rig` on every Blender version this script supports.

    4.3+ key animation on Action *slots* and leave `animation_data.action` as a legacy pointer;
    the FBX exporter refuses to re-bake an action it cannot re-assign, and (separately) only
    walks `bpy.data.actions` when `bake_anim_use_all_actions` is on. Touching the slot first,
    when the API has one, keeps both the viewport and the sidecar export honest.
    """
    anim = rig.animation_data_create()
    for owner in (getattr(anim, "action_collection", None), getattr(rig.data, "action_collection", None)):
        collection = getattr(owner, "children_root", None) if owner is not None else None
        layer = next((l for l in getattr(collection, "layers", []) if getattr(l, "action", None) is action), None)
        if layer is None and collection is not None:
            layer = collection.layers.new(action.name)
            layer.action = action
        if layer is not None:
            slot = next((s for s in layer.slots if s.id_data is action), None) or layer.slots.new(id_type="OBJECT", name=action.name)
            try:
                slot.id_data = action
            except (TypeError, RuntimeError):
                pass
            collection.root_slot = slot
            break
    anim.action = action
    return anim


def build_clips(pw, slots, names, fps):
    """Author each requested clip as its own Blender action (= one THREE.AnimationClip)."""
    scene = bpy.context.scene
    made = []
    for name in names:
        spec = CLIPS.get(name)
        if spec is None:
            warn(f"no procedural clip named '{name}' (have: {', '.join(sorted(CLIPS))})")
            continue
        action = bpy.data.actions.new(name)
        set_action(pw.rig, action)
        builder = ClipBuilder(pw, slots, fps=fps, seconds=spec["seconds"], loop=spec["loop"])
        t0 = time.time()
        spec["fn"](builder)
        curves = pw.finish(interpolation="LINEAR")
        made.append({"name": name, "loop": spec["loop"], "seconds": round(builder.count / fps, 3),
                     "curves": curves, "note": spec["note"]})
        vlog(f"clip {name}: {curves} fcurves, {builder.total} keys, {time.time() - t0:.1f}s")
    total = max([m["seconds"] for m in made], default=1.0)
    scene.frame_start, scene.frame_end = 1, max(2, int(round(total * fps)) + 1)
    return made


# ==================================================================================================
# 7. retarget: drive this skeleton with animation recorded on another one
#
# The dancing/mechanic FBX files in fbx/ carry real keyframe data on a *different* rig. Only
# the change each bone makes to its own rest pose is transferred (world-space delta + the
# twist about the bone axis), never absolute matrices, so a T-pose source can drive an A-pose
# character without snapping its arms out sideways.
# ==================================================================================================

def _rest_frames(rig):
    """{bone: (rest_world_quat, rest_dir)} in armature space."""
    out = {}
    for bone in rig.data.bones:
        m = bone.matrix_local
        out[bone.name] = (m.to_quaternion().copy(), (m.to_3x3() @ Vector((0, 1, 0))).normalized())
    return out


def bone_twist(rest_m, posed_m, d=None):
    """Signed twist of a bone about its own (posed) axis, i.e. the roll a clip adds."""
    dirv = d if d is not None else (posed_m.to_3x3() @ Vector((0, 1, 0))).normalized()
    xr = rest_m.to_3x3() @ Vector((1, 0, 0))
    xp = posed_m.to_3x3() @ Vector((1, 0, 0))
    xr = xr - xr.dot(dirv) * dirv
    xp = xp - xp.dot(dirv) * dirv
    if xr.length < 1e-4 or xp.length < 1e-4:
        return 0.0
    return signed_angle(xr.normalized(), xp.normalized(), dirv)


def eval_pose_matrices(rig, action=None, frame=None, rest_basis=None):
    """Compose every pose bone's armature-space matrix by hand, optionally after writing
    `action`'s channels at `frame`.

    The depsgraph is bypassed on purpose: a control-rig FBX (deform bones driven by constraints
    on animated empties, or one action shared by several objects) can evaluate to a pose that
    never changes when the scene frame moves, and a retarget from that silently becomes one frozen
    pose. This is the same parent-first composition `PoseWriter` uses to keyframe the target rig,
    so both sides of the transfer are measured in one consistent frame.
    """
    bones = rig.data.bones
    rel, kids = {}, {}
    for b in bones:
        rel[b.name] = (b.parent.matrix_local.inverted() @ b.matrix_local) if b.parent else b.matrix_local.copy()
        kids.setdefault(b.parent.name if b.parent else None, []).append(b.name)
    order, queue = [], list(kids.get(None) or [])
    while queue:
        name = queue.pop(0)
        order.append(name)
        queue.extend(kids.get(name, []))
    for name in bones.keys():                      # anything the hierarchy missed (orphan bones)
        if name not in order:
            order.append(name)
    pose = rig.pose.bones
    if rest_basis:
        for name, mat in rest_basis.items():
            pb = pose.get(name)
            if pb is not None:
                pb.matrix_basis = mat
    if action is not None and frame is not None:
        chans = {}
        for fc in action.fcurves:
            m = re.match(r'pose\.bones\["([^"]+)"\]\.([A-Za-z_]+)$', fc.data_path or "")
            if m:
                chans.setdefault((m.group(1), m.group(2)), {})[fc.array_index] = fc
        for (name, prop), per_index in chans.items():
            pb = pose.get(name)
            if pb is None:
                continue
            try:
                current = getattr(pb, prop)
            except AttributeError:
                continue
            vals = list(current)
            for i in range(len(vals)):
                fc = per_index.get(i)
                if fc is not None:
                    vals[i] = fc.evaluate(frame)
            try:
                setattr(pb, prop, type(current)(vals) if hasattr(current, "__len__") else vals)
            except (TypeError, ValueError):
                pass
    mats, ident = {}, Matrix.Identity(4)
    for name in order:
        pb = pose.get(name)
        if pb is None:
            continue
        parent = bones[name].parent
        base = mats.get(parent.name, ident) if parent else ident
        mats[name] = base @ rel[name] @ pb.matrix_basis
    return mats


def action_motion(action):
    """(key count, total value spread) for an action - a stand-in for "is this a performance".

    A rig file often carries one action per clip plus a setup action, all with the same fcurve
    count, so ranking by channels alone picks the frozen one. Ranking by keys-then-spread does not.
    """
    keys, spread = 0, 0.0
    for fc in action.fcurves:
        pts = fc.keyframe_points
        keys += len(pts)
        if len(pts) > 1:
            ys = [p.co.y for p in pts]
            spread += max(ys) - min(ys)
    return (keys, spread)


def donor_basis(rig, slots):
    """(rotation into the clip frame, height along the body axis, facing yaw) for a donor rig.

    The clip frame is the one `PoseWriter` works in: +Z up, -Y forward, +X toward the
    character's left. Deriving it from the donor's own rest *joints* - instead of assuming the
    file was authored that way - is what lets a Y-up, centimetre-scaled or oddly-oriented export
    retarget without a correction, and it works in armature space so nothing about the donor's
    object hierarchy has to be touched.
    """
    bones = rig.data.bones

    def head(slot):
        n = slots.get(slot)
        return Vector(bones[n].head_local) if n and n in bones else None

    up = Vector((0, 0, 1))
    hips_h = head("hips")
    top = head("head") or head("neck") or head("upper_chest") or head("chest") or head("spine")
    if hips_h and top:
        d = top - hips_h
        if d.length > 1e-6:
            up = d.normalized()
    fwd = Vector((0.0, 0.0, 0.0))
    for side in ("left", "right"):
        ankle, toe = head(f"{side}_foot"), head(f"{side}_toe")
        if ankle and toe:
            d = toe - ankle
            if d.length > 1e-6:
                fwd += d.normalized()
    if fwd.length < 1e-6:
        fwd = Vector((0, -1, 0))
    fwd = fwd - up * fwd.dot(up)
    if fwd.length < 1e-6:
        fwd = Vector((0, -1, 0)) - up * Vector((0, -1, 0)).dot(up)
        if fwd.length < 1e-6:
            fwd = Vector((1, 0, 0))
    fwd = fwd.normalized()
    z = up
    y = -fwd                        # the authored facing is -Y
    x = y.cross(z).normalized()
    y = z.cross(x).normalized()     # re-orthogonalise after the projections
    # One axis per ROW, so `to_clip @ v` is (x.v, y.v, z.v) - the donor vector read out in clip
    # coordinates. Transposing here silently applies the inverse rotation instead, which on a
    # Y-up/Z-forward donor points every limb the wrong way (feet overhead, in practice).
    to_clip = Matrix((x, y, z))
    pts = [Vector(b.head_local) for b in bones] + [Vector(b.tail_local) for b in bones]
    along = [p.dot(z) for p in pts]
    height = (max(along) - min(along)) or 1.0
    return to_clip, height, math.atan2(-fwd.x, -fwd.y)


def sample_animation_source(path, fps, start=None, seconds=None, verbose=False, prefer=None):
    """Read a donor FBX into rig-agnostic sample data: per frame, per canonical slot, the
    world-space rotation delta and twist it applies to its own rest pose."""
    reset_scene()
    ensure_addons()
    objs = import_fbx(path, anim=True)
    rig = find_armature(objs)
    if rig is None:
        die(f"{path}: no armature, so there is nothing to retarget from")
    slots = map_bones(rig.data.bones, rig.name)
    missing = [s for s in ("hips", "spine", "head", "left_up_leg", "left_upper_arm") if s not in slots]
    if missing:
        die(f"{path}: cannot recognise these bones on the donor rig: {', '.join(missing)} - "
            "retargeting needs at least a spine, a head and one limb joint")
    # Deliberately no collapse_object_transforms() here: baking a donor's object scale into its
    # bone data leaves the *posed* matrices inconsistent with the keyframed values (on the ActorCore
    # file every bone came back with a zero Y column). Sampling stays in armature space and uses a
    # basis built from the donor's own rest joints, which needs no mutation at all.
    basis, height, yaw = donor_basis(rig, slots)
    candidates = [a for a in bpy.data.actions if any("pose.bones" in fc.data_path for fc in a.fcurves)]
    action = rig.animation_data.action if (rig.animation_data and rig.animation_data.action) else None
    if prefer:
        matches = [a for a in candidates if prefer.lower() in a.name.lower()]
        if not matches:
            die(f"{path}: no action named like {prefer!r} (have: {', '.join(sorted(a.name for a in candidates)[:12])})")
        action = matches[0]
    elif action is None or not action.fcurves:
        if not candidates:
            die(f"{path}: contains no skeletal animation to take")
        # NOT the most fcurves: a file that ships one action per clip gives every action the same
        # channel count, and its setup/rest action - two identical keys - wins a tie and retargets
        # as a frozen pose. Variation is what makes an animation worth taking.
        action = max(candidates, key=action_motion)
    if action is None:
        die(f"{path}: the active action has no pose channels")
    keys, spread = action_motion(action)
    log(f"  using donor action '{action.name}' ({keys} keys, "
        f"frames {int(action.frame_range[0])}..{int(action.frame_range[1])}, motion {round(spread, 3)})")
    if spread < 1e-6:
        die(f"{os.path.basename(path)}: every channel in '{action.name}' holds a single value, so "
            f"there is no performance to take. This file's animation lives in {len(candidates)} "
            f"take(s) that this Blender's FBX importer collapsed to two flat keys - re-export the "
            f"donor from Blender (or pick another file with --retarget-action) before retargeting.", 1)
    lo, hi = (action.frame_range[0], action.frame_range[1]) if action else (1, 1)
    scene = bpy.context.scene
    src_fps = scene.render.fps + scene.render.fps_subsample / max(scene.render.fps_base, 1e-6) if hasattr(scene.render, "fps_subsample") else scene.render.fps
    first = int(round((start if start is not None else (lo - 1) / src_fps) * fps)) + 1
    last = int(round(first + (seconds if seconds else (hi - lo + 1) / src_fps) * fps))
    first = max(first, int(lo))
    last = min(max(last, first + 2), int(hi))
    # A file exported from a game engine often keeps the character's travel on the armature
    # object rather than on the pelvis bone, so read those channels too.
    obj_loc = {fc.array_index: fc for fc in action.fcurves if (fc.data_path or "") == "location"}
    rest_obj_loc = Vector(rig.location)
    bone_of = dict(slots)
    rest_basis = {pb.name: pb.matrix_basis.copy() for pb in rig.pose.bones}
    rest_mats = eval_pose_matrices(rig, rest_basis=rest_basis)
    frames = []
    for f in range(first, last + 1):
        mats = eval_pose_matrices(rig, action, f, rest_basis)
        entry = {"dirs": {}, "twist": {}, "hips": None}
        for slot, name in bone_of.items():
            m = mats.get(name)
            rest_m = rest_mats.get(name)
            if m is None or rest_m is None:
                continue
            # Measure the same thing the target rig will drive: where the *next joint's head*
            # ended up, not where the bone's local Y points. Bone roll differs between rigs and
            # on this ActorCore file the two are 90 degrees apart, so bone Y would aim limbs sideways.
            kid = bone_of.get(CANON_CHILD.get(slot))
            kid_m = mats.get(kid) if kid else None
            dirv = (kid_m.translation - m.translation) if kid_m is not None else (m.to_3x3() @ BONE_Y)
            if dirv.length < 1e-8:
                continue
            dirv = dirv.normalized()
            # a (direction, twist) pair is the only representation that survives a rig whose
            # bones are rolled differently
            entry["dirs"][slot] = basis @ dirv
            entry["twist"][slot] = bone_twist(rest_m, m, m.to_3x3() @ BONE_Y)
            if slot == "hips":
                travel = Vector(m.translation - rest_m.translation)
                if obj_loc:
                    travel += Vector((
                        (obj_loc[i].evaluate(f) if i in obj_loc else rest_obj_loc[i]) - rest_obj_loc[i]
                        for i in range(3)))
                entry["hips"] = basis @ travel
        frames.append(entry)
    for name, mat in rest_basis.items():          # leave the donor as we found it
        pb = rig.pose.bones.get(name)
        if pb is not None:
            pb.matrix_basis = mat
    return {"path": path, "frames": frames, "fps": fps, "height": height, "yaw": yaw,
            "slots": slots, "first": first, "last": last, "action": action.name}


def rest_head_of(rig, name):
    return rig.data.bones[name].head_local.copy()


def apply_samples(pw, samples, root_mode="inplace"):
    """Drive the target rig with sampled (direction, twist) data and keyframe the result."""
    if not samples["frames"]:
        return 0
    target_h = pw.height or 1.0
    donor_h = samples["height"] or 1.0
    ratio = target_h / donor_h
    # detrend the donor's travel so the character dances in place like every other clip
    heads = [s["hips"] for s in samples["frames"] if s["hips"] is not None]
    mean = Vector((0.0, 0.0, 0.0))
    slope = 0.0
    if heads:
        n = len(heads)
        mean = Vector((sum(h[i] for h in heads) / n for i in range(3)))
        if n > 1:
            slope = (heads[-1].y - heads[0].y) / (n - 1)     # per-frame drift along the facing axis
        else:
            mean = Vector((0, 0, 0))
    keyed = 0
    for i, entry in enumerate(samples["frames"]):
        pw.clear()
        for slot, dirv in entry["dirs"].items():
            if dirv.length < 1e-8:
                continue
            pw.aim(slot, dirv, twist=entry["twist"].get(slot, 0.0))
        if entry["hips"] is not None and root_mode != "none":
            hips = pw.bone("hips")
            if hips:
                # scale first, then detrend: mean and slope are in the donor's own units, and
                # subtracting them from an already-scaled offset drops the character 90 units away
                move = Vector(entry["hips"]) * ratio
                if root_mode == "inplace":
                    move -= (mean + Vector((0, slope * i, 0))) * ratio
                    move.x = 0.0                              # no straying sideways either
                pw._d[hips] = move
        if i in (0, 40, 84):
            vlog(f"  retarget frame {i}: hips offset {tuple(round(x, 3) for x in move)}")
        pw.key(i + 1, extra_locations=[pw.bone("hips")] if pw.bone("hips") else ())
        keyed += 1
    pw.finish(interpolation="LINEAR")
    if heads and root_mode != "none":
        span = max((h[j] for h in heads for j in range(3)), default=0) - min((h[j] for h in heads for j in range(3)), default=0)
        if span * ratio < 0.02 * target_h:
            vlog("  note: the sampled range carries no root motion (a stationary intro?); "
                 "pass --retarget-start to begin where the performance moves")
    return keyed


# ==================================================================================================
# 8. export: GLB for three.js, plus the manifest that makes it self-describing
# ==================================================================================================

GLTF_FLAGS = {
    "export_format": "GLB",
    "use_selection": True,
    "export_yup": True,                  # Blender Z-up -> glTF/three.js Y-up (the +Z forward the game wants)
    "export_animations": True,
    "export_animation_mode": "ACTIONS",  # one glTF animation per action == one THREE.AnimationClip
    "export_skins": True,
    "export_def_bones": True,            # drops the unweighted helper/IK bones entirely
    "export_leaf_bones": False,
    "export_morph": True,                # 52 facial keys; --no-morphs turns this off (they are ~60% of the file)
    "export_morph_normal": False,
    "export_morph_tangent": False,
    "export_extras": True,
    "export_apply": False,               # modifiers off: applying them destroys shape keys
    "export_materials": "EXPORT",
    "export_image_format": "AUTO",
    "export_tangents": False,
    "export_normals": True,
    "export_texcoords": True,
    "export_influence_nb": 4,
    "export_force_sampling": False,
    "export_optimize_animation_size": True,
    "export_anim_slide_to_zero": True,   # clips must start at t=0 for THREE.AnimationMixer
    "export_reset_pose_bones": True,
    "export_rest_position_armature": True,
}


def call_supported(op, **kwargs):
    """Blender renames export options between releases; drop what this build does not know
    instead of failing the whole run on a keyword."""
    valid = {p.identifier for p in op.get_rna_type().properties}
    dropped = sorted(k for k in kwargs if k not in valid)
    if dropped:
        vlog("exporter has no option(s): " + ", ".join(dropped))
    return op(**{k: v for k, v in kwargs.items() if k in valid})


def export_glb(rig, meshes, path):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    rig.select_set(True)
    for m in meshes:
        m.select_set(True)
    bpy.context.view_layer.objects.active = rig
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    call_supported(bpy.ops.export_scene.gltf, filepath=path, **GLTF_FLAGS)
    return os.path.getsize(path)


def read_glb(path):
    """Parse the GLB container: 12-byte header, then length/type/data chunks."""
    with open(path, "rb") as fh:
        blob = fh.read()
    magic, version, length = struct.unpack_from("<4sII", blob, 0)
    if magic != b"glTF":
        raise ValueError(f"{path}: not a glTF binary file")
    off, json_chunk = 12, None
    while off + 8 <= length:
        clen, ctype = struct.unpack_from("<I4s", blob, off)
        data = blob[off + 8: off + 8 + clen]
        if ctype == b"JSON":
            json_chunk = json.loads(data.decode("utf-8"))
        off += 8 + clen
    if json_chunk is None:
        raise ValueError(f"{path}: GLB has no JSON chunk")
    json_chunk["_meta"] = {"version": version, "byteLength": length}
    return json_chunk


def glb_report(glb, path):
    """What the game will really see - read back out of the file rather than assumed."""
    accessors = glb.get("accessors", [])
    nodes = glb.get("nodes", [])

    def accessor(i):
        try:
            return accessors[i]
        except (IndexError, TypeError):
            return {}

    anims = []
    for anim in glb.get("animations", []):
        end_t, bones = 0.0, set()
        for ch in anim.get("channels", []):
            node = ch.get("target", {}).get("node")
            if node is not None and node < len(nodes):
                bones.add(nodes[node].get("name", str(node)))
        for samp in anim.get("samplers", []):
            end_t = max(end_t, (accessor(samp.get("input", -1)).get("max") or [0.0])[0])
        anims.append({"name": anim.get("name", ""), "duration": round(end_t, 4),
                      "bones": len(bones), "channels": len(anim.get("channels", []))})
    tris = 0
    verts = 0
    for mesh in glb.get("meshes", []):
        for prim in mesh.get("primitives", []):
            tris += accessor(prim.get("indices", -1)).get("count", 0) // 3
            verts += accessor(prim.get("attributes", {}).get("POSITION", -1)).get("count", 0)
    skins = glb.get("skins", [])
    joints = sum(len(s.get("joints", [])) for s in skins)
    morphs = sum(len(m.get("extras", {}).get("targetNames", [])) for m in glb.get("meshes", []))
    return {
        "file": os.path.basename(path),
        "bytes": os.path.getsize(path),
        "nodes": len(nodes),
        "bones": joints,
        "skins": len(skins),
        "skinnedMeshes": len([n for n in nodes if "skin" in n]),
        "triangles": tris,
        "vertices": verts,
        "morphTargets": morphs,
        "materials": [m.get("name", f"material{i}") for i, m in enumerate(glb.get("materials", []))],
        "images": len(glb.get("images", [])),
        "animations": anims,
    }


def write_manifest(path, payload):
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "w") as fh:
        json.dump(payload, fh, indent=2, sort_keys=False)
    return path


# ==================================================================================================
# 9. inspect + CLI
# ==================================================================================================

def report_character(rig, meshes, slots, samples=None):
    lines = []
    bones = rig.data.bones
    weighted = set()
    for o in meshes:
        for vg in o.vertex_groups:
            weighted.add(vg.name)
    anim = [a.name for a in bpy.data.actions]
    polys = sum(len(o.data.polygons) for o in meshes)
    verts = sum(len(o.data.vertices) for o in meshes)
    keys = [(o.name, len(o.data.shape_keys.key_blocks)) for o in meshes if o.data.shape_keys]
    lines.append(f"armature        {rig.name}  ({len(bones)} bones, {len(weighted)} with skin weights)")
    lines.append(f"meshes          {len(meshes)}  ({verts} verts / {polys} polys)")
    for o in meshes:
        lines.append(f"   - {o.name:22s} verts={len(o.data.vertices):7d} groups={len(o.vertex_groups):4d}"
                     f" shapeKeys={len(o.data.shape_keys.key_blocks) if o.data.shape_keys else 0}")
    lines.append(f"mapped slots    {len(slots)}/{len(SLOTS)}")
    for slot in SLOTS:
        if slot in slots:
            b = bones[slots[slot]]
            ln = (b.tail_local - b.head_local).length
            lines.append(f"   {slot:16s} = {slots[slot]:28s} len={ln:7.2f}")
    unmapped = [b.name for b in bones if b.name not in slots.values() and not is_derived(b.name)
                and b.name in weighted]
    if unmapped:
        lines.append(f"weighted but unnamed  {len(unmapped)}: " + ", ".join(unmapped[:12]) + (" ..." if len(unmapped) > 12 else ""))
    lines.append(f"animations      {len(anim)}: " + (", ".join(anim[:10]) + (" ..." if len(anim) > 10 else "") if anim else "NONE - clips will be authored"))
    if keys:
        lines.append("shape keys      " + ", ".join(f"{n}:{k}" for n, k in keys))
    return "\n".join(lines)


def cmd_inspect(args):
    global VERBOSE
    VERBOSE = args.verbose
    ensure_addons()
    reset_scene()
    objs = import_fbx(args.fbx, anim=not args.no_anims)
    rig = find_armature(objs)
    meshes = meshes_of(objs, rig) if rig else [o for o in objs if o.type == "MESH"]
    if rig is None:
        log("NO ARMATURE - this FBX is a bare mesh; `rig`/`build` will generate a humanoid skeleton")
        for o in meshes:
            log(f"  mesh {o.name}: {len(o.data.vertices)} verts, {len(o.data.polygons)} polys, "
                f"{len(o.vertex_groups)} vertex groups")
        if args.json:
            write_manifest(args.json, {"source": args.fbx, "armature": None,
                                      "meshes": [o.name for o in meshes], "rigged": False})
        return 0
    slots = map_bones(rig.data.bones, rig.name)
    log(report_character(rig, meshes, slots))
    yaw = measured_facing(rig, slots)
    log(f"facing          yaw to author -Y: {math.degrees(yaw or 0):+.2f} deg "
        f"({'toe bones' if yaw is not None else 'not measurable'})")
    log(f"height          {armature_space_height(rig, meshes):.3f} units (any unit; --height bakes the scale)")
    if args.json:
        write_manifest(args.json, {"source": args.fbx, "armature": rig.name,
                                  "bones": len(rig.data.bones), "slots": slots,
                                  "meshes": [o.name for o in meshes], "rigged": True})
    return 0


def build_parser():
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("-v", "--verbose", action="store_true", help="per-bone and per-curve detail")
    ap = argparse.ArgumentParser(
        prog="rig_and_animate.py",
        description=__doc__.splitlines()[0],
        epilog="Run inside Blender:  blender --background --python tools/rig_and_animate.py -- build --fbx fbx/Survival_Character.fbx",
    )
    ap.add_argument("-v", "--verbose", action="store_true", help=argparse.SUPPRESS)
    sub = ap.add_subparsers(dest="mode")

    p = sub.add_parser("inspect", help="report what the FBX contains (no writes)", parents=[common])
    p.add_argument("--fbx", required=True)
    p.add_argument("--no-anims", action="store_true", help="skip reading animation curves")
    p.add_argument("--json", help="also dump the report as JSON here")
    p.set_defaults(func=cmd_inspect)

    for name, help_text in (("rig", "rig only: skeleton + weights + normalised transform, no clips"),
                            ("animate", "rig if needed, then author/retarget clips"),
                            ("build", "rig + animate + export GLB + manifest (the usual one)")):
        q = sub.add_parser(name, help=help_text, parents=[common])
        q.add_argument("--fbx", required=True, help="the character FBX")
        q.add_argument("--out", default="assets/models", help="output directory (default assets/models)")
        q.add_argument("--name", default=None, help="asset name (default: FBX file stem, lowercased)")
        q.add_argument("--height", type=float, default=2.3, help="target height in game units, 0 keeps the imported scale")
        q.add_argument("--yaw", type=float, default=None, help="override the facing yaw in degrees (default: measured)")
        q.add_argument("--fps", type=int, default=30)
        q.add_argument("--clips", default="idle,walk,run,jump,pulse,hit,grab,celebrate",
                       help="comma list of procedural clips, or 'none'")
        q.add_argument("--retarget-from", default=None, help="FBX whose animation to transfer onto this character")
        q.add_argument("--retarget-clip", default="dance", help="clip name for the retargeted animation")
        q.add_argument("--retarget-action", default=None,
                       help="which donor action to take (name or substring). Default: the action "
                            "with the most motion - NOT the most channels, because a file with one "
                            "action per clip ties on channels and its frozen setup action wins")
        q.add_argument("--retarget-start", type=float, default=None, help="seconds into the donor clip to begin")
        q.add_argument("--retarget-seconds", type=float, default=2.8, help="how much of the donor to take")
        q.add_argument("--retarget-root", choices=["inplace", "keep", "none"], default="inplace",
                       help="strip the donor's travel so the character stays in place")
        q.add_argument("--keep-source-anims", action="store_true", help="keep clips already in the character FBX")
        q.add_argument("--auto-rig", action="store_true", help="generate a humanoid skeleton if the FBX has none")
        q.add_argument("--weights", choices=["auto", "heat", "distance"], default="auto")
        q.add_argument("--decimate", type=float, default=0.0, help="0 = keep every triangle; 0.5 = half")
        q.add_argument("--no-morphs", action="store_true", help="drop shape keys (they cost more than the base mesh here)")
        q.add_argument("--export-fbx", action="store_true", help="also write a rigged+animated .fbx next to the GLB")
        q.add_argument("--dry-run", action="store_true", help="stop before writing files")
        q.set_defaults(func=cmd_build, rig_only=(name == "rig"))
    return ap


def cmd_build(args):
    global VERBOSE
    VERBOSE = args.verbose
    ensure_addons()
    src = args.fbx
    if not os.path.isfile(src):
        die(f"no such FBX: {src}")
    name = args.name or re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", os.path.splitext(os.path.basename(src))[0].lower()).strip("_"))
    samples = None
    if args.retarget_from and not args.rig_only:
        if not os.path.isfile(args.retarget_from):
            die(f"--retarget-from: no such file: {args.retarget_from}")
        log(f"reading donor animation: {args.retarget_from}")
        samples = sample_animation_source(args.retarget_from, args.fps, args.retarget_start,
                                             args.retarget_seconds, prefer=args.retarget_action)
        log(f"  {len(samples['frames'])} frames sampled from '{samples['action']}' "
            f"(donor height {samples['height']:.1f})")

    reset_scene()
    objs = import_fbx(src, anim=args.keep_source_anims)
    rig = find_armature(objs)
    meshes = meshes_of(objs, rig) if rig else [o for o in objs if o.type == "MESH"]
    auto_rigged = False
    if rig is None:
        if not args.auto_rig and len(meshes) == 0:
            die("the FBX has neither an armature nor a mesh - nothing to rig")
        if not args.auto_rig:
            die("the FBX has no armature; pass --auto-rig to generate a humanoid skeleton")
        height = armature_space_height(None, meshes) or 1.0
        pose_kind = detect_arm_pose(meshes, height)
        log(f"no skeleton found - auto-rigging a {pose_kind}-pose humanoid at {height:.2f} units tall")
        rig = build_humanoid_armature(name, height, pose_kind)
        meshes = [o for o in bpy.data.objects if o.type == "MESH"]
        skin_meshes(rig, meshes, {}, prefer="distance")
        auto_rigged = True
    slots = map_bones(rig.data.bones, rig.name)
    needed = ("hips", "spine", "head", "left_up_leg", "right_up_leg", "left_upper_arm", "right_upper_arm")
    absent = [s for s in needed if s not in slots]
    if absent:
        die("could not identify these bones on " + os.path.basename(src) + ": " + ", ".join(absent)
            + "\n  the rig is not a recognisable humanoid; rename the bones or check --fbx")
    log(f"skeleton {rig.name}: {len(rig.data.bones)} bones, {len(slots)} canonical slots"
        + (" (auto-rigged)" if auto_rigged else ""))
    strip_constraints(rig)
    yaw = None if args.yaw is None else math.radians(args.yaw)
    info = normalise(rig, meshes, height=(args.height or None), yaw=yaw)
    log(f"normalised: height {info.get('height')} (was {info.get('measuredHeight'):.2f}), "
        f"feet at z={info.get('feetZ')}, facing via {info.get('yawSource')}")
    trim_non_deform_bones(rig, meshes)
    # An armature whose meshes carry no skin weights (MPFB exports like this) would stay rigid.
    # Weight them only after normalise(), so the bind pose matches the final scale and position.
    if not any(len(m.vertex_groups) for m in meshes):
        log(f"armature has {len(meshes)} unweighted meshes - skinning them to {rig.name}")
        skin_meshes(rig, meshes, {}, prefer="auto")
    if args.decimate and args.decimate < 1.0:
        for mesh in meshes:
            mod = mesh.modifiers.new("Decimate", "DECIMATE")
            mod.show_viewport = True
            mesh.data.update()
            bpy.context.view_layer.objects.active = mesh
            for o in bpy.context.selected_objects:
                o.select_set(False)
            mesh.select_set(True)
            try:
                mod.ratio = args.decimate
                bpy.ops.object.modifier_apply(modifier=mod.name)
            except Exception as exc:
                warn(f"decimate skipped for {mesh.name}: {exc}")
                mesh.modifiers.remove(mod)
    GLTF_FLAGS["export_morph"] = not args.no_morphs
    # the exporter converts keyframe *frames* to seconds with scene.fps, so an unset fps would
    # ship every clip 25% slow (Blender's default is 24, not the --fps the clips were authored at)
    bpy.context.scene.render.fps = args.fps
    bpy.context.scene.render.fps_base = 1.0
    pw = PoseWriter(rig, slots)
    pw.height = info.get("height") or armature_space_height(rig, meshes)
    made = []
    if not args.rig_only:
        names = [c.strip() for c in args.clips.split(",") if c.strip() and c.strip() != "none"]
        if names:
            log("authoring clips: " + ", ".join(names))
            made += build_clips(pw, slots, names, args.fps)
        if samples:
            action = bpy.data.actions.new(args.retarget_clip)
            set_action(rig, action)
            n = apply_samples(pw, samples, root_mode=args.retarget_root)
            made.append({"name": args.retarget_clip, "loop": True,
                         "seconds": round(n / args.fps, 3), "retargetedFrom": os.path.basename(samples["path"]),
                         "note": "transferred from " + os.path.basename(samples["path"])})
            log(f"retargeted {args.retarget_clip}: {n} frames")
    log(report_character(rig, meshes, slots))
    vlog("actions to export: " + (", ".join(f"{a.name}({len(a.fcurves)}fc,{int(a.frame_range[1])}f)"
                                          for a in bpy.data.actions) or "none"))
    glb_path = os.path.join(args.out, f"{name}.glb")
    manifest_path = os.path.join(args.out, f"{name}.character.json")
    if args.dry_run:
        log("--dry-run: nothing written")
        return 0
    size = export_glb(rig, meshes, glb_path)
    glb = read_glb(glb_path)
    seen = glb_report(glb, glb_path)
    actual = {a["name"] for a in seen["animations"]}
    clips = []
    for m in made:
        clip_name = next((a["name"] for a in seen["animations"] if m["name"] in a["name"]), m["name"])
        if clip_name not in actual:
            warn(f"clip '{m['name']}' did not survive the export; the game will fall back to idle")
            continue
        entry = dict(m)
        entry["name"] = clip_name
        entry["duration"] = next((a["duration"] for a in seen["animations"] if a["name"] == clip_name), m["seconds"])
        clips.append(entry)
    state_map = {
        "idle": "idle", "walk": "walk", "run": "run", "sprint": "run", "pulse": "pulse",
        "hit": "hit", "interact": "grab", "grab": "grab", "jump": "jump",
        "celebrate": "celebrate", "dance": "dance",
    }
    payload = {
        "generator": "tools/rig_and_animate.py",
        "version": 1,
        "name": name,
        "source": src.replace(os.sep, "/"),
        "glb": os.path.basename(glb_path),
        "units": "three.js world units; feet on y=0",
        "height": round(info.get("height") or 0.0, 4),
        "forward": {"authored": "-Y in Blender", "inThreeJs": "+Z", "extraYaw": 0.0,
                    "appliedYawDeg": round(math.degrees(yaw if yaw is not None else 0.0), 1)},
        "fps": args.fps,
        "clips": clips,
        "stateMap": {k: v for k, v in state_map.items() if any(c["name"].startswith(v) for c in clips)},
        "slots": slots,
        "stats": seen,
    }
    write_manifest(manifest_path, payload)
    log(f"wrote {glb_path} ({size / 1e6:.2f} MB)  {seen['triangles']} tris, {seen['bones']} bones, "
        f"{len(seen['animations'])} clips, {seen['morphTargets']} morphs")
    log(f"wrote {manifest_path}")
    for c in clips:
        log(f"   clip {c['name']:12s} {c['duration']:.2f}s loop={c['loop']}")
    if args.export_fbx:
        fbx_out = os.path.join(args.out, f"{name}.fbx")
        call_supported(bpy.ops.export_scene.fbx, filepath=fbx_out, use_selection=True,
                       add_leaf_bones=False, bake_anim=True, bake_anim_use_all_actions=True,
                       bake_anim_use_all_bones=True,
                       object_types={"ARMATURE", "MESH"}, path_mode="COPY", embed_textures=True)
        log(f"wrote {fbx_out}")
    return 0


def main(argv=None):
    argv = list(sys.argv if argv is None else argv)
    # `blender --background --python this.py -- build --fbx x.fbx` puts the real args after "--"
    if "--" in argv:
        argv = argv[argv.index("--") + 1:]
    argv = [a for a in argv if not a.endswith(".py")] or ["--help"]
    ap = build_parser()
    args = ap.parse_args(argv)
    if not getattr(args, "func", None):
        ap.print_help()
        return 0
    t0 = __import__("time").time()
    try:
        rc = args.func(args)
    except RuntimeError as exc:      # deliberate "cannot continue" errors report one clean line
        return die(str(exc), 1)
    log(f"done in {__import__('time').time() - t0:.1f}s")
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
