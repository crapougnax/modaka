export interface SkillField {
   name: string;
   label: string;
   type: 'text' | 'password' | 'number' | 'boolean' | 'select';
   placeholder?: string;
   description?: string;
   required?: boolean;
   default?: any;
   options?: { label: string; value: string }[];
}

export interface SkillManifest {
   id: string;
   version?: string;
   name: string;
   description: string;
   icon?: string;
   category?: 'media' | 'knowledge' | 'erp' | 'communication' | 'utility';
   fields: SkillField[];
}

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
   abstract readonly manifest: SkillManifest;

   get name(): string {
      return this.manifest.name;
   }

   get description(): string {
      return this.manifest.description;
   }

   /**
    * Optional method to test connection or credentials using given values payload.
    */
   public testConnection?(values: Record<string, any>): Promise<{ success: boolean; message?: string; error?: string }>;

   /**
    * Optional method to update runtime configuration.
    */
   public updateConfig?(values: Record<string, any>): void;

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
