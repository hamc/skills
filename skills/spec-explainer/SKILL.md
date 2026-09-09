---
name: spec-explainer
description: Turn a spec-driven change (OpenSpec, spec-kit) into a narrated walkthrough with generated voice-over, so someone who did not write the proposal can understand it without reading it. Use this when someone asks for a proposal, spec, change or RFC to be explained, walked through, summarised, presented, or turned into a video. It explains a change that already exists; it does not write, implement, review or archive one.
license: MIT
metadata:
  author: hamc
  version: "1.6"
---

# spec-explainer

Turns a spec-driven change into a **storyboard** — a short, structured script — and renders it as a
narrated walkthrough that plays like a video and reads like a page.

The storyboard is the deliverable. Everything downstream is swappable: `narrate.py` turns it into
audio, `render.mjs` turns it into a self-contained HTML player, and the same `storyboard.json` is
what a Remotion or Videowright pipeline would take to emit an `.mp4` later. Never skip the
storyboard to hand-write output.

Commands run from the root of the project being explained. `$SKILL` is the directory this file is
in; most agents state it when the skill loads, and otherwise:

```bash
SKILL=$(dirname "$(dirname "$(find -L . ~/.claude ~/.agents ~/.cursor ~/.config \
  -maxdepth 6 -name smoke.mjs -path '*spec-explainer*' 2>/dev/null | head -1)")")
[ -f "$SKILL/scripts/render.mjs" ] || echo "spec-explainer: not found — ask where it was installed"
```

If `bootstrap.sh` reports `Permission denied` the install dropped the executable bit; run it as
`bash $SKILL/scripts/bootstrap.sh`.

## Operating rules

1. **Read the whole change before writing a scene.** Every file in the change directory. The
   storyboard's value comes from the decisions and the rejected alternatives — a summary of the
   argument alone is something the reader could already skim.
2. **Never invent.** Every number, file path, code line, and terminal line in a scene is copied from
   the change or from the code it names. If the change records no measured result, the storyboard has
   no results scene. A walkthrough that gets a detail wrong is worse than no walkthrough — it is
   believed faster.

   Two cases make "read the real file" harder than it sounds, and both are common:

   - **The change already landed**, so the file carries the fix rather than the defect. These
     frameworks rarely record a commit, so anchor on the change directory's own creation:
     `git log --diff-filter=A -1 --format=%H -- <change-dir>/`, then `git show <sha>^:<path>`.
     That anchor fails in three ways, and none of them is exotic. `^` may not exist, when the spec
     and the code arrived in the same commit. It may point somewhere unrelated, when the spec was
     committed alongside code that had not changed yet — check that the file you get back actually
     contains the defect the change describes, rather than trusting the SHA. And there may be no
     git history at all.

     When you cannot read the "before", say so instead of reconstructing it: build the `code` scene
     as the mechanism rather than as the cause, and never present the current file as the defect it
     fixed. Where the change itself quotes the old code, that quotation is usable with its source in
     the `file` field — `src/cart.py (pre-change, quoted in spec.md §2)` — which is honest in a way
     a retyped fragment is not.
   - **The file is not in the repository at all** — a vendored image, an upstream dependency, a
     chart. Resolve it at the version the change names (image tag, chart version, upstream tag) and
     put that provenance in the scene's `file` field, e.g. `vendor/payments-sdk/client.py (upstream 2.4.1)`.
     A quoted line with no provenance is indistinguishable from an invented one.

   The same applies to a `terminal` scene. Output pasted from a run is one thing; output assembled
   from numbers in the change is a reconstruction, and its `file` field has to say so — write
   `# reconstructed from spec.md §1`, not a command line nobody can run. A plausible prompt above
   made-up output is the most believable wrong thing this skill can produce.

3. **The narration leaves the machine.** Step 3 sends each scene's text to a speech service, and
   rule 2 fills that text with names copied out of the repository. Keep credentials, tokens,
   internal hostnames and customer identifiers out of it, and say so if that costs a detail. Where
   nothing may leave, skip step 3 — the page still speaks on the browser's own voices.
4. **Scene one has to stand on its own**, for someone who has not opened the proposal. Name the
   system, the situation, and the failure — in that order, even when that costs a sentence you think
   is obvious. The commonest defect in a first draft is an opening that reads perfectly to whoever
   just read the change and means nothing to anyone else.

   Where it starts depends on the level: `beginner` opens on what the system does, `intermediate` on
   the concrete failure, `advanced` on the decision and what it costs. For a change that adds a
   feature rather than fixing a defect, the failure is the cost the reader already pays — the
   onboarding they sit through, the step they repeat — not an invented bug.
