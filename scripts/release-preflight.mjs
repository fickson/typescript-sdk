#!/usr/bin/env node

import { mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const PACKAGE_NAME = "@sekuire/sdk";
const DEFAULT_API_HEALTH_URL = "https://api.sekuire.ai/health";
const DEFAULT_OAGS_URL = "https://oags.sekuire.ai";
const DEFAULT_HTTP_TIMEOUT_MS = Number(
  process.env.SEKUIRE_PREFLIGHT_HTTP_TIMEOUT_MS ?? "15000"
);

function parseArgs(argv) {
  const options = {
    mode: "prepublish",
    version: null,
    checkRuntime: false,
    checkK8s: false,
    k8sNamespace: "sekuire",
    skipBuild: false,
    skipTest: false,
    skipPackageSmoke: false,
  };

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    } else if (arg === "--check-runtime") {
      options.checkRuntime = true;
    } else if (arg === "--check-k8s") {
      options.checkK8s = true;
    } else if (arg === "--skip-build") {
      options.skipBuild = true;
    } else if (arg === "--skip-test") {
      options.skipTest = true;
    } else if (arg === "--skip-package-smoke") {
      options.skipPackageSmoke = true;
    } else if (arg.startsWith("--mode=")) {
      options.mode = arg.split("=")[1];
    } else if (arg.startsWith("--version=")) {
      options.version = arg.split("=")[1];
    } else if (arg.startsWith("--namespace=")) {
      options.k8sNamespace = arg.split("=")[1];
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!["prepublish", "postpublish"].includes(options.mode)) {
    throw new Error(`Invalid mode "${options.mode}". Use prepublish or postpublish.`);
  }

  return options;
}

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    cwd: process.cwd(),
    ...opts,
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

function runCapture(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    env: process.env,
    cwd: process.cwd(),
    ...opts,
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new Error(
      stderr
        ? `Command failed: ${command} ${args.join(" ")}\n${stderr}`
        : `Command failed: ${command} ${args.join(" ")}`
    );
  }

  return result.stdout;
}

function logStep(message) {
  process.stdout.write(`\n[release-preflight] ${message}\n`);
}

function installSmokeFromSpec(spec) {
  const smokeDir = mkdtempSync(path.join(tmpdir(), "sekuire-sdk-smoke-"));

  try {
    run("npm", ["init", "-y"], { cwd: smokeDir });
    run("npm", ["install", "--no-audit", "--ignore-scripts", spec], { cwd: smokeDir });
    run(
      "node",
      [
        "--input-type=module",
        "-e",
        `import("${PACKAGE_NAME}").then((mod)=>{console.log("import_ok",Object.keys(mod).length);}).catch((err)=>{console.error(err);process.exit(1);});`,
      ],
      { cwd: smokeDir }
    );
  } finally {
    rmSync(smokeDir, { recursive: true, force: true });
  }
}

function runPrepublishChecks(options) {
  if (!options.skipBuild) {
    logStep("Running build");
    run("pnpm", ["run", "build"]);
  }

  if (!options.skipTest) {
    logStep("Running test suite");
    run("pnpm", ["run", "test"]);
  }

  if (options.skipPackageSmoke) {
    logStep("Skipping local package smoke test");
    return;
  }

  logStep("Packing local tarball");
  const packed = JSON.parse(runCapture("npm", ["pack", "--json"]).trim());
  const tarballFile = packed?.[0]?.filename;
  if (!tarballFile) {
    throw new Error("Unable to determine tarball filename from npm pack output.");
  }
  const tarballPath = path.resolve(process.cwd(), tarballFile);

  try {
    logStep(`Running install/import smoke test from ${tarballFile}`);
    installSmokeFromSpec(tarballPath);
  } finally {
    unlinkSync(tarballPath);
  }
}

function runPostpublishChecks(options) {
  const currentVersion = runCapture("npm", ["view", PACKAGE_NAME, "version"]).trim();
  const targetVersion = options.version ?? currentVersion;

  if (currentVersion !== targetVersion) {
    throw new Error(
      `Published version mismatch. Expected ${targetVersion}, got ${currentVersion}.`
    );
  }

  logStep(`Running install/import smoke test from npm (${PACKAGE_NAME}@${targetVersion})`);
  installSmokeFromSpec(`${PACKAGE_NAME}@${targetVersion}`);
}

