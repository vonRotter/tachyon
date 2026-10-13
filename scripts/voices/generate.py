"""
Pre-renders the radio dialogue with the open-weight Kokoro-82M speech model (Apache-2.0).

Scans src/ for `say('speaker', 'text')` calls, synthesises each line with the speaker's cast
voice, loudness-normalises it with ffmpeg, and writes public/voice/<hash>.mp3 plus
src/ui/voiceManifest.json. Unchanged lines are kept; lines no longer in the script are removed.
The game applies the per-faction radio filter at runtime, so the files are clean speech.

    python3 -m venv .venv-voice && .venv-voice/bin/pip install -r scripts/voices/requirements.txt
    .venv-voice/bin/python scripts/voices/generate.py

Needs ffmpeg on PATH. The model files (about 120 MB) download on first run into
scripts/voices/models/, which is git-ignored.
"""

import json
import re
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

ROOT = Path(__file__).resolve().parents[2]
MODELS = Path(__file__).resolve().parent / "models"
OUT = ROOT / "public" / "voice"
MANIFEST = ROOT / "src" / "ui" / "voiceManifest.json"
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"
MODEL_FILES = ["kokoro-v1.0.int8.onnx", "voices-v1.0.bin"]

# Each faction gets its own accent and register so speakers are easy to tell apart by ear.
# A voice is either a Kokoro voice id or a weighted blend of several.
CAST = {
    # Kestrel Station: American, plain-spoken
    "varga": {"voice": "af_heart", "lang": "en-us", "speed": 1.0},
    "juno": {"voice": "af_bella", "lang": "en-us", "speed": 1.08},
    "pike": {"voice": "am_puck", "lang": "en-us", "speed": 1.05},
    # Red Wake: deep and slow
    "vey": {"voice": {"am_fenrir": 0.3, "am_onyx": 0.7}, "lang": "en-us", "speed": 0.92},
    # Helion Combine: British, measured
    "tessaine": {"voice": "bm_george", "lang": "en-gb", "speed": 0.94},
    "nessa": {"voice": "af_nova", "lang": "en-us", "speed": 1.05},
    # Helion Combine: British, measured
    "quell": {"voice": "bf_isabella", "lang": "en-gb", "speed": 1.02},
    "vale": {"voice": "bm_fable", "lang": "en-gb", "speed": 1.0},
    # Drift Union: British, older and warmer
    "sorrel": {"voice": "bf_emma", "lang": "en-gb", "speed": 0.9},
    "kit": {"voice": "af_kore", "lang": "en-us", "speed": 1.08},
    "magpie": {"voice": "am_michael", "lang": "en-us", "speed": 0.98},
}

SAY = re.compile(r"""say\(\s*'(\w+)'\s*,\s*(['"])((?:\\.|(?!\2).)*)\2\s*\)""")


def fnv1a(text: str) -> str:
    """Same hash as voiceKey() in src/ui/comms.ts."""
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def spoken(text: str) -> str:
    """Shouted words in the script ("Who IS that") would otherwise be spelled out as letters."""
    return re.sub(r"\b[A-Z]{2,}\b", lambda m: m.group().lower(), text)


def unescape(s: str) -> str:
    return re.sub(r"\\(.)", r"\1", s)


def script_lines() -> list[tuple[str, str]]:
    lines = []
    for path in sorted((ROOT / "src").rglob("*.ts")):
        for m in SAY.finditer(path.read_text(encoding="utf-8")):
            lines.append((m.group(1), unescape(m.group(3))))
    return list(dict.fromkeys(lines))


def ensure_models() -> None:
    MODELS.mkdir(exist_ok=True)
    for name in MODEL_FILES:
        dest = MODELS / name
        if not dest.exists():
            print(f"downloading {name}")
            urllib.request.urlretrieve(RELEASE + name, dest)


def style(k: Kokoro, voice):
    if isinstance(voice, str):
        return voice
    return sum(k.get_voice_style(v) * w for v, w in voice.items())


def main() -> None:
    lines = script_lines()
    missing_cast = sorted({s for s, _ in lines if s not in CAST})
    if missing_cast:
        sys.exit(f"no voice cast for: {', '.join(missing_cast)}")
    old = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {}
    k = None
    for speaker, text in lines:
        key = fnv1a(f"{speaker}|{text}")
        dest = OUT / f"{key}.mp3"
        if dest.exists() and key in old:
            manifest[key] = old[key]
            continue
        if k is None:
            ensure_models()
            k = Kokoro(str(MODELS / MODEL_FILES[0]), str(MODELS / MODEL_FILES[1]))
        cast = CAST[speaker]
        samples, sr = k.create(spoken(text), voice=style(k, cast["voice"]), speed=cast["speed"], lang=cast["lang"])
        with tempfile.NamedTemporaryFile(suffix=".wav") as wav:
            sf.write(wav.name, np.asarray(samples, dtype=np.float32), sr)
            subprocess.run(
                [
                    "ffmpeg", "-y", "-loglevel", "error", "-i", wav.name,
                    "-af", "silenceremove=start_periods=1:start_threshold=-50dB,"
                    "areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,"
                    "loudnorm=I=-16:TP=-1.5:LRA=11",
                    "-ac", "1", "-ar", "24000", "-b:a", "48k", str(dest),
                ],
                check=True,
            )
        info = sf.info(str(dest))
        manifest[key] = {"speaker": speaker, "duration": round(info.duration, 2)}
        print(f"{key} {speaker:9s} {info.duration:5.1f}s  {text[:60]}")
    for f in OUT.glob("*.mp3"):
        if f.stem not in manifest:
            f.unlink()
            print(f"removed {f.name}")
    MANIFEST.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(f"{len(manifest)} lines voiced")


if __name__ == "__main__":
    main()
