import { appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const LOG_DIR = join(homedir(), ".everydaymcp");
const LOG_FILE = join(LOG_DIR, "server.log");

if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

function formatMessage(level: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data)}` : "";
  return `[${timestamp}] [${level}] ${message}${dataStr}\n`;
}

export const logger = {
  info(message: string, data?: unknown) {
    appendFileSync(LOG_FILE, formatMessage("INFO", message, data));
  },
  error(message: string, error?: unknown) {
    appendFileSync(LOG_FILE, formatMessage("ERROR", message, error));
  },
};
