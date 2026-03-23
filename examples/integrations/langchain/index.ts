import "dotenv/config";
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { SekuireChatModel } from "./sekuire-chat-model";
import { wrapSekuireTools } from "./sekuire-tools";

async function main() {
  const model = await SekuireChatModel.fromConfig();

  console.log(`Model type: ${model._llmType()}`);
  console.log(`Provider model: ${model.getProvider().getModelName()}\n`);

  console.log("--- Single Message ---");
  const simple = await model.invoke([
    new HumanMessage("What is the capital of France? Answer in one sentence."),
  ]);
  console.log("Response:", simple.content);
  console.log();

  console.log("--- Full Conversation Context ---");
  const conversation = await model.invoke([
    new SystemMessage("You are a geography expert. Be concise."),
    new HumanMessage("What is the capital of France?"),
    new AIMessage("The capital of France is Paris."),
    new HumanMessage("And what is its population?"),
  ]);
  console.log("Response:", conversation.content);
  if ((conversation as any).response_metadata?.usage) {
    console.log("Usage:", JSON.stringify((conversation as any).response_metadata.usage));
  }
  console.log();

  console.log("--- Tool Call Round-Trip ---");
  const withToolHistory = await model.invoke([
    new SystemMessage("You are a helpful assistant with access to tools."),
    new HumanMessage("What is 2 + 2?"),
    new AIMessage({
      content: "",
      tool_calls: [
        { id: "call_1", name: "calculator", args: { expression: "2 + 2" } },
      ],
    }),
    new ToolMessage({ content: "4", tool_call_id: "call_1" }),
    new HumanMessage("Now multiply that by 10."),
  ]);
  console.log("Response:", withToolHistory.content);
  console.log();

  console.log("--- Available LangChain Tools (policy-filtered) ---");
  const enforcer = model.getEnforcer();
  const langchainTools = wrapSekuireTools({ enforcer });

  if (langchainTools.length === 0) {
    console.log("No tools passed policy filter (or no tools registered).");
  } else {
    for (const tool of langchainTools.slice(0, 10)) {
      console.log(`  - ${tool.name}: ${tool.description}`);
    }
    if (langchainTools.length > 10) {
      console.log(`  ... and ${langchainTools.length - 10} more`);
    }
  }
  console.log();

  console.log("--- Policy Enforcement ---");
  if (enforcer) {
    console.log("Policy enforcer is active.");

    try {
      enforcer.enforceTool("file_delete");
      console.log('Tool "file_delete" is allowed (unexpected).');
    } catch (error: any) {
      console.log(`Blocked tool "file_delete": ${error.message}`);
    }

    try {
      enforcer.enforceTool("web_search");
      console.log('Tool "web_search" is allowed.');
    } catch (error: any) {
      console.log(`Blocked tool "web_search": ${error.message}`);
    }

    try {
      enforcer.enforceModel("gpt-3.5-turbo");
      console.log('Model "gpt-3.5-turbo" is allowed (unexpected).');
    } catch (error: any) {
      console.log(`Blocked model "gpt-3.5-turbo": ${error.message}`);
    }
  } else {
    console.log("No policy enforcer configured.");
  }
  console.log();

  console.log("--- Streaming ---");
  const stream = await model.stream([
    new HumanMessage("Count from 1 to 5, one number per line."),
  ]);
  process.stdout.write("Streamed: ");
  for await (const chunk of stream) {
    process.stdout.write(String(chunk.content));
  }
  console.log("\n");

  console.log("--- Token Usage ---");
  const usageResult = await model.invoke([
    new HumanMessage("Say hello."),
  ]);
  const metadata = (usageResult as any).response_metadata;
  if (metadata?.usage) {
    console.log(`Prompt tokens: ${metadata.usage.prompt_tokens}`);
    console.log(`Completion tokens: ${metadata.usage.completion_tokens}`);
    console.log(`Total tokens: ${metadata.usage.total_tokens}`);
  } else {
    console.log("Token usage:", JSON.stringify(metadata));
  }
}

main().catch(console.error);
