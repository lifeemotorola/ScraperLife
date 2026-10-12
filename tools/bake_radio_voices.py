#!/usr/bin/env python3
"""Bake playable PCM-16 WAV voice audio files for 94.7 Waterside FM radio station.

Generates broadcast voice clips for DJ Gabriel (male host) and DJ Kpannah (female host)
with distinctive vocal formant frequencies, syllable envelopes, and FM radio station acoustics.
The user can replace any of these .wav files in assets/radioVoices/ with their own recorded voice files.
"""

from __future__ import annotations

import math
import wave
from array import array
from pathlib import Path

SAMPLE_RATE = 22050
OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "radioVoices"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def generate_radio_voice_wav(
    filepath: Path,
    gender: str = "male",
    duration: float = 4.5,
    syllables: int = 14,
) -> None:
    """Generate a high-quality PCM-16 WAV voice file with vocal formants and radio acoustics."""
    total_samples = int(duration * SAMPLE_RATE)
    raw = array("h", [0] * total_samples)

    # Base pitch & vocal tract formants
    if gender == "female":
        base_f0 = 225.0   # Female fundamental frequency (bright, warm)
        f1, f2, f3 = 850.0, 1850.0, 2900.0
    else:
        base_f0 = 118.0   # Male fundamental frequency (deep announcer baritone)
        f1, f2, f3 = 520.0, 1250.0, 2400.0

    syllable_dur = duration / max(4, syllables)
    radio_hiss_amp = 0.015

    for i in range(total_samples):
        t = i / SAMPLE_RATE

        # Syllable rhythm envelope
        syllable_phase = (t % syllable_dur) / syllable_dur
        # Smooth attack & decay for each spoken syllable
        if syllable_phase < 0.15:
            syl_env = syllable_phase / 0.15
        elif syllable_phase > 0.85:
            syl_env = (1.0 - syllable_phase) / 0.15
        else:
            syl_env = 1.0

        # Overall sentence envelope (fade in at start, fade out at end)
        if t < 0.2:
            sentence_env = t / 0.2
        elif t > duration - 0.25:
            sentence_env = max(0.0, (duration - t) / 0.25)
        else:
            sentence_env = 1.0

        env = syl_env * sentence_env

        # Subtle natural pitch intonation contour
        pitch_contour = 1.0 + 0.08 * math.sin(2.0 * math.pi * 0.7 * t) + 0.04 * math.sin(2.0 * math.pi * 2.2 * t)
        f0 = base_f0 * pitch_contour

        # Glottal pulse excitation + vocal tract harmonics
        glottal = (
            0.55 * math.sin(2.0 * math.pi * f0 * t)
            + 0.28 * math.sin(2.0 * math.pi * 2 * f0 * t)
            + 0.18 * math.sin(2.0 * math.pi * 3 * f0 * t)
            + 0.10 * math.sin(2.0 * math.pi * 4 * f0 * t)
        )

        # Formant resonances (vocal tract filtering)
        formant_1 = 0.35 * math.sin(2.0 * math.pi * f1 * t)
        formant_2 = 0.22 * math.sin(2.0 * math.pi * f2 * t)
        formant_3 = 0.12 * math.sin(2.0 * math.pi * f3 * t)

        voice_signal = (glottal * 0.65 + (formant_1 + formant_2 + formant_3) * 0.35) * env

        # FM radio microphone presence & subtle radio warmth
        radio_mic = 0.05 * math.sin(2.0 * math.pi * 1050.0 * t) * env
        # Radio static / breath texture
        pseudo_noise = ((i * 1103515245 + 12345) & 0x7FFFFFFF) / 0x7FFFFFFF * 2.0 - 1.0
        static = pseudo_noise * radio_hiss_amp * sentence_env

        sample_val = (voice_signal * 0.82 + radio_mic + static) * 0.75
        # Clamp to 16-bit range
        sample_val = max(-1.0, min(1.0, sample_val))
        raw[i] = int(sample_val * 32767)

    with wave.open(str(filepath), "wb") as wf:
        wf.setnchannels(1)      # Mono
        wf.setsampwidth(2)      # 16-bit PCM
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(raw.tobytes())


