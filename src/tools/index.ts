export * from './agent-delegation';
export * from './agent-invocation';
export * from './base';
export * from './calculator';
export * from './compliance-operations';
export * from './data-formats';
export * from './data-operations';
export * from './directory-operations';
export * from './file-operations';
export * from './google-workspace';
export * from './http-request';
export * from './network-operations';
export * from './pattern-parser';
export * from './system-operations';
export * from './utility-operations';
export * from './verification-status';
export * from './web-search';

import { AgentDelegationTool, AgentDiscoveryTool, AgentStatusTool } from './agent-delegation';
import { GetAgentInfoTool, InvokeAgentTool, SearchAgentsTool } from './agent-invocation';
import { ToolRegistry } from './base';
import { CalculatorTool } from './calculator';
import {
  AuditLogTool,
  DecryptDataTool,
  EncryptDataTool,
  PiiDetectTool,
} from './compliance-operations';
import {
  CsvParseTool,
  CsvWriteTool,
  JsonStringifyTool,
  XmlParseTool,
  YamlParseTool,
} from './data-formats';
import { Base64DecodeTool, Base64EncodeTool, HashTool, JsonParseTool } from './data-operations';
import {
  DirectoryCopyTool,
  DirectoryExistsTool,
  DirectoryListTool,
  DirectoryMkdirTool,
  DirectoryMoveTool,
  DirectoryRmdirTool,
  DirectoryRmRecursiveTool,
  DirectoryTreeTool,
} from './directory-operations';
import {
  FileAppendTool,
  FileChmodTool,
  FileCopyTool,
  FileDeleteTool,
  FileExistsTool,
  FileListTool,
  FileMoveTool,
  FileReadTool,
  FileStatTool,
  FileWriteTool,
} from './file-operations';
import { HttpRequestTool } from './http-request';
import {
  DnsLookupTool,
  DownloadFileTool,
  HttpDeleteTool,
  HttpPostTool,
  HttpPutTool,
  PingTool,
} from './network-operations';
import { EnvGetTool, EnvSetTool, GetCwdTool, GetPlatformTool } from './system-operations';
import { GoogleDocsCreateTool } from './google-workspace';
import {
  DateFormatTool,
  GenerateUuidTool,
  RandomNumberTool,
  RegexMatchTool,
  SleepTool,
  UrlParseTool,
} from './utility-operations';
import { VerificationStatusTool } from './verification-status';
import { WebSearchTool } from './web-search';

export interface ToolRegistryOptions {
  privateKey?: string;
  publicKey?: string;
  registryUrl?: string;
}

export function createDefaultToolRegistry(options?: ToolRegistryOptions): ToolRegistry {
  const registry = new ToolRegistry();

  // Files category
  registry.register(new FileReadTool());
  registry.register(new FileWriteTool());
  registry.register(new FileAppendTool());
  registry.register(new FileDeleteTool());
  registry.register(new FileMoveTool());
  registry.register(new FileCopyTool());
  registry.register(new FileStatTool());
  registry.register(new FileExistsTool());
  registry.register(new FileListTool());
  registry.register(new FileChmodTool());

  // Directories category
  registry.register(new DirectoryListTool());
  registry.register(new DirectoryMkdirTool());
  registry.register(new DirectoryRmdirTool());
  registry.register(new DirectoryRmRecursiveTool());
  registry.register(new DirectoryExistsTool());
  registry.register(new DirectoryMoveTool());
  registry.register(new DirectoryCopyTool());
  registry.register(new DirectoryTreeTool());

  // Network category
  registry.register(new WebSearchTool());
  registry.register(new HttpRequestTool());
  registry.register(new HttpPostTool());
  registry.register(new HttpPutTool());
  registry.register(new HttpDeleteTool());
  registry.register(new DownloadFileTool());
  registry.register(new DnsLookupTool());
  registry.register(new PingTool());

  // Google Workspace category
  registry.register(new GoogleDocsCreateTool());

  // Data category
  registry.register(new JsonParseTool());
  registry.register(new JsonStringifyTool());
  registry.register(new CsvParseTool());
  registry.register(new CsvWriteTool());
  registry.register(new YamlParseTool());
  registry.register(new XmlParseTool());
  registry.register(new Base64EncodeTool());
  registry.register(new Base64DecodeTool());
  registry.register(new HashTool());

  // Utilities category
  registry.register(new CalculatorTool());
  registry.register(new DateFormatTool());
  registry.register(new GenerateUuidTool());
  registry.register(new RandomNumberTool());
  registry.register(new SleepTool());
  registry.register(new RegexMatchTool());
  registry.register(new UrlParseTool());

  // System category
  registry.register(new GetCwdTool());
  registry.register(new GetPlatformTool());
  registry.register(new EnvGetTool());
  registry.register(new EnvSetTool());

  // Compliance category
  registry.register(new AuditLogTool());
  registry.register(new PiiDetectTool());
  registry.register(new EncryptDataTool());
  registry.register(new DecryptDataTool());

  // Agent Communication category
  registry.register(
    new SearchAgentsTool(options?.privateKey, options?.publicKey, options?.registryUrl)
  );
  registry.register(
    new GetAgentInfoTool(options?.privateKey, options?.publicKey, options?.registryUrl)
  );
  registry.register(
    new InvokeAgentTool(options?.privateKey, options?.publicKey, options?.registryUrl)
  );

  // Agent Orchestration category
  registry.register(new AgentDiscoveryTool());
  registry.register(new AgentDelegationTool());
  registry.register(new AgentStatusTool());

  // CRITICAL: Always register verification status tool (required for compliance)
  registry.register(new VerificationStatusTool());

  return registry;
}

export const builtInTools = {
  // Files
  FileReadTool,
  FileWriteTool,
  FileAppendTool,
  FileDeleteTool,
  FileMoveTool,
  FileCopyTool,
  FileStatTool,
  FileExistsTool,
  FileListTool,
  FileChmodTool,

  // Directories
  DirectoryListTool,
  DirectoryMkdirTool,
  DirectoryRmdirTool,
  DirectoryRmRecursiveTool,
  DirectoryExistsTool,
  DirectoryMoveTool,
  DirectoryCopyTool,
  DirectoryTreeTool,

  // Network
  WebSearchTool,
  HttpRequestTool,
  HttpPostTool,
  HttpPutTool,
  HttpDeleteTool,
  DownloadFileTool,
  DnsLookupTool,
  PingTool,

  // Google Workspace
  GoogleDocsCreateTool,

  // Data
  JsonParseTool,
  JsonStringifyTool,
  CsvParseTool,
  CsvWriteTool,
  YamlParseTool,
  XmlParseTool,
  Base64EncodeTool,
  Base64DecodeTool,
  HashTool,

  // Utilities
  CalculatorTool,
  DateFormatTool,
  GenerateUuidTool,
  RandomNumberTool,
  SleepTool,
  RegexMatchTool,
  UrlParseTool,

  // System
  GetCwdTool,
  GetPlatformTool,
  EnvGetTool,
  EnvSetTool,

  // Agent Communication
  SearchAgentsTool,
  GetAgentInfoTool,
  InvokeAgentTool,

  // Agent Orchestration
  AgentDiscoveryTool,
  AgentDelegationTool,
  AgentStatusTool,

  // Compliance
  VerificationStatusTool,
  AuditLogTool,
  PiiDetectTool,
  EncryptDataTool,
  DecryptDataTool,
};
