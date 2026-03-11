import { runServe } from './serve.js';
import { runSetup, runInteractiveInit } from './setup.js';
import { printHelp } from './help.js';
import { runConfigCli } from './config.js';

const command = process.argv[2];
const flags = process.argv.slice(3);
const force = flags.includes('--force');

async function main(): Promise<void> {
  switch (command) {
    case 'serve':
      await runServe();
      break;

    case 'setup-claude':
      await runSetup('claude', { force });
      break;

    case 'setup-cursor':
      await runSetup('cursor', { force });
      break;

    case 'setup-copilot':
      await runSetup('copilot', { force });
      break;

    case 'setup-augment':
      await runSetup('augment', { force });
      break;

    case 'init':
      if (flags.includes('--reconfigure-pat')) {
        const { reconfigurePat } = await import('./reconfigure-pat.js');
        await reconfigurePat();
      } else {
        await runInteractiveInit({ skipIfExists: false });
      }
      break;

    case 'config': {
      const subcommand = flags[0];
      const subArgs = flags.slice(1);
      await runConfigCli(subcommand, subArgs);
      break;
    }

    case '--help':
    case '-h':
    case undefined:
      printHelp();
      break;

    case '--version':
    case '-v': {
      const { readFileSync } = await import('node:fs');
      const { join, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const __dirname = dirname(fileURLToPath(import.meta.url));
      // Walk up from dist/cli/ to find package.json
      try {
        const pkgPath = join(__dirname, '..', '..', 'package.json');
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
        console.log(`sprint-pilot v${pkg.version}`);
      } catch {
        console.log('sprint-pilot (version unknown)');
      }
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "sprint-pilot --help" for usage information.');
      process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error('Fatal error:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
