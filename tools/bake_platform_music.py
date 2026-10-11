#!/usr/bin/env python3
"""Bake an original, loopable instrumental bed for the Waterside platform.

This is a small standard-library-only additive synthesizer: no samples, third-party
packages, or borrowed music. The result is a stereo PCM WAV so browsers can stream it
without an audio codec dependency.

  python3 tools/bake_platform_music.py
"""

from __future__ import annotations

import argparse
import math
import random
import sys
import wave
from array import array
from pathlib import Path

SAMPLE_RATE = 22_050
TEMPO = 88
BARS = 16
BEATS = BARS * 4
BEAT_SECONDS = 60.0 / TEMPO
DURATION = BEATS * BEAT_SECONDS

# Warm D-minor-coloured progression: Dm7, Bbmaj7, Fadd9, Cadd9. Each voicing
# lasts two bars; the eight-bar progression repeats once in the 16-bar loop.
PROGRESSION = (
    {"root": 38, "pad": (50, 57, 60, 65), "lead": (74, 77, 79, 81)},
    {"root": 34, "pad": (46, 53, 57, 62), "lead": (70, 74, 77, 81)},
    {"root": 41, "pad": (41, 48, 55, 57, 60), "lead": (77, 79, 81, 84)},
    {"root": 36, "pad": (48, 55, 62, 64), "lead": (72, 74, 76, 79)},
)


def midi_hz(note: int) -> float:
    return 440.0 * (2.0 ** ((note - 69) / 12.0))


def add_tone(
    left: array,
    right: array,
    start: float,
    duration: float,
    note: int,
    amplitude: float,
    pan: float,
    voice: str,
    phase_offset: float = 0.0,
) -> None:
    """Add one gently voiced pad, bass, or plucked note to the stereo mix."""
    first = max(0, int(start * SAMPLE_RATE))
    count = min(int(duration * SAMPLE_RATE), len(left) - first)
    if count <= 0:
        return

    frequency = midi_hz(note)
    angular_frequency = 2.0 * math.pi * frequency / SAMPLE_RATE
    pan = max(-1.0, min(1.0, pan))
    left_gain = math.cos((pan + 1.0) * math.pi * 0.25) * amplitude
    right_gain = math.sin((pan + 1.0) * math.pi * 0.25) * amplitude

    for sample_index in range(count):
        t = sample_index / SAMPLE_RATE
        phase = angular_frequency * sample_index + phase_offset
        if voice == "pad":
            attack = min(1.0, t / 0.65)
            release = min(1.0, max(0.0, duration - t) / 0.9)
            envelope = attack * release * (0.91 + 0.09 * math.sin(2.0 * math.pi * 0.17 * t + phase_offset))
            sample = (
                math.sin(phase)
                + 0.22 * math.sin(phase * 2.003 + 0.16)
                + 0.055 * math.sin(phase * 3.01 + 0.35)
            ) * envelope
        elif voice == "bass":
            envelope = (1.0 - math.exp(-t * 45.0)) * math.exp(-t * 2.8)
            sample = (math.sin(phase) + 0.16 * math.sin(phase * 2.0)) * envelope
        else:  # rounded tine/plucked-key tone
            attack = 1.0 - math.exp(-t * 80.0)
            envelope = attack * math.exp(-t * 4.5)
            sample = (
                math.sin(phase)
                + 0.36 * math.sin(phase * 2.01 + 0.12)
                + 0.12 * math.sin(phase * 3.97 + 0.28)
            ) * envelope

        index = first + sample_index
        left[index] += sample * left_gain
        right[index] += sample * right_gain


def add_kick(left: array, right: array, start: float, amplitude: float) -> None:
    first = max(0, int(start * SAMPLE_RATE))
    count = min(int(0.19 * SAMPLE_RATE), len(left) - first)
    phase = 0.0
    for i in range(count):
        t = i / SAMPLE_RATE
        frequency = 105.0 - 48.0 * min(1.0, t / 0.19)
        phase += 2.0 * math.pi * frequency / SAMPLE_RATE
        envelope = math.exp(-t * 20.0)
        sample = math.sin(phase) * envelope * amplitude
        left[first + i] += sample * 0.707
        right[first + i] += sample * 0.707


def add_hand_drum(left: array, right: array, start: float, amplitude: float, pan: float) -> None:
    first = max(0, int(start * SAMPLE_RATE))
    count = min(int(0.12 * SAMPLE_RATE), len(left) - first)
    pan = max(-1.0, min(1.0, pan))
    left_gain = math.cos((pan + 1.0) * math.pi * 0.25) * amplitude
    right_gain = math.sin((pan + 1.0) * math.pi * 0.25) * amplitude
    rng = random.Random(first + 781)
    for i in range(count):
        t = i / SAMPLE_RATE
        envelope = math.exp(-t * 37.0)
        body = math.sin(2.0 * math.pi * (185.0 - 55.0 * t) * t) * 0.72
        skin = (rng.random() * 2.0 - 1.0) * math.exp(-t * 82.0) * 0.28
        sample = (body + skin) * envelope
        left[first + i] += sample * left_gain
        right[first + i] += sample * right_gain


