import { getAgent } from "@sekuire/sdk";

async function main() {
  const agent = await getAgent("assistant");

  console.log(`Agent: ${agent.name}`);
  console.log(`Provider: ${agent.getLLMProvider()}`);
  console.log(`Model: ${agent.getModelName()}\n`);

  // Simple chat
  console.log("User: What is the capital of Japan?");
  const response = await agent.chat("What is the capital of Japan?");
  console.log(`Agent: ${response}\n`);

  // Follow-up (conversation history is preserved)
  console.log("User: What is the population of that city?");
  const followUp = await agent.chat("What is the population of that city?");
  console.log(`Agent: ${followUp}\n`);

  // Streaming response
  console.log("User: Tell me a short fun fact about space.");
  process.stdout.write("Agent: ");
  for await (const chunk of agent.chatStream(
    "Tell me a short fun fact about space."
  )) {
    process.stdout.write(chunk);
  }
  console.log("\n");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
