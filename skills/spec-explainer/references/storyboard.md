# storyboard.json

A storyboard is a small JSON document: a title and a handful of scenes — how many is set by the
audience level, see [levels.md](levels.md). Each scene is one narration
paragraph plus one visual. There is deliberately no free-form HTML — the renderer knows six visual
types, and the constraint is what keeps storyboards writable, reviewable, and re-renderable by a
different back end later.

## Top level

```json
{
  "title": "Stock is reserved at checkout, not after payment",
  "kind": "openspec change",
  "source": "openspec/changes/2026-08-20-reserve-stock-at-checkout",
  "scenes": [ ... ]
}
```

| field | required | notes |
|---|---|---|
| `title` | yes | The change's thesis as a sentence, not its slug |
| `lang` | no | BCP-47 tag for the narration, e.g. `pt-BR`. Default `en-US` |
| `level` | no | `beginner`, `intermediate` or `advanced` — see [levels.md](levels.md). Default `intermediate` |
| `thin` | no | `true` when the change genuinely has no middle, so a short storyboard is the honest output rather than a warning |
| `kind` | no | Eyebrow label above the title. Default `spec walkthrough` |
| `source` | no | Path shown in the footer so a viewer can find the real document |
| `scenes` | yes | 6–8 of them |
| `voice` | — | Written by `narrate.py`; do not set it by hand |

## Scene

```json
{
  "id": "problem",
  "title": "Two people bought the last one",
  "narration": "Two or three sentences, written to be read aloud.",
  "seconds": 12,
  "visual": { "type": "terminal", "lines": [ ... ] }
}
```

`title` and `narration` are required; `visual` is required and must be one of the six types below.
`seconds` and `audio` are written by `narrate.py` and should not be authored by hand. Without that
step, leave `seconds` out and the renderer estimates it from the narration length; set it manually
only to hold a dense visual on screen longer.

**Narration is prose, not bullets.** It is the voiceover: full sentences, one idea per sentence, no
markdown. The visual carries the structure; the narration carries the argument. If a narration needs
a list, the visual should have been `bullets`.

**Length is set by the level, not by taste** — `beginner` ~70 words a scene, `intermediate` ~45,
`advanced` ~55. See [levels.md](levels.md). Write to the number from the first draft; the runtime
follows from it and from the scene count, and is not a third thing to aim at.

The reverse mistake is worse and harder to see. A narration squeezed under its word count stops
explaining and starts *referring* — it names the thing instead of saying what the thing is, and it
reads fine to whoever just read the change. If a scene cannot be said in its budget, the storyboard
has too few scenes for this level, not too many words.

## Visual types

### `flow` — a pipeline, blocks arriving one at a time

For "where in the system this happens". Nodes are laid out left to right with arrows between them.

```json
{ "type": "flow", "nodes": [
  { "label": "cart", "note": "stock is only read" },
  { "label": "stock write", "note": "can reach -1", "state": "bad" }
] }
```

`state` is `active` (amber), `good` (green), `bad` (red), or omitted. Use at most two states per
scene — colouring everything colours nothing. Keep to 3–6 nodes; a pipeline that needs more is two
scenes.

**Edges are where a routing argument lives.** `edges` holds one entry per gap between nodes —
`edges[0]` sits between `nodes[0]` and `nodes[1]` — and each carries an optional `label` and an
optional `state` of `blocked`, which draws a red `✕` instead of an arrow. That is how you show a
value that reaches some callers and not others, rather than saying so in the narration.

```json
{ "type": "flow",
  "nodes": [{ "label": "hold_seconds" }, { "label": "reserve" }, { "label": "charge" }],
  "edges": [{ "label": "never arrives", "state": "blocked" }, { "label": "obeys" }] }
```

An unlabelled arrow says only "related somehow"; `never arrives` is the mechanism.

### `sequence` — who says what to whom, in order

The diagram for a loop between parts of a system: a client and a service, a service and a store.
Actors sit across the top with a lifeline each; messages are arrows between them, in time order
down the page. Reach for it whenever the argument is about **an exchange** — a refusal
and what the other side does next, a call whose answer changes the following call.

