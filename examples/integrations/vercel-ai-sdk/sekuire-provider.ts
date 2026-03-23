import type {
  LanguageModelV1,
  LanguageModelV1CallWarning,
  LanguageModelV1FinishReason,
  LanguageModelV1StreamPart,
  LanguageModelV1Prompt,
  LanguageModelV1CallOptions,
  LanguageModelV1FunctionToolCall,
} from "@ai-sdk/provider";
import {
  loadConfig,
  getAgentConfig,
  createLLMProvider,
  PolicyEnforcer,
} from "@sekuire/sdk";
import type {
  LLMProvider,
  LLMMessage as Message,
  ChatOptions,
  LLMToolDefinition as ToolDefinition,
  LLMToolCall as ToolCallFunction,
  ActivePolicy,
  SekuireConfig,
  AgentConfig,
} from "@sekuire/sdk";
import fs from "fs/promises";

interface SekuireProviderOptions {
  configPath?: string;
}

interface SekuireModelHandle {
  provider: LLMProvider;
  enforcer: PolicyEnforcer | undefined;
  agentConfig: AgentConfig;
  config: SekuireConfig;
}

const policyCache = new Map<string, ActivePolicy>();

function convertPromptToMessages(prompt: LanguageModelV1Prompt): Message[] {
  const messages: Message[] = [];

  for (const msg of prompt) {
    switch (msg.role) {
      case "system": {
        messages.push({ role: "system", content: msg.content });
        break;
      }

      case "user": {
        const textParts = msg.content.filter(
          (part): part is Extract<(typeof msg.content)[number], { type: "text" }> =>
            part.type === "text"
        );
        const text = textParts.map((part) => part.text).join("");
        if (text) {
          messages.push({ role: "user", content: text });
        }
        break;
      }

      case "assistant": {
        const assistantText: string[] = [];
        const toolCalls: ToolCallFunction[] = [];

        for (const part of msg.content) {
          if (part.type === "text") {
            assistantText.push(part.text);
          } else if (part.type === "tool-call") {
            toolCalls.push({
              id: part.toolCallId,
              type: "function",
              function: {
                name: part.toolName,
                arguments:
                  typeof part.args === "string"
                    ? part.args
                    : JSON.stringify(part.args),
              },
            });
          }
        }

        const content = assistantText.join("") || null;
        if (toolCalls.length > 0) {
          messages.push({ role: "assistant", content, tool_calls: toolCalls });
        } else {
          messages.push({ role: "assistant", content: content || "" });
        }
        break;
      }

      case "tool": {
        for (const part of msg.content) {
          if (part.type === "tool-result") {
            const resultContent =
              typeof part.result === "string"
                ? part.result
                : JSON.stringify(part.result);
            messages.push({
              role: "tool",
              tool_call_id: part.toolCallId,
              content: resultContent,
            });
          }
        }
        break;
      }
    }
  }

  return messages;
}

function convertToolDefinitions(
  options: LanguageModelV1CallOptions
): ToolDefinition[] | undefined {
  const mode = options.mode;
  if (mode?.type !== "regular" || !mode.tools || mode.tools.length === 0) {
    return undefined;
  }

  return mode.tools
    .filter((tool) => tool.type === "function")
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as Record<string, unknown>,
      },
    }));
}

function convertChatOptions(options: LanguageModelV1CallOptions): ChatOptions {
  const chatOptions: ChatOptions = {};

  if (options.temperature !== undefined) {
    chatOptions.temperature = options.temperature;
  }
  if (options.maxTokens !== undefined) {
    chatOptions.max_tokens = options.maxTokens;
  }
  if (options.topP !== undefined) {
    chatOptions.top_p = options.topP;
  }
  if (options.frequencyPenalty !== undefined) {
    chatOptions.frequency_penalty = options.frequencyPenalty;
  }
  if (options.presencePenalty !== undefined) {
    chatOptions.presence_penalty = options.presencePenalty;
  }
  if (options.stopSequences !== undefined) {
    chatOptions.stop = options.stopSequences;
  }

  const tools = convertToolDefinitions(options);
  if (tools) {
    chatOptions.tools = tools;
  }

  return chatOptions;
}

function mapFinishReason(
  reason: string | undefined
): LanguageModelV1FinishReason {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "tool_calls":
      return "tool-calls";
    case "content_filter":
      return "content-filter";
    default:
      return "stop";
  }
}

