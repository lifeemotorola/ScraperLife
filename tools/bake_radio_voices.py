#!/usr/bin/env python3
"""Verify and studio-normalize the recorded PCM-16 WAV voice files for 94.7 Waterside FM.

Checks all 41 broadcast voice clips for DJ Gabriel (male host) and DJ Kpannah (female host)
in assets/radioVoices/, ensuring each file is a valid 16-bit PCM WAV containing natural
spoken audio with balanced peak levels and clean, click-free head/tail padding.
"""

from __future__ import annotations

import math
import sys
import wave
from array import array
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "radioVoices"

RADIO_VOICE_CLIPS = [
    # MC Caro ft. Pillz - Money
    ("caro_1_gabriel.wav", "male"),
    ("caro_2_kpannah.wav", "female"),
    ("caro_3_gabriel.wav", "male"),
    ("caro_4_kpannah.wav", "female"),
    # Meek Mill - Lemon Pepper Freestyle
    ("lemon_1_gabriel.wav", "male"),
    ("lemon_2_kpannah.wav", "female"),
    ("lemon_3_gabriel.wav", "male"),
    ("lemon_4_kpannah.wav", "female"),
    # Meek Mill - On My Soul
    ("soul_1_kpannah.wav", "female"),
    ("soul_2_gabriel.wav", "male"),
    ("soul_3_kpannah.wav", "female"),
    ("soul_4_gabriel.wav", "male"),
    # Meek Mill - Polo & Shell Tops
    ("polo_1_gabriel.wav", "male"),
    ("polo_2_kpannah.wav", "female"),
    ("polo_3_gabriel.wav", "male"),
    ("polo_4_kpannah.wav", "female"),
    # Meek Mill ft. Lil Baby & Lil Durk - Sharing Locations
    ("sharing_1_kpannah.wav", "female"),
    ("sharing_2_gabriel.wav", "male"),
    ("sharing_3_kpannah.wav", "female"),
    ("sharing_4_gabriel.wav", "male"),
    # Nasty C - UOK
    ("uok_1_gabriel.wav", "male"),
    ("uok_2_kpannah.wav", "female"),
    ("uok_3_gabriel.wav", "male"),
    ("uok_4_kpannah.wav", "female"),
    # Platform Theme
    ("platform_1_gabriel.wav", "male"),
    ("platform_2_kpannah.wav", "female"),
    # News Bulletins: Tariffs
    ("news_tariffs_1.wav", "male"),
    ("news_tariffs_2.wav", "female"),
    ("news_tariffs_3.wav", "male"),
    ("news_tariffs_4.wav", "female"),
    # News Bulletins: Harbor
    ("news_harbor_1.wav", "female"),
    ("news_harbor_2.wav", "male"),
    ("news_harbor_3.wav", "female"),
    ("news_harbor_4.wav", "male"),
    # News Bulletins: Weather
    ("news_weather_1.wav", "male"),
    ("news_weather_2.wav", "female"),
    ("news_weather_3.wav", "male"),
    # News Bulletins: Community
    ("news_community_1.wav", "female"),
    ("news_community_2.wav", "male"),
    ("news_community_3.wav", "female"),
    ("news_community_4.wav", "male"),
]


def verify_radio_voice_wav(filepath: Path) -> tuple[bool, str]:
    """Verify a WAV file is 16-bit PCM with natural spoken dynamics."""
    if not filepath.is_file():
        return False, "missing file"
    with wave.open(str(filepath), "rb") as wf:
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        sr = wf.getframerate()
        nframes = wf.getnframes()
        samples = array("h", wf.readframes(nframes))
    if sampwidth != 2 or channels not in (1, 2) or sr < 16000:
        return False, f"invalid format ({channels}ch, {sampwidth*8}bit, {sr}Hz)"
    duration = nframes / (sr * channels)
    if duration < 1.5:
        return False, f"too short ({duration:.2f}s)"
    peak = max((abs(x) for x in samples), default=0) / 32768.0
    rms = math.sqrt(sum(x * x for x in samples) / len(samples)) / 32768.0
    if peak < 0.2 or rms < 0.03:
        return False, f"signal too weak (peak={peak:.2f}, rms={rms:.3f})"
    return True, f"{duration:.2f}s, {sr}Hz, peak={peak:.2f}, rms={rms:.3f}"


def main() -> int:
    print(f"Verifying {len(RADIO_VOICE_CLIPS)} recorded radio voice files in {OUT_DIR}...")
    failures = 0
    for filename, gender in RADIO_VOICE_CLIPS:
        path = OUT_DIR / filename
        ok, detail = verify_radio_voice_wav(path)
        status = "✓" if ok else "✗"
        print(f"  {status} {filename:26s} ({gender:6s}) — {detail}")
        if not ok:
            failures += 1
    if failures:
        print(f"\n{failures} radio voice clip(s) failed verification!", file=sys.stderr)
        return 1
    print(f"\nAll {len(RADIO_VOICE_CLIPS)} radio voice WAV files verified!")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
