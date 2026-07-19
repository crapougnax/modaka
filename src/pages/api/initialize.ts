import type { APIRoute } from 'astro';
import { initBackend } from '../../lib/backend';
import * as fs from 'node:fs/promises';
import { parse } from 'yaml';
import { ContentItem } from '../../lib/models/ContentItem';
import { Storage } from '@quatrain/storage';
import { Backend } from '@quatrain/backend';
import { Readable } from 'node:stream';
import * as crypto from 'node:crypto';
import * as path from 'node:path';

export const prerender = false;

// Predefined welcome note content for onboarding categories
const WELCOME_CONTENTS: Record<string, { title: string; summary: string; markdown: string; tags: string[] }> = {
   'literature/sci-fi': {
      title: 'Guide d\'accueil : Littérature & Science-Fiction',
      summary: 'Espace dédié à vos lectures, analyses littéraires et oeuvres de science-fiction imaginaires.',
      tags: ['littérature', 'science-fiction', 'onboarding', 'bienvenue'],
      markdown: `# Bienvenue dans votre bibliothèque Littérature & Science-Fiction 📚\n\nCet espace est destiné à recueillir vos notes de lecture, vos critiques d'œuvres, vos fiches d'auteurs et vos réflexions sur la science-fiction et l'imaginaire.\n\n## Suggestions d'utilisation\n- Documentez les thèmes de romans cultes (ex: *Mockingbird* de Walter Tevis).\n- Organisez vos analyses de genres (Cyberpunk, Space Opera, Uchronies).\n- Notez vos citations préférées et idées de récits.\n`
   },
   'technology/ai': {
      title: 'Guide d\'accueil : Intelligence Artificielle',
      summary: 'Espace de veille et d\'apprentissage dédié à l\'IA, aux LLMs et aux agents autonomes.',
      tags: ['intelligence-artificielle', 'technologie', 'onboarding', 'veille'],
      markdown: `# Bienvenue dans votre hub d'Intelligence Artificielle 🤖\n\nC'est ici que vous pouvez regrouper vos lectures techniques, vos tutoriels de programmation, vos notes sur les LLMs (comme Gemini) et l'architecture des systèmes multi-agents.\n\n## Suggestions d'utilisation\n- Archivez des articles de recherche sur l'apprentissage profond (Deep Learning).\n- Notez les invites (prompts) et patrons de conception (design patterns) d'agents IA.\n- Documentez vos expériences avec les SDKs agentiques (comme Antigravity).\n`
   },
   'health/biohacking': {
      title: 'Guide d\'accueil : Biohacking & Longévité',
      summary: 'Espace de suivi pour vos optimisations de santé, sommeil et longévité active.',
      tags: ['santé', 'biohacking', 'longévité', 'onboarding'],
      markdown: `# Bienvenue dans votre carnet Biohacking & Santé 💡\n\nUtilisez cet espace pour suivre vos routines de sommeil, vos notes sur l'alimentation, la supplémentation, les protocoles de longévité active et le biohacking.\n\n## Suggestions d'utilisation\n- Résumez des études cliniques sur l'optimisation métabolique.\n- Notez vos protocoles de jeûne, d'exposition au froid ou de musculation.\n- Suivez l'impact de vos habitudes quotidiennes sur votre concentration.\n`
   },
   'finance/investment': {
      title: 'Guide d\'accueil : Finance & Investissement',
      summary: 'Suivi de vos analyses de marchés, principes d\'investissement et gestion de patrimoine.',
      tags: ['finance', 'investissement', 'onboarding', 'patrimoine'],
      markdown: `# Bienvenue dans votre espace Finance & Investissement 📈\n\nUn carnet pour vos stratégies de gestion de portefeuille, vos analyses fondamentales de projets ou d'entreprises, et vos fiches de lecture sur l'économie.\n\n## Suggestions d'utilisation\n- Documentez vos règles personnelles d'allocation d'actifs.\n- Rédigez vos thèses d'investissement sur des actions ou actifs spécifiques.\n- Centralisez vos notes de podcasts financiers et d'analyses macroéconomiques.\n`
   },
   'culinary/recipes': {
      title: 'Guide d\'accueil : Cuisine & Gastronomie',
      summary: 'Votre livre de recettes personnel et vos explorations culinaires.',
      tags: ['cuisine', 'gastronomie', 'recettes', 'onboarding'],
      markdown: `# Bienvenue dans votre grimoire de Recettes 🍳\n\nConservez ici vos recettes de cuisine favorites, vos techniques culinaires et vos expérimentations gastronomiques.\n\n## Suggestions d'utilisation\n- Notez les recettes testées et approuvées avec vos ajustements personnels.\n- Regroupez des fiches sur l'association des saveurs et le choix des ingrédients.\n- Listez les adresses et plats mémorables découverts lors de vos sorties.\n`
   },
   'travel/exploration': {
      title: 'Guide d\'accueil : Voyages & Exploration',
      summary: 'Carnet de voyage pour planifier vos destinations et conserver vos souvenirs d\'aventure.',
      tags: ['voyage', 'exploration', 'onboarding', 'découvertes'],
      markdown: `# Bienvenue dans votre carnet de Voyage ✈️\n\nPlanifiez vos prochaines destinations et rassemblez vos souvenirs, itinéraires et listes de recommandations locales.\n\n## Suggestions d'utilisation\n- Rédigez vos guides de voyage pratiques (lieux à visiter, transports, hébergements).\n- Conservez les récits de vos aventures et randonnées.\n- Listez vos recommandations de restaurants et activités pour vos futurs séjours.\n`
   }
};