```json
{ "type": "sequence",
  "caption": "one sentence naming what the picture shows",
  "actors": ["shopper", "checkout", "stock"],
  "messages": [
    { "from": 0, "to": 1, "label": "pay", "state": "ok" },
    { "from": 1, "to": 2, "label": "reserve 1 for 15 min", "state": "ok" },
    { "from": 2, "to": 1, "label": "refused: none left", "state": "bad" },
    { "from": 1, "to": 1, "label": "roll the charge back" },
    { "from": 1, "to": 0, "label": "sold out, and not charged", "state": "good" }
  ] }
```

`from` and `to` are indexes into `actors`; equal indexes draw a self-message. `state` is `ok`
(blue), `good`, `bad`, or omitted. **Label every arrow** — an unlabelled arrow says only "related
somehow", where `refused: none left` is the mechanism.

Two to four actors, four to six messages. More than that and the diagram is the transcript rather
than the point of it, and the labels stop fitting.

The `caption` states the one claim the picture makes; it also becomes the figure's accessible label,
so write it as a sentence rather than a title.

### `compare` — before beside after

The workhorse for "what actually changes". Both sides get the same number of lines, and line *n* on
the left is the thing line *n* on the right replaces. That parallelism is the whole point; break it
and the reader has to diff two lists by hand.

**`compare` is ordered by valence, not by logic.** The renderer paints the left column red and the
right green, because its common case is before/after. A non-temporal contrast — two categories, two
strategies — still has to put the losing side on the left, or the colour argues against the words.
If neither side is the worse one, `compare` is the wrong visual; use `bullets`.

```json
{ "type": "compare",
  "before": { "label": "today",    "lines": ["reads stock, charges, then writes", "..."] },
  "after":  { "label": "proposed", "lines": ["reserves first, then charges", "..."] } }
```

3–5 lines per side.

### `code` — the smallest piece of code responsible

```json
{ "type": "code", "file": "src/cart.py",
  "lines": ["if stock_of(item.sku) < item.qty:", "    raise OutOfStock(item.sku)", "charge(payment, cart.total)"],
  "highlight": [3] }
```

`lines` is an array of source lines, copied verbatim — never retyped from memory. `highlight` is
1-based line numbers within that array. Keep it under 12 lines: this is the fragment that makes the
problem obvious, not the function.

### `terminal` — real output

The strongest opening scene for a tool whose failure mode is visible in its own output.

```json
{ "type": "terminal", "file": "$ python -m shop.orders --replay 19:03", "lines": [
  { "text": "19:03:11  order #8822  checkout  -> charged", "tone": "muted" },
  { "text": "SKU-4471  stock: -1", "tone": "bad" }
] }
```

A line is a string or `{ "text": "...", "tone": "muted|good|bad|cool" }`. `file` is the header —
usually the command that produced the output. Under 10 lines; elide with `...` rather than scrolling.

### `bullets` — numbered points

For non-goals and for verification results. Numbered, so use it only where the order means something
or the items are genuinely a set to count. 3–5 items, one line each.

```json
{ "type": "bullets", "items": ["pricing is untouched", "shipping is untouched"] }
```

**Do not put the same visual type in two consecutive scenes.** For the first second of the new
scene the viewer reads a continuation of the previous argument rather than a new one, and the
narration has to fight that. Two `sequence` diagrams in a row is the case that bites; two `bullets`
in a row usually means neither was drawn.

## Scene order that works

Not a template to fill in — a change with no measured result should not have scene 7. But this order
is what a reviewer needs, and departing from it should be a decision:

1. **The failure**, concretely — `terminal` or `code`
2. **What it costs**, and where in the pipeline — `flow`
3. **The cause**, in the smallest code that carries it — `code`
4. **The rule**, before and after — `compare`
5. **The decision it hinges on**, and the escape hatch — `terminal` or `bullets`
6. **Non-goals** — `bullets`
7. **What verification showed, and did not show** — `terminal` or `bullets`
