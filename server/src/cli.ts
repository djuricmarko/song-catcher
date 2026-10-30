#!/usr/bin/env node
import { Command } from 'commander';
import pino from 'pino';

import {
  ConfigError,
  checkEnvironment,
  loadConfig,
  redactConfig,
  type AppConfig,
} from './config/env.js';
import { DeezerClient } from './deezer/client.js';
import { createLogger } from './logging.js';
import { startServer } from './http/start.js';
import { VERSION } from './version.js';

interface CliOptions {
  printConfig?: boolean;
  check?: boolean;
}

function printConfig(config: AppConfig): void {
  console.log(JSON.stringify(redactConfig(config), null, 2));
}

async function run(options: CliOptions): Promise<void> {
  const config = loadConfig(process.env);

  if (options.printConfig) {
    printConfig(config);
    return;
  }

  const report = await checkEnvironment(config);
  for (const warning of report.warnings) {
    console.warn(`warning: ${warning}`);
  }
  if (report.errors.length > 0) {
    for (const error of report.errors) {
      console.error(`error: ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  if (options.check) {
    console.log('Configuration OK');
    for (const [name, executable] of Object.entries(report.tools)) {
      console.log(`  ${name}: ${executable ?? 'not found'}`);
    }

    const logger = pino({ level: 'silent' });
    const deezer = new DeezerClient(config, logger);
    try {
      await deezer.init();
      const loginOk = await deezer.testLogin();
      console.log(`Deezer login: ${loginOk ? 'OK' : 'FAILED'}`);
      if (!loginOk) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(
        `Deezer login failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exitCode = 1;
    }
    return;
  }

  const logger = createLogger(config);
  await startServer(config, logger);
}

const program = new Command()
  .name('deezer-downloader')
  .description('Download music from Deezer and YouTube with a React frontend.')
  .version(VERSION, '--version', 'show version and exit')
  .option('--print-config', 'print the resolved configuration with secrets redacted and exit')
  .option('--check', 'validate configuration, external tools and Deezer login, then exit')
  .action(async (options: CliOptions) => {
    await run(options);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
});
