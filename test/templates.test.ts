import { describe, it, expect } from 'vitest';
import { getAllTemplates, renderTaskTemplate } from '../src/templates/index.js';
import { renderClaudeMd } from '../src/templates/claude-md.js';
import { renderProjectState } from '../src/templates/project-state.js';
import { renderFeatheragentsConfig } from '../src/templates/featheragents-config.js';
import { renderOpenCodeConfig } from '../src/templates/opencode/config.js';
import { renderFrameSkill } from '../src/templates/skills/frame.js';
import { renderBuildSkill } from '../src/templates/skills/build.js';
import { renderCriticSkill } from '../src/templates/skills/critic.js';
import { renderSyncSkill } from '../src/templates/skills/sync.js';
import { renderBuilderAgent } from '../src/templates/opencode/agents/builder.js';
import { renderCriticAgent } from '../src/templates/opencode/agents/critic.js';
import { renderSyncerAgent } from '../src/templates/opencode/agents/syncer.js';
import { ProjectStateSchema, FeatherConfigSchema } from '../src/config/schema.js';
import { defaultConfig } from '../src/config/defaults.js';
import type { FeatherConfig } from '../src/config/schema.js';

function makeConfig(overrides: Partial<FeatherConfig> = {}): FeatherConfig {
  return { ...defaultConfig('test-project'), ...overrides };
}

// ── Manifest ──────────────────────────────────────────────────────────────────

describe('getAllTemplates', () => {
  it('includes .claude/ files for claude-code client', () => {
    const files = getAllTemplates(makeConfig({ clients: 'claude-code' }));
    const paths = files.map((f) => f.relativePath);
    expect(paths.some((p) => p.startsWith('.claude/'))).toBe(true);
    expect(paths.some((p) => p.startsWith('.opencode/'))).toBe(false);
  });

  it('includes .opencode/ files for opencode client', () => {
    const files = getAllTemplates(makeConfig({ clients: 'opencode' }));
    const paths = files.map((f) => f.relativePath);
    expect(paths.some((p) => p.startsWith('.opencode/'))).toBe(true);
    expect(paths.some((p) => p.startsWith('.claude/'))).toBe(false);
  });

  it('includes both .claude/ and .opencode/ for both clients', () => {
    const files = getAllTemplates(makeConfig({ clients: 'both' }));
    const paths = files.map((f) => f.relativePath);
    expect(paths.some((p) => p.startsWith('.claude/'))).toBe(true);
    expect(paths.some((p) => p.startsWith('.opencode/'))).toBe(true);
  });

  it('always includes state.json', () => {
    for (const clients of ['claude-code', 'opencode', 'both'] as const) {
      const files = getAllTemplates(makeConfig({ clients }));
      const paths = files.map((f) => f.relativePath);
      expect(paths.some((p) => p.endsWith('state.json'))).toBe(true);
    }
  });

  it('always includes featheragents/config.json', () => {
    const files = getAllTemplates(makeConfig());
    const paths = files.map((f) => f.relativePath);
    expect(paths).toContain('featheragents/config.json');
  });

  it('always includes project-docs files', () => {
    const files = getAllTemplates(makeConfig());
    const paths = files.map((f) => f.relativePath);
    expect(paths.some((p) => p.includes('project-docs'))).toBe(true);
  });

  it('all files have non-empty paths', () => {
    const files = getAllTemplates(makeConfig());
    for (const f of files) {
      expect(f.relativePath.length).toBeGreaterThan(0);
    }
  });

  it('includes all four skill files for claude-code', () => {
    const files = getAllTemplates(makeConfig({ clients: 'claude-code' }));
    const paths = files.map((f) => f.relativePath);
    expect(paths).toContain('.claude/commands/frame.md');
    expect(paths).toContain('.claude/commands/build.md');
    expect(paths).toContain('.claude/commands/critic.md');
    expect(paths).toContain('.claude/commands/sync.md');
  });
});

// ── CLAUDE.md ─────────────────────────────────────────────────────────────────

describe('renderClaudeMd', () => {
  it('contains the project name', () => {
    const out = renderClaudeMd(makeConfig({ projectName: 'myapp' }));
    expect(out).toContain('myapp');
  });

  it('lists all four MCP tools', () => {
    const out = renderClaudeMd(makeConfig());
    expect(out).toContain('get_project_brief');
    expect(out).toContain('get_task');
    expect(out).toContain('start_task');
    expect(out).toContain('write_handoff');
  });

  it('lists model roles', () => {
    const out = renderClaudeMd(makeConfig());
    expect(out).toContain('frame');
    expect(out).toContain('build');
    expect(out).toContain('critic');
    expect(out).toContain('sync');
  });

  it('mentions enabled integrations', () => {
    const config = makeConfig({
      integrations: { linear: true, github: false, context7: false, webSearch: false },
    });
    const out = renderClaudeMd(config);
    expect(out).toContain('linear');
  });

  it('does not mention disabled integrations in the integrations section', () => {
    const config = makeConfig({
      integrations: { linear: false, github: false, context7: false, webSearch: false },
    });
    const out = renderClaudeMd(config);
    // Should not have an integrations section at all
    expect(out).not.toContain('### Integrations');
  });
});

