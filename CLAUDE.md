# cronjob-runner

设计哲学是极简：只在 match 的时候运行；不重跑、不重试、不做进程管理、不做漏跑检查，跑没跑由人看日志。

## 职责边界

- 每分钟 glob 一次脚本，读脚本顶部注释里的 5 段 cron，isMatch 命中才 spawn。
- spawn 后 unref，不等待、不杀、不限制并发；任务跑多久、是否重叠，由任务自己负责。
- 脚本失败（崩溃、非 0 退出）不做告警，人工看脚本旁的日志。
- runner 自身的存活和单实例由 pm2 保证；代码里只保留启动时的单例检查。
- 不引入 adapter、wrapper、helper、兼容层；旧逻辑直接删。

## 脚本约定

- 只支持 分 时 日 月 周 五段。
- cron 写在文件头注释区（第一行到第一行正式代码之前，空行不截断）；.ts/.js 用 // 或 /** */，.sh 用 #。
- 只有带 `@cron` 标记的行才算调度配置，标记后取 5 段，之后是说明文字；不合法的行静默忽略。
- 块外每条 `@cron` 独立调度，同一分钟命中几条就 spawn 几次（group=0）。
- `@cronbegin` / `@cronend` 块内是“或”：同一块命中多少条都只 spawn 一次（按 group 去重）。
  块嵌套、不成对时整个文件不调度，记 Error 日志。块内每行仍要写 `@cron`。
- 启动时检测 tsx：缺失只警告，.ts 回退到 node 直接跑（不保证所有语法可用）；.js/.sh 不受影响。

## 日志

- 主日志：pm2 --log cronjob-runner/main.log。
- 事件行格式：<dtm> JOBSPWD path=<相对路径> pid=<pid>，另有 JOBERR、JOBEXIT。
- 任务日志：cronjob/<相对路径>.log，append。
- pid 只出现在主日志的三个事件里（JOBSPWD / JOBERR / JOBEXIT），任务日志里不再单独写。
- 日志权限默认 0644，多人可见，不做特殊处理。

## 其它

- 不做重叠保护，不做失败重试，不做补跑，不做漏跑检查。
