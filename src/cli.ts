import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initCommand } from './commands/init.js';
import { doctorCommand } from './commands/doctor.js';
import { mcpCommand } from './commands/mcp-install.js';
import { taskCommand } from './commands/task.js';
import { handoffCommand } from './commands/handoff.js';
import { reviewCommand } from './commands/review.js';
import { skillsCommand } from './commands/skills-install.js';
import { verifyCommand } from './commands/verify.js';
import { orchestrateCommand } from './commands/orchestrate.js';
import { approveCommand } from './commands/approve.js';
import { packagesCommand } from './commands/packages.js';
import { serveCommand } from './commands/serve.js';
import { authCommand } from './commands/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read version from package.json at dist time — bundled into cli.js
let version = '0.1.0';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as { version: string };
  version = pkg.version;
} catch {
  // bundled — version constant is fine
}

const program = new Command();

program
  .name('feather')
  .description('Lean multi-model agentic coding workflow')
  .version(version);

program.addCommand(initCommand);
program.addCommand(doctorCommand);
program.addCommand(mcpCommand);
program.addCommand(taskCommand);
program.addCommand(handoffCommand);
program.addCommand(reviewCommand);
program.addCommand(skillsCommand);
program.addCommand(verifyCommand);
program.addCommand(orchestrateCommand);
program.addCommand(approveCommand);
program.addCommand(packagesCommand);
program.addCommand(serveCommand);
program.addCommand(authCommand);

program.parse();
