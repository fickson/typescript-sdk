import type { ToolRegistry } from './base';

export class ToolPatternParser {
  /**
   * Get the tool name prefix for a category
   * "files" -> "file"
   * "directories" -> "dir"
   * "network" -> "http" or "network"
   */
  private static getCategoryPrefix(category: string): string {
    const prefixMap: Record<string, string> = {
      files: 'file',
      directories: 'dir',
      utilities: 'util',
      agent_communication: 'agent',
    };

    return prefixMap[category] || category;
  }

  /**
   * Parse tool patterns:
   *   "calculator" => ["calculator"]
   *   "files:*" => ["file_read", "file_write", "file_delete", ...]
   *   "files:[read,write]" => ["file_read", "file_write"]
   */
  static parse(pattern: string, registry: ToolRegistry): string[] {
    // Simple tool name (no colon)
    if (!pattern.includes(':')) {
      return [pattern];
    }

    const [category, operations] = pattern.split(':', 2);

    // Validate category exists
    if (!registry.hasCategory(category)) {
      throw new Error(`Unknown tool category: ${category}`);
    }

    // Wildcard: all tools in category
    if (operations === '*') {
      return registry.getToolsByCategory(category);
    }

    // Granular selection: [read,write,delete]
    if (operations.startsWith('[') && operations.endsWith(']')) {
      const ops = operations
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // Convert category to singular form for tool naming
      // "files" -> "file", "directories" -> "dir"
      const toolPrefix = ToolPatternParser.getCategoryPrefix(category);
      return ops.map((op) => `${toolPrefix}_${op}`);
    }

    throw new Error(
      `Invalid tool pattern: ${pattern}. Expected format: "category:*" or "category:[op1,op2]"`
    );
  }

  /**
   * Expand multiple patterns into unique tool names
   */
  static expandPatterns(patterns: string[], registry: ToolRegistry): string[] {
    const expanded = new Set<string>();

    for (const pattern of patterns) {
      try {
        const tools = ToolPatternParser.parse(pattern, registry);
        tools.forEach((t) => expanded.add(t));
      } catch (error) {
        console.warn(`Failed to parse tool pattern "${pattern}": ${error}`);
      }
    }

    return Array.from(expanded);
  }

  /**
   * Filter allowed tools by removing blocked ones
   */
  static filterBlocked(allowedTools: string[], blockedTools: string[]): string[] {
    const blockedSet = new Set(blockedTools);
    return allowedTools.filter((tool) => !blockedSet.has(tool));
  }
}
