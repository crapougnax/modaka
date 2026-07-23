import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gitAddIfRepo, execGitRunner } from './git';

describe('gitAddIfRepo', () => {
   beforeEach(() => {
      vi.restoreAllMocks();
   });

   it('should run git add if inside git repository', async () => {
      const spy = vi.spyOn(execGitRunner, 'run').mockImplementation(async (cmd: string) => {
         if (cmd.includes('rev-parse')) {
            return { stdout: 'true\n', stderr: '' };
         }
         return { stdout: '', stderr: '' };
      });

      await gitAddIfRepo('/fake/path/file.txt');
      expect(spy).toHaveBeenCalledWith('git rev-parse --is-inside-work-tree', '/fake/path');
      expect(spy).toHaveBeenCalledWith('git add "file.txt"', '/fake/path');
   });

   it('should skip git add if not inside git repository', async () => {
      const spy = vi.spyOn(execGitRunner, 'run').mockImplementation(async (cmd: string) => {
         if (cmd.includes('rev-parse')) {
            return { stdout: 'false\n', stderr: '' };
         }
         return { stdout: '', stderr: '' };
      });

      await gitAddIfRepo('/fake/path/file.txt');
      expect(spy).toHaveBeenCalledWith('git rev-parse --is-inside-work-tree', '/fake/path');
      expect(spy).not.toHaveBeenCalledWith('git add "file.txt"', '/fake/path');
   });
});

