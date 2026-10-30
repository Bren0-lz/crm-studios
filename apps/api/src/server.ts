import { buildApp } from "./app.js";
import { config } from "./config.js";
import { createRepositoryFromConfig } from "./infrastructure/startup.js";

const { repository, close } = await createRepositoryFromConfig();
const app = await buildApp({ repository });
if (close) app.addHook("onClose", close);

try {
  await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
