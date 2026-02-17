import { Tool, ToolMetadata } from './base';

export class JsonStringifyTool extends Tool {
  metadata: ToolMetadata = {
    name: 'json_stringify',
    description: 'Convert object to JSON string',
    parameters: [],
    category: 'data',
    compliance_level: 'public',
  };

  async execute(input: { data: any; pretty?: boolean }): Promise<string> {
    return JSON.stringify(input.data, null, input.pretty ? 2 : 0);
  }
}

export class CsvParseTool extends Tool {
  metadata: ToolMetadata = {
    name: 'csv_parse',
    description: 'Parse CSV string to array of objects',
    parameters: [],
    category: 'data',
    compliance_level: 'public',
  };

  async execute(input: { csv: string; delimiter?: string; headers?: boolean }): Promise<any[]> {
    const delimiter = input.delimiter || ',';
    const hasHeaders = input.headers !== false;

    const lines = input.csv.trim().split('\n');
    if (lines.length === 0) return [];

    const headers = hasHeaders
      ? lines[0].split(delimiter).map((h) => h.trim())
      : Array.from({ length: lines[0].split(delimiter).length }, (_, i) => `column${i}`);

    const startIndex = hasHeaders ? 1 : 0;

    return lines.slice(startIndex).map((line) => {
      const values = line.split(delimiter).map((v) => v.trim());
      const obj: any = {};
      headers.forEach((header, i) => {
        obj[header] = values[i] || '';
      });
      return obj;
    });
  }
}

export class CsvWriteTool extends Tool {
  metadata: ToolMetadata = {
    name: 'csv_write',
    description: 'Convert array of objects to CSV string',
    parameters: [],
    category: 'data',
    compliance_level: 'public',
  };

  async execute(input: { data: any[]; delimiter?: string; headers?: boolean }): Promise<string> {
    if (!Array.isArray(input.data) || input.data.length === 0) {
      return '';
    }

    const delimiter = input.delimiter || ',';
    const includeHeaders = input.headers !== false;

    const headers = Object.keys(input.data[0]);
    const rows: string[] = [];

    if (includeHeaders) {
      rows.push(headers.join(delimiter));
    }

    for (const item of input.data) {
      const values = headers.map((header) => {
        const value = item[header]?.toString() || '';
        // Escape values containing delimiter or quotes
        return value.includes(delimiter) || value.includes('"')
          ? `"${value.replace(/"/g, '""')}"`
          : value;
      });
      rows.push(values.join(delimiter));
    }

    return rows.join('\n');
  }
}

export class YamlParseTool extends Tool {
  metadata: ToolMetadata = {
    name: 'yaml_parse',
    description: 'Parse YAML string to object',
    parameters: [],
    category: 'data',
    compliance_level: 'public',
  };

  async execute(input: { yaml: string }): Promise<any> {
    // Simple YAML parser for basic cases
    // For production, use a proper YAML library
    const lines = input.yaml.split('\n');
    const result: any = {};
    let currentKey = '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        currentKey = key.trim();

        if (value) {
          // Parse value types
          if (value === 'true') result[currentKey] = true;
          else if (value === 'false') result[currentKey] = false;
          else if (value === 'null') result[currentKey] = null;
          else if (!isNaN(Number(value))) result[currentKey] = Number(value);
          else result[currentKey] = value.replace(/^["']|["']$/g, '');
        } else {
          result[currentKey] = {};
        }
      }
    }

    return result;
  }
}

export class XmlParseTool extends Tool {
  metadata: ToolMetadata = {
    name: 'xml_parse',
    description: 'Parse XML string to object',
    parameters: [],
    category: 'data',
    compliance_level: 'public',
  };

  async execute(input: { xml: string }): Promise<any> {
    // Simple XML parser - for production use a proper XML library
    const tagRegex = /<(\w+)(?:\s+[^>]*)?>([^<]*)<\/\1>/g;
    const result: any = {};

    let match;
    while ((match = tagRegex.exec(input.xml)) !== null) {
      const [, tag, content] = match;
      result[tag] = content.trim();
    }

    return result;
  }
}
