/**
 * ⚠️ CRITICAL SYSTEM TOOL - DO NOT EDIT OR DELETE ⚠️
 *
 * This tool is automatically included by Sekuire to verify agent compliance
 * and verification status. Removing or modifying this tool will prevent your
 * agent from being properly verified and may result in trust protocol violations.
 *
 * This tool queries the Sekuire registry to check:
 * - Agent verification status (verified/unverified/pending)
 * - Compliance framework adherence
 * - Security score and reputation
 * - Code review status
 */

import { Tool, type ToolInput, type ToolMetadata } from './base';

interface VerificationStatusResponse {
  sekuire_id: string;
  verification_status: 'Verified' | 'Unverified' | 'Pending' | 'Revoked';
  reputation_score: number;
  security_score?: number;
  code_review_status?: string;
  compliance_frameworks: string[];
  is_compliant: boolean;
  last_verified?: string;
  verified_by?: string;
  verification_details?: {
    has_valid_signature: boolean;
    repository_verified: boolean;
    passes_security_checks: boolean;
    compliance_score: number;
  };
}

export class VerificationStatusTool extends Tool {
  metadata: ToolMetadata = {
    name: 'get_verification_status',
    description:
      'Check the verification and compliance status of this agent in the Sekuire registry. This tool is required for trust protocol compliance and must not be removed.',
    parameters: [
      {
        name: 'sekuire_id',
        type: 'string',
        description: 'The Sekuire ID of the agent to check (defaults to current agent)',
        required: false,
      },
      {
        name: 'include_details',
        type: 'boolean',
        description: 'Include detailed verification information',
        required: false,
      },
    ],
    category: 'compliance',
    compliance_level: 'system', // System-level tool that cannot be disabled
  };

  private registryUrl: string;

  constructor(registryUrl?: string) {
    super();
    // Default to production registry, or use custom URL
    this.registryUrl = registryUrl || process.env.SEKUIRE_REGISTRY_URL || 'http://localhost:9300';
  }

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const sekuireId = (input.sekuire_id as string) || this.getAgentId();
    const includeDetails = (input.include_details as boolean) || false;

    if (!sekuireId) {
      throw new Error('No Sekuire ID provided and unable to determine current agent ID');
    }

