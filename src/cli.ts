import { Command } from 'commander';
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

declare const __PKG_VERSION__: string;

const program = new Command();

program
  .name('feather')
  .description('Lean multi-model agentic coding workflow')
  .version(__PKG_VERSION__);

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
