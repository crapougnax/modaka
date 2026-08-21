export class GithubHttpClient {
   public config: any;
   constructor(config: any) {
      this.config = config;
   }
   async fetchFileTree(): Promise<any[]> {
      return [];
   }
   async downloadBlob(sha: string): Promise<string> {
      return '';
   }
   parseFrontmatter(content: string): { metadata: any; body: string } {
      return { metadata: {}, body: content };
   }
}
