import fs from 'fs';
import path from 'path';

export class Logger {
    private static logDir = path.join(process.cwd(), 'logs');
    private static logFile = path.join(process.cwd(), 'logs', 'app.log');

    private static ensureDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    static info(message: string, ...args: any[]) {
        this.write('INFO', message, args);
    }

    static error(message: string, ...args: any[]) {
        this.write('ERROR', message, args);
    }

    static warn(message: string, ...args: any[]) {
        this.write('WARN', message, args);
    }

    static startTimer(label: string) {
        this.info(`[Timer:start] ${label}`);
        return Date.now();
    }

    static endTimer(label: string, startMs: number, extra?: Record<string, unknown>) {
        const elapsedMs = Date.now() - startMs;
        if (extra) this.info(`[Timer:end] ${label} (${elapsedMs}ms)`, extra);
        else this.info(`[Timer:end] ${label} (${elapsedMs}ms)`);
        return elapsedMs;
    }


    private static write(level: string, message: string, args: any[]) {
        this.ensureDir();
        const timestamp = new Date().toISOString();
        const formattedArgs = args.map(arg => {
            if (arg instanceof Error) return arg.stack || arg.message;
            if (typeof arg === 'object') return JSON.stringify(arg);
            return arg;
        }).join(' ');

        const logLine = `[${timestamp}] [${level}] ${message} ${formattedArgs}\n`;

        // Console output for dev
        if (level === 'ERROR') console.error(`[${level}] ${message}`, ...args);
        else console.log(`[${level}] ${message}`, ...args);

        try {
            fs.appendFileSync(this.logFile, logLine);
        } catch (e) {
            console.error('Failed to write to log file:', e);
        }
    }
}
