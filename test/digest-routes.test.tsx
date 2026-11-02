import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// Nights are written into a temp dir, never into runs/ (read-only fixtures).
const NORMAL = '2026-10-28';
const EMPTY = '2026-10-27';
const BAD_LINE = '2026-10-26';
const MISSING = '2026-10-25';

// File order is deliberately not job order: the digest must sort by job.
const normalLines = [
  { at: '2026-10-28T23:00:02+01:00', job: 'zeta/nightly', status: 'ok', owner: 'x' },
  { at: '2026-10-28T23:00:05+01:00', job: 'alpha/backup', status: 'retry', owner: 'y', error: 'timeout' },
  { at: '2026-10-28T23:01:05+01:00', job: 'alpha/backup', status: 'ok', owner: 'y' },
  { at: '2026-10-28T23:10:00+01:00', job: 'mid/report', status: 'fail', owner: null, error: 'boom' },
];
const normalJobs = ['alpha/backup', 'mid/report', 'zeta/nightly'];

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(join(dir, `${NORMAL}.jsonl`), normalLines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  writeFileSync(join(dir, `${EMPTY}.jsonl`), '');
  writeFileSync(
    join(dir, `${BAD_LINE}.jsonl`),
    [
      JSON.stringify({ at: '2026-10-26T23:00:02+01:00', job: 'zeta/nightly', status: 'ok', owner: 'x' }),
      '{this line does not parse',
      JSON.stringify({ at: '2026-10-26T23:00:09+01:00', job: 'alpha/backup', status: 'ok', owner: 'y' }),
    ].join('\n') + '\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('digest page: GET /digest/:night', () => {
  it('answers 200 for a night with a file', async () => {
    const res = await app.request(`/digest/${NORMAL}`);
    expect(res.status).toBe(200);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for an empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still answers 200 for a night with a bad line and shows the good rows', async () => {
    const res = await app.request(`/digest/${BAD_LINE}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('zeta/nightly');
    expect(html).toContain('alpha/backup');
  });
});

describe('digest JSON: GET /api/digest/:night', () => {
  it('answers 200 for a night with a file', async () => {
    const res = await app.request(`/api/digest/${NORMAL}`);
    expect(res.status).toBe(200);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('returns no rows for an empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    const night = (await res.json()) as Night;
    expect(night.night).toBe(EMPTY);
    expect(night.rows).toEqual([]);
  });

  it('still answers 200 for a night with a bad line, counts it and keeps the good rows', async () => {
    const res = await app.request(`/api/digest/${BAD_LINE}`);
    expect(res.status).toBe(200);
    const night = (await res.json()) as Night;
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual(['alpha/backup', 'zeta/nightly']);
  });

  it('lists jobs in the same order the page first mentions them', async () => {
    const html = await (await app.request(`/digest/${NORMAL}`)).text();
    const night = (await (await app.request(`/api/digest/${NORMAL}`)).json()) as Night;

    for (const job of normalJobs) {
      expect(html).toContain(job);
    }
    const pageOrder = [...normalJobs].sort((a, b) => html.indexOf(a) - html.indexOf(b));
    expect(night.rows.map((r) => r.job)).toEqual(pageOrder);
  });
});
