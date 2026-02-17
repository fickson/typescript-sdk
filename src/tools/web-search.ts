import axios from 'axios';
import { Tool, type ToolInput, type ToolMetadata } from './base';

export class WebSearchTool extends Tool {
  metadata: ToolMetadata = {
    name: 'web_search',
    description: 'Search the web for information using various search engines',
    parameters: [
      {
        name: 'query',
        type: 'string',
        description: 'The search query',
        required: true,
      },
      {
        name: 'num_results',
        type: 'number',
        description: 'Number of results to return',
        required: false,
        default: 5,
      },
    ],
    category: 'web',
    compliance_level: 'public',
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const query = input.query as string;
    const numResults = (input.num_results as number) || 5;

    if (this.policyEnforcer) {
      this.policyEnforcer.enforceNetwork('api.duckduckgo.com', 'https');
    }

    // Use DuckDuckGo Instant Answer API (no auth required)
    try {
      const response = await axios.get('https://api.duckduckgo.com/', {
        params: {
          q: query,
          format: 'json',
          no_html: 1,
        },
      });

      const data = response.data;
      const results: string[] = [];

      if (data.AbstractText) {
        results.push(`Summary: ${data.AbstractText}`);
      }

      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        data.RelatedTopics.slice(0, numResults).forEach((topic: any) => {
          if (topic.Text && topic.FirstURL) {
            results.push(`- ${topic.Text}\n  URL: ${topic.FirstURL}`);
          }
        });
      }

      if (results.length === 0) {
        return `No results found for query: ${query}`;
      }

      return `Search results for "${query}":\n\n${results.join('\n\n')}`;
    } catch (error) {
      throw new Error(
        `Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
}
