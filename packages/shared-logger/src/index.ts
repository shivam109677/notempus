import pino from "pino";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  correlationId?: string;
  userId?: string;
  sessionId?: string;
  service?: string;
  duration?: number;
  [key: string]: unknown;
}

class Logger {
  private pinoLogger = pino({
    level: process.env.LOG_LEVEL || "info",
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "hostname,pid",
      },
    },
  });

  private formatMessage(message: string, context?: LogContext): { msg: string; ctx: LogContext } {
    return {
      msg: message,
      ctx: context || {},
    };
  }

  debug(message: string, context?: LogContext): void {
    this.pinoLogger.debug(this.formatMessage(message, context));
  }

  info(message: string, context?: LogContext): void {
    this.pinoLogger.info(this.formatMessage(message, context));
  }

  warn(message: string, context?: LogContext): void {
    this.pinoLogger.warn(this.formatMessage(message, context));
  }

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    const ctx = context || {};
    if (error instanceof Error) {
      ctx.error = error.message;
      ctx.stack = error.stack;
    } else if (typeof error === "object") {
      ctx.error = error;
    }
    this.pinoLogger.error(this.formatMessage(message, ctx));
  }
}

export function createLogger(service: string): Logger {
  const logger = new Logger();
  logger.info(`Logger initialized for ${service}`, { service });
  return logger;
}

export default Logger;
