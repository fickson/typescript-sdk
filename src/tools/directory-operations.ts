import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Tool, type ToolInput, type ToolMetadata } from './base';

export class DirectoryListTool extends Tool {
  metadata: ToolMetadata = {
    name: 'dir_list',
    description: 'List contents of a directory',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the directory',
        required: true,
      },
    ],
    category: 'directories',
    compliance_level: 'internal',
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const dirPath = input.path as string;

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(dirPath, 'read');
    }

    try {
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      const formatted = files.map((file) => {
        const type = file.isDirectory() ? '[DIR]' : '[FILE]';
        return `${type} ${file.name}`;
      });
      return formatted.join('\n');
    } catch (error) {
      throw new Error(
        `Failed to list directory: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export class DirectoryMkdirTool extends Tool {
  metadata: ToolMetadata = {
    name: 'dir_mkdir',
    description: 'Create a new directory',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the directory to create',
        required: true,
      },
      {
        name: 'recursive',
        type: 'boolean',
        description: "Create parent directories if they don't exist",
        required: false,
      },
    ],
    category: 'directories',
    compliance_level: 'restricted',
    requires_approval: true,
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const dirPath = input.path as string;
    const recursive = input.recursive === true || input.recursive === 'true';

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(dirPath, 'write');
    }

    try {
      await fs.mkdir(dirPath, { recursive });
      return `Successfully created directory ${dirPath}`;
    } catch (error) {
      throw new Error(
        `Failed to create directory: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export class DirectoryRmdirTool extends Tool {
  metadata: ToolMetadata = {
    name: 'dir_rmdir',
    description: 'Remove an empty directory',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the directory to remove',
        required: true,
      },
    ],
    category: 'directories',
    compliance_level: 'restricted',
    requires_approval: true,
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const dirPath = input.path as string;

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(dirPath, 'delete');
    }

    try {
      await fs.rmdir(dirPath);
      return `Successfully removed directory ${dirPath}`;
    } catch (error) {
      throw new Error(
        `Failed to remove directory: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export class DirectoryRmRecursiveTool extends Tool {
  metadata: ToolMetadata = {
    name: 'dir_rm_recursive',
    description: 'Remove a directory and all its contents (DANGEROUS - use with caution)',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the directory to remove recursively',
        required: true,
      },
    ],
    category: 'directories',
    compliance_level: 'restricted',
    requires_approval: true,
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const dirPath = input.path as string;

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(dirPath, 'delete');
    }

    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      return `Successfully removed directory and contents: ${dirPath}`;
    } catch (error) {
      throw new Error(
        `Failed to remove directory recursively: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export class DirectoryExistsTool extends Tool {
  metadata: ToolMetadata = {
    name: 'dir_exists',
    description: 'Check if a directory exists',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to check',
        required: true,
      },
    ],
    category: 'directories',
    compliance_level: 'internal',
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const dirPath = input.path as string;

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(dirPath, 'read');
    }

    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory() ? 'true' : 'false';
    } catch {
      return 'false';
    }
  }
}

export class DirectoryMoveTool extends Tool {
  metadata: ToolMetadata = {
    name: 'dir_move',

    description: 'Move or rename directory',

    parameters: [],

    category: 'directories',

    compliance_level: 'public',
  };

  async execute(input: {
    source: string;
    destination: string;
  }): Promise<{ moved: boolean }> {
    await fs.rename(input.source, input.destination);
    return { moved: true };
  }
}

export class DirectoryCopyTool extends Tool {
  metadata: ToolMetadata = {
    name: 'dir_copy',

    description: 'Copy directory recursively',

    parameters: [],

    category: 'directories',

    compliance_level: 'public',
  };

  async execute(input: {
    source: string;
    destination: string;
  }): Promise<{ copied: boolean }> {
    await fs.cp(input.source, input.destination, { recursive: true });
    return { copied: true };
  }
}

export class DirectoryTreeTool extends Tool {
  metadata: ToolMetadata = {
    name: 'dir_tree',

    description: 'Get directory tree structure',

    parameters: [],

    category: 'directories',

    compliance_level: 'public',
  };

  async execute(input: { path: string; depth?: number }): Promise<any> {
    const maxDepth = input.depth ?? 3;

    async function buildTree(dirPath: string, currentDepth: number): Promise<any> {
      if (currentDepth >= maxDepth) return null;

      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const tree: any = { name: path.basename(dirPath), children: [] };

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const subtree = await buildTree(fullPath, currentDepth + 1);
          if (subtree) {
            tree.children.push(subtree);
          }
        } else {
          tree.children.push({ name: entry.name, type: 'file' });
        }
      }

      return tree;
    }

    return buildTree(input.path, 0);
  }
}
