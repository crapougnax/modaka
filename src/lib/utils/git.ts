import * as path from 'node:path';
import { exec } from 'node:child_process';
import { Queue } from '@quatrain/queue';

export const execGitRunner = {
   run: async (command: string, cwd: string): Promise<{ stdout: string; stderr: string }> => {
      return new Promise((resolve, reject) => {
         exec(command, { cwd }, (err, stdout, stderr) => {
            if (err) reject(err);
            else resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
         });
      });
   }
};

/**
 * Conditionally runs `git add` on a file if it is located inside an active Git repository.
 *
 * @param filePath - The absolute or relative path to the file to check and add.
 * @returns A promise that resolves when the git operations have completed.
 */
export async function gitAddIfRepo(filePath: string): Promise<void> {
   const dir = path.dirname(filePath);
   try {
      const { stdout } = await execGitRunner.run('git rev-parse --is-inside-work-tree', dir);
      if (stdout.trim() === 'true') {
         await execGitRunner.run(`git add "${path.basename(filePath)}"`, dir);
         Queue.info(`[Git] Added file to index: ${filePath}`);
      }
   } catch (e) {
      // not a git repo or git not found, ignore silently
   }
}

