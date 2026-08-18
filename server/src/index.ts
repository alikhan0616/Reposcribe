import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

app.listen(env.port, () => {
  console.log(`[reposcribe-server] listening on http://localhost:${env.port}`);
  console.log(`[reposcribe-server] allowed client origins: ${env.clientOrigins.join(', ')}`);
});
