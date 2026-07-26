import { Core } from '@quatrain/core';
import { AbstractSkillAdapter, type ToolDefinition } from './AbstractSkillAdapter';

/**
 * Pivot class and registry manager representing Agent skills in the Quatrain Core framework.
 */
export class Skills extends Core {
   protected static _adapters = new Map<string, AbstractSkillAdapter>();
   public static logger = this.addLogger('Skills');

   /**
    * Register a skill adapter into the registry.
    * 
    * @param alias Unique identifier for the skill (e.g. 'jellyfin', 'brevo', 'odoo').
    * @param adapter Instance of AbstractSkillAdapter.
    */
   public static addSkill(alias: string, adapter: AbstractSkillAdapter): void {
      this._adapters.set(alias, adapter);
      this.info(`[Skills] Registered skill adapter '${alias}' (${adapter.name})`);
   }

   /**
    * Retrieve a registered skill adapter by alias.
    * 
    * @param alias The skill alias.
    */
   public static getSkill(alias: string): AbstractSkillAdapter | undefined {
      return this._adapters.get(alias);
   }

   /**
    * Check if a skill adapter is registered.
    */
   public static hasSkill(alias: string): boolean {
      return this._adapters.has(alias);
   }

   /**
    * Returns all registered skill adapters.
    */
   public static getSkills(): Map<string, AbstractSkillAdapter> {
      return this._adapters;
   }

   /**
    * Returns all tool definitions across all registered skills.
    */
   public static getAllTools(): (ToolDefinition & { skillAlias: string })[] {
      const allTools: (ToolDefinition & { skillAlias: string })[] = [];
      for (const [alias, adapter] of this._adapters.entries()) {
         const tools = adapter.getTools();
         for (const tool of tools) {
            allTools.push({
               ...tool,
               skillAlias: alias
            });
         }
      }
      return allTools;
   }

   /**
    * Dispatches tool execution to the matching registered skill.
    * 
    * @param toolName The name of the tool to execute.
    * @param params Parameter payload.
    */
   public static async execute(toolName: string, params: any): Promise<any> {
      for (const [alias, adapter] of this._adapters.entries()) {
         const tools = adapter.getTools();
         if (tools.some(t => t.name === toolName)) {
            this.info(`[Skills] Executing tool '${toolName}' via skill '${alias}'`);
            return await adapter.execute(toolName, params);
         }
      }
      throw new Error(`Tool '${toolName}' not found in any registered skill.`);
   }
}
