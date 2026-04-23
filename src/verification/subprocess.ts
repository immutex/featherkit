import { spawn } from 'node:child_process';

export type SubprocessResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export async function runSubprocess(
  command: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<SubprocessResult> {
  return await new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      resolve({ exitCode: 127, stdout, stderr: error.message });
    });

    child.on('close', (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}