export const POST: APIRoute = async ({ request }) => {
   await initBackend();

   try {
      const { categories } = await request.json();
      if (!categories || !Array.isArray(categories) || categories.length === 0) {
         return new Response(JSON.stringify({ error: 'No categories provided' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
         });
      }

      const docStorage = Storage.getStorage('document-storage');
      const createdItems = [];

      for (const cat of categories) {
         const content = WELCOME_CONTENTS[cat] || {
            title: `Espace d'accueil : ${cat.split('/').pop()}`,
            summary: `Cet espace a été créé pour votre thématique ${cat}.`,
            tags: ['onboarding', 'welcome'],
            markdown: `# Bienvenue dans ${cat} 📁\n\nVous pouvez maintenant ajouter vos documents et notes de contexte dans cette catégorie.`
         };

         const slugify = (text: string) => {
            return text
               .toString()
               .normalize('NFD')
               .replace(/[\u0300-\u036f]/g, '')
               .toLowerCase()
               .trim()
               .replace(/\s+/g, '-')
               .replace(/[^\w\-]+/g, '')
               .replace(/\-\-+/g, '-');
         };

         const semanticId = slugify(content.title) || crypto.randomUUID();
         const mdRef = `markdowns/${semanticId}.md`;

         const getDocFile = (ref: string) => ({
            bucket: process.env.S3_BUCKET || 'documents',
            ref,
            name: path.basename(ref),
            mime: 'text/markdown'
         });

         // Save welcome markdown document
         await docStorage.create(getDocFile(mdRef) as any, Readable.from([content.markdown]));

         const contentItem = await ContentItem.factory({
            id: semanticId,
            title: content.title,
            type: 'guide',
            category: cat,
            tags: content.tags,
            summary: content.summary,
            originalFileUri: 'welcome://onboarding',
            markdownFileUri: mdRef,
            contextNote: 'Initialisé automatiquement lors de l\'onboarding utilisateur.',
            body: content.markdown,
            createdAt: new Date().toISOString()
         });

         await contentItem.save();
         createdItems.push(contentItem.toJSON());
      }

      return new Response(JSON.stringify({
         success: true,
         items: createdItems
      }), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
      });

   } catch (err: any) {
      Backend.error('[Initialize API] Failed to initialize: ' + err.message, err);
      return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};

export const GET: APIRoute = async () => {
   try {
      const configPath = path.resolve(process.cwd(), 'src/config/onboarding.yaml');
      const yamlContent = await fs.readFile(configPath, 'utf-8');
      const data = parse(yamlContent);
      return new Response(JSON.stringify(data), {
         status: 200,
         headers: { 'Content-Type': 'application/json' }
      });
   } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
         status: 500,
         headers: { 'Content-Type': 'application/json' }
      });
   }
};
