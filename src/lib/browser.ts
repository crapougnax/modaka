import { launch } from 'puppeteer-core';
import { Log } from '@quatrain/log';
import * as fs from 'node:fs/promises';
import { Config } from '@quatrain/config';

export async function fetchHtmlWithJs(url: string): Promise<string> {
   // 1. Fast HTTP fetch check for HTML pages
   try {
      Log.info(`[Browser Scraper] Trying fast HTTP fetch for: ${url}`);
      const res = await fetch(url, {
         headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
         },
         signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
         const contentType = res.headers.get('content-type') || '';
         if (contentType.includes('text/html')) {
            const html = await res.text();
            if (html.length > 200 && html.includes('<body')) {
               Log.info(`[Browser Scraper] Fast fetch successful for ${url} (${html.length} bytes)`);
               return html;
            }
         } else {
            Log.warn(`[Browser Scraper] Fast fetch returned non-HTML type: ${contentType}`);
         }
      } else {
         Log.warn(`[Browser Scraper] Fast fetch returned status: ${res.status}`);
      }
   } catch (e: any) {
      Log.warn(`[Browser Scraper] Fast fetch failed: ${e.message}. Falling back to Puppeteer.`);
   }

   let executablePath = Config.get<string>('chrome.path');

   if (!executablePath) {
      if (process.platform === 'darwin') {
         executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      } else {
         executablePath = '/usr/bin/chromium-browser';
      }
   }

   // Verify executable existence to throw a helpful error
   try {
      await fs.access(executablePath);
   } catch {
      throw new Error(
         `L'exécutable Chrome/Chromium est introuvable au chemin : "${executablePath}". ` +
         `Veuillez configurer la variable CHROME_PATH dans votre fichier .env.`
      );
   }

   Log.info(`[Browser Scraper] Launching Chrome at: ${executablePath} to crawl: ${url}`);

   const browser = await launch({
      executablePath,
      headless: true,
      args: [
         '--no-sandbox',
         '--disable-setuid-sandbox',
         '--disable-gpu',
         '--disable-dev-shm-usage',
         '--blink-settings=imagesEnabled=false'
      ]
   });

   try {
      const page = await browser.newPage();
      
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent(
         'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      Log.info(`[Browser Scraper] Navigating to ${url}...`);
      await page.goto(url, {
         waitUntil: 'domcontentloaded',
         timeout: 15000
      });

      const html = await page.content();
      Log.info(`[Browser Scraper] Successfully extracted ${html.length} bytes of rendered HTML`);
      return html;
   } catch (err: any) {
      Log.error(`[Browser Scraper] Error crawling ${url}: ${err.message}`);
      throw err;
   } finally {
      await browser.close();
   }
}
