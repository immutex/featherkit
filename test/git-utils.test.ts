import { describe, it, expect } from 'vitest';
import { parseFilesFromTaskMd, parseSectionFromTaskMd, parseDiffFilePaths } from '../src/utils/git.js';

// ── parseFilesFromTaskMd ──────────────────────────────────────────────────────

describe('parseFilesFromTaskMd', () => {
  it('returns empty array when ## Files section is absent', () => {
    const md = '# Task\n\n## Goal\nDo something.\n';
    expect(parseFilesFromTaskMd(md)).toEqual([]);
  });

  it('parses simple file paths', () => {
    const md = '## Files\nsrc/foo.ts\nsrc/bar.ts\n\n## Goal\nDone.\n';
    expect(parseFilesFromTaskMd(md)).toEqual(['src/foo.ts', 'src/bar.ts']);
  });

  it('strips HTML comment lines', () => {
    const md = '## Files\n<!-- List files here -->\nsrc/main.ts\n\n## Done Criteria\n- [ ] done\n';
    expect(parseFilesFromTaskMd(md)).toEqual(['src/main.ts']);
  });

  it('strips empty lines', () => {
    const md = '## Files\n\nsrc/a.ts\n\nsrc/b.ts\n\n## Risks\nNone.\n';
    expect(parseFilesFromTaskMd(md)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('stops at the next ## heading', () => {
    const md = '## Files\nsrc/a.ts\n## Done Criteria\n- [ ] done\n';
    expect(parseFilesFromTaskMd(md)).toEqual(['src/a.ts']);
  });

  it('returns empty array for empty ## Files section', () => {
    const md = '## Files\n\n## Done Criteria\n- [ ] done\n';
    expect(parseFilesFromTaskMd(md)).toEqual([]);
  });

  it('handles Files section at end of file (no following heading)', () => {
    const md = '## Files\nsrc/a.ts\nsrc/b.ts';
    expect(parseFilesFromTaskMd(md)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('ignores // comment lines', () => {
    const md = '## Files\n// this is a comment\nsrc/a.ts\n';
    expect(parseFilesFromTaskMd(md)).toEqual(['src/a.ts']);
  });
});

// ── parseDiffFilePaths ────────────────────────────────────────────────────────

describe('parseDiffFilePaths', () => {
  it('returns empty array for empty input', () => {
    expect(parseDiffFilePaths('')).toEqual([]);
  });

  it('parses a single file path from a diff --git header', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'index abc..def 100644',
      '--- a/src/foo.ts',
      '+++ b/src/foo.ts',
    ].join('\n');
    expect(parseDiffFilePaths(diff)).toEqual(['src/foo.ts']);
  });

  it('parses multiple file paths', () => {
    const diff = [
      'diff --git a/src/foo.ts b/src/foo.ts',
      'index abc..def 100644',
      'diff --git a/src/bar.ts b/src/bar.ts',
      'index 123..456 100644',
    ].join('\n');
    expect(parseDiffFilePaths(diff)).toEqual(['src/foo.ts', 'src/bar.ts']);
  });

  it('handles deleted files (+++ /dev/null is not extracted)', () => {
    const diff = [
      'diff --git a/src/old.ts b/src/old.ts',
      'deleted file mode 100644',
      '--- a/src/old.ts',
      '+++ /dev/null',
    ].join('\n');
    // Only the diff --git header line is parsed — not the +++ line
    expect(parseDiffFilePaths(diff)).toEqual(['src/old.ts']);
  });

  it('handles new files', () => {
    const diff = [
      'diff --git a/src/new.ts b/src/new.ts',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/src/new.ts',
    ].join('\n');
    expect(parseDiffFilePaths(diff)).toEqual(['src/new.ts']);
  });

  it('ignores non-diff lines', () => {
    const diff = 'Some preamble\ndiff --git a/src/util.ts b/src/util.ts\nother stuff';
    expect(parseDiffFilePaths(diff)).toEqual(['src/util.ts']);
  });

  it('does not parse +++ b/ lines (would be unreliable for deletions)', () => {
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      '+++ b/src/a.ts',
      '+++ b/src/b.ts',
    ].join('\n');
    // Only one path from the diff --git header, not two from the +++ lines
    expect(parseDiffFilePaths(diff)).toEqual(['src/a.ts']);
  });

  it('handles paths with slashes and hyphens', () => {
    const diff = 'diff --git a/src/mcp/tools/verify-phase.ts b/src/mcp/tools/verify-phase.ts';
    expect(parseDiffFilePaths(diff)).toEqual(['src/mcp/tools/verify-phase.ts']);
  });
});

// ── parseSectionFromTaskMd ────────────────────────────────────────────────────

describe('parseSectionFromTaskMd', () => {
  it('returns empty string when heading is not found', () => {
    const md = '## Goal\nSome goal.\n';
    expect(parseSectionFromTaskMd(md, 'Done Criteria')).toBe('');
  });

  it('extracts content between headings', () => {
    const md = '## Goal\nDo something useful.\n\n## Files\nsrc/a.ts\n';
    expect(parseSectionFromTaskMd(md, 'Goal')).toBe('Do something useful.');
  });

  it('strips HTML comments from section body', () => {
    const md = '## Goal\n<!-- What needs to be done -->\n\n## Files\nsrc/a.ts\n';
    expect(parseSectionFromTaskMd(md, 'Goal')).toBe('');
  });

  it('returns content up to end of file when no following heading', () => {
    const md = '## Done Criteria\n- [ ] Feature works\n- [ ] Tests pass';
    expect(parseSectionFromTaskMd(md, 'Done Criteria')).toBe('- [ ] Feature works\n- [ ] Tests pass');
  });

  it('handles multi-line sections', () => {
    const md = '## Constraints\nMust not break existing tests.\nMust follow conventions.\n\n## Risks\nNone.\n';
    const result = parseSectionFromTaskMd(md, 'Constraints');
    expect(result).toContain('Must not break existing tests.');
    expect(result).toContain('Must follow conventions.');
    expect(result).not.toContain('Risks');
  });
});
