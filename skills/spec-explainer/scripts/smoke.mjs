#!/usr/bin/env node
// Smoke test for the emitted player. The deliverable of this skill is an HTML
// page, and render.mjs validating the storyboard says nothing about whether that
// page runs — which is how a call to an undeleted helper shipped, fatal to three
// of the six visual types and invisible to the other three.
//
// Renders each storyboard, runs the page's own script in a stub DOM, drives the
// clock forward, and asserts the whole reel was drawn without throwing.
//
// Usage: node smoke.mjs [storyboard.json ...]   (defaults to ../examples/*.json)

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const examples = join(here, '..', 'examples');

function element() {
  const el = {
    _html: '', children: [], classes: new Set(), attrs: {}, style: {},
    textContent: '', title: '', className: '',
    get innerHTML() { return el._html; },
    set innerHTML(v) { el._html = String(v); el.onHtml && el.onHtml(el._html); },
    classList: {
      add: (c) => el.classes.add(c), remove: (c) => el.classes.delete(c),
      toggle: (c, on) => (on ? el.classes.add(c) : el.classes.delete(c)),
      contains: (c) => el.classes.has(c)
    },
    setAttribute: (k, v) => { el.attrs[k] = String(v); },
    getAttribute: (k) => (k in el.attrs ? el.attrs[k] : null),
    addEventListener: (kind, fn) => { (el.handlers[kind] ||= []).push(fn); },
    appendChild: (c) => { el.children.push(c); return c; },
    // Every element the player builds carries at most one child it reads back.
    querySelectorAll: (sel) => {
      const cls = sel.replace('.', '');
      const n = (el._html.match(new RegExp('class="[^"]*\\b' + cls + '\\b', 'g')) || []).length;
      return Array.from({ length: n }, () => element());
    },
    handlers: {}
  };
  Object.defineProperty(el, 'firstChild', { get: () => el.children[0] || element() });
  return el;
}

function run(html, name) {
  const script = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].pop()[1];
  const payload = /<script id="storyboard"[^>]*>([\s\S]*?)<\/script>/.exec(html)[1];
  const scenes = JSON.parse(payload).scenes;

  const drawn = [];
  const byId = {};
  for (const id of ['storyboard', 'scene', 'narration', 'bar', 'play', 'prev', 'next',
                    'speak', 'voice', 'chapter', 'runtime']) byId[id] = element();
  byId.storyboard.textContent = payload;
  byId.scene.onHtml = (h) => drawn.push(h);

  const doc = {
    getElementById: (id) => byId[id] || element(),
    createElement: () => element(),
    addEventListener: () => {}
  };

  let frame = null, clock = 0;
  const ctx = {
    document: doc,
    window: {},                       // no speechSynthesis: the audio path is what ships
    Audio: function () { return { play: () => Promise.resolve(), pause() {}, onended: null, ended: false }; },
    performance: { now: () => clock },
    requestAnimationFrame: (fn) => { frame = fn; return 1; },
    cancelAnimationFrame: () => { frame = null; },
    console, JSON, Math, String, Number, Array, Object, RegExp, Promise
  };
  ctx.window.document = doc;

  const errors = [];
  try { vm.runInNewContext(script, ctx); } catch (e) { errors.push('load: ' + e.message); }

  // Press play, then walk the clock far enough to pass every scene.
  try { byId.play.handlers.click?.[0]?.(); } catch (e) { errors.push('play: ' + e.message); }
  for (let i = 0; i < scenes.length * 4 && frame; i++) {
    const fn = frame; frame = null; clock += 60_000;
    try { fn(clock); } catch (e) { errors.push('tick ' + i + ': ' + e.message); break; }
  }

  const problems = [...errors];
  if (drawn.length < scenes.length) {
    problems.push(`drew ${drawn.length} of ${scenes.length} scenes`);
  }
  drawn.forEach((h, i) => { if (!h.trim()) problems.push(`scene ${i + 1} drew nothing`); });
  if (!byId.narration.textContent) problems.push('narration band is empty');

  const types = scenes.map((s) => s.visual.type).join(', ');
  if (problems.length) {
    console.error(`FAIL  ${name}  [${types}]`);
    problems.forEach((p) => console.error('        ' + p));
    return false;
  }
  console.log(`ok    ${name}  ${drawn.length}/${scenes.length} scenes  [${types}]`);
  return true;
}

const inputs = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(examples).filter((f) => f.endsWith('.json')).map((f) => join(examples, f));

const out = mkdtempSync(join(tmpdir(), 'spec-explainer-smoke-'));
let ok = true;
for (const input of inputs) {
  const html = join(out, basename(input) + '.html');
  execFileSync('node', [join(here, 'render.mjs'), input, html], { stdio: 'pipe' });
  ok = run(readFileSync(html, 'utf8'), basename(input)) && ok;
}
console.log(ok ? 'player smoke: pass' : 'player smoke: FAIL');
process.exit(ok ? 0 : 1);
