#!/usr/bin/env node
// storyboard.json -> self-contained HTML walkthrough. Zero dependencies.
// Usage: node render.mjs <storyboard.json> [out.html]

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const VISUALS = new Set(['flow', 'sequence', 'compare', 'code', 'terminal', 'bullets']);

function fail(msg) {
  console.error(`render: ${msg}`);
  process.exit(1);
}

/**
 * Rule 8 says nothing this skill produces is committed, and step 0 asks the
 * agent to arrange that. Nothing checked, so a run could leave a megabyte of
 * html and mp3 staged for the next `git add -A`.
 *
 * The storyboard's own directory is what gets checked, not the page's. The mp3s
 * are the bulk and they live beside the storyboard wherever the page is written,
 * and a validation render to /dev/null has no directory worth asking about — so
 * checking the output meant the author heard about this at step 4, one TTS run
 * after it would have been useful.
 */
function checkIgnored(storyboard) {
  const dir = dirname(resolve(storyboard));
  try {
    execFileSync('git', ['check-ignore', '-q', dir], { stdio: 'ignore' });
  } catch (e) {
    if (e.status !== 1) return; // not a repo, or no git: nothing to say
    warn(`${dir} is not gitignored — add .spec-explainer/ to .gitignore, or to ` +
      '.git/info/exclude for no footprint on a tracked file');
  }
}

