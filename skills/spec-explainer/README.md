# spec-explainer

Turns a spec-driven change into a narrated walkthrough, so someone who did not write the proposal
can understand what it argues. Reads [OpenSpec](https://github.com/Fission-AI/OpenSpec) and
[spec-kit](https://github.com/github/spec-kit) layouts, and asks about anything else.

That asymmetry is the point. The author already holds the argument in their head; everyone else has
to rebuild it from a document written while it was still being figured out. This is for everyone
else.

It exists because AI-accelerated development changed the ratio: proposals now arrive faster than a
team can read them, and the reading is where the cost sits. This does not replace the proposal — it
gets a reviewer to the point where their questions are worth asking.

Two things are decided when you run it, not baked in: **who is watching** and **what language they
read**.

## Prerequisites

| | why | if it's missing |
|---|---|---|
| **Node 18+** | runs `render.mjs`, which has no dependencies | the renderer will not start |
| **Python 3.9+** | runs `narrate.py` via edge-tts | skip narration; the player falls back to your browser's own voices |
| **Network, first run** | installs edge-tts, then calls Microsoft's voice endpoint per scene | narration cannot be generated; everything else works |
| **A spec-driven project** | the skill reads one change directory | there is nothing to explain |
| **git** *(optional)* | reads the pre-change source, and checks the output is ignored | those two checks go quiet; nothing fails |
| **bash** *(optional)* | runs `bootstrap.sh`, the Python setup | do its two commands yourself — see *On Windows* below |

Nothing else. **No API key, no account, no paid service** — edge-tts uses Microsoft Edge's neural
voices, which are free.

Two things do go over the network, and neither is hidden: **the narration text is sent to Microsoft's
speech endpoint** to be spoken, one request per scene; and on a Python that ships without `ensurepip`,
`bootstrap.sh` downloads pip's official bootstrap script, printing the URL and the SHA-256 of what it
got before running it. Skip the narration step and nothing leaves the machine at all.

Because the narration is copied from the change, treat it as something you are publishing: keep
credentials, tokens, internal hostnames and anything else you cannot share out of the words, or skip
narration for that repository.

On Debian and Ubuntu, `python3` ships without `pip`. `bootstrap.sh` detects that and installs pip
into its own virtualenv — you do not need `sudo`.

**On Windows**, `render.mjs` and `narrate.py` run natively — they are plain Node and plain Python,
with no shell in them. Only `bootstrap.sh` needs one. Run it from Git Bash or WSL and it works: it
looks for the `Scripts\python.exe` that a Windows virtualenv creates as well as the POSIX
`bin/python3`. With no bash at all, do its two steps by hand —

```powershell
py -m venv $HOME\.cache\spec-explainer\venv
$HOME\.cache\spec-explainer\venv\Scripts\pip install edge-tts
```

— and give `narrate.py` that interpreter in place of the one `bootstrap.sh` prints. It is the same
location `bootstrap.sh` uses, so a later run from Git Bash finds it rather than building a second
one.

**Disk:** about 30 MB for the virtualenv, in `~/.cache/spec-explainer/` rather than in your project.
Roughly 100–140 KB of audio per scene. Everything else lands in `.spec-explainer/` inside the
project; put that one line in `.gitignore`, or in `.git/info/exclude` when you want no footprint on
a tracked file. The renderer checks and tells you if neither is done.

## How it works

The skill reads the whole change and writes a **storyboard**: a handful of scenes, each one
narration paragraph and one visual, drawn from a fixed vocabulary of six visual types (`flow`,
`sequence`, `compare`, `code`, `terminal`, `bullets`).

```
<one change directory> → storyboard.json → narrate.py → render.mjs → walkthrough.html
   the whole change       scenes + script    edge-tts    audio inlined, one file
```

Frameworks disagree about file names and agree about three documents: **the argument**, **the
decisions**, and **the verification**. `references/frameworks.md` maps each layout onto those three,
and adding a framework is an entry in that table, not a code change. The middle scenes come from the
decisions, so a change with no rejected alternative and no trade-off has no middle — the honest
output is four scenes, and the storyboard says `"thin": true` so that reads as a decision rather
than as a mistake.

**The storyboard is the contract.** Everything downstream is a consumer of it: swapping
`render.mjs` for Remotion or [Videowright](https://github.com/scosman/videowright) to emit an `.mp4`
adds a consumer rather than requiring a rewrite. Being small and legible is also what lets you check
the script against the proposal before anyone believes the walkthrough — a video cannot be read that
way.

**Nothing it produces is committed.** A storyboard is a reading of a change, not a record of one —
committed, it goes stale against the proposal with nothing to fail. It lives under
`.spec-explainer/`, ignored, and rebuilds.

Scene durations are **measured** from the generated audio, not estimated, so the visuals and the
voice stay together.

## Audience

The same change makes three different walkthroughs, and the difference is not length. It is what the
viewer already has.

| | `beginner` | `intermediate` | `advanced` |
|---|---|---|---|
| the viewer | new to this codebase or domain | works here, has not read this change | has skimmed it, deciding whether to approve |
| opens on | what the system does and where this sits | the concrete failure | the decision and what it costs |
| vocabulary | defined the first time it appears | assumed | assumed |
| scenes | 8–10 | 6–8 | 5–7 |
| runtime | 3:20–4:45 | 1:50–2:30 | 1:55–2:40 |

`beginner` spends scenes on orientation and defines terms as it goes, and skips the statistics.
`advanced` inverts the opening and spends everything on rejected alternatives, trade-offs and what
verification did *not* establish — the things an approval actually rests on. `intermediate` is the
default.

Runtime is a consequence of scenes × words, not a third target: inside both budgets you are inside
the runtime. `references/levels.md` carries the detail, and the renderer warns when a storyboard
leaves the range.

## Language and level

Both are asked at run time. Give them in the invocation:

```
/spec-explainer reserve-stock-at-checkout pt-BR beginner
```

…or let it ask. To stop it asking every time, it writes your answers to
`.spec-explainer/config.json`:

```json
{ "lang": "pt-BR", "level": "intermediate" }
```

A BCP-47 tag or a bare language both work. The voice is resolved against edge-tts's live catalogue —
a multilingual voice for the locale where one exists, the best neural voice for it otherwise — so any
language edge-tts serves is available without this skill keeping a table.

**Narrate in the language your team reads, which is often not the language the specs are written
in.** English specs and a Portuguese-reading team is the ordinary case, and the skill never infers
the language from the document.

**Multilingual voices matter more than they sound like they should.** A spec narration is almost
always one language carrying another language's terms of art — a Portuguese sentence containing
*done*, *score*, *judge*. A monolingual voice reads those phonetically, and that is most of what
makes generated narration sound wrong.

## Files

| | |
|---|---|
| `SKILL.md` | the procedure and the rules the agent follows |
| `references/storyboard.md` | the storyboard schema and the six visual types |
| `references/levels.md` | what each audience level changes, and the budgets |
| `references/frameworks.md` | which file plays which role, per spec framework |
| `examples/` | a complete worked storyboard, and a fixture covering all six visuals |
| `scripts/bootstrap.sh` | idempotent Python setup; prints the interpreter to use |
| `scripts/narrate.py` | storyboard → one mp3 per scene, plus measured durations |
| `scripts/render.mjs` | storyboard + audio → one self-contained HTML page |
| `scripts/smoke.mjs` | runs the emitted page in a stub DOM; the regression guard |
| `evals/evals.json` | test prompts this skill is expected to handle |
| `evals/trigger-evals.json` | queries for measuring whether the description triggers |

## Troubleshooting

**Play one scene with sound before you forward the file.** If the narration step was skipped the page
falls back to the browser's own voices, and on a machine with no voice for that language it reads
with the wrong accent or not at all — nothing in the file says so, and only listening finds it.

**The narration sounds like a robot reading a foreign language.** It is reading a foreign language:
check that `lang` in the storyboard matches the narration, and re-run `narrate.py --lang <tag>`.

**No audio when the page opens.** Browsers block audio until you interact with the page. Click
**play**.

**I updated the skill and nothing changed.** The installer copies files rather than linking them, so
an installed skill stays where it was until you run `npx skills update`.

**How do I share it?** Send the file. The page is self-contained — the audio is inlined and it makes
no network request at all — so it opens from a download, an email attachment or a USB stick with
nothing installed on the other end. A URL needs a host, which is a decision this skill stays out of.

**`bootstrap: could not create a venv`.** Your Python has no `venv` module at all:
`sudo apt install python3-venv`.

## License

MIT
