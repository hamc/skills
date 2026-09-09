#!/usr/bin/env python3
"""storyboard.json -> one mp3 per scene, and each scene's real duration.

Audio lands in <storyboard>.audio/ and the storyboard records the file name plus
the measured `seconds`. It deliberately does not inline the audio: the storyboard
is meant to stay readable in a pull request diff, and render.mjs is what embeds
the files. A scene whose narration and voice have not changed is not regenerated.

Usage: .venv/bin/python3 narrate.py <storyboard.json> [--voice NAME] [--rate +0%]
"""

import argparse
import asyncio
import hashlib
import json
import re
import sys
from pathlib import Path

import edge_tts

# Multilingual first: a spec narration is nearly always one language carrying
# another language's terms of art — a Portuguese sentence containing "done",
# "score", "judge". A monolingual voice reads those phonetically, which is most
# of what makes generated narration sound wrong. Only seven locales have a
# multilingual voice, so everything else resolves against the live voice list
# rather than a table this file would have to keep in sync.
MULTILINGUAL = {
    "de-DE": "de-DE-SeraphinaMultilingualNeural",
    "en-AU": "en-AU-WilliamMultilingualNeural",
    "en-US": "en-US-AvaMultilingualNeural",
    "fr-FR": "fr-FR-VivienneMultilingualNeural",
    "it-IT": "it-IT-GiuseppeMultilingualNeural",
    "ko-KR": "ko-KR-HyunsuMultilingualNeural",
    "pt-BR": "pt-BR-ThalitaMultilingualNeural",
}

# A bare language picks the locale most people mean by it.
ALIASES = {
    "de": "de-DE", "en": "en-US", "es": "es-ES", "fr": "fr-FR", "it": "it-IT",
    "ja": "ja-JP", "ko": "ko-KR", "nl": "nl-NL", "pl": "pl-PL", "pt": "pt-BR",
    "ru": "ru-RU", "tr": "tr-TR", "zh": "zh-CN",
}


def normalize(lang: str) -> str:
    lang = lang.strip().replace("_", "-")
    if "-" in lang:
        head, tail = lang.split("-", 1)
        return f"{head.lower()}-{tail.upper()}"
    return ALIASES.get(lang.lower(), lang.lower())


async def resolve_voice(lang: str) -> str:
    """Best available voice for a language, without a table to keep in sync."""
    if lang in MULTILINGUAL:
        return MULTILINGUAL[lang]

    voices = await edge_tts.list_voices()
    prefix = lang.split("-")[0].lower()

    def rank(v):
        locale = v["Locale"].replace("_", "-")
        multi = "Multilingual" in v["ShortName"]
        return (locale.lower() == lang.lower(), multi, locale.lower().startswith(prefix))

    best = [v for v in voices if v["Locale"].replace("_", "-").lower().startswith(prefix)]
    if not best:
        raise SystemExit(
            f"narrate: no voice for language {lang!r}. Run --list-voices and pass --voice."
        )
    return max(best, key=rank)["ShortName"]

# A beat after the voice stops, so a scene does not cut on the last syllable.
TAIL = 0.9


# Which boundary events a voice emits depends on the voice: the monolingual ones
# send WordBoundary, the multilingual ones send SentenceBoundary. Take whichever
# arrives, and fall back to the file itself if a voice sends neither.
BOUNDARIES = ("WordBoundary", "SentenceBoundary")

MPEG1_RATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
MPEG2_RATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
SAMPLE_RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def mp3_seconds(path: Path) -> float:
    """Length of a constant-bitrate mp3, read off its first frame header."""
    data = path.read_bytes()
    i = data.find(b"\xff")
    while 0 <= i < len(data) - 4:
        h = data[i:i + 4]
        if h[0] == 0xFF and (h[1] & 0xE0) == 0xE0:
            version = (h[1] >> 3) & 0x03
            rates = MPEG1_RATES if version == 3 else MPEG2_RATES
            bitrate = rates[(h[2] >> 4) & 0x0F]
            sample = SAMPLE_RATES.get(version, [0, 0, 0])[(h[2] >> 2) & 0x03]
            if bitrate and sample:
                return len(data) * 8 / (bitrate * 1000)
        i = data.find(b"\xff", i + 1)
    return 0.0


def sentence_beats(events: list[tuple[float, str]], text: str) -> list[float]:
    """When each sentence starts speaking, in seconds.

    A multilingual voice emits one SentenceBoundary per sentence and the offsets
    are the answer directly. A monolingual voice emits one WordBoundary per word,
    so the events are walked against the sentence they fall inside. Both end up
    as the same thing: the moment the narration reaches each idea, which is what
    the renderer reveals a diagram against.
    """
    sentences = [s for s in re.findall(r"[^.!?]+[.!?]*", text) if s.strip()]
    if not events or not sentences:
        return []
    if len(events) == len(sentences):
        return [round(offset, 2) for offset, _ in events]

    beats, cursor, spoken = [], 0, 0.0
    for sentence in sentences:
        target = spoken + len(sentence.strip())
        if cursor < len(events):
            beats.append(round(events[cursor][0], 2))
        while cursor < len(events) and spoken < target:
            spoken += len(events[cursor][1]) + 1
            cursor += 1
        spoken = target
    return beats


