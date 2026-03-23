import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { ChatGenerationChunk } from "@langchain/core/outputs";
import type { CallbackManagerForLLMRun } from "@langchain/core/callbacks/manager";
import type {
  LLMProvider,
  ChatOptions,
  ChatResponse,
  LLMMessage as SekuireMessage,
  LLMToolCall as ToolCallFunction,
  LLMToolDefinition as ToolDefinition,
} from "@sekuire/sdk";
import {
  PolicyEnforcer,
  loadConfig,
  getAgentConfig,
  loadSystemPrompt,
  createLLMProvider,
} from "@sekuire/sdk";

interface SekuireChatModelOptions {
  provider: LLMProvider;
  enforcer?: PolicyEnforcer;
  systemPrompt?: string;
  chatOptions?: ChatOptions;
}

function extractText(message: BaseMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .filter((part): part is { type: "text"; text: string } => {
        const p = part as Record<string, unknown>;
        return p.type === "text" && typeof p.text === "string";
      })
      .map((part) => part.text)
      .join("");
  }
  return String(message.content);
}

function convertMessages(messages: BaseMessage[]): SekuireMessage[] {
  return messages.map((msg) => {
    if (msg instanceof SystemMessage) {
      return { role: "system" as const, content: extractText(msg) };
    }

    if (msg instanceof HumanMessage) {
      return { role: "user" as const, content: extractText(msg) };
    }

    if (msg instanceof AIMessage) {
      const result: SekuireMessage = {
        role: "assistant" as const,
        content: extractText(msg),
      };
      if (msg.tool_calls?.length) {
        result.tool_calls = msg.tool_calls.map((tc) => ({
          id: tc.id || crypto.randomUUID(),
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.args),
          },
        }));
        if (!result.content) result.content = null;
      }
      return result;
    }

    if (msg instanceof ToolMessage) {
      return {
        role: "tool" as const,
        content: extractText(msg),
        tool_call_id: msg.tool_call_id,
      };
    }

    return { role: "user" as const, content: extractText(msg) };
  });
}

function mapToolCalls(
  toolCalls: ToolCallFunction[]
): { name: string; args: Record<string, unknown>; id: string; type: "tool_call" }[] {
  return toolCalls.map((tc) => ({
    name: tc.function.name,
    args: JSON.parse(tc.function.arguments),
    id: tc.id,
    type: "tool_call" as const,
  }));
}

export class SekuireChatModel extends BaseChatModel {
  private provider: LLMProvider;
  private enforcer?: PolicyEnforcer;
  private systemPrompt?: string;
  private defaultChatOptions?: ChatOptions;
  private boundTools?: ToolDefinition[];

  constructor(options: SekuireChatModelOptions) {
    super({});
    this.provider = options.provider;
    this.enforcer = options.enforcer;
    this.systemPrompt = options.systemPrompt;
    this.defaultChatOptions = options.chatOptions;
  }

  withTools(tools: ToolDefinition[]): this {
    this.boundTools = tools;
    return this;
  }

  static async fromConfig(configPath?: string): Promise<SekuireChatModel> {
    const config = await loadConfig(configPath);
    const agentConfig = getAgentConfig(config);

    const apiKey = process.env[agentConfig.llm.api_key_env] || "";
    const provider = await createLLMProvider(agentConfig.llm.provider, {
      apiKey,
      model: agentConfig.llm.model,
      baseUrl: agentConfig.llm.base_url,
      temperature: agentConfig.llm.temperature,
      maxTokens: agentConfig.llm.max_tokens,
    });

    let enforcer: PolicyEnforcer | undefined;
    const policyContent: Record<string, unknown> = {};

    if (config.permissions) policyContent.permissions = config.permissions;
    if (config.rate_limits) policyContent.rate_limits = config.rate_limits;

    if (agentConfig.models) policyContent.agent = { models: agentConfig.models };
    if (agentConfig.toolsets) {
      policyContent.tools = {
        allowed_tools: agentConfig.toolsets.allowed_tools,
        blocked_tools: agentConfig.toolsets.blocked_tools,
      };
    }

    if (Object.keys(policyContent).length > 0) {
      enforcer = new PolicyEnforcer({
        policy_id: "local",
        workspace_id: "local",
        version: "1.0",
        status: "active",
        hash: "",
        content: policyContent,
      });
      if (provider.setPolicyEnforcer) {
        provider.setPolicyEnforcer(enforcer);
      }
    }

    let systemPrompt: string | undefined;
    if (agentConfig.system_prompt) {
      try {
        systemPrompt = await loadSystemPrompt(agentConfig.system_prompt);
      } catch {
        systemPrompt = undefined;
      }
    }

    const chatOptions: ChatOptions = {};
    if (agentConfig.llm.temperature !== undefined) chatOptions.temperature = agentConfig.llm.temperature;
    if (agentConfig.llm.max_tokens !== undefined) chatOptions.max_tokens = agentConfig.llm.max_tokens;

    return new SekuireChatModel({
      provider,
      enforcer,
      systemPrompt,
      chatOptions,
    });
  }

  _llmType(): string {
    return "sekuire";
  }

  async _generate(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun
  ): Promise<ChatResult> {
    let allMessages = messages;

    if (this.systemPrompt) {
      const hasSystem = messages.some((m) => m instanceof SystemMessage);
      if (!hasSystem) {
        allMessages = [new SystemMessage(this.systemPrompt), ...messages];
      }
    }

    const sekuireMessages = convertMessages(allMessages);

    const chatOptions: ChatOptions = { ...this.defaultChatOptions };
    if (options?.stop) chatOptions.stop = options.stop;
    if (this.boundTools?.length) chatOptions.tools = this.boundTools;

    const response: ChatResponse = await this.provider.chat(
      sekuireMessages,
      chatOptions
    );

    const aiMessage = response.tool_calls?.length
      ? new AIMessage({
          content: response.content || "",
          tool_calls: mapToolCalls(response.tool_calls),
        })
      : new AIMessage(response.content);

    return {
      generations: [
        {
          text: response.content,
          message: aiMessage,
        },
      ],
      llmOutput: {
        model: response.model,
        finish_reason: response.finish_reason,
        usage: response.usage,
      },
    };
  }

  async *_streamResponseChunks(
    messages: BaseMessage[],
    options: this["ParsedCallOptions"],
    _runManager?: CallbackManagerForLLMRun
  ): AsyncGenerator<ChatGenerationChunk> {
    let allMessages = messages;

    if (this.systemPrompt) {
      const hasSystem = messages.some((m) => m instanceof SystemMessage);
      if (!hasSystem) {
        allMessages = [new SystemMessage(this.systemPrompt), ...messages];
      }
    }

    const sekuireMessages = convertMessages(allMessages);

    const chatOptions: ChatOptions = { ...this.defaultChatOptions };
    if (options?.stop) chatOptions.stop = options.stop;

    const stream = this.provider.chatStream(sekuireMessages, chatOptions);

    for await (const chunk of stream) {
      yield new ChatGenerationChunk({
        text: chunk.content,
        message: new AIMessageChunk(chunk.content),
        generationInfo: chunk.finish_reason
          ? { finish_reason: chunk.finish_reason }
          : undefined,
      });
    }
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  getEnforcer(): PolicyEnforcer | undefined {
    return this.enforcer;
  }
}
