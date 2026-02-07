import { appendFileSync } from "fs";
import { join } from "path";

const LOG_FILE = join(import.meta.dirname, "mcp-server.log");

function formatMessage(level: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : "";
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
