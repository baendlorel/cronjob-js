# crontab-js

A minimal, JS-native crontab.

Drop a script in a directory, write a 5-field cron expression in its header comment, and the runner will spawn it when the expression matches — once per minute, nothing more.

No retries, no catch-up runs, no overlap protection, no process supervision. If a job ran or not, read the log.

## Install

```bash
pnpm add crontab-js
# or
npm i crontab-js
```

Requires **Node.js >= 22**.

## Quick start

Create a job script:

```js
// cronjob/backup.js
// @cron 0 3 * * * 每天凌晨三点
console.log('backup', new Date().toISOString());
```

Start the runner from your project root:

```js
// main.js
import { cronjob } from 'crontab-js';

const task = await cronjob({ dir: './cronjob' });
```

Then let pm2 keep it alive:

```bash
pm2 start main.js --name cronjob --log cronjob-runner/main.log
```

`cronjob()` resolves to a controller with `stop()` / `pause()` / `resume()`.

## Writing jobs

The cron expression goes in the **header comment** — from line 1 until the first line of real code. For `.ts`/`.js` use `//` or `/** */`, for `.sh` use `#`.

```js
// @cron 0 9 * * *
// @cron 30 18 * * 1-5 工作日下班
console.log('two independent schedules in one file');
```

```sh
#!/bin/bash
# @cron */5 * * * *
echo "every five minutes"
```

Rules:

- Only the **5-field** form is supported: `minute hour day-of-month month day-of-week`.
- Everything after the 5 fields is a human-readable note and is ignored.
- Lines without `@cron` are ignored silently.
- Field syntax is [cron-parser](https://github.com/harrisiirak/cron-parser)'s: ranges, lists, steps, and names such as `MON-FRI` in the day-of-week field.
- Aliases like `@daily` or `@hourly` are **not** accepted — they are not 5-field expressions.

### Multiple schedules in one file

Each `@cron` line schedules independently — if two lines match in the same minute, the script is spawned twice:

```js
// @cron 0 9 * * *
// @cron 0 21 * * *
```

Use a block when you want "either of these, but only once":

```js
// @cronbegin
// @cron 0 9 * * 1-5
// @cron 0 9 * * 6
// @cronend
```

A block spawns the file **once** when any line inside it matches. Nested or unclosed blocks cause the whole file to be skipped and an error to be logged.

### Second-level expressions are not supported

Six-field expressions are **not** supported:

```js
// @cron 0 0 9 * * *   ← rejected, error logged, not scheduled
```

The runner logs an error and skips that line — it will not silently reinterpret it as a 5-field expression.

## Supported script types

| Extension | Interpreter |
| --- | --- |
| `.js` | the current Node.js (`process.execPath`) |
| `.ts` | `tsx` → `ts-node` → Node.js with native type stripping |
| `.sh` | `bash`, falling back to `sh` |
| `.py` | `python3` → `python` (optional) |

If a `.ts` file has a `#!` line, that shebang wins over the default interpreter. Same for any other extension.

If `tsx` is not installed, `.ts` still runs under Node.js directly, but not every TypeScript syntax is supported — a warning is logged at startup.

## Logs

Everything goes to the runner's stdout (use `pm2 --log` to persist it) plus a per-job log file:

- **Runner log**: one line per event — config loaded, job spawned, job exited, errors.
  ```
  2026-11-21 09:00:00.017 [Spawn] path=daily/report.js pid=12345
  2026-11-21 09:00:04.210 [Exit]  path=daily/report.js pid=12345 code=0 signal=null
  ```
- **Job log**: `<logDir>/<relative-path>.log`, appended. Each job's own stdout/stderr goes here.

`path` in the runner log is always relative to `dir`.

## API

### `cronjob(config?): Promise<TaskController>`

Starts the minute-based scheduler. Immediately takes a single-instance lock keyed by `dir` — a second runner on the same directory throws `cronjob-runner already running`.

### `UserCronjobConfig`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `dir` | `string` | `process.cwd()` | Directory scanned for job scripts. |
| `logDir` | `string` | same as `dir` | Where per-job logs are written. |
| `include` | `string[]` | `['**/*.{ts,js,sh}']` | Glob patterns for job scripts (passed to `fs.glob`). Add `'**/*.py'` if you use Python. |
| `exclude` | `string[]` | `['node_modules/', '.git', '.vscode', '.claude', '__pycache__']` | Glob patterns to skip. |
| `timezone` | `string` | `'Asia/Shanghai'` | IANA timezone used for both cron matching and log timestamps. |
| `jobcwd` | `string \| (scriptPath: string) => string` | same as `dir` | Working directory for spawned jobs. Pass a function to derive it per script. |

### `TaskController`

```ts
interface TaskController {
  stop(): void;    // clears the pending timer, sets state to Stopped
  pause(): void;   // pauses the runner; the pending timer keeps ticking
  resume(): void;  // resumes a paused runner
}
```

## How it works

Every minute the runner:

1. globs `dir` for matching files,
2. reads the header comment block of each file,
3. parses the `@cron` lines with `cron-parser`, using `timezone`,
4. spawns matching scripts, detached and unref'd, with stdout/stderr redirected to their log file.

The first tick is aligned to the next minute boundary. If the timer fires a few milliseconds early (common on WSL), it waits for the boundary instead of running the same minute twice.

## Design limits

These are deliberate, not missing features:

- **No retries.** A failed job stays failed until its next scheduled run.
- **No catch-up.** If the machine was down at 03:00, the 03:00 job does not run when it comes back.
- **No overlap protection.** A long job will overlap with its next run.
- **No process management.** Jobs are detached; the runner does not watch or kill them.
- **No exit-code alerts.** Non-zero exits are logged; read the job log if you care.

The runner itself is kept alive by pm2. If the runner dies, nothing runs until pm2 restarts it.

## License

MIT
