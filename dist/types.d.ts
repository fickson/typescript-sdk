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
export interface PublishRequest {
    manifest: Manifest;
    sekuireId: string;
    signature: string;
    publicKey: string;
}
export interface AgentResponse {
    sekuireId: string;
    name: string;
    version: string;
    description?: string;
    authorKey: string;
    createdAt: string;
    verificationStatus: VerificationStatus;
    reputationScore: number;
}
export type VerificationStatus = 'unverified' | 'pending' | 'verified' | 'suspended';
export interface ReputationResponse {
    score: number;
    taskCount: number;
    verificationBadge?: string;
    recentLogs: ReputationLog[];
}
export interface ReputationLog {
    id: string;
    taskHash: string;
    rating: number;
    comment?: string;
    timestamp: string;
}
export interface SubmitReputationRequest {
    sekuireId: string;
    taskHash: string;
    rating: number;
    comment?: string;
    signature: string;
}
export * from "./types/policy";
export interface HandshakeHello {
    clientNonce: string;
}
export interface HandshakeWelcome {
    agentId: string;
    agentNonce: string;
    signatureC: string;
    agentPublicKey: string;
    credentials: string[];
}
export interface HandshakeAuth {
    signatureA: string;
    clientPublicKey: string;
    clientNonce?: string;
}
export interface VerifyAgentRequest {
    sekuireId: string;
    status: VerificationStatus;
    badge?: string;
    reason?: string;
}
export interface DisputeRequest {
    sekuireId: string;
    accuserId: string;
    reason: string;
    evidenceLog: string;
}
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
export interface SekuireClientConfig {
    registryUrl: string;
    apiKey?: string;
    timeout?: number;
    retries?: number;
}
export interface KeyPair {
    publicKey: string;
    privateKey: string;
}
export interface HandshakeResult {
    agentId: string;
    verified: boolean;
    credentials: string[];
}
export declare class SekuireError extends Error {
    readonly code: string;
    readonly details?: any | undefined;
    constructor(message: string, code: string, details?: any | undefined);
}
export declare class NetworkError extends SekuireError {
    readonly originalError?: Error | undefined;
    constructor(message: string, originalError?: Error | undefined);
}
export declare class ProtocolError extends SekuireError {
    readonly statusCode?: number | undefined;
    constructor(message: string, statusCode?: number | undefined);
}
export declare class CryptoError extends SekuireError {
    constructor(message: string);
}
export declare class PolicyViolationError extends SekuireError {
    readonly rule: string;
    constructor(message: string, rule: string);
}
export type HexString = string;
export type AgentId = string;
