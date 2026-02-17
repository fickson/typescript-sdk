/**
 * A2A Protocol Type Definitions
 *
 * Types implementing the A2A Protocol specification for agent interoperability.
 * See: https://github.com/a2aproject/A2A
 */

// ============================================================================
// Agent Card Types
// ============================================================================

/** Full A2A-compliant Agent Card */
export interface AgentCard {
  /** Unique agent identifier (e.g., "sekuire:workspace:agent-name") */
  agentId: string;

  /** Human-readable agent name */
  name: string;

  /** Agent description */
  description: string;

  /** Semantic version */
  version: string;

  /** Provider information */
  provider?: AgentProvider;

  /** Supported A2A protocol versions */
  protocolVersions: string[];

  /** Agent capabilities */
  capabilities: AgentCapabilities;

  /** Skills the agent provides */
  skills: AgentSkill[];

  /** Default input MIME types accepted */
  defaultInputModes?: string[];

  /** Default output MIME types produced */
  defaultOutputModes?: string[];

  /** Security schemes supported */
  securitySchemes?: Record<string, SecurityScheme>;

  /** Required security scheme names */
  security?: string[];

  /** Base URL for A2A endpoints */
  url: string;
}

/** Provider information */
export interface AgentProvider {
  name: string;
  url?: string;
}

/** Agent capabilities */
export interface AgentCapabilities {
  /** Supports streaming responses via SSE */
  streaming: boolean;

  /** Supports push notifications */
  pushNotifications: boolean;

  /** Supports extended agent card endpoint */
  extendedAgentCard: boolean;
}

/** Security scheme definition */
export interface SecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
}

/** Structured skill definition */
export interface AgentSkill {
  /** Skill identifier (e.g., "document:summarize") */
  id: string;

  /** Human-readable skill name */
  name: string;

  /** Skill description */
  description?: string;

  /** Tags for categorization */
  tags?: string[];

  /** Input MIME types accepted */
  inputModes?: string[];

  /** Output MIME types produced */
  outputModes?: string[];

  /** Example prompts */
  examples?: string[];
}

// ============================================================================
// Message Types
// ============================================================================

/** A2A message with role and parts */
export interface A2AMessage {
  /** Message role: "user" or "agent" */
  role: 'user' | 'agent';

  /** Message content parts */
  parts: A2AMessagePart[];
}

/** Message part content */
export type A2AMessagePart =
  | { type: 'text'; text: string }
  | { type: 'file'; uri: string; mimeType?: string }
  | { type: 'data'; data: unknown };

// ============================================================================
// Task Types
// ============================================================================

/** A2A task states (aligned with A2A protocol spec) */
export type A2ATaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'rejected'
  | 'auth-required';

/** A2A task status with timestamp */
export interface A2ATaskStatus {
  state: A2ATaskState;
  timestamp: string;
}

/** Full A2A task */
export interface A2ATask {
  taskId: string;
  contextId?: string;
  status: A2ATaskStatus;
  artifacts: A2AArtifact[];
  history: A2AMessage[];
  /** ID of the task that delegated to this task */
  parentTaskId?: string;
  /** Trace ID shared across the delegation chain */
  traceId?: string;
}

/** Task artifact output */
export interface A2AArtifact {
  name?: string;
  parts: A2AMessagePart[];
  index?: number;
}

// ============================================================================
// Routing Types
// ============================================================================

/** Request for skill-based auto-discovery routing */
export interface A2ARouteRequest {
  /** Required skill (e.g., "document:summarize") */
  skill: string;

  /** Message to send to the agent */
  message: A2AMessage;

  /** Optional conversation context ID */
  contextId?: string;

  /** Parent task ID for delegation tracking */
  parentTaskId?: string;

  /** Trace ID for the entire delegation chain */
  traceId?: string;
}

/** Response from skill-based routing */
export interface A2ARouteResponse {
  /** Created task ID */
  taskId: string;

  /** Current task status */
  status: A2ATaskState;

  /** ID of the selected agent */
  agentId: string;

  /** Initial response message (if any) */
  message?: A2AMessage;

  /** Trace ID for the delegation chain */
  traceId?: string;
}

// ============================================================================
// JSON-RPC Types
// ============================================================================

/** JSON-RPC 2.0 Request */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  id: string | number;
  params?: unknown;
}

/** JSON-RPC 2.0 Response */
export interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  result?: T;
  error?: JsonRpcError;
}

/** JSON-RPC 2.0 Error */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// ============================================================================
// Method Parameters
// ============================================================================

/** Parameters for tasks/send method */
export interface TasksSendParams {
  /** Optional existing task ID to continue */
  taskId?: string;

  /** Message to send */
  message: A2AMessage;

  /** Optional context ID for grouping tasks */
  contextId?: string;
}

/** Parameters for tasks/get method */
export interface TasksGetParams {
  taskId: string;
}

/** Parameters for tasks/cancel method */
export interface TasksCancelParams {
  taskId: string;
}

/** Parameters for tasks/sendSubscribe method */
export interface TasksSendSubscribeParams {
  /** Optional existing task ID to continue */
  taskId?: string;

  /** Message to send */
  message: A2AMessage;
}

// ============================================================================
// SSE Event Types
// ============================================================================

/** SSE task update event */
export interface TaskUpdateEvent {
  taskId: string;
  status: A2ATaskState;
  updatedAt: string;
  message?: A2AMessage;
  artifacts?: A2AArtifact[];
}
