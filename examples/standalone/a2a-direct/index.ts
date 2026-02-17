import { A2AServer } from "@sekuire/sdk";
import type { AgentCard, A2AMessage, JsonRpcRequest } from "@sekuire/sdk";

function card(id: string, name: string, skillId: string, skillName: string): AgentCard {
  return {
    agentId: id, name, description: name, version: "1.0.0",
    protocolVersions: ["1.0"], url: "http://localhost:0",
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    skills: [{ id: skillId, name: skillName }],
  };
}

function extractText(message: A2AMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}

const mathServer = new A2AServer({
  card: card("math-agent", "Math Agent", "math:calculate", "Calculate"),
  handlers: {
    "math:calculate": async (message: A2AMessage) => {
      const text = extractText(message);
      const match = text.match(/(\d+)\s*([+\-*/])\s*(\d+)/);
      if (!match) {
        return { role: "agent" as const, parts: [{ type: "text" as const, text: "Send an expression like '42 * 17'" }] };
      }
      const [, a, op, b] = match;
      const ops: Record<string, (x: number, y: number) => number> = {
        "+": (x, y) => x + y, "-": (x, y) => x - y,
        "*": (x, y) => x * y, "/": (x, y) => x / y,
      };
      const result = ops[op](Number(a), Number(b));
      return { role: "agent" as const, parts: [{ type: "text" as const, text: `${a} ${op} ${b} = ${result}` }] };
    },
  },
});

const summaryServer = new A2AServer({
  card: card("summary-agent", "Summary Agent", "text:summarize", "Summarize"),
  handlers: {
    "text:summarize": async (message: A2AMessage) => {
      const text = extractText(message);
      const words = text.split(/\s+/);
      const summary = words.length > 10 ? words.slice(0, 10).join(" ") + "..." : `Summary: ${text}`;
      return { role: "agent" as const, parts: [{ type: "text" as const, text: summary }] };
    },
  },
});

async function sendTask(server: A2AServer, text: string) {
  const request: JsonRpcRequest = {
    jsonrpc: "2.0", method: "tasks/send", id: Date.now().toString(),
    params: { message: { role: "user" as const, parts: [{ type: "text" as const, text }] } },
  };
  return server.handleRequest(request);
}

async function main() {
  console.log("--- Agent-to-Agent Direct Communication ---\n");

  console.log("Orchestrator -> Math Agent: 'Calculate 42 * 17'");
  const mathResult = await sendTask(mathServer, "Calculate 42 * 17");
  const mathAnswer = (mathResult.result as any)?.history?.slice(-1)[0]?.parts?.[0]?.text || "no result";
  console.log(`Math Agent -> Orchestrator: '${mathAnswer}'\n`);

  const summaryInput = `The math agent calculated: ${mathAnswer}. Summarize the result.`;
  console.log(`Orchestrator -> Summary Agent: '${summaryInput}'`);
  const summaryResult = await sendTask(summaryServer, summaryInput);
  const summaryAnswer = (summaryResult.result as any)?.history?.slice(-1)[0]?.parts?.[0]?.text || "no result";
  console.log(`Summary Agent -> Orchestrator: '${summaryAnswer}'\n`);

  console.log("--- Agent Cards ---\n");
  for (const server of [mathServer, summaryServer]) {
    const c = server.getAgentCard();
    console.log(`${c.name}: skills = [${c.skills.map((s) => s.id).join(", ")}]`);
  }
  console.log("\nAll communication is in-process via A2A JSON-RPC. No server started.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
