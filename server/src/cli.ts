#!/usr/bin/env node
import { Command } from 'commander';
import pino from 'pino';

import { ConfigError, loadConfig, redactConfig, type AppConfig } from './config/env.js';
import { checkEnvironment, type EnvironmentReport } from './config/preflight.js';
import { DeezerClient } from './deezer/client.js';
import { startServer } from './http/start.js';
import { errorMessage } from './lib/errors.js';
import { createLogger } from './logging.js';
import { VERSION } from './version.js';

interface CliOptions {
  printConfig?: boolean;
  check?: boolean;
}

function printConfig(config: AppConfig): void {
  console.log(JSON.stringify(redactConfig(config), null, 2));
}

/** Prints what the environment check found. Returns false when the server cannot run. */
function reportEnvironment(report: EnvironmentReport): boolean {
  for (const warning of report.warnings) {
    console.warn(`warning: ${warning}`);
  }
  for (const error of report.errors) {
    console.error(`error: ${error}`);
  }
  return report.errors.length === 0;
}

/** `--check`: shows the resolved tools and tries a real Deezer login. Returns false when the login fails. */
async function checkDeezerLogin(config: AppConfig, report: EnvironmentReport): Promise<boolean> {
  console.log('Configuration OK');
  for (const [name, executable] of Object.entries(report.tools)) {
    console.log(`  ${name}: ${executable ?? 'not found'}`);
  }

  const deezer = new DeezerClient(config, pino({ level: 'silent' }));
  try {
    await deezer.init();
    const loginOk = await deezer.testLogin();
    console.log(`Deezer login: ${loginOk ? 'OK' : 'FAILED'}`);
    return loginOk;
  } catch (error) {
    console.error(`Deezer login failed: ${errorMessage(error)}`);
    return false;
  }
}

async function run(options: CliOptions): Promise<void> {
  const config = loadConfig(process.env);

  if (options.printConfig) {
    printConfig(config);
    return;
  }

  const report = await checkEnvironment(config);
  if (!reportEnvironment(report)) {
    process.exitCode = 1;
    return;
  }

  if (options.check) {
    if (!(await checkDeezerLogin(config, report))) {
      process.exitCode = 1;
    }
    return;
  }

  await startServer(config, createLogger(config));
}

const program = new Command()
  .name('song-catcher')
  .description('Download music from Deezer and YouTube with a React frontend.')
  .version(VERSION, '--version', 'show version and exit')
  .option('--print-config', 'print the resolved configuration with secrets redacted and exit')
  .option('--check', 'validate configuration, external tools and Deezer login, then exit')
  .action(async (options: CliOptions) => {
    await run(options);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof ConfigError) {
    // The message already lists every problem; a stack trace would only bury it.
    console.error(error.message);
  } else if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
});
