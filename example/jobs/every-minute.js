// @cron * * * * * 每分钟一次，用来确认 runner 活着
console.log(`[every-minute] ${new Date().toISOString()}`);
