import "dotenv/config";
import { Agent, run } from "@openai/agents";
import { PolicyViolationError } from "@sekuire/sdk";
import { createGovernedOpenAIClient, loadSekuirePolicy } from "./governed-client";

async function main() {
  console.log("=== Sekuire Governed OpenAI Client ===\n");
  console.log(
    "This demo uses a proxy-based OpenAI client that intercepts every\n" +
    "chat.completions.create() call with policy enforcement. The OpenAI\n" +
    "Agents SDK has no idea governance is happening.\n"
  );

  // --- Policy checks (no API key needed) ---

  const enforcer = await loadSekuirePolicy("./sekuire.yml");

  console.log("--- Model Policy ---\n");

  for (const model of ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"]) {
    try {
      enforcer.enforceModel(model);
      console.log(`  ${model}: ALLOWED`);
    } catch (err) {
      if (err instanceof PolicyViolationError) {
        console.log(`  ${model}: BLOCKED - [${err.rule}] ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  console.log("\n--- Tool Policy ---\n");

  for (const tool of ["web_search", "calculator", "file_delete", "env_set"]) {
    try {
      enforcer.enforceTool(tool);
      console.log(`  ${tool}: ALLOWED`);
    } catch (err) {
      if (err instanceof PolicyViolationError) {
        console.log(`  ${tool}: BLOCKED - [${err.rule}] ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  console.log("\n--- Rate Limiting ---\n");

  for (let i = 1; i <= 12; i++) {
    try {
      enforcer.enforceRateLimit("request");
      console.log(`  Request ${i}: ALLOWED`);
    } catch (err) {
      if (err instanceof PolicyViolationError) {
        console.log(`  Request ${i}: BLOCKED - ${err.message}`);
      } else {
        throw err;
      }
    }
  }

  // --- Live agent run with governed client ---

  if (!process.env.OPENAI_API_KEY) {
    console.log("\n--- Skipping live agent run (no OPENAI_API_KEY) ---");
    console.log(
      "\nAll policy checks passed. Set OPENAI_API_KEY to run the full governed agent."
    );
    return;
  }

  console.log("\n--- Governed Agent Run ---\n");

  const client = await createGovernedOpenAIClient({
    configPath: "./sekuire.yml",
  });

  const agent = new Agent({
    name: "Research Assistant",
    instructions: "You are a helpful research assistant. Be concise.",
    model: "gpt-4o-mini",
    client,
  });

  try {
    const result = await run(agent, "What is the capital of France? One sentence.");
    console.log(`Agent response: ${result.finalOutput}`);
  } catch (err) {
    if (err instanceof PolicyViolationError) {
      console.log(`Blocked by policy: [${err.rule}] ${err.message}`);
    } else {
      throw err;
    }
  }

  // --- Demonstrate blocked model ---

  console.log("\n--- Blocked Model Demo ---\n");

  const blockedAgent = new Agent({
    name: "Blocked Assistant",
    instructions: "You should never run.",
    model: "gpt-3.5-turbo",
    client,
  });

  try {
    await run(blockedAgent, "Hello");
    console.log("ERROR: should not have succeeded");
  } catch (err) {
    if (err instanceof PolicyViolationError) {
      console.log(`gpt-3.5-turbo blocked: [${err.rule}] ${err.message}`);
    } else {
      throw err;
    }
  }

  console.log("\nAll LLM calls were governed transparently by Sekuire policy.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
