#!/usr/bin/env node
/**
 * ADR 0164: "talk" is retired. A window the desktop application opens is a
 * Space window, what a person is told about is a Space, the directory and its
 * run are an Aggregate, and what is being presented is a presentation of a
 * presented Graph.
 *
 * Tracked so a branch in flight replays it rather than hand-merging. It follows
 * the mask / rewrite / unmask design of
 * `.scratch/thing-and-diagram/rename-layout-to-diagram.mjs`; read that header
 * for the design.
 *
 * Usage:
 *   node .scratch/talk-to-space/rename-talk.mjs [--dry] [--log]
 *   pnpm exec prettier --write .
 *   cargo fmt --all
 *
 * The word had three senses, so the replacement is chosen by where it stands:
 *   - a file that presents (`PRESENTING`): the presented Graph, a presentation;
 *   - a file a person reads or a string a person is shown (`USER_FACING`): Space;
 *   - everywhere else, prose and identifiers: Aggregate;
 *   - a directory name, a repository name or a Title in a fixture: space.
 *
 * NOT produced here; a branch replaying this takes them from the merge:
 *   - `git mv packages/desktop/src-tauri/src/talks.rs …/aggregates.rs`;
 *   - the conformance asset whose name is the hash of its changed bytes
 *     (`conformance/intake/directory/accepted-markdown/aggregate/assets/`), and
 *     the key `packages/desktop/src-tauri/src/address/tests.rs` expects for the
 *     renamed folder;
 *   - the sentences rewritten by hand after the sweep: `CONTEXT.md`, `README.md`,
 *     `docs/requirements/`, the shell's dialogs, and the Notes window's view;
 *   - ADR 0164, the plugin manifests' version, and this rename's guard block in
 *     `test/unit/current-domain-vocabulary.test.ts`.
 */

import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const dryRun = process.argv.includes('--dry');
const log = process.argv.includes('--log');

/** The trees the vocabulary guard excludes as history, and files not ours to sweep. */
const EXCLUDED = [
  /^docs\/adr\/(?!README\.md$)/,
  /^docs\/superpowers\//,
  // Dated rulings, kept as they were recorded.
  /^docs\/requirements\/DECISIONS\.md$/,
  /^docs\/requirements\/conflicts\//,
  /^\.scratch\//,
  /^pnpm-lock\.yaml$/,
  /^skills-lock\.json$/,
  /^Cargo\.lock$/,
  /^\.agents\/skills\/shadcn\//,
  /^test\/unit\/current-domain-vocabulary\.test\.ts$/,
  /\.(png|jpg|jpeg|gif|ico|icns|woff2?|svg|webp|pdf)$/,
];

/** Files in which the word meant the Graph being presented. */
const PRESENTING = [
  /^packages\/graph\/src\/presentation-notes\.ts$/,
  /^packages\/graph\/src\/index\.ts$/,
  /^packages\/graph\/test\/presentation-notes\.test\.ts$/,
  /^packages\/app\/src\/(notes-window|navigation|presenting-window|presenting-commands|key-bindings)\.ts$/,
  /^packages\/app\/src\/components\/(NotesWindow|PresentedNotesList)\.tsx$/,
  /^packages\/app\/src\/components\/notes-window\.css$/,
  /^packages\/app\/test\/(notes-window|presentation-link|presenting-window)\.test\.ts$/,
  /^packages\/app\/test\/SpaceApp\.test\.tsx$/,
  /^packages\/app\/e2e\/(notes-window|presenting)\.spec\.ts$/,
  /^packages\/app\/ladle-e2e\/notes-window\.spec\.ts$/,
  /^packages\/app\/stories\//,
  /^docs\/requirements\/navigation\.md$/,
  /^CONTEXT\.md$/,
];

/** Files a person reads, and source whose strings a person is shown. */
const USER_FACING = [
  /^README\.md$/,
  /^docs\/deploy-cloudflare\.md$/,
  /^docs\/aggregate-directory\.md$/,
  /^docs\/requirements\/ui\.md$/,
  /^plugins\//,
  /^\.claude-plugin\//,
  /^packages\/desktop\/ui\//,
  /^packages\/app\/src\/mount/,
  /^packages\/app\/src\/mounted-edits\.ts$/,
  /^src\/desktop\//,
  /^src\/mcp\//,
  /^src\/startup\//,
  /^src\/cli\//,
];

const classOf = (file) =>
  PRESENTING.some((p) => p.test(file))
    ? 'presenting'
    : USER_FACING.some((p) => p.test(file))
      ? 'user'
      : 'internal';

