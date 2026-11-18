# Research: transcribe the downloaded top videos (data/research/kalo/*.mp4) with faster-whisper → transcripts.json
# Usage: python scripts/transcribe-kalo-videos.py [model=small]
import json, sys, pathlib
from faster_whisper import WhisperModel

d = pathlib.Path("data/research/kalo")
model = WhisperModel(sys.argv[1] if len(sys.argv) > 1 else "small", device="cpu", compute_type="int8")
out = {}
for f in sorted(d.glob("*.mp4")):
    segs, info = model.transcribe(str(f), language="id", vad_filter=True)
    out[f.stem] = [{"start": round(s.start, 2), "end": round(s.end, 2), "text": s.text.strip()} for s in segs]
    print(f.stem, len(out[f.stem]), "segments", flush=True)
    (d / "transcripts.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
