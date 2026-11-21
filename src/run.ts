import type { Job } from './types/job.js';
import type { CronjobContext } from './config.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env } from 'node:process';

import { Tag } from './consts.js';
import { log } from './utils.js';
import { CMD_NONE } from './interpreter.js';

export function run(cx: CronjobContext, { filepath, interpreter }: Job) {
  let output: number | null = null;
  const closeOutput = () => {
    if (output !== null) {
      fs.closeSync(output);
      output = null; // ! 防止反复close
    }
  };
  // 主日志统一用相对路径，绝对路径只用于 spawn
  const relativePath = path.relative(cx.dir, filepath);
  try {
    // 把相对于cron文件夹的路径也带入到日志路径中，这样符合直觉
    const logfile = path.join(cx.logDir, relativePath + '.log');

    // 子目录下的脚本，其日志子目录也要存在，否则 shell 重定向失败、命令不会执行
    fs.mkdirSync(path.dirname(logfile), { recursive: true });

    // 运行这个文件
    if (interpreter.cmd === CMD_NONE) {
      log(cx, `${Tag.Warn} path=${relativePath} unsupported extension`);
      return;
    }

    const cmd = interpreter.cmd;
    const args = interpreter.args.concat(filepath);

    output = fs.openSync(logfile, 'a');

    const child = spawn(cmd, args, {
      stdio: ['ignore', output, output],
      detached: true,
      env,
      // 子进程 cwd 默认和主程序一样，或者以--cwd=xxx录入
      cwd: cx.jobcwd(filepath),
    });

    child.on('error', (e) => {
      closeOutput();
      log(cx, `${Tag.Error} path=${relativePath} pid=${child.pid ?? '-1'}`, e);
    });
    child.on('spawn', () => {
      closeOutput();
      log(cx, `${Tag.Spawned} path=${relativePath} pid=${child.pid ?? '-1'}`);
    });
    child.on('exit', (code, signal) => {
      closeOutput();
      log(cx, `${Tag.Exit} path=${relativePath} pid=${child.pid ?? '-1'} code=${code} signal=${signal}`);
    });
    child.unref();
  } catch (e) {
    closeOutput();
    // spawn 之前的异常（mkdir/openSync/jobcwd 等）也要进主日志，否则无法定位
    log(cx, `${Tag.Error} path=${relativePath} pid=-1`, e);
  }
}