5. **The budget belongs to the level** — see [references/levels.md](references/levels.md) for the
   table. `intermediate` is six to eight scenes at ~45 words each; `beginner` is 8–10 at ~70,
   because a viewer who needs the ground cannot be given it in seventeen seconds. Write to the word
   count from the first draft — a scene written long and cut later loses the explanation rather than
   the padding, and one squeezed under the count stops explaining and starts naming.

   **Runtime is what those two produce, not a third thing to hit.** Inside both budgets you are
   inside the runtime by construction; if the clock is wrong, the scene count or the word count is
   wrong, and that is what to change.
6. **Carry the one decision the change lives or dies on** — most have exactly one, usually named as
   such. Past ~12 KB of decisions the budget stops stretching and starts choosing: carry that one in
   full, name the others in a line each. Eight shallow scenes are worse than six that land.
7. **Narrate in the language the team reads**, which is not necessarily the language the spec is
   written in — a team reading Portuguese reviews English specs every day. Resolve it in step 0 and
   set `lang` on every storyboard explicitly. Never infer it from the spec's own language.
8. **Nothing this skill produces is committed.** The storyboard, the audio and the page are a
   reading of the change, not a record of it. A committed storyboard silently disagrees with the
   proposal the moment the proposal is revised, and nothing fails when it does. Everything goes
   under `.spec-explainer/`, which is gitignored. Never publish anywhere the person did not ask for.

## Workflow

### 0. Detect the framework, the change, and the language

**The framework.** Read [references/frameworks.md](references/frameworks.md) — it maps each known
layout onto the three documents this skill needs: the argument, the decisions, the verification.
Probe:

```bash
ls -d openspec/changes 2>/dev/null          # OpenSpec
ls -d specs/[0-9]*-*/ 2>/dev/null | head -3 # spec-kit
```

If both match, or neither does, ask which directory holds one change and which file carries which
role. Do not infer a layout from a file that merely happens to be called `spec.md`.

**The change.** If the invocation named one, use it. If exactly one is in flight, take it, say which
one you took, and show how to override. Otherwise list them and ask — never default to the most
recent, which is a guess dressed as a convention.

Anything after the change name is a language tag or a level, in either order and either optional —
`/spec-explainer <change> pt-BR beginner` and `/spec-explainer <change> advanced` are both complete
invocations. Take what is there and resolve the rest below.

**The level.** Who is going to watch decides which scenes exist, not just how long they are. Read
[references/levels.md](references/levels.md). Take it from the invocation
(`/spec-explainer <change> beginner`), then from `.spec-explainer/config.json`, and otherwise use
`intermediate` — but say which you used and offer the other two, because the author of a change is
the worst judge of what a newcomer to it needs.

**The language.** Take the first of these that answers:

1. the invocation — `/spec-explainer <change> es-ES`, or "explain it in Japanese"
2. `.spec-explainer/config.json`, if it exists: `{"lang": "pt-BR"}`
3. **ask.** A BCP-47 tag (`pt-BR`, `es-ES`, `ja-JP`) or a bare language (`pt`, `es`, `ja`)

After asking, record it so the next change does not ask again:

```bash
mkdir -p .spec-explainer && echo '{ "lang": "pt-BR", "level": "intermediate" }' \
  > .spec-explainer/config.json
```

Then make sure `.spec-explainer/` is ignored. `.gitignore` is the usual place and worth committing
so the whole team gets it — but it is a tracked file, so on a branch mid-review that line is itself a
change nobody asked for. Offer `.git/info/exclude` when they want no footprint at all: local,
untracked, same effect.

### 1. Read the change

Read every file in the change directory. Pull out, explicitly, before writing anything:

- the concrete failure, or the cost the reader already pays
- where in the system it happens
- the smallest piece of code responsible
- the rule the change adds, as before/after
- the one decision it hinges on, and the escape hatch that keeps the ordinary path working
- what it deliberately does not touch
- what verification actually showed — including what it failed to show, and what is still open

Those map almost one-to-one onto scenes. That is not a coincidence; a change whose argument names no
concrete failure is a change that is not ready to be reviewed either.

