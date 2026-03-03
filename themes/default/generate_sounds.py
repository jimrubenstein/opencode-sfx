#!/usr/bin/env python3
"""
Generate retro arcade-style sound effects for opencode-sfx.
Inspired by Space Invaders, Pac-Man, and classic 8-bit games.
"""

import numpy as np
from pydub import AudioSegment
from pydub.generators import Sine, Square, Sawtooth
import io
import struct
import wave
import os

SAMPLE_RATE = 44100
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))


def numpy_to_audio_segment(samples, sample_rate=SAMPLE_RATE):
    """Convert numpy float array (-1 to 1) to pydub AudioSegment."""
    # Clip and convert to 16-bit PCM
    samples = np.clip(samples, -1.0, 1.0)
    pcm = (samples * 32767).astype(np.int16)

    # Write to WAV in memory
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())
    buf.seek(0)
    return AudioSegment.from_wav(buf)


def square_wave(freq, duration_ms, volume=0.25, sample_rate=SAMPLE_RATE):
    """Generate a square wave - the classic 8-bit sound."""
    t = np.linspace(0, duration_ms / 1000, int(sample_rate * duration_ms / 1000), endpoint=False)
    wave = np.sign(np.sin(2 * np.pi * freq * t)) * volume
    return wave


def saw_wave(freq, duration_ms, volume=0.25, sample_rate=SAMPLE_RATE):
    """Generate a sawtooth wave."""
    t = np.linspace(0, duration_ms / 1000, int(sample_rate * duration_ms / 1000), endpoint=False)
    wave = (2 * (freq * t % 1) - 1) * volume
    return wave


def noise(duration_ms, volume=0.15, sample_rate=SAMPLE_RATE):
    """Generate white noise."""
    n_samples = int(sample_rate * duration_ms / 1000)
    return np.random.uniform(-volume, volume, n_samples)


def sine_wave(freq, duration_ms, volume=0.25, sample_rate=SAMPLE_RATE):
    """Generate a sine wave."""
    t = np.linspace(0, duration_ms / 1000, int(sample_rate * duration_ms / 1000), endpoint=False)
    return np.sin(2 * np.pi * freq * t) * volume


def frequency_sweep(start_freq, end_freq, duration_ms, wave_type='square', volume=0.25, sample_rate=SAMPLE_RATE):
    """Generate a frequency sweep (ascending or descending)."""
    t = np.linspace(0, duration_ms / 1000, int(sample_rate * duration_ms / 1000), endpoint=False)
    freqs = np.linspace(start_freq, end_freq, len(t))
    phase = np.cumsum(freqs / sample_rate) * 2 * np.pi

    if wave_type == 'square':
        return np.sign(np.sin(phase)) * volume
    elif wave_type == 'saw':
        return (2 * ((np.cumsum(freqs / sample_rate)) % 1) - 1) * volume
    else:
        return np.sin(phase) * volume


def apply_envelope(samples, attack_ms=10, decay_ms=50, sample_rate=SAMPLE_RATE):
    """Apply attack/decay envelope to avoid clicks."""
    attack_samples = int(sample_rate * attack_ms / 1000)
    decay_samples = int(sample_rate * decay_ms / 1000)

    envelope = np.ones(len(samples))
    if attack_samples > 0 and attack_samples < len(samples):
        envelope[:attack_samples] = np.linspace(0, 1, attack_samples)
    if decay_samples > 0 and decay_samples < len(samples):
        envelope[-decay_samples:] = np.linspace(1, 0, decay_samples)

    return samples * envelope


def concat_samples(*sample_arrays):
    """Concatenate multiple sample arrays."""
    return np.concatenate(sample_arrays)


def mix_samples(*sample_arrays):
    """Mix multiple sample arrays together (must be same length)."""
    max_len = max(len(s) for s in sample_arrays)
    result = np.zeros(max_len)
    for s in sample_arrays:
        result[:len(s)] += s
    return np.clip(result, -1.0, 1.0)


def silence(duration_ms, sample_rate=SAMPLE_RATE):
    """Generate silence."""
    return np.zeros(int(sample_rate * duration_ms / 1000))


def save_sound(samples, filename, gain_db=0):
    """Save samples as MP3 file with optional gain boost."""
    seg = numpy_to_audio_segment(samples)
    if gain_db != 0:
        seg = seg + gain_db
    filepath = os.path.join(OUTPUT_DIR, filename)
    seg.export(filepath, format='mp3', bitrate='192k')
    print(f"  Saved: {filepath} ({len(seg)}ms, {seg.dBFS:.1f} dBFS)")


