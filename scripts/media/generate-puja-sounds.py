#!/usr/bin/env python3
"""Synthesises the puja sounds: the small hand bell (ghanti) and the shankh.

Generated in-repo so the sounds need no licence (like generate-bell.py).
Usage: python3 scripts/media/generate-puja-sounds.py /tmp, then
  ffmpeg -i /tmp/ghanti.wav -c:a aac -b:a 64k assets/sounds/ghanti.m4a
  ffmpeg -i /tmp/shankh.wav -c:a aac -b:a 64k assets/sounds/shankh.m4a
"""
import math
import os
import random
import struct
import sys
import wave

RATE = 22050


def write(path: str, frames: list[float], fade_s: float = 0.25) -> None:
    peak = max(abs(v) for v in frames) or 1.0
    fade = int(RATE * fade_s)
    with wave.open(path, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        data = bytearray()
        for i, value in enumerate(frames):
            gain = 0.8 / peak
            if i > len(frames) - fade:
                gain *= (len(frames) - i) / fade
            data += struct.pack("<h", int(value * gain * 32767))
        out.writeframes(bytes(data))


def ghanti() -> list[float]:
    """A brass hand bell: bright, inharmonic, two quick strikes (tan-tan)."""
    base = 1180.0
    partials = [(1.0, 1.0, 0.9), (2.32, 0.6, 0.55), (3.9, 0.35, 0.3), (5.4, 0.2, 0.18)]
    length = int(RATE * 1.8)
    out = [0.0] * length
    random.seed(7)
    for start in (0.0, 0.28):
        offset = int(start * RATE)
        for i in range(length - offset):
            t = i / RATE
            value = sum(
                a * math.exp(-t / d) * math.sin(2 * math.pi * base * r * t)
                for r, a, d in partials
            )
            value += random.uniform(-1, 1) * math.exp(-t / 0.006) * 0.5
            out[offset + i] += value * min(1.0, t / 0.002)
    return out


def shankh() -> list[float]:
    """A conch: a breathy horn tone that swells, holds, then falls slightly."""
    seconds = 2.6
    base = 330.0
    harmonics = [(1, 1.0), (2, 0.7), (3, 0.45), (4, 0.3), (5, 0.18), (6, 0.1), (7, 0.06)]
    random.seed(108)
    out = []
    phase = 0.0
    noise = 0.0
    for i in range(int(RATE * seconds)):
        t = i / RATE
        # Swell in, hold, and let the pitch sag a little as breath runs out.
        envelope = min(1.0, t / 0.35) * (1.0 if t < 2.0 else max(0.0, 1 - (t - 2.0) / 0.6))
        pitch = base * (1 + 0.006 * math.sin(2 * math.pi * 5.2 * t)) * (1 - 0.03 * max(0, t - 1.8))
        phase += 2 * math.pi * pitch / RATE
        tone = sum(a * math.sin(h * phase) for h, a in harmonics)
        noise = 0.92 * noise + 0.08 * random.uniform(-1, 1)
        out.append(envelope * (tone + noise * 0.6))
    return out


def main(folder: str) -> None:
    write(os.path.join(folder, "ghanti.wav"), ghanti(), 0.3)
    write(os.path.join(folder, "shankh.wav"), shankh(), 0.1)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp")
