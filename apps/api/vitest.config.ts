import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // A máquina de desenvolvimento às vezes fica lenta (OneDrive, antivírus); 5s gerava falsos timeouts.
    testTimeout: 20_000,
  },
});
