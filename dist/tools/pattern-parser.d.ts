import type { ToolRegistry } from './base';
export declare class ToolPatternParser {
    /**
     * Get the tool name prefix for a category
     * "files" -> "file"
     * "directories" -> "dir"
     * "network" -> "http" or "network"
     */
    private static getCategoryPrefix;
    /**
     * Parse tool patterns:
     *   "calculator" => ["calculator"]
     *   "files:*" => ["file_read", "file_write", "file_delete", ...]
     *   "files:[read,write]" => ["file_read", "file_write"]
     */
    static parse(pattern: string, registry: ToolRegistry): string[];
    /**
     * Expand multiple patterns into unique tool names
     */
    static expandPatterns(patterns: string[], registry: ToolRegistry): string[];
    /**
     * Filter allowed tools by removing blocked ones
     */
    static filterBlocked(allowedTools: string[], blockedTools: string[]): string[];
}
