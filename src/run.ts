import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { env } from 'node:process';
import { consts, joblogtag } from './consts.js';
import { log } from './utils.js';
import { hasTsx } from './initialize.js';

export const runFile = ({ fullpath, dev, cwd }) => {
  let output = null;
  const closeOutput = () => {
    if (output !== null) {
      fs.closeSync(output);
      output = null; // ! 防止反复close
    }
  };
  try {
    const parsed = path.parse(fullpath);
    const relativePath = path.relative(consts.定时任务位置, fullpath);

    // 把相对于cron文件夹的路径也带入到日志路径中，这样符合直觉
    const logfile = path.join(consts.日志路径, relativePath + '.log');

    // 子目录下的脚本，其日志子目录也要存在，否则 shell 重定向失败、命令不会执行
    fs.mkdirSync(path.dirname(logfile), { recursive: true });

    // 运行这个文件
    let cmd = '';
    let args = [];
    if (parsed.ext === '.ts') {
      cmd = process.execPath;
      args = hasTsx ? ['--import', 'tsx', fullpath] : [fullpath];
    } else if (parsed.ext === '.js') {
      cmd = process.execPath;
      args = [fullpath];
    } else if (parsed.ext === '.sh') {
      cmd = 'bash';
      args = [fullpath];
    } else {
      log(`Unsupported file: ${fullpath}`);
      return;
    }
    // args.push('>>', logfile, '2>&1');

    output = fs.openSync(logfile, 'a');

    const child = spawn(cmd, args, {
      stdio: ['ignore', output, output],
      detached: true,
      env: dev ? { ...env, CRONJOB_IS_DEV: 'true' } : env,
      // 子进程 cwd 默认和主程序一样，或者以--cwd=xxx录入
      cwd,
    });

    child.on('error', (e) => {
      closeOutput();
      log(`${joblogtag.error} path=${relativePath} pid=${child.pid ?? '-1'}`, e);
    });
    child.on('spawn', () => {
      closeOutput();
      log(`${joblogtag.spawned} path=${relativePath} pid=${child.pid ?? '-1'}`);
    });
    child.on('exit', (code, signal) => {
      closeOutput();
      log(
        `${joblogtag.exit} path=${relativePath} pid=${child.pid ?? '-1'} code=${code} signal=${signal}`,
      );
    });
    child.unref();
  } catch (e) {
    closeOutput();
    console.error(e);
  }
};
