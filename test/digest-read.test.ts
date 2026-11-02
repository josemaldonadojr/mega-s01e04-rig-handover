import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night?.rows.find((r) => r.job === job);

  it('gives 5 jobs sorted by job and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(night?.badLines).toBe(1);
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('keeps retries, the last status and the most recent error', () => {
    expect(row('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps a row whose owner is null', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok', lastError: null });
  });

  it('reports a failing last run', () => {
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
  });

  it('keeps times exactly as written', () => {
    expect(row('lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('reads an empty file as a night with no rows', () => {
    writeFileSync(join(dir, '2026-11-01.jsonl'), '');
    expect(readNight(dir, '2026-11-01')).toEqual({
      night: '2026-11-01',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-11-02')).toBeNull();
  });

  it('returns null for a night that is not a YYYY-MM-DD date', () => {
    writeFileSync(join(dir, 'latest.jsonl'), '');
    for (const bad of ['latest', '2026-13-01', '2026-02-30', '../runs/2026-10-28', '2026-10-28.jsonl', '']) {
      expect(readNight(dir, bad)).toBeNull();
    }
  });

  it('counts lines with a bad or missing field as bad, and skips blank lines', () => {
    const lines = [
      '{"at":"2026-11-03T01:00:00+01:00","job":"a","status":"retry","owner":"rook","error":"boom"}',
      '',
      '{"at":"2026-11-03T01:01:00+01:00","job":"a","status":"done","owner":"rook"}',
      '{"job":"a","status":"ok","owner":"rook"}',
      '{"at":"2026-11-03T01:02:00+01:00","status":"ok","owner":"rook"}',
      '[1,2]',
      '{"at":"2026-11-03T01:03:00+01:00","job":"a","status":"ok"}',
      '   ',
    ];
    writeFileSync(join(dir, '2026-11-03.jsonl'), lines.join('\n') + '\n');
    const night = readNight(dir, '2026-11-03');
    expect(night?.badLines).toBe(4);
    expect(night?.counts).toEqual({ ok: 1, retry: 1, fail: 0 });
    expect(night?.rows).toEqual([
      {
        job: 'a',
        owner: null,
        runs: 2,
        retries: 1,
        lastStatus: 'ok',
        lastError: 'boom',
        firstAt: '2026-11-03T01:00:00+01:00',
        lastAt: '2026-11-03T01:03:00+01:00',
      },
    ]);
  });
});
