# example/jobs

一组可运行的示例脚本，同时作为 `tests/` 里 glob / 解析 / 调度的真实素材。

| 文件 | 表达式 | 说明 |
| --- | --- | --- |
| `every-minute.js` | `* * * * *` | 每分钟一次 |
| `daily-report.js` | `0 9 * * *`、`30 18 * * 1-5` | 块外多条各自调度 |
| `backup.sh` | `0 3 * * *` | shebang 覆盖默认解释器 |
| `weekdays/standup.js` | 块内两条 | 命中任意一条只跑一次 |

`README.md` 不是 `.ts/.js/.sh`，不会被 glob 选中。
