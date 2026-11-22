import { cronjob } from '../dist/index.mjs';

async function main() {
  const task = await cronjob();

  // # 必须停止task才能正常退出，正常被pm2重启
  process.on('SIGINT', () => {
    console.log(`SIGINT,pid=${process.pid}`);
    task.stop();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    console.log(`SIGTERM,pid=${process.pid}`);
    task.stop();
    process.exit(0);
  });
}

main();
// 这里的task在main函数内部定义，外部无法访问，因此可以删除这部分重复的信号处理代码
// pm2 start cronjob-runner/main.js  --log cronjob-runner/main.log  --name cronjob --no-treekill
