import type { Logger } from '@protontech/drive-sdk';
import { LogLevel } from '@protontech/drive-sdk/dist/telemetry';

const ORDER: Record<LogLevel, number> = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARNING]: 2,
    [LogLevel.ERROR]: 3,
};

export class ConsoleLogger implements Logger {
    constructor(private readonly minLevel: LogLevel = LogLevel.INFO) {}

    debug(msg: string): void {
        this.write(LogLevel.DEBUG, msg);
    }

    info(msg: string): void {
        this.write(LogLevel.INFO, msg);
    }

    warn(msg: string): void {
        this.write(LogLevel.WARNING, msg);
    }

    error(msg: string, error?: unknown): void {
        if (ORDER[LogLevel.ERROR] >= ORDER[this.minLevel]) {
            console.error(`[error] ${msg}`, error ?? '');
        }
    }

    private write(level: LogLevel, msg: string): void {
        if (ORDER[level] < ORDER[this.minLevel]) {
            return;
        }
        const line = `[${level.toLowerCase()}] ${msg}`;
        if (level === LogLevel.WARNING) {
            console.warn(line);
        } else {
            console.log(line);
        }
    }
}
