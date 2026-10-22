import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

interface FeedItem {
  title: string;
  link: string;
  date?: string;
  description?: string;
  image?: string;
}

interface FeedResult {
  fetchedAt: string;
  feed: {
    title: string;
    description: string;
    link: string;
    items: FeedItem[];
  };
  xml: string;
}

// In-memory cache for scraped feeds
interface CacheEntry {
  timestamp: number;
  data: FeedResult;
}
const cache = new Map<string, CacheEntry>();

function normalizeUrl(inputUrl: string): string {
  let url = inputUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cleanCdata(text: string): string {
  return text.replace(/\]\]>/g, ']]&gt;');
}

function generateRssXml(feed: { title: string; description: string; link: string; items: FeedItem[] }, intervalMinutes: number, selfRssUrl: string): string {
  const buildDate = new Date().toUTCString();
  const ttl = Math.max(15, intervalMinutes);

  const itemsXml = feed.items.map((item) => {
    let pubDateTag = '';
    if (item.date) {
      const parsedDate = new Date(item.date);
      if (!isNaN(parsedDate.getTime())) {
        pubDateTag = `      <pubDate>${parsedDate.toUTCString()}</pubDate>\n`;
      } else {
        pubDateTag = `      <pubDate>${escapeXml(item.date)}</pubDate>\n`;
      }
    }

    let enclosureTag = '';
    if (item.image) {
      enclosureTag = `      <enclosure url="${escapeXml(item.image)}" type="image/jpeg" length="0" />\n`;
    }

    return `    <item>
      <title><![CDATA[${cleanCdata(item.title)}]]></title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
${pubDateTag}      <description><![CDATA[${cleanCdata(item.description || item.title)}]]></description>
${enclosureTag}    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${cleanCdata(feed.title)}]]></title>
    <link>${escapeXml(feed.link)}</link>
    <description><![CDATA[${cleanCdata(feed.description)}]]></description>
    <lastBuildDate>${buildDate}</lastBuildDate>
    <ttl>${ttl}</ttl>
    <generator>puulp.it RSS Engine (Edizione 2.0)</generator>
    <atom:link href="${escapeXml(selfRssUrl)}" rel="self" type="application/rss+xml" />
${itemsXml}
  </channel>
</rss>`;
}

async function fetchPageWithFallbacks(targetUrl: string): Promise<{ text: string; contentType: string }> {
  let urlObj: URL;
  try {
    urlObj = new URL(targetUrl);
  } catch {
    throw new Error('URL non valido.');
  }

  // Attempt 1: Modern Desktop Browser (Chrome 131)
  const desktopHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
  };

  let primaryError: Error | null = null;
  try {
    const response = await fetch(targetUrl, {
      headers: desktopHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(18000),
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      return { text, contentType };
    }

    if (response.status === 403 || response.status === 401 || response.status === 429) {
      primaryError = new Error(`HTTP ${response.status} Forbidden`);
    } else {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
  } catch (err: unknown) {
    primaryError = err instanceof Error ? err : new Error(String(err));
  }

  // Attempt 2: Mobile Safari User-Agent (bypasses some desktop-only WAFs)
  try {
    const mobileHeaders = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
    };
    const response = await fetch(targetUrl, {
      headers: mobileHeaders,
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });

    if (response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();
      return { text, contentType };
    }
  } catch {
    // continue to RSS discovery
  }

  // Attempt 3: Automatic RSS/Atom discovery for sites protected by Cloudflare/WAF
  // Most publishers block direct HTML scraping but allow public RSS/Atom feeds!
  const cleanTarget = targetUrl.replace(/\/$/, '');
  const candidateRssUrls = [
    `${cleanTarget}/feed`,
    `${cleanTarget}/rss`,
    `${cleanTarget}/rss.xml`,
    `${cleanTarget}/feed.xml`,
    `${cleanTarget}/atom.xml`,
    `${cleanTarget}/index.xml`,
    `${urlObj.origin}/feed`,
    `${urlObj.origin}/rss.xml`,
    `${urlObj.origin}/rss`,
  ];

  for (const candidate of candidateRssUrls) {
    if (candidate === targetUrl) continue;
    try {
      const res = await fetch(candidate, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'application/rss+xml,application/xml,text/xml,application/atom+xml,*/*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(6000),
      });

      if (res.ok) {
        const text = await res.text();
        if (text.includes('<rss') || text.includes('<channel') || text.includes('<feed') || text.includes('<entry')) {
          return { text, contentType: 'application/rss+xml' };
        }
      }
    } catch {
      // Continue next candidate
    }
  }

  // If all attempts failed, throw a descriptive, actionable error
  if (primaryError && primaryError.message.includes('403')) {
    throw new Error(
      `Impossibile raggiungere la pagina (HTTP 403 Forbidden). Il server di destinazione o Cloudflare blocca l'accesso automatico. Prova a inserire direttamente il feed RSS (es. ${cleanTarget}/feed o ${cleanTarget}/rss.xml).`
    );
  }

  throw new Error(
    primaryError ? `Impossibile raggiungere la pagina: ${primaryError.message}` : 'Impossibile raggiungere la pagina.'
  );
}

async function scrapePage(targetUrl: string, intervalMinutes: number, hostUrl: string): Promise<FeedResult> {
  const normalizedUrl = normalizeUrl(targetUrl);
  const cacheKey = normalizedUrl;
  const cached = cache.get(cacheKey);
  const now = Date.now();

  const cacheTtlMs = intervalMinutes * 60 * 1000;
  if (cached && (now - cached.timestamp < cacheTtlMs)) {
    return cached.data;
  }

  // Fetch page content with anti-blocking fallbacks
  const { text, contentType } = await fetchPageWithFallbacks(normalizedUrl);

  let feedTitle = '';
  let feedDescription = '';
  const items: FeedItem[] = [];

  // Check if content is already RSS or Atom XML
  if (contentType.includes('xml') || text.trim().startsWith('<?xml') || text.includes('<rss') || text.includes('<feed')) {
    const $ = cheerio.load(text, { xmlMode: true });

    // Handle RSS 2.0
    if ($('rss').length > 0 || $('channel').length > 0) {
      feedTitle = $('channel > title').first().text().trim() || $('title').first().text().trim();
      feedDescription = $('channel > description').first().text().trim() || '';
      
      $('item').each((_, el) => {
        const item$ = $(el);
        const title = item$.find('title').first().text().trim();
        const link = item$.find('link').first().text().trim();
        const desc = item$.find('description').first().text().trim();
        const pubDate = item$.find('pubDate').first().text().trim();
        const enclosure = item$.find('enclosure[type^="image"]').attr('url') || item$.find('media\\:content[medium="image"]').attr('url');

        if (title && link) {
          items.push({
            title,
            link,
            date: pubDate,
            description: desc.replace(/<[^>]+>/g, '').trim().slice(0, 300),
            image: enclosure,
          });
        }
      });
    } else if ($('feed').length > 0) {
      // Handle Atom
      feedTitle = $('feed > title').first().text().trim();
      feedDescription = $('feed > subtitle').first().text().trim() || '';

      $('entry').each((_, el) => {
        const item$ = $(el);
        const title = item$.find('title').first().text().trim();
        const link = item$.find('link[rel="alternate"]').attr('href') || item$.find('link').attr('href') || '';
        const desc = item$.find('summary').first().text().trim() || item$.find('content').first().text().trim();
        const updated = item$.find('updated').first().text().trim() || item$.find('published').first().text().trim();

        if (title && link) {
          items.push({
            title,
            link: new URL(link, normalizedUrl).href,
            date: updated,
            description: desc.replace(/<[^>]+>/g, '').trim().slice(0, 300),
          });
        }
      });
    }
  }

  // If not standard XML or no items parsed, parse HTML
  if (items.length === 0) {
    const $ = cheerio.load(text);

    // Site Title
    feedTitle =
      $('meta[property="og:site_name"]').attr('content')?.trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      $('title').first().text().trim() ||
      new URL(normalizedUrl).hostname;

    // Site Description
    feedDescription =
      $('meta[property="og:description"]').attr('content')?.trim() ||
      $('meta[name="description"]').attr('content')?.trim() ||
      `Feed generato da ${feedTitle} tramite puulp.it`;

    const seenLinks = new Set<string>();

    // Strategy 1: JSON-LD Structured Data
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const raw = $(el).html();
        if (!raw) return;
        const data = JSON.parse(raw);
        const candidates = Array.isArray(data) ? data : (data['@graph'] || [data]);
        for (const item of candidates) {
          const type = String(item['@type'] || '');
          if (/article|blogposting|newsarticle|itempage/i.test(type)) {
            const title = item.headline || item.name;
            const url = item.url || item.mainEntityOfPage;
            if (title && url) {
              const fullUrl = new URL(url, normalizedUrl).href;
              if (!seenLinks.has(fullUrl)) {
                seenLinks.add(fullUrl);
                items.push({
                  title: String(title).trim(),
                  link: fullUrl,
                  date: item.datePublished ? new Date(item.datePublished).toLocaleDateString('it-IT') : undefined,
                  description: item.description ? String(item.description).slice(0, 250) : undefined,
                  image: item.image?.url || (typeof item.image === 'string' ? item.image : undefined),
                });
              }
            }
          }
        }
      } catch {
        // Ignore JSON parsing errors
      }
    });

    // Strategy 2: Semantic <article> elements
    if (items.length < 3) {
      $('article').each((_, el) => {
        const article$ = $(el);
        const heading = article$.find('h1, h2, h3, h4, .entry-title, .post-title, [class*="title"]').first();
        const anchor = heading.find('a').first().length > 0 ? heading.find('a').first() : article$.find('a').first();
        const href = anchor.attr('href') || article$.find('a').attr('href');

        if (href) {
          try {
            const fullUrl = new URL(href, normalizedUrl).href;
            if (!seenLinks.has(fullUrl) && !fullUrl.includes('#')) {
              let title = '';
              if (heading.length > 0) {
                const headingClone = heading.clone();
                headingClone.find('time, small, .date, [class*="date"]').remove();
                title = headingClone.text().trim();
              }
              if (!title && anchor.length > 0) {
                const anchorClone = anchor.clone();
                anchorClone.find('time, small, p, .date, [class*="date"]').remove();
                title = anchorClone.text().trim();
              }
              if (!title) {
                title = (heading.text() || anchor.text()).trim();
              }

              if (title && title.length > 3) {
                seenLinks.add(fullUrl);
                const dateEl = article$.find('time, small, .date, [class*="date"], [class*="time"]').first();
                const dateText = dateEl.attr('datetime') || dateEl.text().trim();
                const descText = article$.find('p, .excerpt, [class*="summary"], [class*="desc"]').first().text().trim();
                const imgUrl = article$.find('img').first().attr('src') || article$.find('img').first().attr('data-src');

                items.push({
                  title,
                  link: fullUrl,
                  date: dateText ? (isNaN(new Date(dateText).getTime()) ? dateText : new Date(dateText).toLocaleDateString('it-IT')) : undefined,
                  description: descText && descText !== title ? descText.slice(0, 250) : undefined,
                  image: imgUrl ? new URL(imgUrl, normalizedUrl).href : undefined,
                });
              }
            }
          } catch {
            // invalid URL
          }
        }
      });
    }

    // Strategy 3: Common blog/news card containers
    if (items.length < 3) {
      const containerSelectors = [
        '[class*="post-item"]',
        '[class*="card"]',
        '[class*="story"]',
        '[class*="entry"]',
        '.athing',
        'li[class*="item"]',
        'div[class*="news"]',
      ];

      $(containerSelectors.join(', ')).each((_, el) => {
        const card$ = $(el);
        const heading = card$.find('h1, h2, h3, h4, .title, [class*="title"], [class*="headline"]').first();
        const anchor = heading.find('a').first().length > 0 ? heading.find('a').first() : card$.find('a').first();
        const href = anchor.attr('href') || card$.find('a').attr('href');

        if (href) {
          try {
            const fullUrl = new URL(href, normalizedUrl).href;
            if (!seenLinks.has(fullUrl) && !fullUrl.includes('#') && !fullUrl.endsWith('.css') && !fullUrl.endsWith('.js')) {
              let title = '';
              if (heading.length > 0) {
                const headingClone = heading.clone();
                headingClone.find('time, small, .date, [class*="date"]').remove();
                title = headingClone.text().trim();
              }
              if (!title && anchor.length > 0) {
                const anchorClone = anchor.clone();
                anchorClone.find('time, small, p, .date, [class*="date"]').remove();
                title = anchorClone.text().trim();
              }
              if (!title) {
                title = (heading.text() || anchor.text()).trim();
              }

              if (title && title.length > 5) {
                seenLinks.add(fullUrl);
                const dateEl = card$.find('time, small, .date, [class*="date"]').first();
                const dateText = dateEl.attr('datetime') || dateEl.text().trim();
                const descText = card$.find('p, [class*="desc"], [class*="excerpt"]').first().text().trim();
                const imgUrl = card$.find('img').first().attr('src') || card$.find('img').first().attr('data-src');

                items.push({
                  title,
                  link: fullUrl,
                  date: dateText ? (isNaN(new Date(dateText).getTime()) ? dateText : new Date(dateText).toLocaleDateString('it-IT')) : undefined,
                  description: descText && descText !== title ? descText.slice(0, 250) : undefined,
                  image: imgUrl ? new URL(imgUrl, normalizedUrl).href : undefined,
                });
              }
            }
          } catch {
            // invalid URL
          }
        }
      });
    }

    // Strategy 4: Find all headline links in headers/main
    if (items.length < 3) {
      $('h1 a, h2 a, h3 a, h4 a, main a').each((_, el) => {
        const anchor = $(el);
        const href = anchor.attr('href');

        if (href) {
          try {
            const fullUrl = new URL(href, normalizedUrl).href;
            if (!seenLinks.has(fullUrl) && !fullUrl.includes('#')) {
              // Try to separate title, date, and description from complex anchor
              const anchorClone = anchor.clone();
              const dateEl = anchorClone.find('time, small, .date, [class*="date"]');
              const dateText = dateEl.first().text().trim();
              dateEl.remove();

              const descEl = anchorClone.find('p, [class*="desc"], [class*="summary"]');
              const innerDesc = descEl.first().text().trim();
              descEl.remove();

              const title = anchorClone.text().trim();

              if (title && title.length > 10 && !title.includes('cookie') && !title.includes('privacy') && !title.includes('login') && !title.includes('accedi')) {
                seenLinks.add(fullUrl);
                const parent = anchor.closest('div, li, section');
                const parentDate = parent.find('time, small').first().text().trim();
                const parentDesc = parent.find('p').first().text().trim();
                const imgUrl = parent.find('img').first().attr('src');

                items.push({
                  title,
                  link: fullUrl,
                  date: dateText || parentDate || undefined,
                  description: (innerDesc || parentDesc || undefined)?.slice(0, 250),
                  image: imgUrl ? new URL(imgUrl, normalizedUrl).href : undefined,
                });
              }
            }
          } catch {
            // invalid URL
          }
        }
      });
    }
  }

  // Slice to max 30 items
  const finalItems = items.slice(0, 30);
  const cleanTitle = feedTitle || new URL(normalizedUrl).hostname;
  const cleanDescription = feedDescription || `Feed RSS generato da ${cleanTitle}`;

  const selfRssUrl = `${hostUrl}/api/public/rss?url=${encodeURIComponent(normalizedUrl)}&every=${intervalMinutes}`;
  const xml = generateRssXml(
    {
      title: cleanTitle,
      description: cleanDescription,
      link: normalizedUrl,
      items: finalItems,
    },
    intervalMinutes,
    selfRssUrl
  );

  const result: FeedResult = {
    fetchedAt: new Date().toISOString(),
    feed: {
      title: cleanTitle,
      description: cleanDescription,
      link: normalizedUrl,
      items: finalItems,
    },
    xml,
  };

  cache.set(cacheKey, {
    timestamp: now,
    data: result,
  });

  return result;
}

