import { beforeEach, describe, expect, it } from 'vitest';
import { Tool, type ToolMetadata, ToolRegistry } from './base';
import { ToolPatternParser } from './pattern-parser';

// Mock tools for testing
class MockTool extends Tool {
  constructor(public metadata: ToolMetadata) {
    super();
  }

  async execute(): Promise<string> {
    return 'mock';
  }
}

describe('ToolPatternParser', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();

    // Register mock file tools
    registry.register(
      new MockTool({
        name: 'file_read',
        description: 'Read file',
        category: 'files',
        risk_level: 'low',
        parameters: [],
      })
    );

    registry.register(
      new MockTool({
        name: 'file_write',
        description: 'Write file',
        category: 'files',
        risk_level: 'medium',
        parameters: [],
      })
    );

    registry.register(
      new MockTool({
        name: 'file_delete',
        description: 'Delete file',
        category: 'files',
        risk_level: 'high',
        parameters: [],
      })
    );

    // Register mock directory tools
    registry.register(
      new MockTool({
        name: 'dir_list',
        description: 'List directory',
        category: 'directories',
        risk_level: 'low',
        parameters: [],
      })
    );

    registry.register(
      new MockTool({
        name: 'dir_mkdir',
        description: 'Create directory',
        category: 'directories',
        risk_level: 'medium',
        parameters: [],
      })
    );

    // Register simple tool
    registry.register(
      new MockTool({
        name: 'calculator',
        description: 'Calculator',
        category: 'utilities',
        risk_level: 'low',
        parameters: [],
      })
    );
  });

  describe('parse', () => {
    it('parses simple tool name', () => {
      const result = ToolPatternParser.parse('calculator', registry);
      expect(result).toEqual(['calculator']);
    });

    it('expands wildcard pattern', () => {
      const result = ToolPatternParser.parse('files:*', registry);
      expect(result).toContain('file_read');
      expect(result).toContain('file_write');
      expect(result).toContain('file_delete');
      expect(result.length).toBe(3);
    });

    it('parses granular selection', () => {
      const result = ToolPatternParser.parse('files:[read,write]', registry);
      expect(result).toEqual(['file_read', 'file_write']);
    });

    it('handles whitespace in granular selection', () => {
      const result = ToolPatternParser.parse('files:[read, write, delete]', registry);
      expect(result).toEqual(['file_read', 'file_write', 'file_delete']);
    });

    it('throws error for unknown category', () => {
      expect(() => {
        ToolPatternParser.parse('unknown:*', registry);
      }).toThrow('Unknown tool category: unknown');
    });

    it('throws error for invalid pattern format', () => {
      expect(() => {
        ToolPatternParser.parse('files:invalid', registry);
      }).toThrow('Invalid tool pattern');
    });
  });

  describe('expandPatterns', () => {
    it('expands multiple patterns', () => {
      const patterns = ['calculator', 'files:[read,write]', 'directories:*'];
      const result = ToolPatternParser.expandPatterns(patterns, registry);

      expect(result).toContain('calculator');
      expect(result).toContain('file_read');
      expect(result).toContain('file_write');
      expect(result).toContain('dir_list');
      expect(result).toContain('dir_mkdir');
    });

    it('handles duplicate tools', () => {
      const patterns = ['files:[read,write]', 'files:[write,delete]'];
      const result = ToolPatternParser.expandPatterns(patterns, registry);

      // Should deduplicate
      const writeCount = result.filter((t) => t === 'file_write').length;
      expect(writeCount).toBe(1);
    });

    it('handles empty patterns array', () => {
      const result = ToolPatternParser.expandPatterns([], registry);
      expect(result).toEqual([]);
    });

    it('skips invalid patterns with warning', () => {
      const patterns = ['calculator', 'invalid:*', 'files:*'];
      const result = ToolPatternParser.expandPatterns(patterns, registry);

      // Should include valid patterns
      expect(result).toContain('calculator');
      expect(result).toContain('file_read');
    });
  });

  describe('filterBlocked', () => {
    it('filters out blocked tools', () => {
      const allowed = ['file_read', 'file_write', 'file_delete', 'calculator'];
      const blocked = ['file_delete'];

      const result = ToolPatternParser.filterBlocked(allowed, blocked);

      expect(result).toContain('file_read');
      expect(result).toContain('file_write');
      expect(result).toContain('calculator');
      expect(result).not.toContain('file_delete');
    });

    it('handles empty blocked list', () => {
      const allowed = ['file_read', 'file_write'];
      const blocked: string[] = [];

      const result = ToolPatternParser.filterBlocked(allowed, blocked);
      expect(result).toEqual(allowed);
    });

    it('handles all tools blocked', () => {
      const allowed = ['file_read', 'file_write'];
      const blocked = ['file_read', 'file_write'];

      const result = ToolPatternParser.filterBlocked(allowed, blocked);
      expect(result).toEqual([]);
    });
  });
});
