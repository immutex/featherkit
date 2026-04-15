// ANSI-colored console output — no external deps.

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';

function colorize(color: string, text: string): string {
  if (!process.stdout.isTTY) return text;
  return `${color}${text}${RESET}`;
}

export const log = {
  info(msg: string): void {
    console.log(colorize(CYAN, '  ') + ' ' + msg);
  },
  success(msg: string): void {
    console.log(colorize(GREEN, '✓') + ' ' + msg);
  },
  warn(msg: string): void {
    console.log(colorize(YELLOW, '⚠') + ' ' + msg);
  },
  error(msg: string): void {
    console.error(colorize(RED, '✗') + ' ' + msg);
  },
  dim(msg: string): void {
    console.log(colorize(DIM + GRAY, msg));
  },
  bold(msg: string): void {
    console.log(colorize(BOLD, msg));
  },
  blank(): void {
    console.log('');
  },
};