# ============================================================
# ANNOUNCE - Pac-Man style startup jingle / power-up fanfare
# ============================================================
def generate_announce():
    print("Generating announce.mp3...")

    # Pac-Man beginning jingle inspired - ascending arpeggio with that iconic feel
    # B4, C5, E5, B5 pattern with square waves
    notes = [
        (493.88, 80),   # B4
        (523.25, 80),   # C5
        (659.25, 80),   # E5
        (493.88, 80),   # B4 (octave down)
        (523.25, 100),  # C5
        (659.25, 100),  # E5
        (783.99, 120),  # G5
        (987.77, 200),  # B5 - hold
    ]

    parts = []
    for freq, dur in notes:
        tone = square_wave(freq, dur, volume=0.22)
        tone = apply_envelope(tone, attack_ms=5, decay_ms=30)
        parts.append(tone)
        parts.append(silence(20))  # tiny gap between notes

    melody = concat_samples(*parts)

    # Add a shimmering high sine underneath
    shimmer_len_ms = int(len(melody) / SAMPLE_RATE * 1000)
    shimmer = frequency_sweep(1200, 2400, shimmer_len_ms, wave_type='sine', volume=0.06)
    if len(shimmer) > len(melody):
        shimmer = shimmer[:len(melody)]
    elif len(shimmer) < len(melody):
        shimmer = np.pad(shimmer, (0, len(melody) - len(shimmer)))

    final = mix_samples(melody, shimmer)
    final = apply_envelope(final, attack_ms=5, decay_ms=80)

    save_sound(final, 'announce.mp3')


# ============================================================
# QUESTION - Coin insert / "Hey listen!" attention grabber
# ============================================================
def generate_question():
    print("Generating question.mp3...")

    # Classic coin-drop sound: two quick descending tones then a ring
    # Like inserting a quarter into an arcade machine
    coin1 = square_wave(1800, 50, volume=0.25)
    coin1 = apply_envelope(coin1, attack_ms=2, decay_ms=20)

    gap1 = silence(30)

    coin2 = square_wave(2400, 60, volume=0.25)
    coin2 = apply_envelope(coin2, attack_ms=2, decay_ms=25)

    gap2 = silence(40)

    # Resonant ring - like the coin settling
    ring = sine_wave(2800, 200, volume=0.20)
    ring_overtone = sine_wave(5600, 200, volume=0.08)
    ring = mix_samples(ring, ring_overtone)
    ring = apply_envelope(ring, attack_ms=5, decay_ms=150)

    gap3 = silence(80)

    # Then a quick "bip bip" alert pattern - Space Invaders style
    bip1 = square_wave(1000, 60, volume=0.22)
    bip1 = apply_envelope(bip1, attack_ms=3, decay_ms=20)
    bip2 = square_wave(1400, 80, volume=0.25)
    bip2 = apply_envelope(bip2, attack_ms=3, decay_ms=30)

    final = concat_samples(coin1, gap1, coin2, gap2, ring, gap3, bip1, silence(40), bip2)
    final = apply_envelope(final, attack_ms=2, decay_ms=60)

    save_sound(final, 'question.mp3')


# ============================================================
# IDLE 1 - Pac-Man eat ghost / level complete celebration
# ============================================================
def generate_idle1():
    print("Generating idle1.mp3...")

    # Quick ascending victory arpeggio - like eating a ghost in Pac-Man
    notes = [
        (523.25, 60),   # C5
        (659.25, 60),   # E5
        (783.99, 60),   # G5
        (1046.50, 120), # C6 - hold longer
    ]

    parts = []
    for freq, dur in notes:
        tone = square_wave(freq, dur, volume=0.22)
        tone = apply_envelope(tone, attack_ms=3, decay_ms=25)
        parts.append(tone)
        parts.append(silence(15))

    # Final flourish - descending wah
    flourish = frequency_sweep(1046.50, 1200, 150, wave_type='square', volume=0.18)
    flourish = apply_envelope(flourish, attack_ms=5, decay_ms=100)

    final = concat_samples(*parts, flourish)
    save_sound(final, 'idle1.mp3')


# ============================================================
# IDLE 2 - Space Invaders style "task done" blip sequence
# ============================================================
def generate_idle2():
    print("Generating idle2.mp3...")

    # Rhythmic "doo-doo-doo-DOOOO" pattern
    pattern = [
        (440.00, 70, 0.20),   # A4
        (554.37, 70, 0.20),   # C#5
        (659.25, 70, 0.22),   # E5
        (880.00, 180, 0.25),  # A5 - triumphant hold
    ]

    parts = []
    for freq, dur, vol in pattern:
        tone = square_wave(freq, dur, volume=vol)
        # Add slight vibrato on the last note
        if dur > 100:
            t = np.linspace(0, dur / 1000, len(tone), endpoint=False)
            vibrato = 1 + 0.03 * np.sin(2 * np.pi * 8 * t)
            tone_vib = square_wave(freq, dur, volume=vol)
            # Resynth with vibrato
            phase = np.cumsum((freq * vibrato) / SAMPLE_RATE) * 2 * np.pi
            tone = np.sign(np.sin(phase)) * vol
        tone = apply_envelope(tone, attack_ms=3, decay_ms=40)
        parts.append(tone)
        parts.append(silence(30))

    final = concat_samples(*parts)
    save_sound(final, 'idle2.mp3')


