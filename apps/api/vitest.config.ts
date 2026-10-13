import { defineConfig } from "vitest/config";
import { coverageFor, testProjects } from "../../scripts/testing.mts";

export default defineConfig({
  test: {
    projects: testProjects().map((project) => ({
      ...project,
      test: {
        ...project.test,
        ...(process.env.TEST_DATABASE_URL ? { fileParallelism: false } : {}),
      },
    })),
    coverage: coverageFor("api"),
    maxWorkers: 2,
    // A máquina de desenvolvimento às vezes fica lenta (OneDrive, antivírus); 5s gerava falsos timeouts.
    testTimeout: 20_000,
  },
});
