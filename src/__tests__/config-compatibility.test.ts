import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getAgent } from '../new-agent';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sekuire-sdk-'));
  tempDirs.push(dir);
  return dir;
}

async function writeCommonFiles(root: string): Promise<{
  promptPath: string;
  toolsPath: string;
}> {
  const promptPath = path.join(root, 'system_prompt.md');
  const toolsPath = path.join(root, 'tools.json');

  await fs.writeFile(promptPath, 'You are a compatibility test agent.', 'utf-8');
  await fs.writeFile(toolsPath, JSON.stringify({ version: '1.0', tools: [] }, null, 2), 'utf-8');

  return { promptPath, toolsPath };
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('Generated config compatibility', () => {
  it('normalizes legacy sekuire.yml policy and sqlite memory config', async () => {
    process.env.SEKUIRE_NO_CTA = 'true';
    delete process.env.OLLAMA_API_KEY;

    const root = await createTempDir();
    const { promptPath, toolsPath } = await writeCommonFiles(root);

    const dataDir = path.join(root, 'data');
    const logsDir = path.join(root, 'logs');
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(logsDir, { recursive: true });

    const configPath = path.join(root, 'sekuire.yml');
    const config = `project:
  name: "compat-agent"
  version: "0.1.0"
agent:
  name: "compat-agent"
  system_prompt: "${promptPath}"
  tools: "${toolsPath}"
  llm:
    provider: "ollama"
    model: "llama3.1"
    api_key_env: "OLLAMA_API_KEY"
    base_url: "http://localhost:11434"
  allowed_tools:
    - network:*
    - data:*
    - system:*
  memory:
    type: "buffer"
    max_messages: 10
  network:
    allow:
      - "https://api.duckduckgo.com"
  filesystem:
    allow_read:
      - "${dataDir}/"
    allow_write:
      - "${logsDir}/"
`;

    await fs.writeFile(configPath, config, 'utf-8');

    const agent = await getAgent(undefined, undefined, configPath);
    const enforcer = agent.getPolicyEnforcer();
    expect(enforcer).toBeDefined();
    if (!enforcer) {
      throw new Error('Expected policy enforcer to be initialized');
    }

    expect(() => enforcer.enforceTool('web_search')).not.toThrow();
    expect(() => enforcer.enforceTool('json_parse')).not.toThrow();
    expect(() => enforcer.enforceTool('env_get')).not.toThrow();
    expect(() => enforcer.enforceTool('file_read')).toThrow();

    expect(() => enforcer.enforceNetwork('api.duckduckgo.com', 'https')).not.toThrow();
    expect(() => enforcer.enforceFilesystem(path.join(dataDir, 'note.txt'), 'read')).not.toThrow();
    expect(() => enforcer.enforceFilesystem(path.join(root, 'outside.txt'), 'read')).toThrow();
  });

  it('supports file memory backend from generated config syntax', async () => {
    process.env.SEKUIRE_NO_CTA = 'true';
    delete process.env.OLLAMA_API_KEY;

    const root = await createTempDir();
    const { promptPath, toolsPath } = await writeCommonFiles(root);
    const memoryPath = path.join(root, 'agent_memory.json');
    const configPath = path.join(root, 'sekuire.yml');

    const config = `project:
  name: "file-memory-agent"
  version: "0.1.0"
agent:
  name: "file-memory-agent"
  system_prompt: "${promptPath}"
  tools: "${toolsPath}"
  llm:
    provider: "ollama"
    model: "llama3.1"
    api_key_env: "OLLAMA_API_KEY"
    base_url: "http://localhost:11434"
  memory:
    type: "file"
    config:
      path: "${memoryPath}"
`;

    await fs.writeFile(configPath, config, 'utf-8');

    const agent = await getAgent(undefined, undefined, configPath);
    await agent.clearHistory();

    const content = await fs.readFile(memoryPath, 'utf-8');
    expect(content.trim().startsWith('{')).toBe(true);
  });
});