Open the code the change names and read it. A `code` scene is copied from the file, never retyped
from the change's quotation of it.

**If the decisions carry no rejected alternative and no trade-off, say so before building.** There
is no middle to the walkthrough, and four honest scenes beat seven padded ones. The decisions may be
more than one file — in spec-kit they are `plan.md` *and* `research.md`, and reading only the first
one will tell you a rich change is empty.

**Draw the mechanism, not its name.** A box labelled `cache` says less than the sentence it
replaces. An exchange between parts of the system is a `sequence`; a value that reaches some callers
and not others is a `flow` with a blocked edge. Reaching for `bullets` three times in one storyboard
means the mechanism got described instead of drawn.

### 2. Write the storyboard

Read [references/storyboard.md](references/storyboard.md) for the schema and the six visual types,
and [examples/reserve-stock-at-checkout.json](examples/reserve-stock-at-checkout.json) for a
complete worked example. Read both before writing your first one.

Write it to `.spec-explainer/<name>/storyboard.json`. Keep it while the change is under review — it
is the expensive part, since regenerating means reading the change again and arriving at a different
script — and let it go afterwards.

### 3. Narrate

Render once first. It is free, offline, and it validates — narration is the expensive step, and
there is no reason to spend one speech request per scene on a storyboard the renderer would reject:

```bash
node $SKILL/scripts/render.mjs .spec-explainer/<name>/storyboard.json /dev/null

PY=$($SKILL/scripts/bootstrap.sh)                  # idempotent; prints the python to use
"$PY" $SKILL/scripts/narrate.py .spec-explainer/<name>/storyboard.json
```

Read the render's warnings: a scene count outside the level's budget, and a `compare` whose sides
have different line counts, are the two mistakes that otherwise survive into a finished
walkthrough.

`narrate.py` writes one mp3 per scene and each scene's **measured** duration, so timing is the audio
rather than an estimate. It regenerates only what changed, so fixing one sentence costs one request.
It picks the voice itself; `--lang TAG`, `--voice NAME`, `--rate -8%`, `--force` and `--list-voices`
override it.

`bootstrap.sh` is the only part of this skill that needs a shell. Where there is none, create the
virtualenv by hand — `python -m venv`, then `pip install edge-tts` — and use that interpreter as
`$PY`. Everything else is plain Node and plain Python.

Skipping this step is supported — the player falls back to the browser's own voices, which is worse
but works.

### 4. Render

```bash
node $SKILL/scripts/render.mjs .spec-explainer/<name>/storyboard.json .spec-explainer/<name>/walkthrough.html
```

Node only, no dependencies. The result is **one self-contained file** — audio inlined, no server, no
network request — which is what makes it shareable, and about 100 KB per scene, which is why it stays
out of the repository.

If the runtime is outside the level's range, do not tighten narrations to chase it — that is how a
scene ends up under its word budget and stops explaining. Change the scene count instead, or accept
the runtime: a scene that names four HTTP status codes is legitimately long in a language that reads
each of them as five spoken words.

### 5. Check it against the change

Re-read the storyboard beside the decisions document one time and confirm every claim traces back.
This is the step that makes the walkthrough trustworthy enough to review from.

### 6. Hand it over

Smoke-test the page before anyone opens it. This catches a blank stage — the failure the person
would otherwise find instead of you:

```bash
node $SKILL/scripts/smoke.mjs .spec-explainer/<name>/storyboard.json
```

Then give them the path, and the command for their OS:

```bash
xdg-open .spec-explainer/<name>/walkthrough.html   # Linux
open      .spec-explainer/<name>/walkthrough.html  # macOS
start     .spec-explainer/<name>/walkthrough.html  # Windows
```

Say that it is a single file with the audio inside, so sending it to a reviewer needs no setup on the
other end. A URL instead of a file is a hosting decision this skill stays out of.

Ask them to play one scene before forwarding it. If step 3 was skipped the page falls back to the
browser's own voices, and on a machine with no voice for this language that means the narration is
read with the wrong accent, or not at all — nothing in the file says so, and only listening finds
it.

Then stop. Do not iterate on styling, and do not commit.

## When not to use this

- **A change with no decisions document.** There is nothing to explain that the argument does not
  already say in 300 words. Point the reader at it.
- **Instead of the review.** The walkthrough gets a reviewer to the point where their questions are
  worth asking. It is not the artifact of record, and it is not approval.
