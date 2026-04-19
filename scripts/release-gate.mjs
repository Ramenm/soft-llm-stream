import { spawnSync } from "node:child_process";

const steps = [
  {
    label: "typecheck",
    command: "tsc",
    args: ["-p", "tsconfig.json", "--noEmit"],
  },
  {
    label: "clean",
    command: "node",
    args: ["./scripts/clean-stage-artifacts.mjs"],
  },
  {
    label: "build",
    command: "tsc",
    args: ["-p", "tsconfig.build.json"],
  },
  {
    label: "test",
    command: "node",
    args: ["--test", "--test-concurrency=1"],
  },
  {
    label: "protocol",
    command: "node",
    args: ["./scripts/protocol-compat-lab.mjs"],
  },
  {
    label: "fuzz",
    command: "node",
    args: ["./scripts/invariant-fuzz.mjs"],
    env: {
      FUZZ_TRACE_COUNT: String(Math.max(1, Number(process.env.GATE_FUZZ_TRACE_COUNT) || 200)),
    },
  },
  {
    label: "stress",
    command: "node",
    args: ["./scripts/stress-benchmark.mjs"],
    env: {
      STRESS_TRACE_COUNT: String(Math.max(1, Number(process.env.GATE_STRESS_TRACE_COUNT) || 40)),
    },
  },
  {
    label: "client",
    command: "node",
    args: ["./scripts/client-cost-benchmark.mjs"],
    env: {
      CLIENT_TRACE_COUNT: String(Math.max(2, Number(process.env.GATE_CLIENT_TRACE_COUNT) || 3)),
      CLIENT_DELAY_SCALE: String(Math.max(0.05, Number(process.env.GATE_CLIENT_DELAY_SCALE) || 0.06)),
    },
  },
  {
    label: "package-artifacts",
    command: "node",
    args: ["./scripts/check-lean-package.mjs"],
  },
];

for (const step of steps) {
  console.log(`
>>> ${step.label}`);

  const result = spawnSync(step.command, step.args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...(step.env ?? {}),
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `release gate step failed: ${step.label} (code=${result.status ?? "null"}, signal=${result.signal ?? "none"})`,
    );
  }
}
