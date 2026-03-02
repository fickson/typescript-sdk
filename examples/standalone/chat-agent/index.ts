import { getAgent } from "@sekuire/sdk";

const agent = await getAgent();

console.log(`Agent: ${agent.name} (${agent.getLLMProvider()}/${agent.getModelName()})`);

const response = await agent.chat("What is the capital of Japan?");
console.log(`Response: ${response}\n`);

const followUp = await agent.chat("What is the population of that city?");
console.log(`Follow-up: ${followUp}\n`);

process.stdout.write("Streaming: ");
for await (const chunk of agent.chatStream("Tell me a fun fact about space.")) {
  process.stdout.write(chunk);
}
console.log();
