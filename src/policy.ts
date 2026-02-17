import { SekuireCrypto } from "./crypto";
import { ProtocolError } from "./types";

export interface ActivePolicy {
  policy_id: string;
  workspace_id: string;
  version: string;
  status: string;
  hash: string;
  content: any;
  activated_at?: string;
  updated_at?: string;
  signature?: string;
  signing_key_id?: string;
  signing_public_key?: string;
}

export class PolicyClient {
  private cache = new Map<string, ActivePolicy>();

  constructor(private readonly baseUrl: string) {}

  invalidateCache(workspaceId: string): void {
    this.cache.delete(workspaceId);
  }

  async fetchActivePolicy(workspaceId: string): Promise<ActivePolicy> {
    if (this.cache.has(workspaceId)) {
      return this.cache.get(workspaceId)!;
    }

    const res = await fetch(
      `${this.baseUrl}/api/v1/workspaces/${workspaceId}/policy/active`,
      { method: "GET" },
    );

    if (!res.ok) {
      throw new ProtocolError(
        `Failed to fetch active policy: ${res.status} ${res.statusText}`,
        res.status,
      );
    }

    const policy: ActivePolicy = await res.json();
    this.verify(policy);
    this.cache.set(workspaceId, policy);
    return policy;
  }

  verify(policy: ActivePolicy): void {
    const recalculatedHash = SekuireCrypto.hash(JSON.stringify(policy.content));
    if (recalculatedHash !== policy.hash) {
      throw new ProtocolError(
        `Policy hash mismatch. Expected ${policy.hash}, got ${recalculatedHash}`,
        400,
      );
    }

    if (policy.signature && policy.signing_public_key) {
      const message = `${policy.policy_id}:${policy.version}:${policy.hash}`;
      const valid = SekuireCrypto.verify(
        message,
        policy.signature,
        policy.signing_public_key,
      );
      if (!valid) {
        throw new ProtocolError("Policy signature verification failed", 400);
      }
    }
  }
}
