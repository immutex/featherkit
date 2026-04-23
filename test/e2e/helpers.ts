import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { defaultConfig } from '../../src/config/defaults.js';
import { runInit } from '../../src/commands/init.js';
import { DEFAULT_WORKFLOW_TEXT } from '../../src/workflow/default.js';

const TMP_PREFIX = 'featherkit-e2e-';

async function createFakeBinary(binDir: string, name: string): Promise<void> {
  const filePath = join(binDir, name);
  await writeFile(filePath, '#!/bin/sh\nprintf "1.0.0\\n"\n', 'utf8');
  await chmod(filePath, 0o755);
}

export async function createTmpProject(projectName: string, options?: { installPackage?: boolean; fakeBinaries?: string[] }) {
  const tmpDir = await mkdtemp(join(tmpdir(), TMP_PREFIX));
  const config = defaultConfig(projectName, 'balanced');
  await runInit(tmpDir, {
    name: projectName,
    preset: 'balanced',
    clients: 'both',
    yes: true,
    localOnly: true,
    force: true,
  });
  await mkdir(dirname(join(tmpDir, config.workflow)), { recursive: true });
  await writeFile(join(tmpDir, config.workflow), DEFAULT_WORKFLOW_TEXT, 'utf8');

  if (options?.installPackage) {
    const serverPath = join(tmpDir, 'node_modules', '@1mmutex', 'featherkit', 'dist', 'server.js');
    await mkdir(dirname(serverPath), { recursive: true });
    await writeFile(serverPath, 'export {};\n', 'utf8');
  }

  let binDir: string | undefined;
  if ((options?.fakeBinaries?.length ?? 0) > 0) {
    binDir = join(tmpDir, '.bin');
    await mkdir(binDir, { recursive: true });
    for (const binary of options?.fakeBinaries ?? []) {
      await createFakeBinary(binDir, binary);
    }
  }

  return { tmpDir, config, binDir };
}

export async function readToken(tmpDir: string, stateDir: string): Promise<string> {
  return (await readFile(join(tmpDir, stateDir, 'dashboard.token'), 'utf8')).trim();
}

export async function waitForHttp(url: string, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  throw new Error(`Timed out waiting for ${url}`);
}

export async function cleanup(tmpDir: string): Promise<void> {
  await rm(tmpDir, { recursive: true, force: true });
}

export function projectExists(tmpDir: string): boolean {
  return existsSync(tmpDir);
}
