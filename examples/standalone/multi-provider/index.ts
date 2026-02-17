import { getAgents } from "@sekuire/sdk";

async function main() {
  const agents = await getAgents("./sekuire.yml");
  const prompt = "What is 2 + 2? Answer in one sentence.";

  console.log(`Prompt: "${prompt}"\n`);

  for (const [name, agent] of agents) {
    const provider = agent.getLLMProvider();
    const model = agent.getModelName();

    console.log(`--- ${name} (${provider}/${model}) ---`);

    try {
      const start = Date.now();
      const response = await agent.chat(prompt);
      const elapsed = Date.now() - start;

      console.log(`  Response: ${response}`);
      console.log(`  Time: ${elapsed}ms\n`);
    } catch (err: any) {
      console.log(`  Error: ${err.message}`);
      console.log(`  (Set the API key in .env to enable this provider)\n`);
    }
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
