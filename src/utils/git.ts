import { execa } from 'execa';

/**
 * Parse the `## Files` section from a task markdown file.
 * Returns file paths as an array. Strips comment lines and empty lines.
 */
export function parseFilesFromTaskMd(markdown: string): string[] {
  const lines = markdown.split('\n');
  const filesIdx = lines.findIndex((l) => /^##\s+Files\s*$/.test(l.trim()));
  if (filesIdx === -1) return [];

  const result: string[] = [];
  for (let i = filesIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at the next heading
    if (/^##\s/.test(line)) break;
    const trimmed = line.trim();
    // Skip empty lines, HTML comments, and markdown comment-style lines
    if (!trimmed || trimmed.startsWith('<!--') || trimmed.startsWith('//')) continue;
    result.push(trimmed);
  }
  return result;
}

/**
 * Parse a specific `## <heading>` section from task markdown.
 * Returns the section body text, or empty string if not found.
 */
export function parseSectionFromTaskMd(markdown: string, heading: string): string {
  const lines = markdown.split('\n');
  const pattern = new RegExp(`^##\\s+${heading}\\s*$`);
  const idx = lines.findIndex((l) => pattern.test(l.trim()));
  if (idx === -1) return '';

  const body: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    body.push(lines[i]);
  }

  return body
    .join('\n')
    .trim()
    .replace(/<!--[\s\S]*?-->/g, '') // strip HTML comments
    .trim();
}

/**
 * Extract changed file paths from a git diff output.
 * Parses `diff --git a/... b/<path>` header lines — robust for deletions
 * where `+++ b/dev/null` would appear.
 */
export function parseDiffFilePaths(diff: string): string[] {
  const result: string[] = [];
  for (const line of diff.split('\n')) {
    const match = line.match(/^diff --git a\/.+ b\/(.+)$/);
    if (match?.[1]) result.push(match[1]);
  }
  return result;
}

export interface GitDiffResult {
  diff: string;
  files: string[];
  scoped: boolean; // true if diff was limited to task file paths
}

/**
 * Run `git diff <base> -- [files]` and return the result.
 * Falls back to unscoped diff if no files are provided.
 * Never throws — errors are returned as descriptive messages.
 */
export async function runGitDiff(
  files: string[],
  base: string,
  cwd: string
): Promise<GitDiffResult> {
  const args = files.length > 0 ? ['diff', base, '--', ...files] : ['diff', base];
  const scoped = files.length > 0;

  try {
    const result = await execa('git', args, { cwd, reject: false });
    const diff = (result.stdout as string).trim();
    return { diff, files, scoped };
  } catch {
    return {
      diff: '(git not available or not a git repository)',
      files,
      scoped,
    };
  }
}
