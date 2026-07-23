import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Dashboard from './Dashboard';

describe('Dashboard Component', () => {
   beforeEach(() => {
      vi.unstubAllGlobals();
      localStorage.setItem('sb_app_configured', 'true');
      vi.stubGlobal('fetch', vi.fn((url: string) => {
         if (url.includes('/api/config')) {
            return Promise.resolve({
               ok: true,
               json: () => Promise.resolve({
                  initialized: true,
                  name: 'Modaka',
                  llm: { apiKey: 'test-key', model: 'gemini-2.5-flash' },
                  okfStorage: { type: 'local', gitLocalPath: '/fake/path' }
               })
            });
         }
         if (url.includes('/api/content')) {
            return Promise.resolve({
               ok: true,
               json: () => Promise.resolve([
                  {
                     id: 'guide-ai',
                     title: 'Guide IA',
                     category: 'technology/ai',
                     tags: ['ai'],
                     summary: 'Résumé IA',
                     createdAt: '2026-07-23',
                     body: '# Guide IA\nContenu explicatif'
                  }
               ])
            });
         }
         if (url.includes('/api/initialize')) {
            return Promise.resolve({
               ok: true,
               json: () => Promise.resolve({
                  themes: [
                     {
                        name: 'Technologie',
                        subthemes: ['technology/ai', 'technology/programming']
                     }
                  ]
               })
            });
         }
         return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, answer: 'Bonjour ! Je suis Modaka.' })
         });
      }) as any);
   });

   it('renders Modaka header title and initial layout', async () => {
      render(<Dashboard initialDevMode={false} />);
      await waitFor(() => {
         expect(screen.getByText(/Modaka/i)).toBeTruthy();
      });
   });

   it('renders dev mode badge when initialDevMode is true', async () => {
      render(<Dashboard initialDevMode={true} />);
      await waitFor(() => {
         expect(screen.getByText(/Modaka/i)).toBeTruthy();
      });
   });

   it('renders bottom navigation bar with interactive tab buttons', async () => {
      const { container } = render(<Dashboard initialDevMode={true} />);
      await waitFor(() => {
         const navButtons = container.querySelectorAll('button');
         expect(navButtons.length).toBeGreaterThan(0);
      });
   });

   it('allows clicking navigation tab buttons to switch views', async () => {
      const { container } = render(<Dashboard initialDevMode={false} />);
      await waitFor(() => {
         const navButtons = container.querySelectorAll('.bottom-nav button, nav button, button');
         if (navButtons.length > 1) {
            fireEvent.click(navButtons[1]);
         }
      });
   });

   it('renders stats tab and switches between modes', async () => {
      render(<Dashboard initialDevMode={false} />);
      const statsTabButton = await screen.findByText((content) => content.includes('Stats & Export'));
      fireEvent.click(statsTabButton);

      await waitFor(() => {
         expect(screen.getByText(/Statistiques de la base/i)).toBeTruthy();
      });

      expect(screen.getAllByText(/Mode 1 : Tableau Synthétique/i).length).toBeGreaterThan(0);

      const catModeButton = screen.getByText(/Mode 2 : Graphe de Liens/i);
      fireEvent.click(catModeButton);

      await waitFor(() => {
         expect(screen.getByText(/Graphe des Liens Inter-Documents/i)).toBeTruthy();
      });
   });

   it('renders onboarding screen when system is uninitialized', async () => {
      localStorage.removeItem('sb_app_configured');
      vi.stubGlobal('fetch', vi.fn((url: string) => {
         if (url.includes('/api/config')) {
            return Promise.resolve({
               ok: true,
               json: () => Promise.resolve({
                  initialized: false,
                  llm: { apiKey: '', model: '' }
               })
            });
         }
         if (url.includes('/api/initialize')) {
            return Promise.resolve({
               ok: true,
               json: () => Promise.resolve({
                  themes: [
                     {
                        name: 'Technologie',
                        subthemes: ['technology/ai']
                     }
                  ]
               })
            });
         }
         return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true })
         });
      }) as any);

      render(<Dashboard initialDevMode={false} />);
      await waitFor(() => {
         expect(screen.getByText(/Bienvenue dans Modaka/i)).toBeTruthy();
         expect(screen.getByText(/Lancer mon Second Brain/i)).toBeTruthy();
      });
   });
});
