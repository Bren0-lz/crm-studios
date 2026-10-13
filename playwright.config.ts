import { defineConfig, devices } from "@playwright/test";

process.env.NODE_ENV = "test";
process.env.STORAGE_MODE = "memory";
process.env.WEB_ORIGIN = "http://127.0.0.1:4173";
process.env.JWT_SECRET = "isolated-e2e-secret-with-at-least-32-characters";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    timezoneId: "America/Sao_Paulo",
    locale: "pt-BR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command:
      "npm run preview -w @crm/web -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