const NOUN = {
  presenting: { one: 'presentation', many: 'presentations', a: 'a', A: 'A', code: 'presented' },
  user: { one: 'Space', many: 'Spaces', a: 'a', A: 'A', code: 'aggregate' },
  internal: { one: 'Aggregate', many: 'Aggregates', a: 'an', A: 'An', code: 'aggregate' },
};

/** Spellings that keep the word: a verb, and a cited historical file. */
const KEEP = [
  /\btalks\s+(?:to|about|with)\b/g,
  /\btalking\b/g,
  /\b\d{4}-[a-z0-9-]*talk[a-z0-9-]*/g,
  /\.scratch\/\S*talk\S*/g,
  /\b\d{2}-[a-z0-9-]*talk[a-z0-9-]*\.md/g,
];

const mask = (line, kept) =>
  KEEP.reduce(
    (text, pattern) =>
      text.replace(pattern, (match) => {
        kept.push(match);
        return `\u0000${kept.length - 1}\u0000`;
      }),
    line,
  );
const unmask = (line, kept) => line.replace(/\u0000(\d+)\u0000/g, (_, index) => kept[Number(index)]);

const cased = (word, to) =>
  word === word.toUpperCase()
    ? to.toUpperCase()
    : word[0] === word[0].toUpperCase()
      ? to[0].toUpperCase() + to.slice(1)
      : to;