function mapToolCalls(
  toolCalls: ToolCallFunction[] | undefined
): LanguageModelV1FunctionToolCall[] {
  if (!toolCalls || toolCalls.length === 0) return [];

  return toolCalls.map((call) => ({
    toolCallType: "function" as const,
    toolCallId: call.id,
    toolName: call.function.name,
    args: call.function.arguments,
  }));
}

async function buildConfigBackedPolicy(
  config: SekuireConfig,
  agentConfig: AgentConfig
): Promise<ActivePolicy> {
  return {
    policy_id: `${config.project.name}-policy`,
    workspace_id: "local",
    version: config.project.version || "1.0.0",
    status: "active",
    hash: "config-based",
    content: {
      agent: {
        models: agentConfig.models || {},
      },
      tools: buildToolsPolicy(agentConfig),
      permissions: buildPermissionsPolicy(config, agentConfig),
      rate_limits: config.rate_limits || {},
    },
  };
}

function buildToolsPolicy(agentConfig: AgentConfig): {
  allowed_tools: Array<{ name: string }>;
  blocked_tools: string[];
} {
  const toolsetAllow = (agentConfig.toolsets?.allowed_tools || [])
    .map((entry) => entry?.name?.trim())
    .filter((entry): entry is string => !!entry);
  const legacyAllow = Array.isArray(agentConfig.allowed_tools)
    ? agentConfig.allowed_tools
    : [];
  const allowedTools = [...new Set([...toolsetAllow, ...legacyAllow])].map(
    (name) => ({ name })
  );

  const toolsetBlocked = Array.isArray(agentConfig.toolsets?.blocked_tools)
    ? agentConfig.toolsets!.blocked_tools
    : [];
  const legacyBlocked = Array.isArray(agentConfig.blocked_tools)
    ? agentConfig.blocked_tools
    : [];
  const blockedTools = [...new Set([...toolsetBlocked, ...legacyBlocked])];

  return { allowed_tools: allowedTools, blocked_tools: blockedTools };
}

function buildPermissionsPolicy(
  config: SekuireConfig,
  agentConfig: AgentConfig
): Record<string, unknown> {
  const permissions: Record<string, unknown> = {};

  if (config.permissions?.network || agentConfig.network) {
    const rootNetwork = config.permissions?.network;
    const legacyNetwork = agentConfig.network;
    permissions.network = {
      enabled: rootNetwork?.enabled ?? legacyNetwork?.enabled ?? true,
      require_tls:
        rootNetwork?.require_tls ?? legacyNetwork?.require_tls ?? false,
      ...(rootNetwork?.allowed_domains || legacyNetwork?.allow
        ? {
            allowed_domains: [
              ...(rootNetwork?.allowed_domains || []),
              ...(legacyNetwork?.allow || []),
            ],
          }
        : {}),
      ...(rootNetwork?.blocked_domains || legacyNetwork?.block
        ? {
            blocked_domains: [
              ...(rootNetwork?.blocked_domains || []),
              ...(legacyNetwork?.block || []),
            ],
          }
        : {}),
    };
  }

  if (config.permissions?.filesystem || agentConfig.filesystem) {
    const rootFs = config.permissions?.filesystem;
    const legacyFs = agentConfig.filesystem;
    permissions.filesystem = {
      enabled: rootFs?.enabled ?? legacyFs?.enabled ?? true,
      ...(rootFs?.allowed_paths || legacyFs?.allow_read
        ? {
            allowed_paths: [
              ...(rootFs?.allowed_paths || []),
              ...(legacyFs?.allow_read || []),
              ...(legacyFs?.allow_write || []),
            ],
          }
        : {}),
      ...(rootFs?.blocked_paths || legacyFs?.block_all
        ? {
            blocked_paths: [
              ...(rootFs?.blocked_paths || []),
              ...(legacyFs?.block_all || []),
            ],
          }
        : {}),
      ...(rootFs?.allowed_extensions || legacyFs?.allowed_extensions
        ? {
            allowed_extensions: [
              ...(rootFs?.allowed_extensions || []),
              ...(legacyFs?.allowed_extensions || []),
            ],
          }
        : {}),
    };
  }

  if (config.permissions?.api) {
    permissions.api = config.permissions.api;
  }

  return permissions;
}

