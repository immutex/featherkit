import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { FeatherConfigSchema, type FeatherConfig } from './schema.js';

const CONFIG_PATH = 'featheragents/config.json';

export function getConfigPath(cwd = process.cwd()): string {
  return join(cwd, CONFIG_PATH);
}

export async function loadConfig(cwd = process.cwd()): Promise<FeatherConfig> {
  const configPath = getConfigPath(cwd);

  if (!existsSync(configPath)) {
    throw new Error(
      `No featheragents config found at ${configPath}\n` +
        `Run \`featheragents init\` to set up your project.`
    );
  }

  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read config at ${configPath}: ${String(err)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in ${configPath}. Check for syntax errors.`);
  }

  const result = FeatherConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid featheragents config:\n${issues}`);
  }

  return result.data;
}

export async function tryLoadConfig(cwd = process.cwd()): Promise<FeatherConfig | null> {
  try {
    return await loadConfig(cwd);
  } catch {
    return null;
  }
}