async def synth(text: str, voice: str, rate: str, dest: Path) -> tuple[float, list[float]]:
    """Write the mp3; return the spoken length and when each sentence starts."""
    comm = edge_tts.Communicate(text, voice, rate=rate)
    end, events = 0, []
    with dest.open("wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] in BOUNDARIES:
                end = max(end, chunk["offset"] + chunk["duration"])
                events.append((chunk["offset"] / 1e7, chunk.get("text", "")))
    if not dest.stat().st_size:
        raise RuntimeError(f"no audio came back for voice {voice!r}")
    seconds = end / 1e7 or mp3_seconds(dest)  # 100-nanosecond ticks
    return seconds, sentence_beats(events, text)


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("storyboard")
    ap.add_argument("--lang", help="narration language, e.g. pt-BR, es, ja-JP")
    ap.add_argument("--voice", help="edge-tts voice; --list-voices to see them")
    ap.add_argument("--rate", default="+0%", help="speaking rate, e.g. -8%% or +10%%")
    ap.add_argument("--force", action="store_true", help="regenerate every scene")
    ap.add_argument("--list-voices", action="store_true")
    args = ap.parse_args()

    if args.list_voices:
        for v in await edge_tts.list_voices():
            print(f"{v['ShortName']:<38} {v['Gender']:<8} {v['Locale']}")
        return 0

    path = Path(args.storyboard)
    try:
        sb = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        print(f"narrate: cannot read {path}: {e}", file=sys.stderr)
        return 1

    # A traceback is a worse message than a sentence, and this step is the
    # expensive one: every scene is a round trip to a speech service. Refuse a
    # storyboard the renderer would reject anyway, before spending any of them.
    if not isinstance(sb, dict) or not isinstance(sb.get("scenes"), list) or not sb["scenes"]:
        print('narrate: storyboard has no "scenes" array', file=sys.stderr)
        return 1
    for i, scene in enumerate(sb["scenes"], 1):
        if not isinstance(scene, dict) or not scene.get("narration"):
            print(f'narrate: scene {i}: missing "narration"', file=sys.stderr)
            return 1
        if not scene.get("title"):
            print(f'narrate: scene {i}: missing "title"', file=sys.stderr)
            return 1

    # --lang wins over the storyboard, and is recorded so a re-render agrees.
    lang = normalize(args.lang or sb.get("lang") or "en-US")
    if lang != sb.get("lang"):
        sb["lang"] = lang
    voice = args.voice or (sb.get("voice") if not args.lang else None) or await resolve_voice(lang)

    audio_dir = path.with_suffix("")
    audio_dir = audio_dir.with_name(audio_dir.name + ".audio")
    audio_dir.mkdir(exist_ok=True)

    sb["voice"] = voice
    sb["lang"] = lang
    if args.rate != "+0%":
        sb["rate"] = args.rate

    def save():
        path.write_text(json.dumps(sb, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    total, made, kept = 0.0, 0, 0
    live = set()
    for i, scene in enumerate(sb["scenes"], 1):
        sig = hashlib.sha256(
            f"{scene['narration']}\x00{voice}\x00{args.rate}".encode("utf-8")
        ).hexdigest()[:16]
        # Content-addressed, not positional. A file named by its position stays
        # put when scenes are reordered, so every scene keeps matching its own
        # signature while playing another scene's audio on another scene's clock
        # — and reordering is the likeliest edit between the first render and the
        # second. Naming the file after what is in it makes that impossible.
        name = f"scene-{sig}.mp3"
        dest = audio_dir / name
        live.add(name)

        if not args.force and scene.get("audio_sig") == sig and dest.exists() and "beats" in scene:
            kept += 1
        else:
            spoken, beats = await synth(scene["narration"], voice, args.rate, dest)
            scene["seconds"] = round(spoken + TAIL, 1)
            scene["beats"] = beats
            scene["audio_sig"] = sig
            made += 1
            print(f"  {name}  {scene['seconds']:>5.1f}s  {scene['title'][:52]}")

        scene["audio"] = f"{audio_dir.name}/{name}"
        total += scene["seconds"]
        # Save after every scene. The record that lets the next run skip a scene
        # lives in the storyboard, so writing it once at the end meant a single
        # refusal from the speech endpoint threw away every scene synthesised
        # before it — and that endpoint does refuse, occasionally, for no reason
        # the text explains.
        save()

    save()

    # Audio no scene points at any more — a cut scene, a rewritten narration, a
    # changed voice. Left behind it inflates the one size this tool reports.
    swept = [f for f in audio_dir.glob("*.mp3") if f.name not in live]
    for f in swept:
        f.unlink()

    size = sum((audio_dir / n).stat().st_size for n in live if (audio_dir / n).exists())
    swept_note = f", {len(swept)} orphaned removed" if swept else ""
    print(
        f"{voice} — {made} generated, {kept} unchanged, "
        f"{int(total // 60)}:{int(total % 60):02d} total, {size / 1024:.0f} KB{swept_note}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