function mmss(s) {
  return `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;
}

function warn(msg) {
  console.warn(`render: ${msg}`);
}

// A walkthrough for someone new to the codebase needs more scenes than one for
// a reviewer deciding whether to approve, so the budget belongs to the level
// rather than to a single number. See references/levels.md.
const LEVELS = {
  beginner: { scenes: [8, 10], words: 70 },
  intermediate: { scenes: [6, 8], words: 45 },
  advanced: { scenes: [5, 7], words: 55 }
};

function advise(sb) {
  const level = sb.level || 'intermediate';
  const budget = LEVELS[level];
  if (!budget) {
    warn(`unknown level "${level}" — expected ${Object.keys(LEVELS).join(', ')}; using intermediate`);
  }
  const [lo, hi] = (budget || LEVELS.intermediate).scenes;
  const n = sb.scenes.length;
  if (n > hi) {
    warn(`${n} scenes at level "${level}" — the budget is ${lo} to ${hi}; past that you have ` +
      'rebuilt the document in a slower medium');
  } else if (n < lo && !sb.thin) {
    warn(`${n} scenes at level "${level}" — the budget is ${lo} to ${hi}. If the change genuinely ` +
      'has no middle, set "thin": true and this stops being a warning');
  }

  // A narration squeezed under its budget stops explaining and starts referring.
  const target = (budget || LEVELS.intermediate).words;
  sb.scenes.forEach((s, i) => {
    const words = String(s.narration).trim().split(/\s+/).length;
    if (words < target * 0.7) {
      warn(`scene ${i + 1}: ${words} words against ~${target} for "${level}" — a narration this ` +
        'short usually names a thing instead of saying what it is');
    }
  });

  // The runtime is what drives every edit an author makes, and it was the one
  // number printed without ever being flagged. Its ceiling is derived from the
  // level's own two budgets, so it can never disagree with them.
  const ceiling = hi * seconds({ narration: 'w '.repeat(target) });
  const total = sb.scenes.reduce((n, s) => n + seconds(s), 0);
  if (total > ceiling) {
    warn(`${mmss(total)} runs past ~${mmss(ceiling)} for "${level}" — change the scene count or ` +
      'the words per scene, rather than tightening narrations to chase the clock');
  }
  sb.scenes.forEach((s, i) => {
    if (s.visual.type !== 'compare') return;
    const a = s.visual.before.lines.length, b = s.visual.after.lines.length;
    if (a !== b) {
      warn(`scene ${i + 1}: compare has ${a} lines against ${b} — line n on the left should be ` +
        'what line n on the right replaces, or the reader diffs two lists by hand');
    }
  });
}

function validate(sb) {
  if (!sb || typeof sb !== 'object') fail('storyboard is not an object');
  if (!sb.title) fail('missing "title"');
  if (!Array.isArray(sb.scenes) || sb.scenes.length === 0) fail('missing "scenes"');
  sb.scenes.forEach((s, i) => {
    const at = `scene ${i + 1}`;
    if (!s.title) fail(`${at}: missing "title"`);
    if (!s.narration) fail(`${at}: missing "narration"`);
    if (!s.visual || !VISUALS.has(s.visual.type)) {
      fail(`${at}: "visual.type" must be one of ${[...VISUALS].join(', ')}`);
    }
    if (s.visual.type === 'flow' && !Array.isArray(s.visual.nodes)) fail(`${at}: flow needs "nodes"`);
    if (s.visual.type === 'sequence') {
      if (!Array.isArray(s.visual.actors) || s.visual.actors.length < 2) {
        fail(`${at}: sequence needs at least two "actors"`);
      }
      if (!Array.isArray(s.visual.messages) || !s.visual.messages.length) {
        fail(`${at}: sequence needs "messages"`);
      }
      s.visual.messages.forEach((m, j) => {
        const n = s.visual.actors.length;
        if (!(m.from >= 0 && m.from < n) || !(m.to >= 0 && m.to < n)) {
          fail(`${at}: message ${j + 1} points outside the actor list`);
        }
      });
    }
    if (s.visual.type === 'compare' && (!s.visual.before || !s.visual.after)) {
      fail(`${at}: compare needs "before" and "after"`);
    }
    if (s.visual.type === 'code' && !Array.isArray(s.visual.lines)) fail(`${at}: code needs "lines"`);
    if (s.visual.type === 'terminal' && !Array.isArray(s.visual.lines)) fail(`${at}: terminal needs "lines"`);
    if (s.visual.type === 'bullets' && !Array.isArray(s.visual.items)) fail(`${at}: bullets needs "items"`);
  });
}

// Narration read aloud at ~2.6 words/sec, plus a beat to let the visual land.
function seconds(scene) {
  if (typeof scene.seconds === 'number') return scene.seconds;
  const words = String(scene.narration).trim().split(/\s+/).length;
  return Math.max(5, Math.round(words / 2.6 + 1.8));
}

const [, , input, output] = process.argv;
if (!input) fail('usage: node render.mjs <storyboard.json> [out.html]');

let sb;
try {
  sb = JSON.parse(readFileSync(input, 'utf8'));
} catch (e) {
  fail(`cannot read ${input}: ${e.message}`);
}
validate(sb);
advise(sb);
checkIgnored(input);
sb.scenes.forEach((s) => { s.seconds = seconds(s); });

// Inline the narration so the page stays a single file. The storyboard keeps
// the paths and stays readable in a diff; only the rendered HTML carries bytes.
const base = dirname(resolve(input));
let audioBytes = 0;
const silent = [];
for (const s of sb.scenes) {
  delete s.audio_sig;
  if (!s.audio) continue;
  const file = resolve(base, s.audio);
  if (!existsSync(file)) {
    silent.push(s.title);
    delete s.audio;
    continue;
  }
  const buf = readFileSync(file);
  audioBytes += buf.length;
  s.audio = `data:audio/mpeg;base64,${buf.toString('base64')}`;
}

if (silent.length) {
  warn(`${silent.length} scene${silent.length > 1 ? 's have' : ' has'} no audio and will fall back ` +
    `to the browser's own voices — run narrate.py first (${silent[0]}${silent.length > 1 ? ', …' : ''})`);
}

const out = output || input.replace(/\.json$/, '') + '.html';
const runtime = sb.scenes.reduce((n, s) => n + s.seconds, 0);
const payload = JSON.stringify(sb).replace(/</g, '\\u003c');

