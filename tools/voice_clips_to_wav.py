#!/usr/bin/env python3
"""Convert the recorded voice clips from mp3 to PCM-16 wav.

assets/audio/ holds the story voice lines, and the game plays them through one
shared HTMLAudioElement (js/systems/VoiceSystem.js). The platform loop already
ships as wav (tools/bake_platform_music.py), so the voices ship as wav too —
one uncompressed format for every clip the game loads, and VoiceSystem's
AUDIO_LINES map points at the .wav basenames.

The audio itself is not touched: the source sample rate and channel count are
preserved and the samples are written as plain 16-bit PCM, so a clip converted
today is byte-for-byte the same clip tomorrow. Each written file is re-read and
verified before the tool reports success, and with --remove-source the mp3 is
only deleted after its wav passed that verification.

Reading mp3 needs libsndfile >= 1.1 (the soundfile wheels bundle it):

    pip install soundfile

    python3 tools/voice_clips_to_wav.py                    # convert every assets/audio/*.mp3
    python3 tools/voice_clips_to_wav.py --remove-source    # ... then delete the verified mp3s
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    import soundfile as sf
except ImportError:  # pragma: no cover - dependency guard with a actionable message
    sys.exit("voice_clips_to_wav: the 'soundfile' package is required (pip install soundfile)")

DEFAULT_AUDIO_DIR = Path(__file__).resolve().parent.parent / "assets" / "audio"


def convert(audio_dir: Path, remove_source: bool) -> int:
    sources = sorted(audio_dir.glob("*.mp3"))
    if not sources:
        print(f"voice_clips_to_wav: no .mp3 clips in {audio_dir} — nothing to convert")
        return 0

    failures = []
    total_bytes = 0
    for mp3 in sources:
        wav = mp3.with_suffix(".wav")
        try:
            data, sample_rate = sf.read(str(mp3), always_2d=True)
            sf.write(str(wav), data, sample_rate, subtype="PCM_16")
            # Verify the written file by reading its own header back.
            info = sf.info(str(wav))
            if info.frames != len(data) or info.samplerate != sample_rate \
                    or info.channels != data.shape[1] or info.subtype != "PCM_16":
                raise ValueError(f"verification mismatch: {info.frames} frames, "
                                 f"{info.samplerate} Hz, {info.channels} ch, {info.subtype}")
        except Exception as error:  # noqa: BLE001 - report and keep converting the rest
            failures.append(f"{mp3.name}: {error}")
            print(f"FAIL  {mp3.name}: {error}")
            continue
        total_bytes += wav.stat().st_size
        print(f"PASS  {mp3.name}  ->  {wav.name}"
              f"  {len(data) / sample_rate:6.2f}s  {sample_rate} Hz  "
              f"{data.shape[1]} ch  {wav.stat().st_size} bytes")
        if remove_source:
            mp3.unlink()

    if failures:
        print(f"\n{len(failures)} clip(s) failed: {'; '.join(failures)}")
        return 1
    print(f"\n{len(sources)} clip(s) converted to PCM-16 wav ({total_bytes} bytes total)"
          + (", mp3 sources removed" if remove_source else ""))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--audio-dir", type=Path, default=DEFAULT_AUDIO_DIR,
                        help=f"directory holding the clips (default: {DEFAULT_AUDIO_DIR})")
    parser.add_argument("--remove-source", action="store_true",
                        help="delete each .mp3 after its .wav is written and verified")
    args = parser.parse_args()
    if not args.audio_dir.is_dir():
        sys.exit(f"voice_clips_to_wav: {args.audio_dir} does not exist")
    return convert(args.audio_dir, args.remove_source)


if __name__ == "__main__":
    raise SystemExit(main())