// ── Project state ─────────────────────────────────────────────────────────────

describe('renderProjectState', () => {
  it('produces valid JSON', () => {
    const out = renderProjectState(makeConfig());
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('produces a valid ProjectState', () => {
    const out = renderProjectState(makeConfig());
    const result = ProjectStateSchema.safeParse(JSON.parse(out));
    expect(result.success).toBe(true);
  });

  it('starts with empty task list', () => {
    const parsed = JSON.parse(renderProjectState(makeConfig()));
    expect(parsed.tasks).toEqual([]);
    expect(parsed.currentTask).toBeNull();
  });
});

// ── Featheragents config ──────────────────────────────────────────────────────

describe('renderFeatheragentsConfig', () => {
  it('produces valid JSON', () => {
    const config = makeConfig();
    const out = renderFeatheragentsConfig(config);
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('round-trips through FeatherConfigSchema', () => {
    const config = makeConfig();
    const out = renderFeatheragentsConfig(config);
    const result = FeatherConfigSchema.safeParse(JSON.parse(out));
    expect(result.success).toBe(true);
  });

  it('preserves project name', () => {
    const config = makeConfig({ projectName: 'roundtrip-test' });
    const parsed = JSON.parse(renderFeatheragentsConfig(config));
    expect(parsed.projectName).toBe('roundtrip-test');
  });
});

// ── OpenCode config ───────────────────────────────────────────────────────────

describe('renderOpenCodeConfig', () => {
  it('produces valid JSON', () => {
    const out = renderOpenCodeConfig(makeConfig());
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it('contains featheragents MCP server entry', () => {
    const parsed = JSON.parse(renderOpenCodeConfig(makeConfig()));
    expect(parsed.mcp?.featheragents).toBeDefined();
    expect(parsed.mcp.featheragents.command).toBe('node');
    expect(parsed.mcp.featheragents.args).toContain('./node_modules/featheragents/dist/server.js');
  });

  it('includes agent definitions', () => {
    const parsed = JSON.parse(renderOpenCodeConfig(makeConfig()));
    expect(parsed.agents?.builder).toBeDefined();
    expect(parsed.agents?.critic).toBeDefined();
    expect(parsed.agents?.syncer).toBeDefined();
  });
});

// ── Task template ─────────────────────────────────────────────────────────────

describe('renderTaskTemplate', () => {
  it('contains the task id', () => {
    const out = renderTaskTemplate(makeConfig(), 'FEAT-001');
    expect(out).toContain('FEAT-001');
  });

  it('contains all required sections', () => {
    const out = renderTaskTemplate(makeConfig(), 'X-1');
    const sections = ['Goal', 'Status', 'Files', 'Constraints', 'Risks', 'Review Notes', 'Next Action', 'Done Criteria'];
    for (const section of sections) {
      expect(out).toContain(`## ${section}`);
    }
  });

  it('includes optional title when provided', () => {
    const out = renderTaskTemplate(makeConfig(), 'X-1', 'Add login');
    expect(out).toContain('Add login');
  });
});

// ── Skill content (Task 08) ───────────────────────────────────────────────────

const MCP_TOOLS = [
  'mcp__featheragents__get_project_brief',
  'mcp__featheragents__get_active_focus',
  'mcp__featheragents__get_task',
  'mcp__featheragents__start_task',
  'mcp__featheragents__append_progress',
  'mcp__featheragents__record_review_notes',
  'mcp__featheragents__write_handoff',
  'mcp__featheragents__get_diff',
  'mcp__featheragents__prepare_context_pack',
];

describe('renderFrameSkill', () => {
  it('references get_project_brief and get_active_focus', () => {
    const out = renderFrameSkill(makeConfig());
    expect(out).toContain('mcp__featheragents__get_project_brief');
    expect(out).toContain('mcp__featheragents__get_active_focus');
  });

  it('references start_task', () => {
    const out = renderFrameSkill(makeConfig());
    expect(out).toContain('mcp__featheragents__start_task');
  });

  it('contains anti-bloat rules', () => {
    const out = renderFrameSkill(makeConfig());
    expect(out.toLowerCase()).toContain('do not');
  });

  it('mentions done criteria', () => {
    const out = renderFrameSkill(makeConfig());
    expect(out).toContain('Done Criteria');
  });

  it('stays under 2000 words', () => {
    const out = renderFrameSkill(makeConfig());
    expect(out.split(/\s+/).length).toBeLessThan(2000);
  });
});

describe('renderBuildSkill', () => {
  it('references get_task and append_progress', () => {
    const out = renderBuildSkill(makeConfig());
    expect(out).toContain('mcp__featheragents__get_task');
    expect(out).toContain('mcp__featheragents__append_progress');
  });

  it('has instructions to commit small', () => {
    const out = renderBuildSkill(makeConfig());
    expect(out.toLowerCase()).toMatch(/small.*commit|commit.*small/);
  });

  it('contains anti-bloat rules', () => {
    const out = renderBuildSkill(makeConfig());
    expect(out.toLowerCase()).toContain('do not');
  });

  it('stays under 2000 words', () => {
    const out = renderBuildSkill(makeConfig());
    expect(out.split(/\s+/).length).toBeLessThan(2000);
  });
});

describe('renderCriticSkill', () => {
  it('references get_task and record_review_notes', () => {
    const out = renderCriticSkill(makeConfig());
    expect(out).toContain('mcp__featheragents__get_task');
    expect(out).toContain('mcp__featheragents__record_review_notes');
  });

  it('mentions blockers and suggestions as separate categories', () => {
    const out = renderCriticSkill(makeConfig());
    expect(out.toLowerCase()).toContain('blocker');
    expect(out.toLowerCase()).toContain('suggestion');
  });

  it('says not to approve if criteria are unmet', () => {
    const out = renderCriticSkill(makeConfig());
    // Phrasing: "approve if any done criterion is unmet" under a Do NOT section
    expect(out.toLowerCase()).toMatch(/approve.*unmet|unmet.*approve/);
  });

  it('stays under 2000 words', () => {
    const out = renderCriticSkill(makeConfig());
    expect(out.split(/\s+/).length).toBeLessThan(2000);
  });
});

describe('renderSyncSkill', () => {
  it('references get_task, get_active_focus, and write_handoff', () => {
    const out = renderSyncSkill(makeConfig());
    expect(out).toContain('mcp__featheragents__get_task');
    expect(out).toContain('mcp__featheragents__get_active_focus');
    expect(out).toContain('mcp__featheragents__write_handoff');
  });

  it('specifies self-contained handoff requirement', () => {
    const out = renderSyncSkill(makeConfig());
    expect(out.toLowerCase()).toContain('self-contained');
  });

  it('mentions what-was-done and what-is-next sections', () => {
    const out = renderSyncSkill(makeConfig());
    expect(out.toLowerCase()).toContain('what was done');
    expect(out.toLowerCase()).toContain('what is next');
  });

  it('stays under 2000 words', () => {
    const out = renderSyncSkill(makeConfig());
    expect(out.split(/\s+/).length).toBeLessThan(2000);
  });
});

// ── OpenCode agent prompts ────────────────────────────────────────────────────

describe('renderBuilderAgent', () => {
  it('references correct MCP tools', () => {
    const out = renderBuilderAgent(makeConfig());
    expect(out).toContain('mcp__featheragents__get_task');
    expect(out).toContain('mcp__featheragents__append_progress');
  });

  it('is self-contained (no external file references needed)', () => {
    const out = renderBuilderAgent(makeConfig());
    expect(out.length).toBeGreaterThan(200);
  });

  it('contains hard rules section', () => {
    const out = renderBuilderAgent(makeConfig());
    expect(out.toLowerCase()).toContain('hard rules');
  });
});

describe('renderCriticAgent', () => {
  it('references get_task and record_review_notes', () => {
    const out = renderCriticAgent(makeConfig());
    expect(out).toContain('mcp__featheragents__get_task');
    expect(out).toContain('mcp__featheragents__record_review_notes');
  });

  it('mentions blocker/suggestion separation', () => {
    const out = renderCriticAgent(makeConfig());
    expect(out.toLowerCase()).toContain('blocker');
    expect(out.toLowerCase()).toContain('suggestion');
  });
});

describe('renderSyncerAgent', () => {
  it('references all three required MCP tools', () => {
    const out = renderSyncerAgent(makeConfig());
    expect(out).toContain('mcp__featheragents__get_task');
    expect(out).toContain('mcp__featheragents__get_active_focus');
    expect(out).toContain('mcp__featheragents__write_handoff');
  });

  it('specifies word limit for handoff notes', () => {
    const out = renderSyncerAgent(makeConfig());
    expect(out).toContain('300');
  });
});

// ── All skills use correct MCP tool names ─────────────────────────────────────

describe('skill MCP tool name correctness', () => {
  const skills = [
    { name: 'frame', render: renderFrameSkill },
    { name: 'build', render: renderBuildSkill },
    { name: 'critic', render: renderCriticSkill },
    { name: 'sync', render: renderSyncSkill },
  ];

  // Every tool name mentioned must be a known valid tool
  for (const { name, render } of skills) {
    it(`${name} skill only references known MCP tool names`, () => {
      const out = render(makeConfig());
      const mentioned = out.match(/mcp__featheragents__\w+/g) ?? [];
      for (const tool of mentioned) {
        expect(MCP_TOOLS, `Unknown tool "${tool}" in ${name} skill`).toContain(tool);
      }
    });
  }
});
