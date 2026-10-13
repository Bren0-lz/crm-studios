import { defineConfig } from "vitest/config";
import { coverageFor, testProjects } from "../../scripts/testing.mts";

export default defineConfig({
  test: {
    projects: testProjects(),
    coverage: coverageFor("contracts"),
    maxWorkers: 2,
  },
});
