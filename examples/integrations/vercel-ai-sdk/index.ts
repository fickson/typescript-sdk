import { generateText, streamText } from "ai";
import { PolicyViolationError } from "@sekuire/sdk";
import { createSekuireProvider } from "./sekuire-provider";

async function main() {
  const sekuire = createSekuireProvider({ configPath: "./sekuire.yml" });

  console.log("--- generateText (governed via LLMProvider) ---\n");

  const model = await sekuire.model();
  const handle = sekuire.getHandle()!;

  console.log(`Provider: ${handle.provider.getProviderName()}`);
  console.log(`Model: ${handle.provider.getModelName()}`);
  console.log(`Policy: ${handle.enforcer ? "active" : "none"}\n`);

  const { text, usage, finishReason } = await generateText({
    model,
    messages: [
      { role: "system", content: "You are a concise research assistant." },
      { role: "user", content: "What are the three laws of robotics? Answer briefly." },
    ],
  });

  console.log(`Response: ${text}`);
  console.log(`Finish reason: ${finishReason}`);
  console.log(`Usage: ${usage.promptTokens} prompt + ${usage.completionTokens} completion tokens\n`);

  console.log("--- streamText (governed streaming) ---\n");

  const streamModel = await sekuire.model();
  const result = streamText({
    model: streamModel,
    prompt: "Explain policy enforcement in one paragraph.",
  });

  process.stdout.write("Response: ");
  for await (const chunk of (await result).textStream) {
    process.stdout.write(chunk);
  }
  console.log("\n");

  console.log("--- Tool definitions flow through provider ---\n");

  const toolModel = await sekuire.model();
  try {
    const toolResult = await generateText({
      model: toolModel,
      messages: [
        { role: "user", content: "What is the weather in San Francisco?" },
      ],
      tools: {
        get_weather: {
          description: "Get current weather for a location",
          parameters: {
            type: "object" as const,
            properties: {
              location: { type: "string", description: "City name" },
            },
            required: ["location"],
          },
        },
      },
    });
    console.log(`Finish reason: ${toolResult.finishReason}`);
    if (toolResult.toolCalls && toolResult.toolCalls.length > 0) {
      for (const call of toolResult.toolCalls) {
        console.log(`Tool call: ${call.toolName}(${JSON.stringify(call.args)})`);
      }
    } else {
      console.log(`Text response: ${toolResult.text?.slice(0, 100)}...`);
    }
  } catch (err: any) {
    if (err instanceof PolicyViolationError) {
      console.log(`Tool call blocked by policy: [${err.rule}] ${err.message}`);
    } else {
      console.log(`Tool test error: ${err.message}`);
    }
  }
  console.log();

  console.log("--- Policy enforcement: blocked model ---\n");

  const enforcer = handle.enforcer;
  if (enforcer) {
    try {
      enforcer.enforceModel("gpt-3.5-turbo");
      console.log("gpt-3.5-turbo: ALLOWED (unexpected)\n");
    } catch (err) {
      if (err instanceof PolicyViolationError) {
        console.log(`gpt-3.5-turbo: BLOCKED - [${err.rule}] ${err.message}\n`);
      } else {
        throw err;
      }
    }

    try {
      enforcer.enforceModel("gpt-4o-mini");
      console.log("gpt-4o-mini: ALLOWED\n");
    } catch (err) {
      if (err instanceof PolicyViolationError) {
        console.log(`gpt-4o-mini: BLOCKED - [${err.rule}] ${err.message}\n`);
      } else {
        throw err;
      }
    }
  } else {
    console.log("No policy enforcer configured.\n");
  }

  console.log("--- Policy enforcement: rate limits ---\n");

  if (enforcer) {
    for (let i = 1; i <= 15; i++) {
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
  }

  console.log("\nAll LLM calls were governed by Sekuire policy via LLMProvider interception.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
