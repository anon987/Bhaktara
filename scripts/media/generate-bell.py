#!/usr/bin/env python3
"""Synthesises the temple bell (ghanti) used by the Sadhana practice screens.

Additive synthesis of inharmonic bell partials with exponential decay and a
short strike transient. Generated in-repo so the sound needs no licence.
Usage: python3 scripts/media/generate-bell.py /tmp/bell.wav, then
ffmpeg -i /tmp/bell.wav -c:a aac -b:a 64k assets/sounds/bell.m4a
"""
import math
import random
import struct
import sys
import wave

RATE = 22050
SECONDS = 3.6
FUNDAMENTAL = 392.0  # G4: warm, not shrill
# (ratio to fundamental, amplitude, decay seconds) of a small brass bell.
PARTIALS = [
    (0.5, 0.35, 2.6),  # hum
    (1.0, 1.0, 2.2),  # prime
    (1.19, 0.55, 1.6),  # minor third (tierce)
    (1.5, 0.35, 1.4),
    (2.0, 0.45, 1.1),  # nominal
    (2.52, 0.25, 0.8),
    (3.01, 0.18, 0.6),
    (4.07, 0.10, 0.4),
]


def sample(t: float, noise: float) -> float:
    value = 0.0
    for ratio, amplitude, decay in PARTIALS:
        # A slight detune per partial gives the slow "wah" beating of real bells.
        frequency = FUNDAMENTAL * ratio
        beat = 1 + 0.08 * math.sin(2 * math.pi * 1.3 * ratio * t)
        value += amplitude * beat * math.exp(-t / decay) * math.sin(2 * math.pi * frequency * t)
    strike = noise * math.exp(-t / 0.012) * 0.6
    attack = min(1.0, t / 0.004)
    return attack * value + strike


def main(path: str) -> None:
    random.seed(108)
    frames = [sample(i / RATE, random.uniform(-1, 1)) for i in range(int(RATE * SECONDS))]
    peak = max(abs(v) for v in frames)
    fade = int(RATE * 0.3)
    with wave.open(path, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        data = bytearray()
        for index, value in enumerate(frames):
            gain = 0.8 / peak
            if index > len(frames) - fade:
                gain *= (len(frames) - index) / fade
            data += struct.pack("<h", int(value * gain * 32767))
        out.writeframes(bytes(data))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "assets/sounds/bell.wav")
