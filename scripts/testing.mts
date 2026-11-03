import baseline from "./coverage-baseline.json" with { type: "json" };

// Os testes rodam sempre no fuso da clínica: a CI (Ubuntu) usa UTC e a máquina do dono usa
// São Paulo, e testes com "hoje"/"amanhã" mudavam de resultado conforme a máquina. Vale para
// o processo do Vitest e para os workers, que herdam o ambiente.
process.env.TZ = "America/Sao_Paulo";

export function testProjects(environment: "node" | "jsdom" = "node") {
  return ["unit", "integration"].map((name) => ({
    extends: true as const,
    test: {
      name,
      environment,
      include: [`src/**/*.${name}.test.{ts,tsx}`],
      testTimeout: 20_000,
    },
  }));
}

export function coverageFor(workspace: keyof typeof baseline.workspaces) {
  const thresholds = baseline.workspaces[workspace];
  return {
    provider: "v8" as const,
    include: ["src/**/*.{ts,tsx}"],
    exclude: ["src/**/*.test.*", "src/test-support/**", "src/test-setup.ts"],
    reporter: ["text", "html", "json-summary", "lcov"] as (
      "text" | "html" | "json-summary" | "lcov"
    )[],
    thresholds: {
      ...thresholds,
      ...(workspace === "api"
        ? {
            "src/modules/**/{broadcast,clinical-integrity,contact-suggestions,daily-cash,finance-forecast,group-schedule,patient-import,patient-timeline,plan-services,retention-report,sales-report}.ts":
              { lines: 80, branches: 80 },
            "src/infrastructure/database-connection.ts": {
              lines: 80,
              branches: 80,
            },
          }
        : workspace === "web"
          ? {
              "src/shared/lib/formatting.ts": { lines: 80, branches: 80 },
            }
          : {
              "src/{common,plans}/model.ts": { lines: 80, branches: 80 },
            }),
    },
  };
}
