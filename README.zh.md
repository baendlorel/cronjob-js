# krontab

<div align="center" style="margin:0 auto">
  <img src="./assets/icon.svg" alt="krontab" width="200" height="200" />
</div>

[English](README.md) | 简体中文

极简的 JS 原生 crontab。

把一个脚本放进目录，在它的头部注释里写 5 段 cron 表达式 —— krontab 会在时间到来之际运行这个脚本。

名字是 `crontab` 的 K 写法：既指 "kron"（时间），也是作者名字的首字母。包仍然只导出一个函数 `cronjob()`。

除了使用方法之外，还需注意[设计边界](#设计边界)

## 安装

```bash
pnpm add krontab
# 或
npm i krontab
```

需要 **Node.js >= 22.14.0**。

## 快速开始

合法的 cron 表达式：

```text
 *    *    *    *    *
 ┬    ┬    ┬    ┬    ┬
 │    │    │    │    │
 │    │    │    │    └─ 星期（0-7，1L-7L）（0 或 7 是周日）
 │    │    │    └────── 月（1-12，JAN-DEC）
 │    │    └─────────── 日（1-31，L）
 │    └──────────────── 时（0-23）
 └───────────────────── 分（0-59）
```

创建一个任务脚本：

```js
// cronjob/backup.js
// @cron 0 3 * * * # 每天凌晨三点
console.log('backup', new Date().toISOString());
```

在项目根目录启动 runner：

```js
// main.js
import { cronjob } from 'krontab';

const task = await cronjob({ dir: './cronjob' });
```

交给 pm2 保活：

```bash
pm2 start main.js --name cronjob --log cronjob-runner/main.log --no-treekill
```

> **务必保留 `--no-treekill`。** pm2 默认会杀掉整棵进程树。任务虽然是 detached + unref 的，但仍然挂在 pm2 的进程树里，所以 `pm2 restart` / `pm2 stop` 会把还在跑的任务一起杀掉 —— 而且拿不到 `[EXIT]` 行，因为 runner 先退出了。加上 `--no-treekill`（或在 ecosystem 里写 `treekill: false`）后，正在跑的任务能在部署中存活。runner 还是单实例守护进程：用 fork 模式启动，不要用 `-i`（见下文）。

`cronjob()` 返回一个控制器，带 `stop()` / `pause()` / `resume()`。

想只看会跑什么、不真的启动调度，给同一个脚本传 `--list`（或 `-l`）：

```bash
node main.js --list
```

它每条调度打印一行然后退出，此时还没有拿单实例锁：

```
2026/11/22 03:00:00.000  0 3 * * *          backup.js                        /usr/bin/node backup.js
```

四列分别是 **下次运行时间**（用 `timezone` 格式化）、**表达式**（块内成员缩进并标 `[group]`）、**相对 `dir` 的路径**、**将要 spawn 的命令**。`--list` 走同一个 `write`，所以表前面照例有 `[INFO] Config loaded: …` 一行。行序跟随 glob 顺序（同一目录内大致按字母序），不按下次运行时间排序。

没有 `@cron` 行的文件会输出 `[WARN] No cron expression: <路径>` 而不是一行表格。能解析但没有下次触发时间的表达式在时间列显示 `(no next run)`；在这一步解析失败的显示 `(invalid)`。实际上提取阶段只保留已经解析成功的表达式，所以写坏的行会更早被丢掉，到不了这张表。什么都没找到时输出 `[INFO] No scripts found in <dir>` 后退出。

`--list` 由 `cronjob()` 扫描 `process.argv` 判断，所以任何含 `--list` 或 `-l` 的参数都会被当成这个分支 —— 包括你本来想传给自己的程序的参数。不要把这两个 flag 透传下去。

## 编写任务

cron 表达式写在**文件头注释**里 —— 从第 1 行到第一行正式代码之前。`.ts`/`.js` 用 `//` 或 `/** */`，`.sh` 用 `#`。头部里的空行和其它注释行都没问题，不会结束文件头。在 `/* */` 块里，每一行正文都必须以 `*` 开头 —— 这是通行写法（也是大多数编辑器和格式化工具的输出）。正文没有 `*` 前缀的 `/*` 块**不算**文件头：第一行这样的内容就结束文件头，于是看不到 `@cron`，文件静默地不被调度。

`@cronbegin` / `@cronend` 在文件头的**任意位置**匹配，包括说明文字。仅仅提到它们的注释（如 `// 参见 @cronend`）会被当成标记，导致整个文件因块错误被拒绝、不予调度。这是刻意的：解析失败的文件永远不跑，比猜作者意图更安全。写说明时别把这两个词留在文件头里。

`@cronutc` 就是 `@cron`，同样接 5 段表达式，但这条按 **UTC** 匹配，而不是 `timezone`。它是行内标记：只作用于所在行，不改变其它行的匹配方式。当某个调度不能随夏令时漂移时用它：

```js
// @cron 0 9 * * *          每天九点（按 timezone）
// @cronutc 0 9 * * *       每天 09:00 UTC
```

5 段之后的内容仍然是说明文字，`@cronutc` 在 `@cronbegin` / `@cronend` 块内也照常可用。`--list` 会给这些行加 `UTC` 前缀。

两个标记都在整行内匹配、包括说明文字，所以文件头的一行里不能出现 `@cronutc`，除非它就是这一行的标记。把两个标记写在同一行（`// @cron 0 9 * * * 也可以写成 @cronutc`）是有歧义的 —— 该行记一条 `[ERROR]` 且不调度。别把 `@cronutc` 留在说明里。

`.py` 的文件头可以用 `#` 注释。`@cron` 必须写在某条 `#` 行上；`'''` / `"""` 文档字符串的定界行可以出现在文件头里，但**文档字符串正文行不会被扫描**，所以多行文档字符串里的 `@cron` 会被忽略。Python 任务请用 `# @cron …`。

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

规则：

- 只支持 **5 段**：`分 时 日 月 周`。
- `@cron` 之后按空白切出的前 5 个 token 是表达式，之后全是说明文字、会被忽略。
- 没有 `@cron` 的行静默忽略。
- 字段语法来自 [cron-parser](https://github.com/harrisiirak/cron-parser)：范围、列表、步长，以及星期字段里的 `MON-FRI` 这类名字。
- **不接受** `@daily`、`@hourly` 这类别名 —— 它们不是 5 段表达式。

标记不必在行首：`// 说明 @cron 0 9 * * *` 是有效的，标记之前的文字会被忽略。

### 关于表达式后面的说明文字

既然 5 段之后都是说明，那么**能被 cron-parser 读懂的第 6 个 token** 会让这一行看起来像秒级表达式，因而被拒绝：

```js
// @cron 0 9 * * * 1   ← 被解析成 6 段（秒级）cron → 报错，不调度
```

判断方式是：取前 6 个 token 尝试解析。成功则以 `6 fields cron is not supported, use 5 fields instead` 跳过该行；失败则前 5 段照常调度，之后全是说明。所以 cron-parser 解析不了的任何东西都可以当说明：

```js
// @cron 0 9 * * * 每天        ← 中文说明，6 段解析失败 → 5 段 + 说明
// @cron 0 9 * * * # 1         ← "#" 不是字段 → 5 段 + 说明
// @cron 0 9 * * * - 1         ← 同上
// @cron 0 9 * * * extra words ← "extra" 不是别名 → 5 段 + 说明
```

### 同一个文件里的多条调度

每条 `@cron` 独立调度 —— 同一分钟命中两条，脚本就会被 spawn 两次：

```js
// @cron 0 9 * * *
// @cron 0 21 * * *
```

想要「命中任意一条，但只跑一次」时用块：

```js
// @cronbegin
// @cron 0 9 * * 1-5
// @cron 0 9 * * 6
// @cronend
```

块内任意一行命中，文件只 spawn **一次**。块按出现顺序编号，各块独立计数 —— 同一分钟两个块都命中，文件会被 spawn 两次。不在任何块里的行不分组，各自独立调度。

`@cronbegin` 和 `@cronend` 必须各自独占一行。一行的分类顺序是 begin → end → 表达式，所以 `@cronbegin @cron 0 9 * * *` 只会开一个块，**丢弃这一行的表达式**；请把它们写在不同的行。块嵌套、块未闭合、`@cronend` 没有对应的 begin，都会导致整个文件被跳过并记一条错误日志。块内某行没有 `@cron` 标记时会记一条 `[WARN]`，因为它很可能是本想写成调度的注释。

### 不支持秒级表达式

不支持 6 段表达式：

```js
// @cron 0 0 9 * * *   ← 拒绝、记错误、不调度
```

runner 记一条错误并跳过该行 —— 不会把它悄悄当成 5 段表达式重新解释。不足 5 段（`@cron 0 9 * *`）同样报错拒绝；否则 cron-parser 会把缺的段自动补齐。

## 支持的脚本类型

| 扩展名                  | 解释器                                              |
| ----------------------- | --------------------------------------------------- |
| `.js` / `.mjs` / `.cjs` | 当前 Node.js（`process.execPath`）                  |
| `.ts` / `.mts` / `.cts` | `tsx` → `ts-node` → 用 Node.js 原生类型擦除         |
| `.sh`                   | `bash`，找不到则退回 `sh`                           |
| `.py`                   | `python3` → `python`（只有加进 `include` 才会用到） |

`.mjs` / `.cjs` / `.mts` / `.cts` 只有加进 `include` 才会被扫描（默认 glob 是 `**/*.{ts,js,sh}`）；它们的头部注释规则与 `.js` / `.ts` 相同，都用 `//` 和 `/** */`。

没有任何解释器映射的扩展名，只有在脚本被提取出来时才会走到；实践中未知扩展名没有可用于头部的注释语法，所以找不到 `@cron` 行，什么都不会 spawn。万一走到那一步，会记一条 `[WARN] path=… unsupported extension`。

如果 `.ts` 文件有 `#!` 行，shebang 优先于默认解释器，其它扩展名同理。shebang 按 `命令 参数...` 解析，所以 `#!/usr/bin/env node` 执行的是 `/usr/bin/env node <脚本>`，`#!/bin/bash -e` 执行的是 `/bin/bash -e <脚本>`。

没有安装 `tsx` 时，`.ts` 仍会由 Node.js 直接运行，但不是所有 TypeScript 语法都支持 —— 启动时会记一条警告。

`.py` 只有加进 `include` 才会用到；默认 glob 不匹配它。

## 日志

所有内容都写到 runner 的 stdout（用 `pm2 --log` 持久化），另外每个任务还有一个日志文件：

- **主日志**：每个事件一行 —— `[INFO]`、`[WARN]`、`[ERROR]`、`[SPAWN]`、`[EXIT]`、`[DEBUG]`。三条任务生命周期日志是：

  ```
  2026/11/21 09:00:00.017 [SPAWN] path=daily/report.js pid=12345
  2026/11/21 09:00:04.210 [EXIT] path=daily/report.js pid=12345 code=0 signal=null
  2026/11/21 09:00:00.018 [ERROR] path=daily/report.js pid=-1 Error: spawn ENOENT
  ```

  进程根本没启动起来时，`[ERROR]` 用 `pid=-1`。
- **时间戳**是 `timezone` 下的 `yyyy/MM/dd HH:mm:ss.SSS`（即 `zh-CN` 的 `Intl.DateTimeFormat` 输出）。
- **任务日志**：`<logDir>/<相对路径>.log`，追加写入，`.log` 后缀接在完整文件名之后（`daily/report.js` → `<logDir>/daily/report.js.log`）。任务自己的 stdout/stderr 都写这里；pid 只出现在主日志里。
- **调试**：每轮只要至少找到一个脚本，就用 `[DEBUG] Start` / `[DEBUG] Finished in Nms` 包起来。`dir` 里没有匹配脚本时改为输出 `[INFO] No scripts found.`，不输出这一对。

主日志里的 `path` 始终相对 `dir`。

替换 `write` 可以把主日志送到别处（文件、logger、pm2 的 stdout）。它收到的 tag 已经是 `[INFO]` 这种格式：

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

启动按分钟调度的 runner。启动时立刻按 `dir` 的哈希拿一个单实例锁 —— 同一目录上的第二个 runner 会抛 `krontab already running`。锁是一个抽象 Unix socket，进程退出（包括 `SIGKILL`）时由操作系统释放。

如果 `process.argv` 含有 `--list` 或 `-l`，`cronjob()` 打印调度表后调用 `process.exit(0)`，不启动调度；这个分支不拿锁。

### 权限

启动时 `cronjob()` 会检查 `dir` 和 `logDir` 的属主是当前用户，且**不能是 group 或 world 可写**，否则抛错、不启动。它自己创建的目录固定用 `0755`，不受 umask 影响，所以在 `umask 002` 的机器（Debian/Ubuntu 的 `USERGROUPS_ENAB`）和 `022` 的机器上都能通过检查。这两个目录都等价于「以 runner 用户身份执行代码」—— 能写 `dir` 的人可以投放脚本，能写 `logDir` 的人可以往任务日志里追加内容。`/tmp` 这类共享目录按设计被拒绝。自定义日志文件以 `0640` 创建；已存在的文件追加写入、不改动其 mode。以 root 运行时跳过检查（root 哪里都能写，检查没有意义），没有 `process.getuid` 的平台（Windows）同样跳过。

检查只覆盖 **`dir` 和 `logDir` 本身** —— 不向上检查父目录，也不重新检查子目录：

- 父目录是 world 可写也能通过：`/srv/shared` 是 `777`、其下的 `jobs` 是 `755` 时，其他用户可以把 `jobs` 改名移走，再放一个自己的目录到原位。
- `dir` 内 world 可写的**子目录**也能通过：`dir/team` 是 `777` 时，`team/x.js` 照样会被 glob 到并 spawn。

扫描哪些目录是安全的，交给部署方决定：`dir` 及其下所有目录只让 runner 用户可写。

锁名由 `dir` 推导而来，因此可预测；本机任何进程只要先绑上这个抽象 socket，runner 就会报 `krontab already running`。最坏情况是本机拒绝服务 —— 它无法让 runner 执行任何东西。

> **从 `cronjob-js` 升级：** 锁名已从 `cronjob-js-…` 改为 `krontab-…`。如果同一个 `dir` 上还有旧 runner 在跑，新的 runner **不会**检测到它，两个都会调度。请先停掉旧进程再启动新的。

### `UserCronjobConfig`

| 选项       | 类型                                       | 默认值                            | 说明                                                                                                                           |
| ---------- | ------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `dir`      | `string`                                   | `process.cwd()`                   | 扫描任务脚本的目录，不存在则创建。                                                                                             |
| `logDir`   | `string`                                   | 与 `dir` 相同                     | 任务日志目录，不存在则创建。                                                                                                   |
| `include`  | `string[]`                                 | `['**/*.{ts,js,sh}']`             | 匹配任务脚本的 glob（传给 `fs.glob`）。用 Python 就加上 `'**/*.py'`。                                                          |
| `exclude`  | `string[]`                                 | 见下文                            | 排除的 glob（作为 `exclude` 传给 `fs.glob`）。                                                                                 |
| `timezone` | `string`                                   | `'Asia/Shanghai'`                 | 用于 cron 匹配和 `timeFormat` 时间戳的 IANA 时区。见[夏令时](#夏令时)。                                                        |
| `jobcwd`   | `string \| (scriptPath: string) => string` | 与 `dir` 相同                     | spawn 出来的任务的 cwd。传函数可以按脚本路径动态决定。                                                                         |
| `write`    | `(tag: Tag, ...args: any[]) => void`       | `console.log(time, tag, ...args)` | 主日志的输出位置。`tag` 是 `[INFO]` `[WARN]` `[ERROR]` `[SPAWN]` `[EXIT]` `[DEBUG]` 之一。默认写 stdout，时间戳用 `timezone`。 |

非法配置会抛 `TypeError` 并指明选项名（`dir`、`logDir`、`include` 等）；未知的 `timezone` 会由 `Intl.DateTimeFormat` 抛 `RangeError`。

#### 夏令时

由于完全按照表达式匹配，因此如果碰到时间跳变问题，请改为 `@cronutc` 来解决。

#### 默认 `exclude`

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

`**/` 很重要：只写 `'node_modules/'` 只能匹配 `dir` 根目录下的那一个，所以放在 `jobs/node_modules/` 里的第三方子项目仍会被扫描、每分钟读一次。点号开头的目录（`.git`、`.vscode`、`.claude`）本来就会被 `fs.glob` 跳过；列出来是为了让显式覆盖 `exclude` 时不会意外把它们重新纳入。`dist`、`dist-tsc`、`coverage` 是常见的构建产物，不排除的话会被当作任务脚本 glob 出来并读取。

替换 `exclude` 就是整体替换这份列表 —— 不会合并。

### `TaskController`

```ts
interface TaskController {
  stop(): void;    // 清掉待触发的定时器，状态置为 Stopped；之后再 resume() 无效
  pause(): void;   // 定时器继续走，但不执行回调
  resume(): void;  // 恢复被暂停的 runner
}
```

## 工作原理

每分钟 runner 会：

1. 在 `dir` 里 glob 匹配的文件，
2. 读取每个文件的头部注释块，
3. 用 `cron-parser` 按 `timezone` 解析 `@cron` 行，
4. spawn 命中的脚本，detached + unref，stdout/stderr 重定向到各自的日志文件。

没有内存缓存：文件每分钟重新读取、重新解析，所以改掉脚本的 `@cron` 行会在下一轮生效，无需重启。

第一次 tick 会对齐到下一个分钟边界。如果定时器早了几毫秒触发（WSL 上常见），它会等到边界再执行，而不是把同一分钟跑两次。

下一轮会在本轮执行之前排好，所以读文件慢或任务抛错都不会打断调度链。tick 抛出的异常或被拒绝的 Promise 只会记一条 `[ERROR] Task tick failed:`，别的什么都不做 —— 下一分钟照常执行。

启动时 runner 还会对缺失的 `tsx` 告警（只影响 `.ts`），并报告是否找到 `python3`/`python`（只在你 include 了 `.py` 时才有意义）。

## 设计边界

这些是刻意为之，不是缺功能：

- **不会重试。** 无法知道失败是发生在副作用之前还是之后，所以提醒失败应该由任务作者自己完成。
- **不补跑。** 03:00 机器关着，开机后 03:00 的任务不会补跑，纯粹是因为时间没到。
- **会重叠。** 跑得久的任务会和它的下一次重叠。
- **无进程管理。** krontab 不会监控、也不会杀任务进程。
- **退出码不告警。** 退出都有日志，可以查看日志。
- **没有任务生命周期回调。** 没有「任务开始」「任务结束」的回调；极简的调度器不应该有这些。
- **定时器按分钟对齐，不是按秒。** 进程忙或主机跨边界挂起时，tick 会在事件循环轮到它时发生，漏掉的那一分钟不补。

krontab 本体非常适合用 pm2 保活。runner 死掉后，直到 pm2 把它重启，否则什么都不会跑。

请用 pm2 的 **fork 模式**（默认）。用 `-i`（cluster 模式）时所有 worker 共享同一个任务目录；单实例锁只让第一个 worker 调度，其它的以 `krontab already running` 退出并被 pm2 反复重启。

## 许可证

MIT —— 见 [LICENSE](LICENSE)。
