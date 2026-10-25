"""Build a compact offline English-Chinese dictionary from ECDICT.

Usage:
    python scripts/build_dictionary.py path/to/ecdict.csv

The generated file is `public/dictionary/ecdict.json`; it contains the 20,000
most frequent single English words with a Chinese translation, IPA and a
normalized part of speech. ECDICT (https://github.com/skywind3000/ECDICT) is
MIT licensed; keep public/dictionary/LICENSE with the generated data.
"""
from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

LIMIT = 20_000
WORD = re.compile(r"^[a-z][a-z'-]{0,39}$")
POS = {
    "n.": "n.", "vt.": "vt.", "vi.": "vi.", "v.": "v.", "a.": "adj.",
    "adj.": "adj.", "ad.": "adv.", "adv.": "adv.", "prep.": "prep.",
    "conj.": "conj.", "pron.": "pron.", "art.": "art.", "num.": "num.",
    "aux.": "aux.", "int.": "interj.", "interj.": "interj."
}


def integer(value: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def normalize_translation(value: str) -> str:
    value = value.replace("\\n", "\n").replace("\r", "")
    lines = [line.strip() for line in value.split("\n") if line.strip()]
    return "; ".join(lines)[:800]


def part_of_speech(translation: str) -> str:
    found: list[str] = []
    for line in translation.split(";"):
        match = re.match(r"\s*([a-z]+\.)\s", line)
        if match:
            value = POS.get(match.group(1))
            if value and value not in found:
                found.append(value)
    return " / ".join(found[:3])


def normalize_definition(value: str) -> str:
    lines = value.replace("\\n", "\n").splitlines()
    senses: list[str] = []
    for line in lines:
        sense = re.sub(r"\s+", " ", line).strip()
        sense = re.sub(r"^(n|v|a|s|r)\s+", lambda match: {"a": "adj.", "s": "adj.", "r": "adv."}.get(match[1], match[1] + ".") + " ", sense)
        if not sense or re.search(r"[\u3400-\u9fff]", sense):
            continue
        if len("; ".join([*senses, sense])) > 500:
            break  # Keep complete senses; never cut a definition mid-sentence.
        senses.append(sense)
        if len(senses) == 2:
            break
    return "; ".join(senses)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: python scripts/build_dictionary.py path/to/ecdict.csv")
    source = Path(sys.argv[1])
    output = Path("public/dictionary/ecdict.json")
    output.parent.mkdir(parents=True, exist_ok=True)

    candidates: list[tuple[int, int, int, str, str, str, str, str]] = []
    with source.open(encoding="utf-8", errors="replace", newline="") as handle:
        for row in csv.DictReader(handle):
            word = (row.get("word") or "").strip().lower()
            if not WORD.fullmatch(word):
                continue
            translation = normalize_translation(row.get("translation") or "")
            if not translation:
                continue
            phonetic = (row.get("phonetic") or "").strip().replace("ә", "ə")
            if not phonetic:
                continue
            frq = integer(row.get("frq") or "")
            bnc = integer(row.get("bnc") or "")
            collins = integer(row.get("collins") or "")
            oxford = integer(row.get("oxford") or "")
            # Prefer corpus frequency; Collins/Oxford entries fill rare gaps.
            score = frq if frq > 0 else (100_000 + bnc if bnc > 0 else 1_000_000 - collins * 10_000 - oxford * 5_000)
            candidates.append((score, frq, bnc, word, phonetic, translation, part_of_speech(translation), normalize_definition(row.get("definition") or "")))

    candidates.sort(key=lambda entry: (entry[0], entry[1] or 10**9, entry[2] or 10**9, entry[3]))
    seen: set[str] = set()
    entries: list[list[str]] = []
    for _score, _frq, _bnc, word, phonetic, translation, pos, definition_en in candidates:
        if word in seen:
            continue
        seen.add(word)
        entries.append([word, f"/{phonetic.strip('/')}/", translation, pos, definition_en])
        if len(entries) >= LIMIT:
            break

    output.write_text(json.dumps(entries, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(entries)} entries to {output} ({output.stat().st_size} bytes)")
    print(f"English coverage: {sum(bool(entry[4]) for entry in entries)}/{len(entries)}")
    for sample in ("agent", "context", "undermine", "session", "orchestration", "take off"):
        entry = next((entry for entry in entries if entry[0] == sample), None)
        print(sample, entry[4] if entry and entry[4] else "[AI fallback]")


if __name__ == "__main__":
    main()
