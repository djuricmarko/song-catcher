import { buildApp, checkEnvironment, createLogger, errorMessage, loadConfig } from '@song-catcher/server';

export type ServerMessage = { type: 'ready'; loggedIn: boolean } | { type: 'failed'; message: string };

function report(message: ServerMessage): void {
  process.parentPort.postMessage(message);
}

async function start(): Promise<void> {
  const config = loadConfig(process.env);
  const environment = await checkEnvironment(config);
  if (environment.errors.length > 0) {
    throw new Error(environment.errors.join('\n'));
  }

  const { app, deezer } = await buildApp(config, createLogger(config), process.env.SONG_CATCHER_WEB_ROOT);
  await app.listen({ host: config.http.host, port: config.http.port });

  process.parentPort.once('message', () => {
    void app.close().finally(() => process.exit(0));
  });
  report({ type: 'ready', loggedIn: await deezer.testLogin() });
}

start().catch((error: unknown) => {
  report({ type: 'failed', message: errorMessage(error) });
});
