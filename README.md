# skills

Agent skills, laid out so the [`skills`](https://github.com/vercel-labs/skills) CLI installs them
into whichever agent you use.

```bash
npx skills@latest add hamc/skills
```

No registration and no publishing step: the CLI walks `skills/<name>/SKILL.md` in any public
repository and writes each skill into the directory your agent reads — `.claude/skills/` for Claude
Code, `.agents/skills/` for Cursor and Codex, and so on. The files land in your repo as ordinary
files you own and can edit; pull later changes when you want them with `npx skills update`.

## Skills

- **[spec-explainer](./skills/spec-explainer/SKILL.md)** — turn a spec-driven change into a narrated
  walkthrough, so someone who did not write the proposal can understand what it argues. Reads
  [OpenSpec](https://github.com/Fission-AI/OpenSpec) and [spec-kit](https://github.com/github/spec-kit)
  layouts. Generates its own voice-over with no API key, in **the language your team reads** — which
  is often not the language the specs are written in — and pitched at **the audience you name**:
  `beginner` opens on what the system does, `intermediate` on the failure, `advanced` on the decision
  and what it costs.
  [Prerequisites and how it works →](./skills/spec-explainer/README.md)

## License

MIT
