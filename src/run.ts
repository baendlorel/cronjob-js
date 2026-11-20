import type { Job } from './types/job.js';
import type { CronjobConfig } from './config.js';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env } from 'node:process';

import { LogTag } from './consts.js';
import { log } from './utils.js';
import { CMD_NONE } from './interpreter.js';

export function run(config: CronjobConfig, { filepath, interpreter }: Job) {
  let output: number | null = null;
  const closeOutput = () => {
    if (output !== null) {
      fs.closeSync(output);
      output = null; // ! 防止反复close
    }
  };
  try {
    const parsed = path.parse(filepath);
    const relativePath = path.relative(config.dir, filepath);

    // 把相对于cron文件夹的路径也带入到日志路径中，这样符合直觉
    const logfile = path.join(config.logDir, relativePath + '.log');

    // 子目录下的脚本，其日志子目录也要存在，否则 shell 重定向失败、命令不会执行
    fs.mkdirSync(path.dirname(logfile), { recursive: true });

    // 运行这个文件
    if (interpreter.cmd === CMD_NONE) {
      log(`Unsupported file: ${filepath}`);
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
      cwd: config.jobcwd(filepath),
    });

    child.on('error', (e) => {
      closeOutput();
      log(`${LogTag.Error} path=${filepath} pid=${child.pid ?? '-1'}`, e);
    });
    child.on('spawn', () => {
      closeOutput();
      log(`${LogTag.Spawned} path=${filepath} pid=${child.pid ?? '-1'}`);
    });
    child.on('exit', (code, signal) => {
      closeOutput();
      log(`${LogTag.Exit} path=${filepath} pid=${child.pid ?? '-1'} code=${code} signal=${signal}`);
    });
    child.unref();
  } catch (e) {
    closeOutput();
    console.error(e);
  }
}