async function checkRuntimeHealth() {
  const apiUrl = process.env.SEKUIRE_API_HEALTH_URL ?? DEFAULT_API_HEALTH_URL;
  const oagsUrl = process.env.OAGS_SITE_URL ?? DEFAULT_OAGS_URL;
  const timeoutSignal = () => AbortSignal.timeout(DEFAULT_HTTP_TIMEOUT_MS);

  logStep(`Checking API health: ${apiUrl}`);
  const apiResponse = await fetch(apiUrl, { signal: timeoutSignal() });
  if (!apiResponse.ok) {
    throw new Error(`API health check failed with HTTP ${apiResponse.status}.`);
  }

  const apiJson = await apiResponse.json();
  const primaryOk = apiJson?.primary_database?.ok === true;
  const logsOk = apiJson?.logs_database?.ok === true;
  if (!primaryOk || !logsOk) {
    throw new Error(
      `API health payload missing DB readiness: ${JSON.stringify(apiJson)}`
    );
  }

  logStep(`Checking OAGS availability: ${oagsUrl}`);
  const oagsHead = await fetch(oagsUrl, { method: "HEAD", signal: timeoutSignal() });
  if (!oagsHead.ok && oagsHead.status !== 405) {
    throw new Error(`OAGS HEAD check failed with HTTP ${oagsHead.status}.`);
  }

  if (oagsHead.status === 405) {
    const oagsGet = await fetch(oagsUrl, { signal: timeoutSignal() });
    if (!oagsGet.ok) {
      throw new Error(`OAGS GET fallback failed with HTTP ${oagsGet.status}.`);
    }
  }
}

function checkKubernetes(namespace) {
  logStep(`Checking Kubernetes context and TimescaleDB in namespace "${namespace}"`);
  const kubectlOpts = { timeout: 15000 };

  const context = runCapture(
    "kubectl",
    ["config", "current-context"],
    kubectlOpts
  ).trim();
  if (!context) {
    throw new Error("kubectl current context is empty.");
  }

  const pods = JSON.parse(
    runCapture(
      "kubectl",
      ["get", "pods", "-n", namespace, "-o", "json"],
      kubectlOpts
    )
  );
  const timescaledbPod = (pods.items ?? []).find((pod) =>
    String(pod?.metadata?.name ?? "").startsWith("timescaledb-")
  );

  if (!timescaledbPod) {
    throw new Error(`No timescaledb pod found in namespace ${namespace}.`);
  }

  if (timescaledbPod.status?.phase !== "Running") {
    throw new Error(
      `TimescaleDB pod ${timescaledbPod.metadata?.name} is not Running (phase=${timescaledbPod.status?.phase}).`
    );
  }

  const svc = JSON.parse(
    runCapture(
      "kubectl",
      ["get", "svc", "-n", namespace, "timescaledb", "-o", "json"],
      kubectlOpts
    )
  );
  const has5432 = (svc.spec?.ports ?? []).some((port) => Number(port.port) === 5432);
  if (!has5432) {
    throw new Error("timescaledb service does not expose port 5432.");
  }

  const endpoints = JSON.parse(
    runCapture(
      "kubectl",
      ["get", "endpoints", "-n", namespace, "timescaledb", "-o", "json"],
      kubectlOpts
    )
  );
  const addresses = endpoints.subsets?.flatMap((subset) => subset.addresses ?? []) ?? [];
  if (addresses.length === 0) {
    throw new Error("timescaledb service has no ready endpoints.");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  logStep(`Mode: ${options.mode}`);
  if (options.mode === "prepublish") {
    runPrepublishChecks(options);
  } else {
    runPostpublishChecks(options);
  }

  if (options.checkRuntime) {
    await checkRuntimeHealth();
  }

  if (options.checkK8s) {
    checkKubernetes(options.k8sNamespace);
  }

  logStep("All selected preflight checks passed.");
}

main().catch((error) => {
  console.error(`\n[release-preflight] ERROR: ${error.message}`);
  process.exit(1);
});
