export interface SkillRegistration {
   alias: string;
   manifest: any;
   factory: (config?: any) => Promise<AbstractSkillAdapter> | AbstractSkillAdapter;
   instance?: AbstractSkillAdapter;
}

/**
 * Pivot class and registry manager representing Agent skills in the Quatrain Core framework.
 */
export class Skills extends Core {
   protected static _registeredPackages = new Map<string, SkillRegistration>();
   protected static _adapters = new Map<string, AbstractSkillAdapter>();
   public static logger = this.addLogger('Skills');

   /**
    * Register a skill package into the available skill catalog without instantiating its adapter.
    * 
    * @param alias Unique identifier for the skill (e.g. 'jellyfin', 'brevo', 'odoo').
    * @param manifest Skill JSON manifest object.
    * @param factory Factory function that dynamically imports and returns an AbstractSkillAdapter instance.
    * @param baseMeta Optional base metadata from package.json or pyproject.toml referenced by manifest.extends.
    */
   public static registerPackage(
      alias: string,
      manifest: any,
      factory: (config?: any) => Promise<AbstractSkillAdapter> | AbstractSkillAdapter,
      baseMeta?: { name?: string; version?: string; description?: string }
   ): void {
      const resolvedManifest = {
         id: manifest.id || baseMeta?.name || alias,
         name: manifest.name || baseMeta?.name || alias,
         version: manifest.version || baseMeta?.version || '1.0.0',
         description: manifest.description || baseMeta?.description || '',
         icon: manifest.icon || '⚡',
         category: manifest.category || 'utility',
         extends: manifest.extends,
         fields: manifest.fields || []
      };

      this._registeredPackages.set(alias, { alias, manifest: resolvedManifest, factory });
      this.info(`[Skills] Registered available skill package '${alias}' (${resolvedManifest.name})`);
   }

   /**
    * Register an active skill adapter instance into the active execution registry.
    * 
    * @param alias Unique identifier for the skill.
    * @param adapter Instance of AbstractSkillAdapter.
    */
   public static addSkill(alias: string, adapter: AbstractSkillAdapter): void {
      this._adapters.set(alias, adapter);
      if (this._registeredPackages.has(alias)) {
         this._registeredPackages.get(alias)!.instance = adapter;
      }
      this.info(`[Skills] Activated skill adapter '${alias}' (${adapter.name})`);
   }

   /**
    * Dynamically activate and instantiate a skill package by alias.
    * 
    * @param alias The skill package alias.
    * @param config Optional configuration parameters.
    */
   public static async activateSkill(alias: string, config?: any): Promise<AbstractSkillAdapter> {
      const reg = this._registeredPackages.get(alias);
      if (!reg) {
         throw new Error(`Skill package '${alias}' is not registered in the catalog.`);
      }

      const instance = await reg.factory(config);
      this.addSkill(alias, instance);
      return instance;
   }

   /**
    * Retrieve an active skill adapter by alias.
    */
   public static getSkill(alias: string): AbstractSkillAdapter | undefined {
      return this._adapters.get(alias);
   }

   /**
    * Check if a skill adapter is active.
    */
   public static hasSkill(alias: string): boolean {
      return this._adapters.has(alias);
   }

   /**
    * Returns all active skill adapters.
    */
   public static getSkills(): Map<string, AbstractSkillAdapter> {
      return this._adapters;
   }

   /**
    * Returns all registered skill package catalogs (manifests + active instances).
    */
   public static getCatalog(): SkillRegistration[] {
      return Array.from(this._registeredPackages.values());
   }

   /**
    * Returns all tool definitions across active skills.
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
    * Dispatches tool execution to the matching registered active skill.
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
