import * as Sentry from '@sentry/node';

const { logger } = Sentry;

class DebugLogger {
  constructor() {
    this.logs = [];
    this.isDebugMode = false;
    this.maxLogs = 1000; // Keep last 1000 logs
    logger.info('DebugLogger initialized');
  }

  log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      args: args.length > 0 ? args : undefined
    };

    this.logs.push(logEntry);

    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // If debug mode is enabled, also log to console
    if (this.isDebugMode) {
      const originalConsole = console[level] || console.log;
      originalConsole(`[${timestamp}] ${message}`, ...args);
    }

    // Log to Sentry as well
    logger[level](message, ...args);
  }

  info(message, ...args) {
    this.log('info', message, ...args);
  }

  warn(message, ...args) {
    this.log('warn', message, ...args);
  }

  error(message, ...args) {
    this.log('error', message, ...args);
  }

  debug(message, ...args) {
    this.log('debug', message, ...args);
  }

  getLogs() {
    logger.debug('Retrieving debug logs', { count: this.logs.length });
    return [...this.logs];
  }

  clearLogs() {
    logger.info('Clearing debug logs', { previousCount: this.logs.length });
    this.logs = [];
  }

  setDebugMode(enabled) {
    logger.info('Setting debug mode', { enabled });
    this.isDebugMode = enabled;
  }
}

// Create a global instance
const debugLogger = new DebugLogger();

export default debugLogger;