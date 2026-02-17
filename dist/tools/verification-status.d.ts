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
export declare class VerificationStatusTool extends Tool {
    metadata: ToolMetadata;
    private registryUrl;
    constructor(registryUrl?: string);
    execute(input: ToolInput): Promise<string>;
    /**
     * Get the current agent's Sekuire ID from environment or config
     */
    private getAgentId;
    /**
     * Extract compliance frameworks from manifest
     */
    private extractComplianceFrameworks;
    /**
     * Determine if agent is compliant based on verification status and checks
     */
    private isCompliant;
    /**
     * Calculate overall compliance score
     */
    private calculateComplianceScore;
    /**
     * Format the response for the agent
     */
    private formatResponse;
}