async function loadModelHandle(
  agentName: string | undefined,
  configPath: string | undefined
): Promise<SekuireModelHandle> {
  const config = await loadConfig(configPath);
  const agentConfig = getAgentConfig(config, agentName);
  const llmConfig = agentConfig.llm;

  const requiresApiKey = llmConfig.provider.toLowerCase() !== "ollama";
  const apiKey = process.env[llmConfig.api_key_env];

  if (requiresApiKey && !apiKey) {
    throw new Error(
      `API key not found: ${llmConfig.api_key_env}. Set this environment variable.`
    );
  }

  const provider = await createLLMProvider(llmConfig.provider, {
    apiKey: apiKey || "",
    model: llmConfig.model,
    baseUrl: llmConfig.base_url,
    temperature: llmConfig.temperature,
    maxTokens: llmConfig.max_tokens,
  });

  let enforcer: PolicyEnforcer | undefined;
  try {
    let activePolicy: ActivePolicy;
    const policyPath = "policy.json";

    try {
      if (policyCache.has(policyPath)) {
        activePolicy = policyCache.get(policyPath)!;
      } else {
        const policyContent = await fs.readFile(policyPath, "utf-8");
        activePolicy = JSON.parse(policyContent) as ActivePolicy;
        policyCache.set(policyPath, activePolicy);
      }
    } catch {
      activePolicy = await buildConfigBackedPolicy(config, agentConfig);
    }

    enforcer = new PolicyEnforcer(activePolicy);
  } catch {
    // No policy - run unrestricted
  }

  if (enforcer && "setPolicyEnforcer" in provider) {
    (provider as unknown as { setPolicyEnforcer(e: PolicyEnforcer): void }).setPolicyEnforcer(enforcer);
  }

  return { provider, enforcer, agentConfig, config };
}

function createSekuireLanguageModel(handle: SekuireModelHandle): LanguageModelV1 {
  const { provider, enforcer } = handle;
  const modelId = provider.getModelName();

  return {
    specificationVersion: "v1",
    provider: `sekuire:${provider.getProviderName()}`,
    modelId,
    defaultObjectGenerationMode: undefined,

    async doGenerate(options) {
      if (enforcer && !("setPolicyEnforcer" in provider)) {
        enforcer.enforceModel(modelId);
        enforcer.enforceRateLimit("request");
      }

      const messages = convertPromptToMessages(options.prompt);
      const chatOptions = convertChatOptions(options);

      const response = await provider.chat(messages, chatOptions);

      const toolCalls = mapToolCalls(response.tool_calls);
      const finishReason = response.tool_calls?.length
        ? ("tool-calls" as LanguageModelV1FinishReason)
        : mapFinishReason(response.finish_reason);

      return {
        text: response.content || undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason,
        usage: {
          promptTokens: response.usage?.prompt_tokens ?? 0,
          completionTokens: response.usage?.completion_tokens ?? 0,
        },
        rawCall: {
          rawPrompt: messages,
          rawSettings: chatOptions,
        },
        warnings: [] as LanguageModelV1CallWarning[],
      };
    },

    async doStream(options) {
      if (enforcer && !("setPolicyEnforcer" in provider)) {
        enforcer.enforceModel(modelId);
        enforcer.enforceRateLimit("request");
      }

      const messages = convertPromptToMessages(options.prompt);
      const chatOptions = convertChatOptions(options);

      const generator = provider.chatStream(messages, chatOptions);

      const readableStream = new ReadableStream<LanguageModelV1StreamPart>({
        async start(controller) {
          try {
            let finishReason: LanguageModelV1FinishReason = "stop";

            for await (const chunk of generator) {
              if (chunk.content) {
                controller.enqueue({
                  type: "text-delta",
                  textDelta: chunk.content,
                });
              }

              if (chunk.finish_reason) {
                finishReason = mapFinishReason(chunk.finish_reason);
              }
            }

            controller.enqueue({
              type: "finish",
              finishReason,
              usage: {
                promptTokens: 0,
                completionTokens: 0,
              },
            });
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return {
        stream: readableStream,
        rawCall: {
          rawPrompt: messages,
          rawSettings: chatOptions,
        },
        warnings: [] as LanguageModelV1CallWarning[],
      };
    },
  };
}

export function createSekuireProvider(options?: SekuireProviderOptions) {
  const configPath = options?.configPath;
  const handleCache = new Map<string, SekuireModelHandle>();

  return {
    async model(agentName?: string): Promise<LanguageModelV1> {
      const cacheKey = agentName || "__default__";

      if (!handleCache.has(cacheKey)) {
        const handle = await loadModelHandle(agentName, configPath);
        handleCache.set(cacheKey, handle);
      }

      const handle = handleCache.get(cacheKey)!;
      return createSekuireLanguageModel(handle);
    },

    getHandle(agentName?: string): SekuireModelHandle | undefined {
      const cacheKey = agentName || "__default__";
      return handleCache.get(cacheKey);
    },
  };
}