writeFileSync(out, page(sb, payload, runtime));
const total = mmss(runtime);
const voice = audioBytes ? `, ${sb.voice} (${Math.round(audioBytes / 1024)} KB)` : ', no audio';
console.log(`${basename(out)} — ${sb.scenes.length} scenes, ${total}${voice}`);

function page(sb, payload, runtime) {
  return `<title>${esc(sb.title)}</title>
<style>
/* Committed single-theme player: a dark stage, painted explicitly so it holds
   on either host ground. Amber accent, blue-biased neutrals. */
:root {
  color-scheme: dark;
  --ground:#0E1116; --panel:#161B22; --panel-2:#1C232C; --rule:#252E3A;
  --ink:#D9DFE8; --ink-dim:#8A94A6; --ink-faint:#5C6678;
  --accent:#F2A03D; --accent-soft:rgba(242,160,61,.14);
  --good:#3FBF7F; --bad:#E5534B; --cool:#5AA9E6;
  /* System stacks only: this page is meant to be emailed and opened offline,
     and a webfont turns that into a network request that may not land. */
  --sans:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
  --mono:ui-monospace,'SF Mono','Cascadia Mono','Segoe UI Mono','Roboto Mono',Menlo,Consolas,monospace;
}
* { box-sizing:border-box; }
body { margin:0; background:var(--ground); color:var(--ink); font-family:var(--sans); }
.wrap { max-width:1080px; margin:0 auto; padding:28px 20px 56px; display:flex; flex-direction:column; gap:18px; }

header { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
.eyebrow { font-family:var(--mono); font-size:11px; letter-spacing:.14em; text-transform:uppercase;
  color:var(--accent); border:1px solid var(--accent-soft); background:var(--accent-soft);
  padding:3px 8px; border-radius:3px; }
h1 { font-size:22px; font-weight:600; margin:0; letter-spacing:-.01em; text-wrap:balance; }
.level { font-family:var(--mono); font-size:11px; color:var(--ink-dim);
  border:1px solid var(--rule); border-radius:3px; padding:3px 8px; }
.meta { font-family:var(--mono); font-size:12px; color:var(--ink-faint); margin-left:auto;
  font-variant-numeric:tabular-nums; }

/* Stage: fixed 16:9 so a scene never reflows the page as it advances. */
.stage { position:relative; aspect-ratio:16/9; background:var(--panel); border:1px solid var(--rule);
  border-radius:10px; overflow:hidden; }
.scene { position:absolute; inset:0; padding:38px 44px; display:flex; flex-direction:column; gap:22px;
  overflow:auto; }
.scene-title { font-size:19px; font-weight:600; letter-spacing:-.01em; text-wrap:balance; flex:none; }
.scene-body { flex:1; min-height:0; display:flex; flex-direction:column; justify-content:center; gap:16px; }
.fx { opacity:0; transform:translateY(6px);
  transition:opacity .38s cubic-bezier(.2,.7,.3,1), transform .38s cubic-bezier(.2,.7,.3,1); }
.fx.on { opacity:1; transform:none; }

/* flow — the pipeline, one block at a time */
.flow { display:flex; align-items:stretch; gap:0; flex-wrap:wrap; }
.fnode { flex:1 1 0; min-width:120px; background:var(--panel-2); border:1px solid var(--rule);
  border-radius:8px; padding:14px 12px; display:flex; flex-direction:column; gap:6px; }
.fnode b { font-size:13px; font-weight:600; font-family:var(--mono); }
.fnode span { font-size:11.5px; color:var(--ink-dim); line-height:1.45; }
.fnode.active { border-color:var(--accent); background:var(--accent-soft); box-shadow:0 0 0 1px var(--accent); }
.fnode.active b { color:var(--accent); }
.fnode.bad { border-color:var(--bad); } .fnode.bad b { color:var(--bad); }
.fnode.good { border-color:var(--good); } .fnode.good b { color:var(--good); }
.farrow { flex:none; width:74px; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:2px; color:var(--ink-faint); font-family:var(--mono); font-size:14px; }
.farrow em { font-style:normal; font-size:9.5px; line-height:1.25; text-align:center;
  letter-spacing:.02em; }
.farrow.blocked { color:var(--bad); }

/* sequence — actors, lifelines, and the messages between them */
.seqfig { margin:0; display:flex; flex-direction:column; gap:10px; }
.seqfig svg { width:100%; max-width:100%; height:auto; color:var(--ink-dim); }
.seqfig figcaption { font-size:11.5px; color:var(--ink-faint); text-align:center; }
.seq-actor { fill:var(--panel-2); stroke:var(--rule); }
.seq-name { fill:var(--ink); font-size:11.5px; font-weight:600; }
.seq-life { stroke:var(--rule); stroke-dasharray:3 4; }
.seq-label { font-size:11px; fill:var(--ink-dim); }
.seq-msg { stroke:currentColor; }
.seq-ok .seq-msg { stroke:var(--cool); } .seq-ok .seq-label { fill:var(--cool); }
.seq-bad .seq-msg { stroke:var(--bad); } .seq-bad .seq-label { fill:var(--bad); }
.seq-good .seq-msg { stroke:var(--good); } .seq-good .seq-label { fill:var(--good); }

/* compare — before beside after */
.compare { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
.col { border:1px solid var(--rule); border-radius:8px; overflow:hidden; background:var(--panel-2); }
.col-head { font-family:var(--mono); font-size:11px; letter-spacing:.1em; text-transform:uppercase;
  padding:8px 12px; border-bottom:1px solid var(--rule); color:var(--ink-dim); }
.col.is-before .col-head { color:var(--bad); } .col.is-after .col-head { color:var(--good); }
.col ul { margin:0; padding:12px 12px 14px 28px; display:flex; flex-direction:column; gap:8px; }
.col li { font-size:13px; line-height:1.5; }

/* code + terminal */
.code { border:1px solid var(--rule); border-radius:8px; background:#0B0E13; overflow:hidden; }
.code-head { font-family:var(--mono); font-size:11px; color:var(--ink-faint); padding:7px 12px;
  border-bottom:1px solid var(--rule); }
pre { margin:0; padding:14px 0; overflow-x:auto; font-family:var(--mono); font-size:12.5px; line-height:1.65; }
pre .ln { display:block; padding:0 16px; white-space:pre; }
pre .ln.hl { background:var(--accent-soft); box-shadow:inset 2px 0 0 var(--accent); }
.term .ln.muted { color:var(--ink-faint); }
.term .ln.good { color:var(--good); }
.term .ln.bad { color:var(--bad); }
.term .ln.cool { color:var(--cool); }

/* bullets */
.bullets { display:flex; flex-direction:column; gap:12px; }
.bullet { display:flex; gap:12px; align-items:flex-start; font-size:14.5px; line-height:1.55; }
.bullet i { flex:none; font-family:var(--mono); font-size:11px; color:var(--accent); font-style:normal;
  border:1px solid var(--rule); border-radius:4px; padding:2px 6px; margin-top:1px; }

/* narration band */
.narration { min-height:74px; background:var(--panel); border:1px solid var(--rule); border-radius:8px;
  padding:16px 18px; font-size:14.5px; line-height:1.6; color:var(--ink); display:flex; align-items:center; }

/* transport */
.bar { display:flex; gap:4px; }
.seg { height:5px; border-radius:2px; background:var(--rule); overflow:hidden; cursor:pointer;
  border:0; padding:0; }
.seg:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
.seg i { display:block; height:100%; width:0; background:var(--accent); }
.seg.done i { width:100%; }
.controls { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
button.ctl { font-family:var(--mono); font-size:12px; color:var(--ink); background:var(--panel);
  border:1px solid var(--rule); border-radius:6px; padding:7px 12px; cursor:pointer; }
button.ctl:hover { border-color:var(--ink-faint); }
button.ctl:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
button.ctl[aria-pressed="true"] { border-color:var(--accent); color:var(--accent); }
select.ctl { max-width:230px; text-overflow:ellipsis; }
.chapter { font-family:var(--mono); font-size:12px; color:var(--ink-dim); margin-left:auto;
  font-variant-numeric:tabular-nums; }
.hint { font-family:var(--mono); font-size:11px; color:var(--ink-faint); }
@media (max-width:720px) {
  .scene { padding:22px 20px; } .compare { grid-template-columns:1fr; }
  .flow { flex-direction:column; } .farrow { width:auto; height:20px; transform:rotate(90deg); }
}
@media (prefers-reduced-motion:reduce) { .fx { transition:none; } }
</style>

<div class="wrap" lang="${esc(sb.lang || 'en-US')}">
  <header>
    <span class="eyebrow">${esc(sb.kind || 'spec walkthrough')}</span>
    ${sb.level ? `<span class="level">for ${/^[aeiou]/i.test(sb.level) ? 'an' : 'a'} ${esc(sb.level)} audience</span>` : ''}
    <h1>${esc(sb.title)}</h1>
    <span class="meta" id="runtime"></span>
  </header>

  <div class="stage"><div class="scene" id="scene"></div></div>
  <div class="narration" id="narration"></div>
  <div class="bar" id="bar"></div>

  <div class="controls">
    <button class="ctl" id="play" aria-label="Play or pause">&#9654;&#65038; play</button>
    <button class="ctl" id="prev" aria-label="Previous scene">&#8592; prev</button>
    <button class="ctl" id="next" aria-label="Next scene">next &#8594;</button>
    <button class="ctl" id="speak" aria-pressed="${sb.scenes.some((s) => s.audio) ? 'true' : 'false'}" aria-label="Read narration aloud">narrate</button>
    <select class="ctl" id="voice" aria-label="Narration voice"></select>
    <span class="chapter" id="chapter"></span>
  </div>
  <p class="hint">space plays and pauses &middot; arrow keys move between scenes${sb.voice ? ' &middot; voice: ' + esc(sb.voice) : ''}${sb.source ? ' &middot; source: ' + esc(sb.source) : ''}</p>
</div>

<script id="storyboard" type="application/json">${payload}</script>
<script>
(function () {
  const SB = JSON.parse(document.getElementById('storyboard').textContent);
  const scenes = SB.scenes;
  const total = ${runtime};
  const el = {
    scene: document.getElementById('scene'), narration: document.getElementById('narration'),
    bar: document.getElementById('bar'), play: document.getElementById('play'),
    chapter: document.getElementById('chapter'), runtime: document.getElementById('runtime'),
    speak: document.getElementById('speak')
  };
  const mmss = (s) => Math.floor(s / 60) + ':' + String(Math.round(s) % 60).padStart(2, '0');
  el.runtime.textContent = scenes.length + ' scenes \\u00b7 ' + mmss(total);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const segs = scenes.map((s, i) => {
    const b = document.createElement('button');
    b.className = 'seg'; b.style.flex = s.seconds + ' 1 0';
    b.title = (i + 1) + '. ' + s.title;
    b.setAttribute('aria-label', 'Scene ' + (i + 1) + ': ' + s.title);
    b.innerHTML = '<i></i>';
    b.addEventListener('click', () => go(i));
    el.bar.appendChild(b);
    return b;
  });

  // Every .fx element is revealed in DOM order against the narration's beats,
  // so the picture assembles as the voice explains it rather than all at once.
  function draw(v) {
    if (v.type === 'flow') {
      const parts = [];
      v.nodes.forEach((n, i) => {
        if (i) {
          const e = (v.edges || [])[i - 1] || {};
          const blocked = e.state === 'blocked';
          parts.push('<div class="farrow fx' + (blocked ? ' blocked' : '') + '">' +
            (e.label ? '<em>' + esc(e.label) + '</em>' : '') +
            (blocked ? '&#10005;' : '&#8594;') + '</div>');
        }
        parts.push('<div class="fnode ' + (n.state || '') + ' fx"><b>' + esc(n.label) + '</b>' +
          (n.note ? '<span>' + esc(n.note) + '</span>' : '') + '</div>');
      });
      return '<div class="flow">' + parts.join('') + '</div>';
    }
    if (v.type === 'sequence') return sequence(v);
    if (v.type === 'compare') {
      const col = (side, cls, i) => '<div class="col ' + cls + ' fx"><div class="col-head">' +
        esc(side.label) + '</div><ul>' + side.lines.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul></div>';
      return '<div class="compare">' + col(v.before, 'is-before', 0) + col(v.after, 'is-after', 1) + '</div>';
    }
    if (v.type === 'code') {
      const hl = new Set(v.highlight || []);
      const body = v.lines.map((l, i) =>
        '<span class="ln' + (hl.has(i + 1) ? ' hl' : '') + '">' + (esc(l) || ' ') + '</span>').join('');
      return '<div class="code fx">' + (v.file ? '<div class="code-head">' + esc(v.file) + '</div>' : '') +
        '<pre>' + body + '</pre></div>';
    }
    if (v.type === 'terminal') {
      const body = v.lines.map((l, i) => {
        const t = typeof l === 'string' ? { text: l } : l;
        return '<span class="ln ' + (t.tone || '') + ' fx">' + (esc(t.text) || ' ') + '</span>';
      }).join('');
      return '<div class="code term fx">' +
        '<div class="code-head">' + esc(v.file || '$') + '</div><pre>' + body + '</pre></div>';
    }
    return '<div class="bullets">' + v.items.map((t, i) =>
      '<div class="bullet fx"><i>' + String(i + 1).padStart(2, '0') + '</i><div>' + esc(t) + '</div></div>'
    ).join('') + '</div>';
  }

  function sequence(v) {
    const actors = v.actors, msgs = v.messages;
    const W = 780, col = W / actors.length, x = (i) => Math.round(col * (i + 0.5));
    const head = 34, gap = 44, H = head + msgs.length * gap + 22;
    const boxW = Math.min(col - 20, 190);
    const parts = [];

    parts.push('<g class="fx">');
    actors.forEach((name, i) => {
      parts.push('<rect class="seq-actor" x="' + (x(i) - boxW / 2) + '" y="2" width="' + boxW +
        '" height="26" rx="6"/>' +
        '<text class="seq-name" x="' + x(i) + '" y="19" text-anchor="middle">' + esc(name) + '</text>' +
        '<line class="seq-life" x1="' + x(i) + '" y1="30" x2="' + x(i) + '" y2="' + (H - 8) + '"/>');
    });
    parts.push('</g>');

    msgs.forEach((m, i) => {
      const y = head + i * gap + 24;
      const cls = 'seq-' + (m.state || 'plain');
      const label = '<text class="seq-label" text-anchor="middle"';
      if (m.from === m.to) {
        // A loop always drew rightwards, so one on the last actor put its label
        // in the few pixels left before the viewBox ended and the label was cut
        // in half. Loops in the right half turn inward, where the label has the
        // whole diagram to run into.
        const x0 = x(m.from), inward = x0 > W / 2 ? -42 : 42;
        parts.push('<g class="fx ' + cls + '">' +
          '<path class="seq-msg" fill="none" d="M' + x0 + ' ' + (y - 8) + ' h' + inward +
            ' v14 h' + -inward + '" marker-end="url(#a)"/>' +
          label + ' x="' + (x0 + inward + (inward < 0 ? -8 : 8)) + '" y="' + (y - 12) +
          '" style="text-anchor:' + (inward < 0 ? 'end' : 'start') + '">' +
          esc(m.label) + '</text></g>');
      } else {
        const x1 = x(m.from), x2 = x(m.to);
        const dir = x2 > x1 ? -7 : 7;
        parts.push('<g class="fx ' + cls + '">' +
          '<line class="seq-msg" x1="' + x1 + '" y1="' + y + '" x2="' + (x2 + dir) + '" y2="' + y +
            '" marker-end="url(#a)"/>' +
          label + ' x="' + Math.round((x1 + x2) / 2) + '" y="' + (y - 7) + '">' +
          esc(m.label) + '</text></g>');
      }
    });

    const claim = v.caption || (actors.join(' \u2192 ') + ': ' + msgs.length + ' messages');
    return '<figure class="seqfig">' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(claim) + '">' +
      '<defs><marker id="a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" ' +
        'orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z" fill="currentColor"/></marker></defs>' +
      parts.join('') + '</svg>' +
      (v.caption ? '<figcaption>' + esc(v.caption) + '</figcaption>' : '') +
      '</figure>';
  }

  let idx = -1, playing = false, t0 = 0, elapsed = 0, raf = 0, reveal = [];

  // A scene assembles in step with the narration: "beats" holds the second each
  // sentence starts speaking, measured from the generated audio. Elements are
  // spread across those beats in DOM order, so the box the voice is describing
  // is the box that just appeared. With nothing playing, the scene is shown
  // whole — a paused or stepped-through scene must never be half drawn.
  function schedule(scene) {
    const nodes = Array.prototype.slice.call(el.scene.querySelectorAll('.fx'));
    const beats = scene.beats || [];
    reveal = nodes.map((node, i) => ({
      node: node,
      at: beats.length ? beats[Math.min(beats.length - 1, Math.floor((i * beats.length) / nodes.length))]
                       : i * 0.35
    }));
    if (!playing) showAll();
  }

  function showAll() { reveal.forEach((r) => r.node.classList.add('on')); }

  function render(i) {
    const s = scenes[i];
    el.scene.innerHTML = '<div class="scene-title fx">' + esc(s.title) + '</div>' +
      '<div class="scene-body">' + draw(s.visual) + '</div>';
    schedule(s);
    el.narration.textContent = s.narration;
    el.chapter.textContent = (i + 1) + ' / ' + scenes.length + '  \\u00b7  ' + s.title;
    segs.forEach((b, j) => {
      b.classList.toggle('done', j < i);
      b.firstChild.style.width = j < i ? '100%' : '0';
    });
    if (el.speak.getAttribute('aria-pressed') === 'true') narrate(i);
  }

  function go(i) {
    if (i < 0 || i >= scenes.length) { pause(); return; }
    idx = i; elapsed = 0; t0 = performance.now(); render(i);
  }

  function tick(now) {
    if (!playing) return;
    const dur = scenes[idx].seconds * 1000;
    const t = (now - t0) / 1000;
    const p = Math.min(1, (t * 1000) / dur);
    segs[idx].firstChild.style.width = (p * 100) + '%';
    for (let k = 0; k < reveal.length; k++) {
      if (t >= reveal[k].at) reveal[k].node.classList.add('on');
    }
    if (p >= 1 && !speaking) {
      if (idx === scenes.length - 1) { pause(); segs[idx].classList.add('done'); return; }
      go(idx + 1);
    }
    raf = requestAnimationFrame(tick);
  }

  function play() {
    if (idx === scenes.length - 1 && !playing) {
      const last = segs[idx].firstChild;
      if (parseFloat(last.style.width) >= 100) go(0);
    }
    playing = true; t0 = performance.now() - elapsed;
    el.play.innerHTML = '&#10073;&#10073; pause';
    if (el.speak.getAttribute('aria-pressed') === 'true' && !resumeNarration()) narrate(idx);
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    playing = false; elapsed = performance.now() - t0; cancelAnimationFrame(raf);
    el.play.innerHTML = '&#9654;&#65038; play';
    showAll();
    pauseNarration();
  }
  function toggle() { playing ? pause() : play(); }

  // Which voices exist depends on the browser and the OS, and the default is
  // whatever the system picked — frequently an English voice reading this text.
  // Rank what is available for the storyboard's language, and let the viewer override.
  const LANG = SB.lang || 'en-US';
  const HAS_AUDIO = scenes.some((s) => s.audio);
  const sel = document.getElementById('voice');
  let voices = [], speaking = false, audioEl = null;

  function rank(v) {
    const lang = (v.lang || '').toLowerCase().replace('_', '-');
    const name = (v.name || '').toLowerCase();
    let s = 0;
    if (lang.slice(0, 2) === LANG.toLowerCase().slice(0, 2)) s += 100;
    if (lang === LANG.toLowerCase()) s += 40;
    if (/natural|neural|online/.test(name)) s += 30;  // Edge/Windows neural voices
    if (v.localService === false) s += 12;            // Chrome's remote Google voices
    return s;
  }

  function loadVoices() {
    // Baked narration needs no picker — the voice was chosen when it was rendered.
    if (HAS_AUDIO) { sel.hidden = true; return; }
    if (!window.speechSynthesis) { sel.hidden = true; el.speak.hidden = true; return; }
    voices = speechSynthesis.getVoices().slice().sort((a, b) => rank(b) - rank(a));
    sel.innerHTML = voices.length
      ? voices.map((v, i) => '<option value="' + i + '">' + esc(v.name) + ' \u00b7 ' + esc(v.lang) + '</option>').join('')
      : '<option>no voices installed</option>';
  }

  function narrate(i) {
    stopNarration();
    const scene = scenes[i];
    if (scene.audio) {
      audioEl = new Audio(scene.audio);
      speaking = true;
      audioEl.onended = () => { speaking = false; };
      // The browser blocks audio until the viewer has interacted; the play
      // button is that interaction, so a rejection here is expected at load.
      audioEl.play().catch(() => { speaking = false; });
      return;
    }
    if (!window.speechSynthesis) return;
    // Chrome truncates an utterance past roughly fifteen seconds. One per
    // sentence avoids that, and gives the pauses a paragraph is supposed to have.
    const v = voices[Number(sel.value) || 0];
    const parts = (String(scene.narration).match(/[^.!?]+[.!?]*/g) || [scene.narration])
      .map((t) => t.trim()).filter(Boolean);
    speaking = true;
    parts.forEach((part, j) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = v ? v.lang : LANG;
      if (v) u.voice = v;
      u.rate = 1;
      if (j === parts.length - 1) u.onend = () => { speaking = false; };
      speechSynthesis.speak(u);
    });
  }

  function pauseNarration() {
    if (audioEl) audioEl.pause();
    else if (window.speechSynthesis && speechSynthesis.speaking) speechSynthesis.pause();
  }

  function resumeNarration() {
    if (audioEl && !audioEl.ended) { audioEl.play().catch(() => {}); return true; }
    if (window.speechSynthesis && speechSynthesis.paused) { speechSynthesis.resume(); return true; }
    return false;
  }

  function stopNarration() {
    speaking = false;
    if (audioEl) { audioEl.pause(); audioEl = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
  }

  el.play.addEventListener('click', toggle);
  document.getElementById('prev').addEventListener('click', () => { go(Math.max(0, idx - 1)); });
  document.getElementById('next').addEventListener('click', () => { go(Math.min(scenes.length - 1, idx + 1)); });
  el.speak.addEventListener('click', () => {
    const on = el.speak.getAttribute('aria-pressed') !== 'true';
    el.speak.setAttribute('aria-pressed', String(on));
    if (on) narrate(idx); else stopNarration();
  });
  sel.addEventListener('change', () => {
    if (el.speak.getAttribute('aria-pressed') === 'true') narrate(idx);
  });
  loadVoices();
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = loadVoices;
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'BUTTON' && e.key === ' ') return;
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    if (e.key === 'ArrowRight') go(Math.min(scenes.length - 1, idx + 1));
    if (e.key === 'ArrowLeft') go(Math.max(0, idx - 1));
  });

  go(0);
})();
</script>
`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
