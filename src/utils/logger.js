import pino from 'pino';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const logsDir = join(ROOT, 'logs');
if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

const level = process.env.LOG_LEVEL || 'info';

const logger = pino({
  level,
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
          ignore: 'pid,hostname',
        },
        level,
      },
      {
        target: 'pino/file',
        options: { destination: join(logsDir, 'app.log'), mkdir: true },
        level,
      },
    ],
  },
});

export default logger;
