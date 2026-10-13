#!/usr/bin/env bash
# Shrinks the game's GLB models with lossless meshopt compression.
#
#   character: 5.5 MB -> ~1.4 MB   (assets/models/survival_character.glb)
#   house:     ~1.5 MB -> smaller  (assets/Environment/old-house.glb)
#
# Only the `meshopt` command is used. The `optimize` command also merges materials and meshes,
# which would break the character's named material slots (see tools/character_palette.py).
#
# Needs @gltf-transform/cli (npm). Run from the repo root:
#   npm install --no-save @gltf-transform/cli
#   bash tools/compress_models.sh
set -euo pipefail
cd "$(dirname "$0")/.."
for model in assets/models/survival_character.glb assets/Environment/old-house.glb; do
  tmp="$(mktemp --suffix=.glb)"
  npx --no-install gltf-transform meshopt "$model" "$tmp"
  mv "$tmp" "$model"
  echo "compressed $model ($(stat -c%s "$model") bytes)"
done
