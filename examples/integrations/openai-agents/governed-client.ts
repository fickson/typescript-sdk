import OpenAI from "openai";
import {
  getAgent,
  PolicyEnforcer,
} from "@sekuire/sdk";

export interface GovernedClientOptions {
  apiKey?: string;
  configPath?: string;
  agentName?: string;
  openaiOptions?: Omit<ConstructorParameters<typeof OpenAI>[0], "apiKey">;
}

export async function loadSekuirePolicy(
  configPath?: string,
  agentName?: string
): Promise<PolicyEnforcer> {
  const agent = await getAgent(agentName, undefined, configPath);
  const enforcer = agent.getPolicyEnforcer();
  if (!enforcer) {
    throw new Error(
      "No policy enforcer available. Ensure sekuire.yml has policy configuration."
    );
  }
  return enforcer;
}

export async function createGovernedOpenAIClient(
  options: GovernedClientOptions = {}
): Promise<OpenAI> {
  const {
    apiKey,
    configPath = "./sekuire.yml",
    agentName,
    openaiOptions,
  } = options;

  const enforcer = await loadSekuirePolicy(configPath, agentName);

  const client = new OpenAI({
    apiKey: apiKey ?? process.env.OPENAI_API_KEY,
    ...openaiOptions,
  });

  return proxyClient(client, enforcer);
}

function proxyClient(client: OpenAI, enforcer: PolicyEnforcer): OpenAI {
  const originalCreate = client.chat.completions.create.bind(
    client.chat.completions
  );

  client.chat.completions.create = function governedCreate(
    body: any,
    options?: any
  ): any {
    enforcer.enforceModel(body.model);
    enforcer.enforceRateLimit("request");

    if (body.tools) {
      for (const tool of body.tools) {
        if (tool.type === "function" && tool.function?.name) {
          enforcer.enforceTool(tool.function.name);
        }
      }
    }

    if (body.stream) {
      return proxyStream(originalCreate(body, options) as any, enforcer);
    }

    const promise = originalCreate(body, options) as Promise<any>;
    return promise.then((response: any) => {
      enforcePostCall(enforcer, response);
      return response;
    });
  } as any;

  return client;
}

function enforcePostCall(enforcer: PolicyEnforcer, response: any): void {
  if (response.usage?.total_tokens) {
    enforcer.enforceRateLimit("token", response.usage.total_tokens);
  }

  if (response.choices) {
    for (const choice of response.choices) {
      if (choice.message?.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          if (tc.type === "function" && tc.function?.name) {
            enforcer.enforceTool(tc.function.name);
          }
        }
      }
    }
  }
}

async function proxyStream(
  streamPromise: Promise<AsyncIterable<any>>,
  enforcer: PolicyEnforcer
): Promise<AsyncIterable<any>> {
  const originalStream = await streamPromise;

  async function* governedIterator() {
    for await (const chunk of originalStream) {
      if (chunk.choices) {
        for (const choice of chunk.choices) {
          if (choice.delta?.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              if (tc.type === "function" && tc.function?.name) {
                enforcer.enforceTool(tc.function.name);
              }
            }
          }
        }
      }

      if (chunk.usage?.total_tokens) {
        enforcer.enforceRateLimit("token", chunk.usage.total_tokens);
      }

      yield chunk;
    }
  }

  return new Proxy(originalStream as any, {
    get(target, prop, receiver) {
      if (prop === Symbol.asyncIterator) {
        return () => governedIterator();
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
