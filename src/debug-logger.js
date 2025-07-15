class DebugLogger {
  constructor() {
    this.logs = [];
    this.isDebugMode = false;
    this.maxLogs = 1000; // Keep last 1000 logs
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
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }

  setDebugMode(enabled) {
    this.isDebugMode = enabled;
  }
}

// Create a global instance
const debugLogger = new DebugLogger();

export default debugLogger;