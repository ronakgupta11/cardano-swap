/**
 * Simple logging utility with different log levels
 */
export class Logger {
    private static formatMessage(level: string, message: string): string {
        const timestamp = new Date().toISOString();
        return `[${timestamp}] [${level}] ${message}`;
    }

    static info(message: string): void {
        console.log(this.formatMessage('INFO', message));
    }

    static warn(message: string): void {
        console.warn(this.formatMessage('WARN', message));
    }

    static error(message: string, error?: Error): void {
        console.error(this.formatMessage('ERROR', message));
        if (error) {
            console.error('Stack trace:', error.stack);
        }
    }

    static debug(message: string): void {
        if (process.env.DEBUG === 'true') {
            console.log(this.formatMessage('DEBUG', message));
        }
    }

    static success(message: string): void {
        console.log(this.formatMessage('SUCCESS', `✅ ${message}`));
    }
}
