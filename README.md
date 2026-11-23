# krontab

<div align="center" style="margin:0 auto">
  <img src="./assets/icon.svg" alt="krontab" width="200" height="200" />
</div>

English | [简体中文](README.zh.md)

A minimal, JS-native crontab.

Drop a script into a directory and write a 5-field cron expression in its header comment — krontab runs the script when the time comes.

The name is `crontab` with a `K` — both "kron" (time) and the author's initial. The package still exports one function, `cronjob()`.

Beyond usage, also read [Design limits](#design-limits).

## Install

```bash
pnpm add krontab
# or
npm i krontab
```

Requires **Node.js >= 22.14.0**.

## Quick start

Valid cron expression:

```text
 *    *    *    *    *
 ┬    ┬    ┬    ┬    ┬
 │    │    │    │    │
 │    │    │    │    └─ day of week (0-7, 1L-7L) (0 or 7 is Sun)
 │    │    │    └────── month (1-12, JAN-DEC)
 │    │    └─────────── day of month (1-31, L)
 │    └──────────────── hour (0-23)
 └───────────────────── minute (0-59)
```

Create a job script, `cronjob/backup.js`:

```js
// @cron 0 3 * * * # 每天凌晨三点
console.log('backup', new Date().toISOString());
```

Start the runner from your project root, in `main.js`:

```js
import { cronjob } from 'krontab';

const task = await cronjob({ dir: './cronjob' });
```

Then let pm2 keep it alive:

```bash
pm2 start main.js --name cronjob --log cronjob-runner/main.log --no-treekill
```

> **Keep `--no-treekill`.** pm2 kills the whole process tree by default. Jobs are spawned detached and unref'd, but they are still in pm2's tree, so `pm2 restart` / `pm2 stop` would kill a job that is still running — with no `[EXIT]` line, because the runner exits first. With `--no-treekill` (or `treekill: false` in an ecosystem file) running jobs survive a deploy. The runner is also a single-instance daemon: start it in fork mode, not with `-i` (see below).

`cronjob()` resolves to a controller with `stop()` / `pause()` / `resume()`.

To see what would run without starting the scheduler, pass `--list` (or `-l`) to the same script:

```bash
node main.js --list
```

That prints one line per schedule and exits, before the single-instance lock is taken:

```
2026/11/22 03:00:00.000  0 3 * * *          backup.js                        /usr/bin/node backup.js
```

The four columns are **next run time** (formatted with `timezone`), **expression** (block members are indented and marked `[group]`), **path relative to `dir`**, and the command that will be spawned. `--list` goes through the same `write`, so the usual `[INFO] Config loaded: …` line appears before the table. Rows follow glob order (roughly alphabetical within a directory); they are not sorted by next run time.

Files with no `@cron` line are reported with `[WARN] No cron expression: <path>` instead of a row. An expression that parses but has no next occurrence prints `(no next run)` in the time column; one that fails to parse at this stage prints `(invalid)`. In practice extraction only keeps expressions that already parsed, so a malformed line is dropped earlier and never reaches the table. When nothing is found at all, `[INFO] No scripts found in <dir>` is printed and the command exits.

`--list` is checked by scanning `process.argv` in `cronjob()`, so any argument list containing `--list` or `-l` takes this branch — including one meant for your own program. Do not forward those flags.

## Writing jobs

The cron expression goes in the **header comment** — from line 1 until the first line of real code. For `.ts`/`.js` use `//` or `/** */`, for `.sh` use `#`. Blank lines and other comment lines inside that header are fine; they do not end it. In a `/* */` block every body line must start with `*` — that is the conventional style (and what most editors and formatters produce). A `/*` block whose body has no `*` prefix is **not** a header: the first such line ends it, so no `@cron` is seen and the file is silently not scheduled.

`@cronbegin` / `@cronend` are matched **anywhere in a header line**, including prose. A comment that merely mentions them (`` // see @cronend ``) is treated as the marker, so the file is rejected with a block error rather than scheduled. This is deliberate: a file that fails to parse never runs, which is safer than guessing what the author meant. Keep those words out of notes inside a header.

`@cronutc` is `@cron` with the same 5-field expression, but the expression is matched in **UTC** instead of `timezone`. It is a per-line marker: it applies only to the line it is on and does not change how other lines are matched. Use it when a schedule must not shift with daylight saving time:

```js
// @cron 0 9 * * *          每天九点（按 timezone）
// @cronutc 0 9 * * *       每天 09:00 UTC
```

Everything after the 5 fields is still a note, and `@cronutc` works inside `@cronbegin` / `@cronend` blocks like any other line. `--list` marks those rows with a `UTC` prefix.

Both markers are found anywhere in the line, notes included, so a header line must not contain `@cronutc` unless it is that line's marker. Putting both markers on one line (`// @cron 0 9 * * * 也可以写成 @cronutc`) is ambiguous — the line is rejected with an `[ERROR]` and not scheduled. Keep `@cronutc` out of the note.

For `.py` the header may use `#` comments. A `@cron` must sit on one of the `#` lines; the `'''` / `"""` docstring delimiters are accepted in the header but **docstring body lines are not scanned**, so `@cron` inside a multi-line docstring is ignored. Use `# @cron …` for Python jobs.

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
- The first 5 whitespace-separated tokens after `@cron` are the expression; everything after them is a human-readable note and is ignored.
- Lines without `@cron` are ignored silently.
- Field syntax is [cron-parser](https://github.com/harrisiirak/cron-parser)'s: ranges, lists, steps, and names such as `MON-FRI` in the day-of-week field.
- Aliases like `@daily` or `@hourly` are **not** accepted — they are not 5-field expressions.

The marker does not have to be at the start of the line: `// 说明 @cron 0 9 * * *` works, and the text before the marker is ignored.

### A note on trailing words

Because the note is whatever follows the 5 fields, a **6th token that cron-parser can read** makes the line look like a seconds-level expression, so it is rejected:

```js
// @cron 0 9 * * * 1   ← parses as a 6-field (seconds) cron → error, not scheduled
```

The check is: take the first 6 tokens and try to parse them. If that succeeds, the line is skipped with `6 fields cron is not supported, use 5 fields instead`. If it fails, the first 5 tokens are scheduled and everything after is the note. So anything cron-parser cannot resolve as a field works as a note:

```js
// @cron 0 9 * * * 每天        ← Chinese note, 6-token parse fails → 5 fields + note
// @cron 0 9 * * * # 1         ← "#" is not a field → 5 fields + note
// @cron 0 9 * * * - 1         ← same
// @cron 0 9 * * * extra words ← "extra" is not an alias → 5 fields + note
```

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

A block spawns the file **once** when any line inside it matches. Blocks are numbered in the order they appear, and each block counts independently — two blocks that both match in the same minute spawn the file twice. Lines outside any block are ungrouped and each schedules independently.

`@cronbegin` and `@cronend` must each be alone on their line. A line is classified in this order — begin, then end, then expression — so `@cronbegin @cron 0 9 * * *` opens a block and **drops the expression on that line**; put them on separate lines. Nested or unclosed blocks, and an `@cronend` without a matching begin, cause the whole file to be skipped and an error to be logged. A line inside a block that has no `@cron` marker triggers a `[WARN]`, since it is probably a comment that was meant to be a schedule.

### Second-level expressions are not supported

Six-field expressions are **not** supported:

```js
// @cron 0 0 9 * * *   ← rejected, error logged, not scheduled
```

## Supported script types

| Extension               | Interpreter                                            |
| ----------------------- | ------------------------------------------------------ |
| `.js` / `.mjs` / `.cjs` | the current Node.js (`process.execPath`)               |
| `.ts` / `.mts` / `.cts` | `tsx` → `ts-node` → Node.js with native type stripping |
| `.sh`                   | `bash`, falling back to `sh`                           |
| `.py`                   | `python3` → `python`                                   |

`.mjs` / `.cjs` / `.mts` / `.cts` are matched by the default `include`, the same as `.ts` / `.js`; their header comments use the same `//` and `/** */` rules as `.js` / `.ts`.

Extensions with no interpreter mapping are only reached if a script is extracted with one; in practice an unknown extension has no comment syntax for its header, so no `@cron` line is found and nothing is spawned. Such a job would log `[WARN] path=… unsupported extension` if it ever got that far.

If a `.ts` file has a `#!` line, that shebang wins over the default interpreter. Same for any other extension. The shebang is parsed as `command args...`, so `#!/usr/bin/env node` runs `/usr/bin/env node <script>` and `#!/bin/bash -e` runs `/bin/bash -e <script>`.

If `tsx` is not installed, `.ts` still runs under Node.js directly, but not every TypeScript syntax is supported — a warning is logged at startup.

The default glob matches `.py` as well, so Python jobs run out of the box.

## Logs

Everything goes to the runner's stdout (use `pm2 --log` to persist it) plus a per-job log file:

- **Runner log**: one line per event — `[INFO]`, `[WARN]`, `[ERROR]`, `[SPAWN]`, `[EXIT]`, `[DEBUG]`. The three job lifecycle lines are:

  ```
  2026/11/21 09:00:00.017 [SPAWN] path=daily/report.js pid=12345
  2026/11/21 09:00:04.210 [EXIT] path=daily/report.js pid=12345 code=0 signal=null
  2026/11/21 09:00:00.018 [ERROR] path=daily/report.js pid=-1 Error: spawn ENOENT
  ```

  `[ERROR]` uses `pid=-1` when the process never started.
- **Timestamps** are `yyyy/MM/dd HH:mm:ss.SSS` in `timezone` (that is `zh-CN` `Intl.DateTimeFormat` output).
- **Job log**: `<logDir>/<relative-path>.log`, appended, with the `.log` suffix after the full filename (`daily/report.js` → `<logDir>/daily/report.js.log`). Each job's own stdout/stderr goes here; the pid is only in the runner log.
- **Debug**: a `[DEBUG] Start` / `[DEBUG] Finished in Nms` pair wraps each tick that found at least one script. If `dir` has no matching scripts the runner logs `[INFO] No scripts found.` instead and skips the pair.

`path` in the runner log is always relative to `dir`.

Replace `write` to send the runner log somewhere else (a file, a logger, pm2's stdout). It receives the tag already formatted as `[INFO]` etc.:

```js
await cronjob({
  dir: './cronjob',
  write(tag, ...args) {
    myLogger.log(tag, ...args);
  },
});
```

## API

### `cronjob(config?): Promise<TaskController>`

Starts the minute-based scheduler. Immediately takes a single-instance lock keyed by a hash of `dir` — a second runner on the same directory throws `krontab already running`. The lock is an abstract Unix socket, so the OS releases it when the process dies, including `SIGKILL`.

If `process.argv` contains `--list` or `-l`, `cronjob()` prints the schedule table and calls `process.exit(0)` instead of starting the scheduler. No lock is taken in that branch.

### Permissions

On startup `cronjob()` checks that `dir` and `logDir` are owned by the current user and are **not group- or world-writable**, and throws rather than starting if not. Directories it creates itself are made with mode `0755` regardless of umask, so they pass that check on `umask 002` machines (Debian/Ubuntu with `USERGROUPS_ENAB`) as well as `022` ones. Both directories are equivalent to code execution as the runner's user — anyone who can write `dir` can drop a script, and anyone who can write `logDir` can append to job logs. `/tmp`-style shared directories are rejected by design. Custom log files are created with mode `0640`; existing files are appended to without changing their mode. The check is skipped when running as root (root can write anywhere, so it proves nothing) and on platforms without `process.getuid` (Windows).

The check covers **`dir` and `logDir` themselves only** — it does not walk up to their parents and does not re-check subdirectories:

- A world-writable **parent** passes: with `/srv/shared` at `777` containing `jobs` at `755`, another user can rename `jobs` away and put their own directory in its place.
- A world-writable **subdirectory** inside `dir` passes: `dir/team` at `777` still lets `team/x.js` be globbed and spawned.

Deciding what is safe to scan is left to deployment: keep `dir` and everything below it writable by the runner's user only.

The lock name is derived from `dir`, so it is predictable; any local process that binds that abstract socket first will make the runner report `krontab already running`. That is a local denial of service at worst — it cannot be used to make the runner execute anything.

> **Upgrading from `cronjob-js`:** the lock name changed from `cronjob-js-…` to `krontab-…`. If an old runner is still running on the same `dir`, a new one will **not** detect it and both will schedule. Stop the old process before starting the new one.

### `UserCronjobConfig`

| Option     | Type                                       | Default                                  | Description                                                                                                                                                       |
| ---------- | ------------------------------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dir`      | `string`                                   | `process.cwd()`                          | Directory scanned for job scripts. Created if missing.                                                                                                            |
| `logDir`   | `string`                                   | same as `dir`                            | Where per-job logs are written. Created if missing.                                                                                                               |
| `include`  | `string[]`                                 | `['**/*.{ts,js,sh,cts,mts,cjs,mjs,py}']` | Glob patterns for job scripts (passed to `fs.glob`).                                                                                                              |
| `exclude`  | `string[]`                                 | see below                                | Glob patterns to skip (passed to `fs.glob` as `exclude`).                                                                                                         |
| `timezone` | `string`                                   | `'Asia/Shanghai'`                        | IANA timezone used for cron matching and for the `timeFormat` timestamps. See [Daylight saving time](#daylight-saving-time).                                      |
| `jobcwd`   | `string \| (scriptPath: string) => string` | same as `dir`                            | Working directory for spawned jobs. Pass a function to derive it per script.                                                                                      |
| `write`    | `(tag: Tag, ...args: any[]) => void`       | `console.log(time, tag, ...args)`        | Where runner log lines go. `tag` is one of `[INFO]` `[WARN]` `[ERROR]` `[SPAWN]` `[EXIT]` `[DEBUG]`. The default writes to stdout with a timestamp in `timezone`. |

Invalid config throws a `TypeError` naming the option (`dir`, `logDir`, `include`, …); an unknown `timezone` throws a `RangeError` from `Intl.DateTimeFormat`.

#### Daylight saving time

Matching is done purely against the expression, so if you hit a clock jump, switch that schedule to `@cronutc`.

#### Default `exclude`

```js
[
  '**/node_modules/',
  '**/.git/',
  '**/.vscode/',
  '**/.claude/',
  '**/__pycache__/',
  '**/dist/',
  '**/dist-tsc/',
  '**/coverage/',
];
```

`**/` matters: a plain `'node_modules/'` only matches the directory at the root of `dir`, so a vendored sub-project under `jobs/node_modules/` would still be scanned and read every minute. Dot-directories (`.git`, `.vscode`, `.claude`) are skipped by `fs.glob` anyway; they are listed so that an explicit `exclude` override cannot accidentally re-include them. `dist`, `dist-tsc` and `coverage` are common build outputs that would otherwise be globbed and read as job scripts.

If you replace `exclude`, you replace this whole list — there is no merging.

### `TaskController`

```ts
interface TaskController {
  stop(): void;    // clears the pending timer, sets state to Stopped; resume() is a no-op after this
  pause(): void;   // the timer keeps ticking but the callback is not run
  resume(): void;  // resumes a paused runner
}
```

## How it works

Every minute the runner:

1. globs `dir` for matching files,
2. reads the header comment block of each file,
3. parses the `@cron` lines with `cron-parser`, using `timezone`,
4. spawns matching scripts, detached and unref'd, with stdout/stderr redirected to their log file.

There is no in-memory cache: files are re-read and re-parsed every minute, so editing a script's `@cron` line takes effect on the next tick without a restart.

The first tick is aligned to the next minute boundary. If the timer fires a few milliseconds early (common on WSL), it waits for the boundary instead of running the same minute twice.

The next tick is scheduled before the current one runs, so a slow file read or a throwing job does not break the chain. An exception or rejected promise from the tick is logged as one `[ERROR] Task tick failed:` line and nothing else — the next minute proceeds normally.

At startup the runner also warns about a missing `tsx` (only matters for `.ts`) and reports whether `python3`/`python` was found (only matters if you included `.py`).

## Design limits

These are deliberate, not missing features:

- **No retries.** There is no way to know whether the failure happened before or after a side effect, so noticing a failure should be the job author's own responsibility.
- **No catch-up.** If the machine was down at 03:00, the 03:00 job does not run when it comes back — purely because that time never arrived.
- **Overlap happens.** A long job will overlap with its next run.
- **No process management.** krontab does not watch or kill job processes; it should not take control of things that are not its own.
- **No exit-code alerts.** Every exit is logged; read the log if you care.
- **No job lifecycle hooks.** There is no callback for "job started" or "job finished"; a minimal scheduler should not have them.
- **The timer is minute-aligned, not second-aligned.** If the process is busy or the host is suspended across a boundary, the tick happens when the event loop gets to it, and there is no catch-up for the missed minute.
- **Maximum concurrency is system-limited.** krontab does not impose a limit on how many jobs can run simultaneously; the limit is determined by the system, e.g., `ulimit -u` for the maximum number of processes. Triggering too many jobs at the same time is generally not recommended, but dozens or hundreds are usually fine.

krontab itself is best kept alive by pm2. If the runner dies, nothing runs until pm2 restarts it.

Run it in pm2 **fork mode** (the default). With `-i` (cluster mode) every worker shares one task directory; the single-instance lock lets only the first worker schedule, and the others exit with `krontab already running` and are restarted by pm2 in a loop.

## License

MIT — see [LICENSE](LICENSE).
