# Who is watching

The same change makes three different walkthroughs, and the difference is not length. It is **what
the viewer already has**: an engineer new to the codebase needs the ground before the argument, one
who works in it daily needs the mechanism, and one who has already skimmed the proposal needs the
decision and what it costs.

Resolve the level in step 0 and set it on the storyboard. `intermediate` is the default when nobody
says.

| | `beginner` | `intermediate` | `advanced` |
|---|---|---|---|
| the viewer | new to this codebase or this domain | works here, has not read this change | has skimmed it, deciding whether to approve |
| opens on | what the system does and where this sits in it | the concrete failure | the decision and what it costs |
| vocabulary | defined the first time it appears | assumed | assumed |
| scenes | 8–10 | 6–8 | 5–7 |
| words per scene | ~70 | ~45 | ~55 |
| runtime that follows | 3:20–4:45 | 1:50–2:30 | 1:55–2:40 |

**Runtime is a consequence, not a third target.** Narration is spoken at roughly 2.6 words a second
plus a beat per scene, so the runtime falls out of scenes × words — which means you cannot be inside
the scene budget and the word budget and still be over time. If the runtime is wrong, one of those
two numbers is wrong, and that is what to fix. Earlier drafts of this file stated a runtime that its
own word count could not produce, and the result was a storyboard tightened below its budget until
it stopped explaining.

These numbers are measured against the renderer, not estimated: `intermediate` walkthroughs of 44
and 47 words a scene ran 1:56 and 2:10; a `beginner` one at 68 words a scene ran 3:38.

**The word count is an approximation and the clock is the truth**, because a word's spoken length
depends on the language. In Portuguese `422` is read as five spoken words. A scene naming four HTTP
status codes runs far past what its written length predicts, and there is nothing wrong with it —
`narrate.py` prints the real total, and that is the number to believe.

## What each level spends its scenes on

### `beginner`

**Scene one is orientation, not the failure.** Name the system, say what it is for in one sentence,
and place this change inside it — *the checkout is the last step before money changes hands; this
change is about what happens when two people reach it at the same second.* Only then show what goes
wrong.

Define a term the first time it appears, in the narration, in half a sentence: *an atomic write —
one the database either applies whole or not at all*. Never a glossary scene; the definition
rides along with the thing it explains.

Prefer showing one thing happening slowly over two things at once. Where an intermediate storyboard
compresses cause and consequence into a single `compare`, split them: one scene for what breaks, one
for why that is expensive.

Skip the rejected alternatives and the statistics. They answer questions this viewer is not asking
yet, and each one costs a scene they need for the mechanism.

### `intermediate`

The default, and the one the other two are defined against. Open on the concrete failure. Assume the
vocabulary of the codebase. Carry the mechanism and the one decision the change lives or dies on.

### `advanced`

**Open on the decision, not the failure.** This viewer can read the failure in ten seconds and is
watching to find out whether the reasoning holds. One scene of situation is enough.

Spend the scenes on what an approval actually rests on: the alternatives that were rejected and why,
the trade-off being accepted, what verification established and — especially — what it did not, and
the open questions. A walkthrough that leaves this viewer without the risk section has told them
nothing they could not have skimmed.

Skip orientation and non-goals unless a non-goal is load-bearing for the decision.

## The opening scene, at every level

Whatever the level, **scene one has to stand on its own for someone who has not opened the
proposal.** It names the system, the situation and the failure, in that order, even when that costs
a sentence the author thinks is obvious. The most common defect in a first draft is an opening that
reads perfectly to the person who just read the change and means nothing to anyone else.
