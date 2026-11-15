export { buildApp, type BuiltApp } from './app.js';
export { ConfigError, loadConfig, type AppConfig } from './config/env.js';
export { checkEnvironment, resolveExecutable, type EnvironmentReport } from './config/preflight.js';
export { errorMessage } from './lib/errors.js';
export { createLogger } from './logging.js';
export { VERSION } from './version.js';
