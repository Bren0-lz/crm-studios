import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test-setup.ts",
    // A máquina de desenvolvimento às vezes fica lenta (OneDrive, antivírus); 5s gerava falsos timeouts.
    testTimeout: 20_000,
  },
});