def add_shaker(left: array, right: array, start: float, amplitude: float, pan: float, seed: int) -> None:
    first = max(0, int(start * SAMPLE_RATE))
    count = min(int(0.052 * SAMPLE_RATE), len(left) - first)
    pan = max(-1.0, min(1.0, pan))
    left_gain = math.cos((pan + 1.0) * math.pi * 0.25) * amplitude
    right_gain = math.sin((pan + 1.0) * math.pi * 0.25) * amplitude
    rng = random.Random(seed)
    previous = 0.0
    for i in range(count):
        t = i / SAMPLE_RATE
        noise = rng.random() * 2.0 - 1.0
        high_pass = noise - previous * 0.72
        previous = noise
        envelope = math.exp(-t * 62.0)
        sample = high_pass * envelope
        left[first + i] += sample * left_gain
        right[first + i] += sample * right_gain


def compose() -> array:
    frame_count = round(DURATION * SAMPLE_RATE)
    left = array("f", [0.0]) * frame_count
    right = array("f", [0.0]) * frame_count
    chord_beats = 8  # two bars per chord

    # Airy sustained chords carry the harmonic bed without crowding dialogue.
    for phrase in range(BEATS // chord_beats):
        chord = PROGRESSION[phrase % len(PROGRESSION)]
        start = phrase * chord_beats * BEAT_SECONDS
        duration = chord_beats * BEAT_SECONDS
        for index, note in enumerate(chord["pad"]):
            add_tone(left, right, start, duration, note, 0.032, (index - 1.5) * 0.18, "pad", index * 0.17)

    # A loose, pentatonic tine motif: syncopated, short, and slightly panned per phrase.
    motif_steps = (0.0, 1.25, 2.5, 4.0, 5.5, 7.0)
    melody_indices = (0, 1, 3, 2, 1, 0)
    for phrase in range(BEATS // chord_beats):
        chord = PROGRESSION[phrase % len(PROGRESSION)]
        phrase_start = phrase * chord_beats * BEAT_SECONDS
        for step_index, beat_offset in enumerate(motif_steps):
            # Vary the phrase endings while retaining a small, hummable contour.
            lead_index = melody_indices[step_index]
            if phrase % 2 and step_index == 5:
                lead_index = 2
            note = chord["lead"][lead_index]
            start = phrase_start + beat_offset * BEAT_SECONDS
            pan = (-0.32 if step_index % 2 == 0 else 0.32) + (phrase % 3 - 1) * 0.08
            add_tone(left, right, start, 0.68, note, 0.048, pan, "pluck", step_index * 0.21)

    # Soft roots anchor the harmony. Two notes per bar leave space around the hand drums.
    for beat in range(BEATS):
        if beat % 2:
            continue
        bar = beat // 4
        chord = PROGRESSION[(bar // 2) % len(PROGRESSION)]
        bass_note = chord["root"]
        start = beat * BEAT_SECONDS
        add_tone(left, right, start, 0.48, bass_note, 0.075, 0.0, "bass", beat * 0.07)

    # Light, hand-played-feeling pulse: rounded low hits, muted hand drums, and a fine shaker.
    for beat in range(BEATS):
        start = beat * BEAT_SECONDS
        subdivision = beat % 4
        if subdivision in (0, 2):
            add_kick(left, right, start, 0.07 if subdivision == 0 else 0.045)
        else:
            add_hand_drum(left, right, start, 0.032 if subdivision == 1 else 0.026,
                          -0.20 if subdivision == 1 else 0.20)

    eighth_note = BEAT_SECONDS / 2.0
    for eighth in range(BEATS * 2):
        accent = 1.0 if eighth % 4 == 0 else 0.63
        pan = -0.24 if eighth % 2 == 0 else 0.24
        add_shaker(left, right, eighth * eighth_note, 0.010 * accent, pan, 10_000 + eighth)

    # Two very quiet short reflections make the plucks sit in the same open space as the city.
    for delay_seconds, feedback in ((0.145, 0.12), (0.287, 0.055)):
        delay = int(delay_seconds * SAMPLE_RATE)
        for i in range(delay, frame_count):
            left[i] += left[i - delay] * feedback
            right[i] += right[i - delay] * feedback

    # Crossfade the final 90 ms back to the opening samples to hide any loop seam.
    crossfade = int(0.09 * SAMPLE_RATE)
    for i in range(crossfade):
        blend = i / max(1, crossfade - 1)
        tail = frame_count - crossfade + i
        left[tail] = left[tail] * (1.0 - blend) + left[i] * blend
        right[tail] = right[tail] * (1.0 - blend) + right[i] * blend

    peak = max(max(abs(value) for value in left), max(abs(value) for value in right), 1e-9)
    gain = 0.76 / peak
    pcm = array("h")
    for l_value, r_value in zip(left, right):
        # A touch of soft saturation keeps the synthetic harmonics warm and prevents clipping.
        l_value = math.tanh(l_value * gain * 1.04) / math.tanh(1.04)
        r_value = math.tanh(r_value * gain * 1.04) / math.tanh(1.04)
        pcm.append(max(-32768, min(32767, round(l_value * 32767))))
        pcm.append(max(-32768, min(32767, round(r_value * 32767))))

    if sys.byteorder != "little":
        pcm.byteswap()
    return pcm


def bake(output: Path) -> None:
    pcm = compose()
    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output), "wb") as target:
        target.setnchannels(2)
        target.setsampwidth(2)
        target.setframerate(SAMPLE_RATE)
        target.writeframes(pcm.tobytes())
    print(f"Wrote {output} ({DURATION:.1f}s, {TEMPO} BPM, original 16-bar stereo loop)")


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=root / "assets/audio/platform-loop.wav",
                        help="output WAV path (default: assets/audio/platform-loop.wav)")
    args = parser.parse_args()
    bake(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
