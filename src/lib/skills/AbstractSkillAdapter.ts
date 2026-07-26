export interface ToolParameter {
   type: 'string' | 'number' | 'boolean' | 'array' | 'object';
   description: string;
   required?: boolean;
   items?: { type: string };
}

export interface ToolDefinition {
   name: string;
   description: string;
   parameters: Record<string, ToolParameter>;
}

/**
 * Abstract Skill Adapter contract conforming to Quatrain Core framework standard.
 */
export abstract class AbstractSkillAdapter {
   abstract readonly name: string;
   abstract readonly description: string;

   /**
    * Returns the list of executable tool definitions provided by this skill.
    */
   abstract getTools(): ToolDefinition[];

   /**
    * Executes a specific tool provided by this skill adapter.
    * 
    * @param toolName Name of the tool to execute.
    * @param params Key-value argument map passed to the tool.
    */
   abstract execute(toolName: string, params: any): Promise<any>;
}