# Manifest of all radio broadcast voice clips
RADIO_VOICE_CLIPS = [
  # MC Caro ft. Pillz - Money
  ("caro_1_gabriel.wav", "male", 4.8),
  ("caro_2_kpannah.wav", "female", 4.8),
  ("caro_3_gabriel.wav", "male", 4.8),
  ("caro_4_kpannah.wav", "female", 5.2),

  # Meek Mill - Lemon Pepper Freestyle
  ("lemon_1_gabriel.wav", "male", 4.8),
  ("lemon_2_kpannah.wav", "female", 5.4),
  ("lemon_3_gabriel.wav", "male", 5.0),
  ("lemon_4_kpannah.wav", "female", 5.0),

  # Meek Mill - On My Soul
  ("soul_1_kpannah.wav", "female", 4.2),
  ("soul_2_gabriel.wav", "male", 4.5),
  ("soul_3_kpannah.wav", "female", 5.2),
  ("soul_4_gabriel.wav", "male", 4.8),

  # Meek Mill - Polo & Shell Tops
  ("polo_1_gabriel.wav", "male", 4.8),
  ("polo_2_kpannah.wav", "female", 5.2),
  ("polo_3_gabriel.wav", "male", 5.0),
  ("polo_4_kpannah.wav", "female", 5.0),

  # Meek Mill ft. Lil Baby & Lil Durk - Sharing Locations
  ("sharing_1_kpannah.wav", "female", 4.5),
  ("sharing_2_gabriel.wav", "male", 4.8),
  ("sharing_3_kpannah.wav", "female", 5.2),
  ("sharing_4_gabriel.wav", "male", 4.8),

  # Nasty C - UOK
  ("uok_1_gabriel.wav", "male", 4.2),
  ("uok_2_kpannah.wav", "female", 5.0),
  ("uok_3_gabriel.wav", "male", 5.2),
  ("uok_4_kpannah.wav", "female", 5.4),

  # Platform Theme
  ("platform_1_gabriel.wav", "male", 4.8),
  ("platform_2_kpannah.wav", "female", 5.2),

  # News Bulletins: Tariffs
  ("news_tariffs_1.wav", "male", 4.5),
  ("news_tariffs_2.wav", "female", 5.2),
  ("news_tariffs_3.wav", "male", 4.5),
  ("news_tariffs_4.wav", "female", 5.5),

  # News Bulletins: Harbor
  ("news_harbor_1.wav", "female", 4.8),
  ("news_harbor_2.wav", "male", 4.8),
  ("news_harbor_3.wav", "female", 5.5),
  ("news_harbor_4.wav", "male", 4.8),

  # News Bulletins: Weather
  ("news_weather_1.wav", "male", 5.0),
  ("news_weather_2.wav", "female", 5.5),
  ("news_weather_3.wav", "male", 5.0),

  # News Bulletins: Community
  ("news_community_1.wav", "female", 4.8),
  ("news_community_2.wav", "male", 3.5),
  ("news_community_3.wav", "female", 5.5),
  ("news_community_4.wav", "male", 5.2),
]


def main() -> int:
    print(f"Baking {len(RADIO_VOICE_CLIPS)} radio voice files into {OUT_DIR}...")
    for filename, gender, duration in RADIO_VOICE_CLIPS:
        path = OUT_DIR / filename
        generate_radio_voice_wav(path, gender=gender, duration=duration)
        print(f"  ✓ {filename} ({gender}, {duration}s)")
    print(f"\nAll {len(RADIO_VOICE_CLIPS)} radio voice WAV files successfully generated!")
    return 0


if __name__ == "__main__":
    main()
