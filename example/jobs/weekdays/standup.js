/**
 * 块内多个表达式是「或」：命中任意一条也只跑一次。
 *
 * @cronbegin
 * @cron 0 9 * * 1-5 工作日早上
 * @cron 0 9 * * 6 周六也来
 * @cronend
 */
console.log(`[standup] ${new Date().toISOString()}`);