/** Fixture data: a Title, a directory, a repository, a path segment. */
const dataRules = (line, kind, file) => {
  const plural = (m, word) => cased(m, /s$/i.test(m) ? `${word}s` : word);
  let next = line
    .replace(/allow-open-talk/g, 'allow-open-aggregate')
    .replace(/%2Ftalks/g, '%2Fspaces')
    .replace(/\bmy talk\b/g, 'my space')
    .replace(/\bmid-talk\b/g, 'mid-presentation')
    .replace(/(['"`])(talks?)\1/gi, (_, quote, m) => `${quote}${plural(m, kind === 'presenting' ? 'demo' : 'space')}${quote}`)
    .replace(/A talk in three parts/g, 'A story in three parts')
    .replace(/How a talk is built/g, 'How a Space is built');
  if (kind === 'presenting') {
    // The Title of a presented Graph in a fixture.
    next = next
      .replace(/(Intro|Launch|INTRO|intro|Ｉｎｔｒｏ)([ -])(talk)/gi, (_, lead, gap, m) => `${lead}${gap}${cased(m, 'demo')}`)
      .replace(/(['"])Talk( Notes)?\1/g, (_, quote, notes) => `${quote}Demo${notes ?? ''}${quote}`)
      .replace(/the end of the talk/g, 'the end of the presentation')
      .replace(/`talk`/g, '`presented`')
      .replace(/\.talk\b/g, '.presentedGraph')
      .replace(/\btalk:/g, 'presentedGraph:');
  } else {
    const quotedBody = (test) =>
      next.replace(/(['"`])((?:(?!\1).)*?)\1/g, (whole, quote, body) =>
        test(body) ? `${quote}${body.replace(/\btalks?\b/gi, (m) => plural(m, 'space'))}${quote}` : whole,
      );
    // A Title in a document or a fixture.
    if (/\btitle\b|"title"/i.test(next) && !file.endsWith('.md')) {
      next = next.replace(/\btalks?\b/gi, (m) => plural(m, 'space'));
    }
    // A short name in quotes: a directory, a file's text, a Title passed along.
    if (!/^packages\/desktop\/src-tauri\//.test(file)) {
      next = quotedBody((body) => body.trim().split(/\s+/).length <= 4 && !/window/.test(body));
    }
  }
  // A name beside a path or name separator.
  next = next.replace(/(?<=[/@-])(talks?)\b|\b(talks?)(?=[/@-])/gi, (m) => plural(m, 'space'));
  return next;
};

/** A compound identifier: `TalkKey`, `open_talks`, `talkDirectory`, `allow-open-talk`. */
const identifierRules = (line, kind) => {
  const to = NOUN[kind].code;
  return line
    .replace(/TALK_WINDOW/g, 'SPACE_WINDOW')
    .replace(/TalkWindow/g, 'SpaceWindow')
    .replace(/talk_window/g, 'space_window')
    .replace(/[A-Za-z0-9_]+/g, (token) => {
      if (!/talk/i.test(token) || /^talks?$/i.test(token)) return token;
      return token
        .replace(/(^|_)a_talk/g, to === 'aggregate' ? '$1an_aggregate' : `$1a_${to}`)
                .replace(/Talk/g, to[0].toUpperCase() + to.slice(1))
        .replace(/TALKS/g, `${to.toUpperCase()}S`)
        .replace(/TALK/g, to.toUpperCase())
        .replace(/talks/g, `${to}s`)
        .replace(/talk/g, to);
    })
    .replace(/allow-open-talk/g, 'allow-open-aggregate')
    .replace(/notes-window__talk/g, 'notes-window__presentation');
};

/** Prose: a comment, a string, a document. */
const proseRules = (text, kind) => {
  const noun = NOUN[kind];
  return text
    .replace(/\btalk windows\b/g, 'Space windows')
    .replace(/\btalk window\b/g, 'Space window')
    .replace(/\btalk Graph\b/g, 'presented Graph')
    .replace(/\b([Aa])n? talk\b/g, (_, a) => `${a === 'A' ? noun.A : noun.a} ${noun.one}`)
    .replace(/\btalks\b/g, noun.many)
    .replace(/\bTalks\b/g, noun.many[0].toUpperCase() + noun.many.slice(1))
    .replace(/\btalk\b/g, noun.one)
    .replace(/\bTalk\b/g, noun.one[0].toUpperCase() + noun.one.slice(1))
    .replace(/\bTALK\b/g, noun.code.toUpperCase());
};

/** Split a source line into code, string and comment runs. */
const segments = (line, rust, inBlock) => {
  const out = [];
  const trimmed = line.trimStart();
  if (inBlock || /^(\*|\/\*|\/\/)/.test(trimmed)) return [{ kind: 'prose', text: line }];
  let run = '';
  let mode = 'code';
  let quote = '';
  const push = (kind) => {
    if (run !== '') out.push({ kind, text: run });
    run = '';
  };
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (mode === 'code') {
      if (c === '/' && line[i + 1] === '/' && line[i - 1] !== ':') {
        push('code');
        out.push({ kind: 'prose', text: line.slice(i) });
        return out;
      }
      if (c === '"' || (!rust && (c === "'" || c === '`'))) {
        run += c;
        push('code');
        mode = 'string';
        quote = c;
        continue;
      }
      run += c;
    } else {
      if (c === '\\') {
        run += c + (line[i + 1] ?? '');
        i += 1;
        continue;
      }
      if (c === quote) {
        push('prose');
        mode = 'code';
      }
      run += c;
    }
  }
  push(mode === 'code' ? 'code' : 'prose');
  return out;
};

const isSource = (file) => /\.(ts|tsx|mts|mjs|js|rs|css)$/.test(file);

const rewrite = (file, source) => {
  const kind = classOf(file);
  const rust = file.endsWith('.rs');
  let inBlock = false;
  const proseHits = [];
  const lines = source.split('\n').map((original) => {
    if (!/talk/i.test(original)) {
      if (isSource(file) && !rust) {
        if (/\/\*/.test(original) && !/\*\//.test(original)) inBlock = true;
        else if (/\*\//.test(original)) inBlock = false;
      }
      return original;
    }
    const kept = [];
    let line = mask(original, kept);
    line = dataRules(line, kind, file);
    line = identifierRules(line, kind);
    if (isSource(file)) {
      line = segments(line, rust, inBlock)
        .map((part) =>
          part.kind === 'prose'
            ? proseRules(part.text, kind)
            : part.text
                .replace(/\btalks\b/g, `${NOUN[kind].code}s`)
                .replace(/\btalk\b/g, NOUN[kind].code)
                .replace(/\bTalks?\b/g, (m) => proseRules(m, kind))
                .replace(/\bTALK\b/g, NOUN[kind].code.toUpperCase()),
        )
        .join('');
    } else {
      line = proseRules(line, kind);
    }
    line = unmask(line, kept);
    if (isSource(file) && !rust) {
      if (/\/\*/.test(original) && !/\*\//.test(original)) inBlock = true;
      else if (/\*\//.test(original)) inBlock = false;
    }
    if (line !== original) proseHits.push(`${file}\n  - ${original.trim()}\n  + ${line.trim()}`);
    return line;
  });
  return { text: lines.join('\n'), hits: proseHits };
};

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
  .split('\0')
  .filter((file) => file !== '' && !EXCLUDED.some((pattern) => pattern.test(file)));

let changed = 0;
for (const file of tracked) {
  const absolute = join(repoRoot, file);
  const stat = lstatSync(absolute, { throwIfNoEntry: false });
  if (stat === undefined || !stat.isFile()) continue;
  const before = readFileSync(absolute, 'utf8');
  if (!/talk/i.test(before)) continue;
  const { text, hits } = rewrite(file, before);
  if (text === before) continue;
  changed += 1;
  if (log) console.log(hits.join('\n'));
  if (!dryRun) writeFileSync(absolute, text);
}
console.error(`${dryRun ? 'would change' : 'changed'} ${changed} files`);
