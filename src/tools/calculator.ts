import { Tool, type ToolInput, type ToolMetadata } from './base';

export class CalculatorTool extends Tool {
  metadata: ToolMetadata = {
    name: 'calculator',
    description: 'Perform mathematical calculations',
    parameters: [
      {
        name: 'expression',
        type: 'string',
        description: 'Mathematical expression to evaluate (e.g., "2 + 2 * 3")',
        required: true,
      },
    ],
    category: 'utility',
    compliance_level: 'public',
  };

  async execute(input: ToolInput): Promise<string> {
    this.validate(input);

    const expression = input.expression as string;

    // Basic validation to prevent code injection
    if (!/^[\d\s+\-*/.()]+$/.test(expression)) {
      throw new Error(
        'Invalid expression. Only numbers and basic operators (+, -, *, /, .) are allowed'
      );
    }

    try {
      // Safe evaluation using Function constructor with restricted scope
      const result = new Function('return ' + expression)();
      return `${expression} = ${result}`;
    } catch (error) {
      throw new Error(
        `Calculation failed: ${error instanceof Error ? error.message : 'Invalid expression'}`
      );
    }
  }
}
