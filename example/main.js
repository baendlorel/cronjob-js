import { cronjob } from '../src/index.js';

cronjob();

// pm2 start cronjob-runner/main.js  --log cronjob-runner/main.log  --name cronjob