    try {
      // Query the Sekuire registry API
      const response = await fetch(`${this.registryUrl}/api/v1/agents/${sekuireId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Sekuire-SDK/1.0',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return JSON.stringify({
            status: 'error',
            message: `Agent ${sekuireId} not found in registry. This agent may not be registered or verified.`,
            is_verified: false,
            is_compliant: false,
          });
        }
        throw new Error(`Registry API error: ${response.status}`);
      }

      const agentData = await response.json();

      // Build verification status response
      const result: VerificationStatusResponse = {
        sekuire_id: agentData.sekuire_id,
        verification_status: agentData.verification_status || 'Unverified',
        reputation_score: agentData.reputation_score || 0,
        security_score: agentData.security_score,
        code_review_status: agentData.code_review_status,
        compliance_frameworks: this.extractComplianceFrameworks(agentData.manifest),
        is_compliant: this.isCompliant(agentData),
        last_verified: agentData.reviewed_at,
        verified_by: agentData.reviewed_by,
      };

      // Add detailed information if requested
      if (includeDetails) {
        result.verification_details = {
          has_valid_signature: !!agentData.public_key,
          repository_verified: agentData.repository_verified || false,
          passes_security_checks: (agentData.security_score || 0) >= 70,
          compliance_score: this.calculateComplianceScore(agentData),
        };
      }

      // Return formatted response
      return this.formatResponse(result);
    } catch (error) {
      return JSON.stringify({
        status: 'error',
        message: `Failed to verify agent status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        is_verified: false,
        is_compliant: false,
        recommendation:
          "Unable to verify agent. Please ensure the agent is properly registered with 'sekuire publish'.",
      });
    }
  }

  /**
   * Get the current agent's Sekuire ID from environment or config
   */
  private getAgentId(): string | null {
    // Try to get from environment variable
    const envId = process.env.SEKUIRE_AGENT_ID;
    if (envId) return envId;

    // Try to read from .sekuire directory
    try {
      const fs = require('node:fs');
      const path = require('node:path');
      const sekuirePath = path.join(process.cwd(), '.sekuire', 'agent.json');
      if (fs.existsSync(sekuirePath)) {
        const config = JSON.parse(fs.readFileSync(sekuirePath, 'utf-8'));
        return config.sekuire_id;
      }
    } catch {
      // Silent fail - we'll return null
    }

    return null;
  }

  /**
   * Extract compliance frameworks from manifest
   */
  private extractComplianceFrameworks(manifest: unknown): string[] {
    const frameworks: string[] = [];
    try {
      const manifestObj = typeof manifest === 'string' ? JSON.parse(manifest) : manifest;
      if (manifestObj?.agent?.compliance?.framework) {
        frameworks.push(manifestObj.agent.compliance.framework);
      }
    } catch {
      // Silent fail
    }
    return frameworks;
  }

  /**
   * Determine if agent is compliant based on verification status and checks
   */
  private isCompliant(agentData: Record<string, unknown>): boolean {
    const hasVerification =
      agentData.verification_status === 'Verified' || agentData.verification_status === 'Pending';
    const hasGoodReputation = (Number(agentData.reputation_score) || 0) >= 0;
    const hasSecurityScore = (Number(agentData.security_score) || 0) >= 60;

    return hasVerification && hasGoodReputation && hasSecurityScore;
  }

  /**
   * Calculate overall compliance score
   */
  private calculateComplianceScore(agentData: Record<string, unknown>): number {
    let score = 0;

    // Verification status (40 points)
    if (agentData.verification_status === 'Verified') score += 40;
    else if (agentData.verification_status === 'Pending') score += 20;

    // Reputation (30 points)
    const repScore = Math.min(30, Math.floor((Number(agentData.reputation_score) || 0) / 10));
    score += repScore;

    // Security score (20 points)
    const secScore = Math.min(20, Math.floor(((Number(agentData.security_score) || 0) / 100) * 20));
    score += secScore;

    // Code review (10 points)
    if (agentData.code_review_status === 'approved') score += 10;

    return score;
  }

  /**
   * Format the response for the agent
   */
  private formatResponse(result: VerificationStatusResponse): string {
    const statusEmoji =
      result.verification_status === 'Verified'
        ? '✅'
        : result.verification_status === 'Pending'
          ? '⏳'
          : '⚠️';

    let response = `${statusEmoji} Agent Verification Status\n\n`;
    response += `Sekuire ID: ${result.sekuire_id}\n`;
    response += `Status: ${result.verification_status}\n`;
    response += `Reputation: ${result.reputation_score}\n`;

    if (result.security_score !== undefined) {
      response += `Security Score: ${result.security_score}/100\n`;
    }

    if (result.compliance_frameworks.length > 0) {
      response += `Compliance: ${result.compliance_frameworks.join(', ')}\n`;
    }

    response += `\nCompliant: ${result.is_compliant ? 'Yes ✓' : 'No ✗'}\n`;

    if (result.verification_details) {
      response += `\nDetailed Verification:\n`;
      response += `  • Valid Signature: ${result.verification_details.has_valid_signature ? '✓' : '✗'}\n`;
      response += `  • Repository Verified: ${result.verification_details.repository_verified ? '✓' : '✗'}\n`;
      response += `  • Security Checks: ${result.verification_details.passes_security_checks ? '✓' : '✗'}\n`;
      response += `  • Compliance Score: ${result.verification_details.compliance_score}/100\n`;
    }

    if (!result.is_compliant) {
      response += `\n⚠️  Warning: This agent is not fully compliant.\n`;
      response += `   Run 'sekuire verify' to initiate verification process.\n`;
    }

    return response;
  }
}
