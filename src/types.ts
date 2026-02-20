// --- Sekuire Identity Protocol Types ---

export interface Manifest {
  project: ProjectMetadata;
  identity: IdentityConfig;
}

export interface ProjectMetadata {
  name: string;
  version: string;
  description?: string;
  authors: string[];
  license?: string;
}

export interface IdentityConfig {
  /** The model identifier (e.g., "gpt-4-0613") */
  model: string;

  /** Path to the system prompt file (relative to sekuire.json) */
  systemPromptPath: string;

  /** Path to the tools definition file (relative to sekuire.json) */
  toolsPath: string;

  /** The Blake3 hash of the system prompt content */
  systemPromptHash?: string;

  /** The Blake3 hash of the tools definition content */
  toolsHash?: string;
}

// --- Registry API Types ---

export interface PublishRequest {
  manifest: Manifest;
  sekuireId: string; // The calculated hash
  signature: string; // Signed hash
  publicKey: string; // The signer's public key
}

// --- Trust Registry Types ---

export interface AgentResponse {
  sekuireId: string;
  name: string;
  version: string;
  description?: string;
  authorKey: string;
  createdAt: string; // ISO8601
  verificationStatus: VerificationStatus;
  reputationScore: number; // 0-100
}

export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'suspended';

export interface ReputationResponse {
  score: number;
  taskCount: number;
  verificationBadge?: string; // e.g., "HIPAA"
  recentLogs: ReputationLog[];
}

export interface ReputationLog {
  id: string;
  taskHash: string;
  rating: number; // 1-5
  comment?: string;
  timestamp: string;
}

export interface SubmitReputationRequest {
  sekuireId: string;
  taskHash: string;
  rating: number;
  comment?: string;
  signature: string; // Employer's signature over the rating
}

export * from "./types/policy";

// --- Handshake Protocol ---

export interface HandshakeHello {
  clientNonce: string; // Random 32-byte hex
}

export interface HandshakeWelcome {
  agentId: string;
  agentNonce: string; // Random 32-byte hex
  signatureC: string; // Sign(clientNonce) by Agent
  agentPublicKey: string; // Agent Ed25519 public key
  credentials: string[]; // List of Signed VCs (JWTs)
}

export interface HandshakeAuth {
  signatureA: string; // Sign(agentNonce) by Client
  clientPublicKey: string; // Client Ed25519 public key (hex)
  clientNonce?: string; // Echo of HELLO nonce (optional for backwards compatibility)
}

// --- Verification & Disputes ---

export interface VerifyAgentRequest {
  sekuireId: string;
  status: VerificationStatus; // Verified, Suspended
  badge?: string; // e.g. "safe", "hipaa"
  reason?: string;
}

export interface DisputeRequest {
  sekuireId: string;
  accuserId: string; // Employer ID
  reason: string;
  evidenceLog: string; // Signed conversation
}

// --- Deprecated / Legacy Management API ---

export interface CreateOrgRequest {
  slug: string;
  displayName: string;
  billingEmail: string;
}

export interface OrgResponse {
  id: string;
  slug: string;
  role: string;
}

export interface CreateWorkspaceRequest {
  name: string;
  policyPreset: string;
}

export interface WorkspaceResponse {
  id: string;
  name: string;
}

export interface InviteRequest {
  email: string;
  role: string;
}

export interface InviteResponse {
  id: string;
  status: string;
}

export interface UserContextResponse {
  id: string;
  email: string;
  onboarded: boolean;
  mfa_enabled: boolean;
  role?: string;
  full_name?: string;
  avatar_url?: string;
  onboarding_step?: number;
  profile_completed?: boolean;
  orgs: OrgSummary[];
  workspaces: WorkspaceSummary[];
}

export interface OrgSummary {
  id: string;
  slug: string;
  workspaces?: WorkspaceSummary[];
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  org_id: string;
}

// --- SDK Specific Types ---

export interface SekuireClientConfig {
  registryUrl: string;
  apiKey?: string; // API key for authentication (X-API-Key header)
  timeout?: number; // milliseconds
  retries?: number;
}

export interface KeyPair {
  publicKey: string; // hex string
  privateKey: string; // hex string
}

export interface HandshakeResult {
  agentId: string;
  verified: boolean;
  credentials: string[];
}

// --- Error Types ---

export class SekuireError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'SekuireError';
  }
}

export class NetworkError extends SekuireError {
  constructor(
    message: string,
    public readonly originalError?: Error
  ) {
    super(message, 'NETWORK_ERROR', originalError);
    this.name = 'NetworkError';
  }
}

export class ProtocolError extends SekuireError {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message, 'PROTOCOL_ERROR', { statusCode });
    this.name = 'ProtocolError';
  }
}

export class CryptoError extends SekuireError {
  constructor(message: string) {
    super(message, 'CRYPTO_ERROR');
    this.name = 'CryptoError';
  }
}

export class PolicyViolationError extends SekuireError {
  constructor(message: string, public readonly rule: string) {
    super(message, 'POLICY_VIOLATION');
    this.name = 'PolicyViolationError';
  }
}

// --- Utility Types ---

export type HexString = string; // 0x prefixed hex string
export type AgentId = string; // Blake3 hash hex string
