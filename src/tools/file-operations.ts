import * as fs from 'node:fs/promises';
import { Tool, type ToolInput, type ToolMetadata } from './base';

export class FileReadTool extends Tool {
  metadata: ToolMetadata = {
    name: 'file_read',
    description: 'Read contents of a file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file to read',
        required: true,
      },
    ],
    category: 'filesystem',
    compliance_level: 'restricted',
    requires_approval: true,
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const filePath = input.path as string;

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(filePath, 'read');
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      throw new Error(
        `Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export class FileWriteTool extends Tool {
  metadata: ToolMetadata = {
    name: 'file_write',
    description: 'Write content to a file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file to write',
        required: true,
      },
      {
        name: 'content',
        type: 'string',
        description: 'Content to write to the file',
        required: true,
      },
    ],
    category: 'filesystem',
    compliance_level: 'restricted',
    requires_approval: true,
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const filePath = input.path as string;
    const content = input.content as string;

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(filePath, 'write');
    }

    try {
      await fs.writeFile(filePath, content, 'utf-8');
      return `Successfully wrote to ${filePath}`;
    } catch (error) {
      throw new Error(
        `Failed to write file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export class FileListTool extends Tool {
  metadata: ToolMetadata = {
    name: 'file_list',
    description: 'List files in a directory',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the directory',
        required: true,
      },
    ],
    category: 'filesystem',
    compliance_level: 'internal',
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const dirPath = input.path as string;

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(dirPath, 'read');
    }

    try {
      const files = await fs.readdir(dirPath);
      return files.join('\n');
    } catch (error) {
      throw new Error(
        `Failed to list directory: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export class FileAppendTool extends Tool {
  metadata: ToolMetadata = {
    name: 'file_append',
    description: 'Append content to the end of a file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file',
        required: true,
      },
      {
        name: 'content',
        type: 'string',
        description: 'Content to append',
        required: true,
      },
    ],
    category: 'files',
    compliance_level: 'restricted',
    requires_approval: true,
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const filePath = input.path as string;
    const content = input.content as string;

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(filePath, 'write');
    }

    try {
      await fs.appendFile(filePath, content, 'utf-8');
      return `Successfully appended to ${filePath}`;
    } catch (error) {
      throw new Error(
        `Failed to append to file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export class FileDeleteTool extends Tool {
  metadata: ToolMetadata = {
    name: 'file_delete',
    description: 'Delete a file',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file to delete',
        required: true,
      },
    ],
    category: 'files',
    compliance_level: 'restricted',
    requires_approval: true,
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const filePath = input.path as string;

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(filePath, 'delete');
    }

    try {
      await fs.unlink(filePath);
      return `Successfully deleted ${filePath}`;
    } catch (error) {
      throw new Error(
        `Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export class FileMoveTool extends Tool {
  metadata: ToolMetadata = {
    name: 'file_move',
    description: 'Move or rename a file',
    parameters: [
      {
        name: 'from',
        type: 'string',
        description: 'Source file path',
        required: true,
      },
      {
        name: 'to',
        type: 'string',
        description: 'Destination file path',
        required: true,
      },
    ],
    category: 'files',
    compliance_level: 'restricted',
    requires_approval: true,
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const fromPath = input.from as string;
    const toPath = input.to as string;

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(fromPath, 'read');
      this.policyEnforcer.enforceFilesystem(toPath, 'write');
    }

    try {
      await fs.rename(fromPath, toPath);
      return `Successfully moved ${fromPath} to ${toPath}`;
    } catch (error) {
      throw new Error(
        `Failed to move file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export class FileCopyTool extends Tool {
  metadata: ToolMetadata = {
    name: 'file_copy',
    description: 'Copy a file to another location',
    parameters: [
      {
        name: 'from',
        type: 'string',
        description: 'Source file path',
        required: true,
      },
      {
        name: 'to',
        type: 'string',
        description: 'Destination file path',
        required: true,
      },
    ],
    category: 'files',
    compliance_level: 'restricted',
    requires_approval: true,
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const fromPath = input.from as string;
    const toPath = input.to as string;

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(fromPath, 'read');
      this.policyEnforcer.enforceFilesystem(toPath, 'write');
    }

    try {
      await fs.copyFile(fromPath, toPath);
      return `Successfully copied ${fromPath} to ${toPath}`;
    } catch (error) {
      throw new Error(
        `Failed to copy file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export class FileStatTool extends Tool {
  metadata: ToolMetadata = {
    name: 'file_stat',
    description: 'Get file metadata (size, dates, type)',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file',
        required: true,
      },
    ],
    category: 'files',
    compliance_level: 'internal',
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const filePath = input.path as string;

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(filePath, 'read');
    }

    try {
      const stats = await fs.stat(filePath);
      return JSON.stringify(
        {
          size: stats.size,
          created: stats.birthtime.toISOString(),
          modified: stats.mtime.toISOString(),
          accessed: stats.atime.toISOString(),
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          permissions: stats.mode.toString(8),
        },
        null,
        2
      );
    } catch (error) {
      throw new Error(
        `Failed to get file stats: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}

export class FileExistsTool extends Tool {
  metadata: ToolMetadata = {
    name: 'file_exists',
    description: 'Check if a file exists',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to check',
        required: true,
      },
    ],
    category: 'files',
    compliance_level: 'internal',
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const filePath = input.path as string;

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(filePath, 'read');
    }

    try {
      await fs.access(filePath);
      return 'true';
    } catch {
      return 'false';
    }
  }
}

export class FileChmodTool extends Tool {
  metadata: ToolMetadata = {
    name: 'file_chmod',
    description: 'Change file permissions',
    parameters: [
      {
        name: 'path',
        type: 'string',
        description: 'Path to the file',
        required: true,
      },
      {
        name: 'mode',
        type: 'string',
        description: 'Permission mode (octal string like "755" or number)',
        required: true,
      },
    ],
    category: 'filesystem',
    compliance_level: 'restricted',
    requires_approval: true,
  };

  async execute(input: { path: string; mode: string | number }): Promise<{ changed: boolean }> {
    if (this.policyEnforcer) {
      this.policyEnforcer.enforceFilesystem(input.path, 'write');
    }

    const mode = typeof input.mode === 'string' ? parseInt(input.mode, 8) : input.mode;
    await fs.chmod(input.path, mode);
    return { changed: true };
  }
}
