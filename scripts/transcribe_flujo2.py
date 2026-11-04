import sys
import os
import json
from faster_whisper import WhisperModel

audio_path = r"Faltantes RDA2\Atracciones individuales\Flujo 2.m4a"
output_txt = r"Faltantes RDA2\Atracciones individuales\Flujo_2_transcripcion.txt"

print(f"Loading faster-whisper model (tiny/base)...")
try:
    model = WhisperModel("base", device="cpu", compute_type="int8")
    print(f"Transcribing {audio_path}...")
    segments, info = model.transcribe(audio_path, beam_size=5, language="es")
    print(f"Detected language '{info.language}' with probability {info.language_probability:.2f}")

    results = []
    with open(output_txt, "w", encoding="utf-8") as f:
        for segment in segments:
            line = f"[{segment.start:.2f}s -> {segment.end:.2f}s] {segment.text}"
            print(line)
            f.write(line + "\n")
            results.append({"start": segment.start, "end": segment.end, "text": segment.text})

    print(f"Transcription saved to {output_txt}")
except Exception as e:
    print(f"Error during transcription: {e}")

