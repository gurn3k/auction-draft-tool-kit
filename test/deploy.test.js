// A deploy from this folder uploads only what the hosted app needs: the page
// files (site/) and the config that serves them. Everything else in the repo
// stays on this machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const DEPLOYED = new Set(['site', 'vercel.json', 'package.json', 'package-lock.json', '.vercelignore']);
// Not part of the repo's own files, or never uploaded by the host.
const NOT_IN_REPO = new Set(['.git', 'node_modules', '.vercel', '.env', '.env.local', '.gitignore']);

test('every top-level file or folder is either needed by the hosted app or left out of the upload', () => {
  const ignored = readFileSync(new URL('.vercelignore', root), 'utf8').split('\n').map((l) => l.trim().replace(/\/$/, '')).filter((l) => l && !l.startsWith('#'));
  const isIgnored = (name) => ignored.some((pattern) => pattern === name || (pattern.startsWith('*') && name.endsWith(pattern.slice(1))));
  const strays = readdirSync(root).filter((name) => !DEPLOYED.has(name) && !NOT_IN_REPO.has(name) && !isIgnored(name));
  assert.deepEqual(strays, []);
  for (const name of DEPLOYED) assert.ok(!isIgnored(name), `${name} is needed but ignored`);
});

test('only site/ is served as pages, behind the content security policy', () => {
  const config = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
  assert.equal(config.outputDirectory, 'site');
  const csp = config.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/);
});
