// Plan morning-digest § 1. The contract every part of § 2 builds against: commit this first,
// then the reader (src/digest/read.ts), the page, the JSON and the board link can go in parallel.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once it has parsed.
export type RunLine = {
  at: string; // as written in the log, offset kept (never converted to UTC)
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night.
export type DigestRow = {
  job: string;
  owner: string | null; // owner on the job's last line; null renders as `—`
  runs: number; // lines for this job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus; // status on the job's last line
  lastError: string | null; // most recent `error` seen for the job, even if a later run was ok
  firstAt: string; // `at` of the job's first line, as written
  lastAt: string; // `at` of the job's last line, as written
};

export type StatusCounts = Record<RunStatus, number>;

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job; page and JSON both use this order (ADR 0001)
  counts: StatusCounts; // ok / retry / fail over every parsed line (the board shows these)
  badLines: number; // lines that didn't parse: counted, never thrown
};

// Reads runs/<night>.jsonl. Returns null when there is no file for that night, or when `night`
// isn't a YYYY-MM-DD date (so a route answers 404). An empty file is a Night with no rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