# ============================================================
# IDLE 3 - Galaga-inspired "stage clear" melody
# ============================================================
def generate_idle3():
    print("Generating idle3.mp3...")

    # Quick 8-bit fanfare: da-da-da-da DA-DA!
    notes = [
        (587.33, 50),   # D5
        (659.25, 50),   # E5
        (783.99, 50),   # G5
        (880.00, 50),   # A5
    ]

    parts = []
    for freq, dur in notes:
        tone = square_wave(freq, dur, volume=0.20)
        tone = apply_envelope(tone, attack_ms=3, decay_ms=20)
        parts.append(tone)
        parts.append(silence(15))

    # Big finish - two strong hits
    parts.append(silence(40))
    hit1 = square_wave(1174.66, 80, volume=0.25)  # D6
    hit1 = apply_envelope(hit1, attack_ms=3, decay_ms=30)
    parts.append(hit1)
    parts.append(silence(50))

    hit2 = square_wave(1318.51, 150, volume=0.25)  # E6
    # Add noise burst for punch
    hit2_noise = noise(150, volume=0.04)
    hit2 = mix_samples(hit2, hit2_noise)
    hit2 = apply_envelope(hit2, attack_ms=3, decay_ms=80)
    parts.append(hit2)

    final = concat_samples(*parts)
    save_sound(final, 'idle3.mp3')


# ============================================================
# ERROR 1 - Pac-Man death sound inspired
# ============================================================
def generate_error1():
    print("Generating error1.mp3...")

    # Classic descending spiral - like Pac-Man dying
    parts = []
    start_freq = 800
    for i in range(8):
        freq = start_freq * (0.85 ** i)  # Each note lower
        dur = 60 + i * 10  # Each note slightly longer (slowing down)
        tone = square_wave(freq, dur, volume=0.22)
        tone = apply_envelope(tone, attack_ms=3, decay_ms=20)
        parts.append(tone)
        parts.append(silence(20))

    # Final low thud
    thud = sine_wave(80, 200, volume=0.25)
    thud_noise = noise(200, volume=0.08)
    thud = mix_samples(thud, thud_noise)
    thud = apply_envelope(thud, attack_ms=10, decay_ms=150)
    parts.append(silence(30))
    parts.append(thud)

    final = concat_samples(*parts)
    save_sound(final, 'error1.mp3')


# ============================================================
# ERROR 2 - Space Invaders "game over" buzz
# ============================================================
def generate_error2():
    print("Generating error2.mp3...")

    # Descending buzz with distortion - like a crash/failure
    sweep = frequency_sweep(600, 80, 300, wave_type='square', volume=0.22)
    sweep = apply_envelope(sweep, attack_ms=5, decay_ms=100)

    gap = silence(60)

    # Two short angry buzzes
    buzz1 = square_wave(120, 100, volume=0.25)
    buzz1_noise = noise(100, volume=0.10)
    buzz1 = mix_samples(buzz1, buzz1_noise)
    buzz1 = apply_envelope(buzz1, attack_ms=5, decay_ms=40)

    buzz2 = square_wave(90, 150, volume=0.25)
    buzz2_noise = noise(150, volume=0.12)
    buzz2 = mix_samples(buzz2, buzz2_noise)
    buzz2 = apply_envelope(buzz2, attack_ms=5, decay_ms=80)

    # Flat "wah-wah" ending (sad trombone but 8-bit)
    wah1 = square_wave(300, 120, volume=0.18)
    wah1 = apply_envelope(wah1, attack_ms=5, decay_ms=50)
    wah2 = square_wave(280, 120, volume=0.18)
    wah2 = apply_envelope(wah2, attack_ms=5, decay_ms=50)
    wah3 = square_wave(250, 200, volume=0.18)
    wah3 = apply_envelope(wah3, attack_ms=5, decay_ms=150)

    final = concat_samples(sweep, gap, buzz1, silence(40), buzz2, silence(80), wah1, silence(30), wah2, silence(30), wah3)
    save_sound(final, 'error2.mp3')


# ============================================================
# Generate all sounds
# ============================================================
if __name__ == '__main__':
    print(f"Output directory: {OUTPUT_DIR}\n")

    generate_announce()
    generate_question()
    generate_idle1()
    generate_idle2()
    generate_idle3()
    generate_error1()
    generate_error2()

    print("\nAll sounds generated!")
