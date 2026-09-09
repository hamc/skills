# Reading a change, whichever framework wrote it

Spec-driven frameworks disagree about directory names and file names. They agree about the three
documents a walkthrough needs, because those three are what a reviewer needs:

| role | what it carries | what the storyboard takes from it |
|---|---|---|
| **the argument** | why this exists, what is wrong today, what is deliberately out of scope | scene 1, and the non-goals scene |
| **the decisions** | the reasoning, the alternatives that were rejected and why | the middle scenes — this is where the value is |
| **the verification** | what was built, what was measured, what is still open | the closing scene |

Everything else in this skill is framework-neutral. Only the mapping below is not.

## Known layouts

### OpenSpec

```
openspec/changes/<name>/          # active
openspec/changes/archive/<dated>/ # landed
```

| role | file |
|---|---|
| argument | `proposal.md` |
| decisions | `design.md` |
| verification | `tasks.md` |
| contract | `specs/<capability>/spec.md` — requirements and scenarios |

The richest of the layouts here: `design.md` carries `## Decisions`, `## Rejected alternatives`,
`## Risks / Trade-offs` and `## Open Questions` as named sections, which map almost one-to-one onto
scenes.

### spec-kit

```
specs/<NNN>-<slug>/
```

| role | file |
|---|---|
| argument | `spec.md` |
| decisions | `plan.md`, and `research.md` where it exists |
| verification | `tasks.md` |
| contract | `contracts/` where it exists |

**`plan.md` is not where the argument is — read `research.md` before concluding anything about this
change.** `plan.md` is mechanical by template: Summary, Technical Context, Constitution Check,
Project Structure. `research.md` is where decisions and rejected alternatives land, and when it is
present it is often richer than an OpenSpec `design.md`. Judging depth from `plan.md` alone predicts
a thin walkthrough for a change that has plenty to say.

Only when *neither* file carries a decision with an alternative that was rejected does this change
have no middle, and then the honest output is four scenes instead of seven. **Set `"thin": true` on
the storyboard when you make that call** — otherwise the renderer warns about the scene count, and
the skill ends up arguing with itself: telling you four honest scenes beat seven padded ones, then
flagging the four.

**Two traps specific to this layout:**

- **There is no non-goals document.** `spec.md` has no out-of-scope section, so the non-goals scene
  the recommended order suggests has nothing to draw on. The nearest material is `plan.md`'s
  Constitution Check, which is a set of constraints rather than a list of exclusions. Drop the scene
  rather than inventing one — and decide that in step 1, not in scene six.
- **`plan.md`'s Project Structure block is aspirational.** It is a plan: its file tree lists files the
  change intends to create, and some of them will not exist. It is exactly the shape that gets copied
  into a `flow` visual. Check each path against the working tree before drawing it.

### Anything else

Ask two questions and write the answers down in this file:

1. Which directory holds one change?
2. Which file carries the argument, which the decisions, which the verification?

A framework that has no decisions document is one where this skill produces a summary rather than an
explanation. Say that to the person instead of discovering it in scene four.

## Detecting which one

```bash
ls -d openspec/changes 2>/dev/null          # OpenSpec
ls -d specs/[0-9]*-*/ 2>/dev/null | head -3 # spec-kit
```

If both match, ask. If neither does, ask. Never infer a layout from a single file that happens to be
named `spec.md` — `specs/` is a common directory name that predates all of these tools.