async function startServer() {
  const app = express();

  // Hostinger / Nginx Reverse Proxy Support: trust X-Forwarded-* headers for HTTPS and real client IPs
  app.enable('trust proxy');

  // Global CORS headers for RSS readers and external consumers
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  // Health check endpoints for VPS uptime monitoring (PM2, Docker, UptimeRobot, Nginx)
  app.get(['/health', '/api/health'], (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'puulp.it',
      environment: isProduction ? 'production' : 'development',
      port: PORT,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    });
  });

  // API Route: Scrape page and generate RSS
  app.post('/api/scrape', async (req: Request, res: Response) => {
    try {
      const { url, interval = 60 } = req.body;
      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'URL mancante o non valido.' });
        return;
      }

      const host = `${req.protocol}://${req.get('host')}`;
      const result = await scrapePage(url, Number(interval) || 60, host);
      res.json(result);
    } catch (err: unknown) {
      console.error('Scrape error:', err);
      const message = err instanceof Error ? err.message : 'Errore sconosciuto durante lo scraping.';
      res.status(500).json({ error: message });
    }
  });

  // Compatibility route for Lovable /_server endpoint
  app.post('/_server', async (req: Request, res: Response) => {
    try {
      const url = req.body?.data?.url || req.body?.url;
      const interval = req.body?.data?.interval || req.body?.interval || 60;
      if (!url) {
        res.status(400).json({ error: 'URL mancante.' });
        return;
      }
      const host = `${req.protocol}://${req.get('host')}`;
      const result = await scrapePage(url, Number(interval), host);
      res.json(result);
    } catch (err: unknown) {
      console.error('Server endpoint error:', err);
      const message = err instanceof Error ? err.message : 'Errore durante la generazione RSS.';
      res.status(500).json({ error: message });
    }
  });

  // Public RSS XML endpoint (for RSS readers to subscribe!)
  app.get('/api/public/rss', async (req: Request, res: Response) => {
    try {
      const targetUrl = req.query.url as string;
      const interval = Number(req.query.every) || 60;

      if (!targetUrl) {
        res.status(400).send('Parametro "url" mancante.');
        return;
      }

      const host = `${req.protocol}://${req.get('host')}`;
      const result = await scrapePage(targetUrl, interval, host);

      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
      res.setHeader('Cache-Control', `public, max-age=${interval * 60}`);
      res.send(result.xml);
    } catch (err: unknown) {
      console.error('Public RSS error:', err);
      const message = err instanceof Error ? err.message : 'Errore nel recupero del feed RSS.';
      res.status(500).setHeader('Content-Type', 'text/plain; charset=utf-8').send(message);
    }
  });

  // Aggregated Page RSS endpoint (subscribing to an entire Page)
  app.get('/api/public/page-rss', async (req: Request, res: Response) => {
    try {
      const title = (req.query.title as string) || 'puulp.it - Pagina Tematica';
      const description = (req.query.description as string) || 'Feed RSS aggregato della pagina';
      const urlsParam = req.query.urls as string;

      if (!urlsParam) {
        res.status(400).send('Parametro "urls" mancante.');
        return;
      }

      const urls = urlsParam.split(',').map((u) => u.trim()).filter(Boolean);
      const host = `${req.protocol}://${req.get('host')}`;

      // Fetch all feeds in parallel (up to 8)
      const feedResults = await Promise.allSettled(
        urls.slice(0, 8).map((u) => scrapePage(u, 60, host))
      );

      const combinedItems: FeedItem[] = [];
      const seen = new Set<string>();

      for (const res of feedResults) {
        if (res.status === 'fulfilled') {
          for (const item of res.value.feed.items) {
            if (!seen.has(item.link)) {
              seen.add(item.link);
              combinedItems.push(item);
            }
          }
        }
      }

      // Sort items by date if available
      combinedItems.sort((a, b) => {
        if (!a.date || !b.date) return 0;
        const timeA = new Date(a.date).getTime();
        const timeB = new Date(b.date).getTime();
        if (isNaN(timeA) || isNaN(timeB)) return 0;
        return timeB - timeA;
      });

      const pageFeedXml = generateRssXml(
        {
          title,
          description,
          link: `${host}/?page=${encodeURIComponent(req.query.slug as string || 'custom')}`,
          items: combinedItems.slice(0, 40),
        },
        60,
        `${host}${req.originalUrl}`
      );

      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=1800');
      res.send(pageFeedXml);
    } catch (err: unknown) {
      console.error('Page RSS error:', err);
      const message = err instanceof Error ? err.message : 'Errore nella generazione del feed della pagina.';
      res.status(500).setHeader('Content-Type', 'text/plain; charset=utf-8').send(message);
    }
  });

  // Resilient path detection for Hostinger VPS deployments (works from project root, dist/server.js, or PM2)
  const rootDir = fs.existsSync(path.resolve(process.cwd(), 'dist'))
    ? process.cwd()
    : (fs.existsSync(path.resolve(__dirname, 'dist')) ? __dirname : path.resolve(__dirname, '..'));

  const publicDir = fs.existsSync(path.resolve(rootDir, 'public'))
    ? path.resolve(rootDir, 'public')
    : path.resolve(__dirname, 'public');

  const distDir = path.resolve(rootDir, 'dist');

  // Serve static assets from public folder (og-image, favicon, robots)
  app.use(express.static(publicDir, { maxAge: isProduction ? '1d' : 0 }));

  // Development: Vite middlewares; Production: Static files with optimal caching
  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port: PORT,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Cache hashed immutable assets (Vite generates unique chunk hashes)
    app.use('/assets', express.static(path.resolve(distDir, 'assets'), {
      maxAge: '1y',
      immutable: true,
    }));

    app.use(express.static(distDir, {
      maxAge: '1h',
    }));

    // SPA fallback: index.html with no-cache so updates propagate immediately
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[puulp.it] Server running in ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} at http://0.0.0.0:${PORT}`);
  });

  // Graceful shutdown for Hostinger VPS (PM2, Docker, systemd)
  const shutdown = (signal: string) => {
    console.log(`[puulp.it] Ricevuto segnale ${signal}. Chiusura ordinata del server...`);
    server.close(() => {
      console.log('[puulp.it] Server arrestato con successo.');
      process.exit(0);
    });
    setTimeout(() => {
      console.error('[puulp.it] Arresto forzato dopo timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('[puulp.it] Impossibile avviare il server:', err);
  process.exit(1);
});
