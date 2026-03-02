import { PolicyEnforcer, PolicyViolationError } from "@sekuire/sdk";
import type { ActivePolicy } from "@sekuire/sdk";

const policy: ActivePolicy = {
  policy_id: "demo-policy",
  workspace_id: "local",
  version: "1.0.0",
  status: "active",
  hash: "local",
  content: {
    agent: {
      models: {
        allowed_models: ["gpt-4o-mini", "gpt-4o"],
        blocked_models: ["gpt-3.5-turbo"],
      },
    },
    tools: {
      allowed_tools: [{ name: "calculator" }, { name: "web_search" }],
      blocked_tools: ["shell_exec", "file_delete"],
    },
    permissions: {
      network: {
        enabled: true,
        require_tls: true,
        allowed_domains: ["api.openai.com", "api.anthropic.com"],
        blocked_domains: ["evil.com", "*.malware.net"],
      },
      filesystem: {
        enabled: true,
        allowed_paths: ["./data/*", "/tmp/*"],
        blocked_paths: ["/etc/*", "~/.ssh/*"],
        allowed_extensions: [".txt", ".json", ".csv"],
      },
    },
    rate_limits: {
      per_agent: { requests_per_minute: 10 },
    },
  },
};

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ALLOWED  ${label}`);
  } catch (err) {
    if (err instanceof PolicyViolationError) {
      console.log(`  BLOCKED  ${label} - [${err.rule}] ${err.message}`);
    } else {
      throw err;
    }
  }
}

const enforcer = new PolicyEnforcer(policy);

console.log("--- Model Enforcement ---\n");
check("gpt-4o-mini", () => enforcer.enforceModel("gpt-4o-mini"));
check("gpt-3.5-turbo (blocked)", () => enforcer.enforceModel("gpt-3.5-turbo"));
check("llama-3 (not in allowlist)", () => enforcer.enforceModel("llama-3"));

console.log("\n--- Tool Enforcement ---\n");
check("calculator", () => enforcer.enforceTool("calculator"));
check("web_search", () => enforcer.enforceTool("web_search"));
check("shell_exec (blocked)", () => enforcer.enforceTool("shell_exec"));
check("file_delete (blocked)", () => enforcer.enforceTool("file_delete"));

console.log("\n--- Network Enforcement ---\n");
check("api.openai.com over HTTPS", () => enforcer.enforceNetwork("api.openai.com", "https"));
check("evil.com (blocked domain)", () => enforcer.enforceNetwork("evil.com", "https"));
check("example.com (not in allowlist)", () => enforcer.enforceNetwork("example.com", "https"));
check("api.openai.com over HTTP (TLS required)", () => enforcer.enforceNetwork("api.openai.com", "http"));

console.log("\n--- Filesystem Enforcement ---\n");
check("./data/report.txt (allowed path + ext)", () => enforcer.enforceFilesystem("./data/report.txt", "read"));
check("/etc/passwd (blocked path)", () => enforcer.enforceFilesystem("/etc/passwd", "read"));
check("~/.ssh/id_rsa (blocked path)", () => enforcer.enforceFilesystem("~/.ssh/id_rsa", "read"));
check("./data/image.png (blocked extension)", () => enforcer.enforceFilesystem("./data/image.png", "read"));

console.log("\n--- Rate Limiting ---\n");
for (let i = 1; i <= 12; i++) {
  check(`Request ${i}`, () => enforcer.enforceRateLimit("request"));
}

console.log("\nAll enforcement is local. No network calls made.");
