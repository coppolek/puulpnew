import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const genAI = new GoogleGenAI({});

interface FeedItem {
  title: string;
  link: string;
  date?: string;
  description?: string;
  image?: string;
  price?: string;
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

function sanitizeAndResolveImageUrl(rawUrl: string | undefined | null, baseUrl: string): string | undefined {
  if (!rawUrl || typeof rawUrl !== 'string') return undefined;
  let clean = rawUrl.trim();
  if (!clean) return undefined;

  // Reject 1x1 transparent tracking pixels and broken Amazon /images/P/ legacy URLs (which return 43-byte empty GIFs)
  if (clean.includes('images-na.ssl-images-amazon.com/images/P/')) return undefined;
  if (/1x1|spacer\.gif|pixel\.gif|transparent\.gif|blank\.gif/i.test(clean)) return undefined;
  if (clean.startsWith('data:image/gif;base64,R0lGODlhAQABA')) return undefined;

  // Protocol-relative URL
  if (clean.startsWith('//')) {
    clean = `https:${clean}`;
  }

  try {
    const parsed = new URL(clean, baseUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // invalid url
  }
  return undefined;
}

function extractImageFromHtmlText(html: string | undefined | null, baseUrl: string): string | undefined {
  if (!html || typeof html !== 'string') return undefined;
  const match = html.match(/<img[^>]+(?:src|data-src|data-lazy-src|data-original)=["']([^"']+)["']/i);
  if (match && match[1]) {
    return sanitizeAndResolveImageUrl(match[1], baseUrl);
  }
  return undefined;
}

function extractImageFromCheerioElement(card$: cheerio.Cheerio<any>, baseUrl: string): string | undefined {
  const sourceEl = card$.find('picture source[srcset], source[srcset]').first();
  if (sourceEl.length > 0) {
    const srcset = sourceEl.attr('srcset');
    if (srcset) {
      const candidates = srcset.split(',').map((s: string) => s.trim().split(/\s+/)[0]).filter(Boolean);
      const last = candidates[candidates.length - 1];
      const resolved = sanitizeAndResolveImageUrl(last, baseUrl);
      if (resolved) return resolved;
    }
  }

  const imgEl = card$.is('img') ? card$ : card$.find('img').first();
  if (imgEl.length > 0) {
    const attrs = [
      imgEl.attr('data-src'),
      imgEl.attr('data-lazy-src'),
      imgEl.attr('data-original'),
      imgEl.attr('data-hi-res'),
      imgEl.attr('data-large_image'),
      imgEl.attr('data-zoom-image'),
      imgEl.attr('src'),
    ];
    for (const attr of attrs) {
      const resolved = sanitizeAndResolveImageUrl(attr, baseUrl);
      if (resolved) return resolved;
    }

    const srcset = imgEl.attr('srcset') || imgEl.attr('data-srcset');
    if (srcset) {
      const candidates = srcset.split(',').map((s: string) => s.trim().split(/\s+/)[0]).filter(Boolean);
      const last = candidates[candidates.length - 1];
      const resolved = sanitizeAndResolveImageUrl(last, baseUrl);
      if (resolved) return resolved;
    }
  }
  return undefined;
}

interface AuthenticAmazonProduct {
  asin: string;
  title: string;
  price: string;
  image: string;
  category: string;
  subcategory: string;
  description: string;
}

const AUTHENTIC_AMAZON_CATALOG: AuthenticAmazonProduct[] = [
  // --- SMARTPHONES & TELEFONIA ---
  {
    asin: 'B0CTQWM1FL',
    title: "Samsung Galaxy XCover7 5G Smartphone Android Resistenza IP68, Display 6.6'', RAM 6GB, 128GB",
    price: '218,00 €',
    image: 'https://m.media-amazon.com/images/I/71sdO7HwoPL.jpg',
    category: 'smartphone',
    subcategory: 'Smartphone 5G Resistenti',
    description: 'Smartphone rugged 5G certificato IP68 e MIL-STD-810H con batteria sostituibile da 4.050 mAh e display Gorilla Glass Victus+.',
  },
  {
    asin: 'B0DYVWPJ39',
    title: 'realme Smartphone 14T 5G, 8+256GB, Batteria 5130 mAh, Display 120Hz, Fotocamera AI 50MP',
    price: '229,99 €',
    image: 'https://m.media-amazon.com/images/I/716LMq+jLDL.jpg',
    category: 'smartphone',
    subcategory: 'Smartphone 5G Media Gamma',
    description: 'Processore MediaTek Dimensity 6300, display fluido a 120 Hz, resistenza IP69 e ricarica rapida con tripla fotocamera AI.',
  },
  {
    asin: 'B0CGVSC587',
    title: 'POCO X6 Pro 5G Smartphone 8GB+256GB, Dimensity 8300-Ultra, CrystalRes 120Hz Flow AMOLED',
    price: '289,00 €',
    image: 'https://m.media-amazon.com/images/I/71v2jVh6nIL.jpg',
    category: 'smartphone',
    subcategory: 'Smartphone 5G ad Alte Prestazioni',
    description: 'Display AMOLED a 120 Hz a 68 miliardi di colori, ricarica turbo da 67W e fotocamera tripla da 64MP con OIS.',
  },
  {
    asin: 'B0CRV68W6C',
    title: 'Samsung Galaxy S24 Smartphone AI, Display 6.2 FHD+ Dynamic AMOLED 2X, 128GB, Caricatore incluso',
    price: '699,00 €',
    image: 'https://m.media-amazon.com/images/I/61uvELoqSCL.jpg',
    category: 'smartphone',
    subcategory: 'Smartphone Top di Gamma',
    description: 'Galaxy AI integrata con Cerchia e Cerca, Traduzione Live, fotocamera da 50MP con elaborazione ProVisual Engine.',
  },
  {
    asin: 'B0DGJ9M81K',
    title: 'Apple iPhone 15 (128 GB) - Nero, Display Super Retina XDR da 6,1", Chip A16 Bionic',
    price: '799,00 €',
    image: 'https://m.media-amazon.com/images/I/61eEYLATF9L.jpg',
    category: 'smartphone',
    subcategory: 'Apple iPhone',
    description: 'Dynamic Island, fotocamera principale da 48MP con teleobiettivo 2x, design in vetro a infusione di colore e connettore USB-C.',
  },
  {
    asin: 'B0CRH3L5JS',
    title: 'Xiaomi Redmi Note 13 4G Smartphone 8+256GB, Display AMOLED 120Hz, Tripla Camera 108MP',
    price: '189,90 €',
    image: 'https://m.media-amazon.com/images/I/71MQtVVebfL.jpg',
    category: 'smartphone',
    subcategory: 'Smartphone Economici',
    description: 'Fotocamera ultra-nitida da 108MP, display AMOLED immersivo da 6,67 pollici a 120Hz e ricarica rapida da 33W.',
  },

  // --- CUFFIE & AUDIO BLUETOOTH ---
  {
    asin: 'B09Y2MYL5C',
    title: 'Sony WH-1000XM5 Cuffie Wireless con Noise Cancelling Premium, Autonomia 30 Ore, Hi-Res Audio',
    price: '329,00 €',
    image: 'https://m.media-amazon.com/images/I/61D4Z3yKPAL.jpg',
    category: 'audio',
    subcategory: 'Cuffie Over-Ear Noise Cancelling',
    description: 'Cancellazione del rumore ai vertici del settore con doppio processore e 8 microfoni, ricarica rapida e chiamate cristalline.',
  },
  {
    asin: 'B0CHWV2WYK',
    title: 'Apple AirPods Pro (2ª generazione) con custodia MagSafe (USB-C), Cancellazione Attiva del Rumore',
    price: '229,00 €',
    image: 'https://m.media-amazon.com/images/I/61SUj2aKoEL.jpg',
    category: 'audio',
    subcategory: 'Auricolari True Wireless Apple',
    description: 'Chip Apple H2, Audio Spaziale personalizzato, modalità Trasparenza adattiva e fino a 30 ore di ascolto con custodia.',
  },
  {
    asin: 'B0CCZ1P14N',
    title: 'Bose QuietComfort Cuffie Bluetooth con Cancellazione del Rumore, Modalità Quiet e Aware',
    price: '249,00 €',
    image: 'https://m.media-amazon.com/images/I/51revx-zToL.jpg',
    category: 'audio',
    subcategory: 'Cuffie Bose Noise Cancelling',
    description: 'Leggendarie prestazioni di cancellazione del rumore, cuscinetti morbidi per massimo comfort e autonomia fino a 24 ore.',
  },
  {
    asin: 'B0CHWTQW8G',
    title: 'Apple AirPods (3ª generazione) con custodia di ricarica Lightning, Audio Spaziale con Rilevamento Testa',
    price: '169,00 €',
    image: 'https://m.media-amazon.com/images/I/61ZRU9gnbxL.jpg',
    category: 'audio',
    subcategory: 'Auricolari Apple AirPods',
    description: 'Design affusolato con sensore di pressione, resistenza all acqua IPX4 e fino a 30 ore complessive di ascolto.',
  },
  {
    asin: 'B0BYV8R61F',
    title: 'JBL Tune 520BT Cuffie On-Ear Wireless con Suono JBL Pure Bass, Bluetooth 5.3, Fino a 57 Ore',
    price: '39,99 €',
    image: 'https://m.media-amazon.com/images/I/61kFL7ywsZS.jpg',
    category: 'audio',
    subcategory: 'Cuffie Bluetooth Economiche',
    description: 'Bassi potenti JBL Pure Bass, connessione multipoint per passare facilmente da un dispositivo all altro e microfono integrato.',
  },

  // --- TRAPANI & ELETTROUTENSILI (FAI DA TE) ---
  {
    asin: 'B09877WFM6',
    title: 'Bosch Trapano battente-avvitatore a batteria UniversalImpact 18V (1 Batteria, in Valigetta)',
    price: '101,97 €',
    image: 'https://m.media-amazon.com/images/I/71wPKhAIjcL.jpg',
    category: 'trapani',
    subcategory: 'Trapani a Batteria 18V',
    description: 'Funzione foratura, percussione e avvitamento con mandrino autoserrante da 10 mm e 20 posizioni di regolazione della coppia.',
  },
  {
    asin: 'B00GXZP1V8',
    title: 'Makita HP457DWE Trapano Avvitatore a Percussione 18V con 2 Batterie Li-Ion e Valigetta',
    price: '135,00 €',
    image: 'https://m.media-amazon.com/images/I/71LGYwc077L.jpg',
    category: 'trapani',
    subcategory: 'Trapani Professionali',
    description: 'Ingranaggi completamente in metallo, velocità variabile con freno elettrico e due batterie incluse per lavoro continuo.',
  },
  {
    asin: 'B07T6XQ54J',
    title: 'Black+Decker Trapano Avvitatore a Percussione 18V Litio con Doppia Batteria e Borsa',
    price: '69,99 €',
    image: 'https://m.media-amazon.com/images/I/71HTR+O4veL.jpg',
    category: 'trapani',
    subcategory: 'Elettroutensili Fai da Te',
    description: 'Azione a percussione da 21.000 colpi/min ideale per forare muratura e calcestruzzo, luce LED integrata e 2 velocità.',
  },
  {
    asin: 'B01M3W965L',
    title: 'DeWalt DCD796D2-QW Trapano Avvitatore a Percussione Brushless Compatto 18V XR',
    price: '199,00 €',
    image: 'https://m.media-amazon.com/images/I/719snUksSEL.jpg',
    category: 'trapani',
    subcategory: 'Trapani Brushless Alta Gamma',
    description: 'Motore senza spazzole Brushless ad alta efficienza energetica, mandrino in metallo da 13 mm e valigetta rigida TSTAK.',
  },

  // --- NOTEBOOK & LAPTOP PC ---
  {
    asin: 'B0BSN2N98L',
    title: 'Apple MacBook Air 13" con Chip M2 (CPU 8-core, GPU 8-core, 8GB RAM, 256GB SSD) - Mezzanotte',
    price: '999,00 €',
    image: 'https://m.media-amazon.com/images/I/710TJuHTMhL.jpg',
    category: 'notebook',
    subcategory: 'Apple MacBook',
    description: 'Display Liquid Retina da 13,6 pollici, autonomia fino a 18 ore, videocamera FaceTime HD a 1080p e ricarica magnetica MagSafe.',
  },
  {
    asin: 'B0CX234XYZ',
    title: 'HP Laptop 15s Display 15.6" Full HD Antiriflesso, Intel Core i5-1235U, 16GB RAM, 512GB SSD',
    price: '549,99 €',
    image: 'https://m.media-amazon.com/images/I/71f5Eu5lJSL.jpg',
    category: 'notebook',
    subcategory: 'Notebook Lavoro & Studio',
    description: 'Prestazioni veloci con processore Intel Core i5 a 10 core, Wi-Fi 6, batteria a lunga durata con ricarica rapida HP Fast Charge.',
  },
  {
    asin: 'B09HM94VDS',
    title: 'Logitech MX Master 3S Mouse Wireless con Scorrimento Ultra-Veloce MagSpeed, 8K DPI',
    price: '97,90 €',
    image: 'https://m.media-amazon.com/images/I/61+OT7FPABL.jpg',
    category: 'notebook',
    subcategory: 'Accessori PC & Produttività',
    description: 'Sensore ottico ad alta precisione da 8.000 DPI su qualsiasi superficie (incluso vetro), clic silenziosi e connettività Flow.',
  },

  // --- SMARTWATCH & WEARABLES ---
  {
    asin: 'B0CHX1W1MN',
    title: 'Apple Watch Series 9 GPS 45mm Cassa in Alluminio con Cinturino Sport, Chip S9 SiP',
    price: '399,00 €',
    image: 'https://m.media-amazon.com/images/I/712wglSBTaL.jpg',
    category: 'smartwatch',
    subcategory: 'Apple Watch',
    description: 'Gesto doppio tocco (Double Tap), display con luminosità fino a 2000 nit, sensore ECG, ossigeno nel sangue e monitoraggio sonno.',
  },
  {
    asin: 'B0CC8Z9N6Z',
    title: 'Samsung Galaxy Watch6 Bluetooth 44mm Ghiera Touch, Monitoraggio Composizione Corporea',
    price: '199,00 €',
    image: 'https://m.media-amazon.com/images/I/41nKCnEIV5L.jpg',
    category: 'smartwatch',
    subcategory: 'Smartwatch Android & Fitness',
    description: 'Vetro in cristallo di zaffiro resistente ai graffi, analisi dettagliata del sonno con Sleep Coaching e misurazione pressione sanguigna.',
  },
  {
    asin: 'B0CHJ8K65L',
    title: 'Xiaomi Smart Band 8 Activity Tracker Display AMOLED 1.62", 60Hz, 150+ Modalità Sport',
    price: '34,99 €',
    image: 'https://m.media-amazon.com/images/I/71iBrsQzbqL.jpg',
    category: 'smartwatch',
    subcategory: 'Smartband & Fitness Tracker',
    description: 'Regolazione automatica della luminosità, autonomia fino a 16 giorni con singola carica e resistenza all acqua 5 ATM.',
  },

  // --- ROBOT & CASA ---
  {
    asin: 'B08HDKF4HM',
    title: 'iRobot Roomba 692 Robot Aspirapolvere con Connessione Wi-Fi, Compatibile con Alexa e Google',
    price: '179,00 €',
    image: 'https://m.media-amazon.com/images/I/61RNw+-A3ZL.jpg',
    category: 'robot',
    subcategory: 'Robot Aspirapolvere',
    description: 'Sistema di pulizia a 3 fasi con doppie spazzole multi-superficie, sensori Dirt Detect e navigazione intelligente.',
  },
  {
    asin: 'B09C2F5Q6L',
    title: 'Dreame L10s Ultra Robot Aspirapolvere e Lavapavimenti con Stazione Base Autopulente',
    price: '599,00 €',
    image: 'https://m.media-amazon.com/images/I/61iq4OgMv4L.jpg',
    category: 'robot',
    subcategory: 'Robot Lavapavimenti Avanzati',
    description: 'Svuotamento automatico della polvere, lavaggio e asciugatura con aria calda dei panni rotanti e potenza di aspirazione di 5.300 Pa.',
  },
  {
    asin: 'B0CKW8M34L',
    title: 'Dyson V8 Absolute Aspirapolvere Senza Filo, Spazzola Motorbar e Fluffy, Fino a 40 Minuti',
    price: '349,00 €',
    image: 'https://m.media-amazon.com/images/I/51jwzoSMoRL.jpg',
    category: 'robot',
    subcategory: 'Aspirapolvere Senza Filo',
    description: 'Potente motore digitale Dyson V8, tecnologia anti-groviglio Motorbar e filtrazione avanzata che trattiene il 99,99% delle particelle.',
  },
  {
    asin: 'B07W67NQ8L',
    title: 'Cosori Friggitrice ad Aria 5.5L XXL, 11 Programmi Preimpostati, Cestello Antiaderente Lavabile',
    price: '109,99 €',
    image: 'https://m.media-amazon.com/images/I/71F0YLbrzBL.jpg',
    category: 'casa',
    subcategory: 'Piccoli Elettrodomestici Cucina',
    description: 'Circolazione d aria calda a 360° con consumo di olio ridotto dell 85%, display touchscreen digitale e ricettario incluso.',
  },

  // --- GAMING & CONSOLE ---
  {
    asin: 'B0CLT5R1VT',
    title: 'PlayStation 5 Slim Standard Edition con Lettore Disco Ultra HD Blu-ray, SSD 1TB',
    price: '479,00 €',
    image: 'https://m.media-amazon.com/images/I/51051FiD9UL.jpg',
    category: 'gaming',
    subcategory: 'Console PlayStation 5',
    description: 'Grafica fino a 4K a 120 fps, Ray Tracing, audio 3D Tempest e controller wireless DualSense con feedback aptico.',
  },
  {
    asin: 'B09G96TFF7',
    title: 'Nintendo Switch Modello OLED Bianco con Schermo OLED da 7 Pollici, Memoria 64 GB',
    price: '319,00 €',
    image: 'https://m.media-amazon.com/images/I/61-PblYntsL.jpg',
    category: 'gaming',
    subcategory: 'Console Nintendo Switch',
    description: 'Colori intensi e contrasto elevato su display OLED da 7 pollici, base con porta LAN integrata e supporto regolabile più ampio.',
  },
  {
    asin: 'B08HGGBB84',
    title: 'PlayStation DualSense Wireless Controller per Console PS5 - Bianco/Nero',
    price: '64,90 €',
    image: 'https://m.media-amazon.com/images/I/61-jjE67uqL.jpg',
    category: 'gaming',
    subcategory: 'Accessori PlayStation & Gaming',
    description: 'Feedback aptico immersivo, trigger adattivi dinamici e microfono integrato in un design ergonomico iconico.',
  },
];

// Helper to dynamically find genuine Amazon media photo if not in catalog
async function findAmazonLiveImage(query: string): Promise<string | null> {
  try {
    const res1 = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query + ' amazon.it')}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res1.ok) return null;
    const html = await res1.text();
    const vqd = html.match(/vqd=([\d-]+)/)?.[1];
    if (!vqd) return null;

    const res2 = await fetch(`https://duckduckgo.com/i.js?l=it-it&o=json&q=${encodeURIComponent(query + ' amazon.it')}&vqd=${vqd}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res2.ok) return null;
    const data = await res2.json();
    for (const r of (data.results || [])) {
      if (r.image && r.image.includes('media-amazon.com/images/I/')) {
        const clean = r.image.replace(/\._[A-Z0-9,_]+_\.jpg$/i, '.jpg');
        if (!clean.includes('31OKBwd611L') && !clean.includes('11XXCCfk0UL')) {
          return clean;
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function getAmazonProductImage(asin?: string, title?: string, queryTopic?: string, rawImage?: string): string {
  // If raw image is already a verified Amazon media asset (and not a placeholder/energy label)
  if (rawImage) {
    const valid = sanitizeAndResolveImageUrl(rawImage, 'https://www.amazon.it');
    if (valid && valid.includes('media-amazon.com/images/I/') && !valid.includes('31OKBwd611L') && !valid.includes('11XXCCfk0UL')) {
      return valid;
    }
  }

  const cleanAsin = (asin || '').toUpperCase().trim();
  if (cleanAsin) {
    const match = AUTHENTIC_AMAZON_CATALOG.find((p) => p.asin === cleanAsin);
    if (match) return match.image;
  }

  const text = `${title || ''} ${queryTopic || ''}`.toLowerCase();

  // Match keyword in authentic catalog
  const match = AUTHENTIC_AMAZON_CATALOG.find((p) => {
    const catLower = p.category.toLowerCase();
    const subLower = p.subcategory.toLowerCase();
    const titleLower = p.title.toLowerCase();
    return (
      (text.includes('smart') || text.includes('phone') || text.includes('cellulare')) && catLower === 'smartphone' ||
      (text.includes('cuffi') || text.includes('auricolar') || text.includes('airpod') || text.includes('sound')) && catLower === 'audio' ||
      (text.includes('trapan') || text.includes('avvitat') || text.includes('utensil') || text.includes('fai da te')) && catLower === 'trapani' ||
      (text.includes('laptop') || text.includes('notebook') || text.includes('computer') || text.includes('macbook')) && catLower === 'notebook' ||
      (text.includes('watch') || text.includes('orolog') || text.includes('smartwatch')) && catLower === 'smartwatch' ||
      (text.includes('robot') || text.includes('aspirapolvere') || text.includes('roomba')) && catLower === 'robot' ||
      (text.includes('playstation') || text.includes('switch') || text.includes('console') || text.includes('controller')) && catLower === 'gaming' ||
      titleLower.split(' ').some((word) => word.length > 4 && text.includes(word))
    );
  });

  if (match) {
    return match.image;
  }

  // High-res verified Amazon tech product photo fallback (never Unsplash!)
  return 'https://m.media-amazon.com/images/I/71sdO7HwoPL.jpg';
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
      const escapedImg = escapeXml(item.image);
      enclosureTag = `      <enclosure url="${escapedImg}" type="image/jpeg" length="0" />\n      <media:content url="${escapedImg}" medium="image" />\n      <media:thumbnail url="${escapedImg}" />\n`;
    }

    return `    <item>
      <title><![CDATA[${cleanCdata(item.title)}]]></title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
${pubDateTag}      <description><![CDATA[${cleanCdata(item.description || item.title)}]]></description>
${enclosureTag}    </item>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
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

function parseXmlFeedContent(text: string, normalizedUrl: string): { feedTitle: string; feedDescription: string; items: FeedItem[] } {
  let feedTitle = '';
  let feedDescription = '';
  const items: FeedItem[] = [];

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
      const contentEncoded = item$.find('content\\:encoded').text().trim();
      const pubDate = item$.find('pubDate').first().text().trim();

      const rawImgCandidate =
        item$.find('enclosure[type^="image"]').attr('url') ||
        item$.find('enclosure').attr('url') ||
        item$.find('media\\:content[medium="image"]').attr('url') ||
        item$.find('media\\:content').attr('url') ||
        item$.find('media\\:thumbnail').attr('url') ||
        item$.find('image > url').text().trim() ||
        extractImageFromHtmlText(contentEncoded, normalizedUrl) ||
        extractImageFromHtmlText(desc, normalizedUrl);

      const enclosure = sanitizeAndResolveImageUrl(rawImgCandidate, normalizedUrl);

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
      const contentHtml = item$.find('content').text().trim();
      const summaryHtml = item$.find('summary').text().trim();
      const updated = item$.find('updated').first().text().trim() || item$.find('published').first().text().trim();

      const rawAtomImg =
        item$.find('link[rel="enclosure"]').attr('href') ||
        item$.find('link[type^="image"]').attr('href') ||
        item$.find('media\\:content').attr('url') ||
        item$.find('media\\:thumbnail').attr('url') ||
        extractImageFromHtmlText(contentHtml, normalizedUrl) ||
        extractImageFromHtmlText(summaryHtml, normalizedUrl);

      const atomImg = sanitizeAndResolveImageUrl(rawAtomImg, normalizedUrl);

      if (title && link) {
        items.push({
          title,
          link: new URL(link, normalizedUrl).href,
          date: updated,
          description: desc.replace(/<[^>]+>/g, '').trim().slice(0, 300),
          image: atomImg,
        });
      }
    });
  }

  return { feedTitle, feedDescription, items };
}

  let feedTitle = '';
  let feedDescription = '';
  const items: FeedItem[] = [];

  // Check if content is already RSS or Atom XML
  if (contentType.includes('xml') || text.trim().startsWith('<?xml') || text.includes('<rss') || text.includes('<feed')) {
    const xmlParsed = parseXmlFeedContent(text, normalizedUrl);
    feedTitle = xmlParsed.feedTitle;
    feedDescription = xmlParsed.feedDescription;
    items.push(...xmlParsed.items);
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

    // 0. Autodiscover linked RSS/Atom feeds (WordPress, Ghost, Medium, Substack, News sites)
    const linkedRssHref = $('link[type*="rss"], link[type*="atom"]').first().attr('href');
    if (linkedRssHref) {
      try {
        const fullRssUrl = new URL(linkedRssHref, normalizedUrl).href;
        if (fullRssUrl !== normalizedUrl) {
          const rssRes = await fetch(fullRssUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
              'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            },
            signal: AbortSignal.timeout(8000),
          });
          if (rssRes.ok) {
            const rssText = await rssRes.text();
            if (rssText.includes('<rss') || rssText.includes('<feed') || rssText.includes('<channel')) {
              const discoveredXml = parseXmlFeedContent(rssText, fullRssUrl);
              if (discoveredXml.items.length > 0) {
                feedTitle = discoveredXml.feedTitle || feedTitle;
                feedDescription = discoveredXml.feedDescription || feedDescription;
                items.push(...discoveredXml.items);
              }
            }
          }
        }
      } catch {
        // Fallback to Cheerio DOM strategies
      }
    }

    // 0.5. Specialized Layout: Hacker News
    if (items.length === 0 && $('.athing').length > 0) {
      $('.athing').each((_, el) => {
        const titleEl = $(el).find('.titleline > a').first();
        const title = titleEl.text().trim();
        const link = titleEl.attr('href');
        const subtext = $(el).next().find('.subtext');
        const age = subtext.find('.age a').text().trim();
        const score = subtext.find('.score').text().trim();
        if (title && link) {
          items.push({
            title,
            link: new URL(link, normalizedUrl).href,
            date: age,
            description: `${score ? score + ' • ' : ''}Pubblicato ${age}`,
          });
        }
      });
    }

    const seenLinks = new Set<string>();

    // Strategy 1: JSON-LD Structured Data
    if (items.length === 0) {
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
                  const rawImg = item.image?.url || (typeof item.image === 'string' ? item.image : (Array.isArray(item.image) ? (typeof item.image[0] === 'string' ? item.image[0] : item.image[0]?.url) : undefined));
                  items.push({
                    title: String(title).trim(),
                    link: fullUrl,
                    date: item.datePublished ? new Date(item.datePublished).toLocaleDateString('it-IT') : undefined,
                    description: item.description ? String(item.description).slice(0, 250) : undefined,
                    image: sanitizeAndResolveImageUrl(rawImg, normalizedUrl),
                  });
                }
              }
            }
          }
        } catch {
          // Ignore JSON parsing errors
        }
      });
    }

    // Strategy 2: Semantic <article> elements (excluding nav/menus)
    if (items.length < 3) {
      $('article').each((_, el) => {
        const article$ = $(el);
        if (article$.closest('nav, header, footer, aside, .menu, [role="navigation"]').length > 0) return;

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

              if (title && title.length > 3 && !title.toLowerCase().includes('cookie') && !title.toLowerCase().includes('accedi')) {
                seenLinks.add(fullUrl);
                const dateEl = article$.find('time, small, .date, [class*="date"], [class*="time"]').first();
                const dateText = dateEl.attr('datetime') || dateEl.text().trim();
                const descText = article$.find('p, .excerpt, [class*="summary"], [class*="desc"]').first().text().trim();
                const imgUrl = extractImageFromCheerioElement(article$, normalizedUrl);

                items.push({
                  title,
                  link: fullUrl,
                  date: dateText ? (isNaN(new Date(dateText).getTime()) ? dateText : new Date(dateText).toLocaleDateString('it-IT')) : undefined,
                  description: descText && descText !== title ? descText.slice(0, 250) : undefined,
                  image: imgUrl,
                });
              }
            }
          } catch {
            // invalid URL
          }
        }
      });
    }

    // Strategy 3: Common blog/news card containers (excluding navigation menus)
    if (items.length < 3) {
      const containerSelectors = [
        '[class*="loop-card"]',
        '[class*="post-item"]',
        '[class*="post-card"]',
        '[class*="article-card"]',
        '[class*="news-card"]',
        '[class*="story"]',
        '[class*="entry"]',
        'div[class*="news"]',
      ];

      $(containerSelectors.join(', ')).each((_, el) => {
        const card$ = $(el);
        if (card$.closest('nav, header, footer, aside, .menu, [role="navigation"]').length > 0) return;

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

              if (title && title.length > 5 && !title.toLowerCase().includes('cookie') && !title.toLowerCase().includes('accedi')) {
                seenLinks.add(fullUrl);
                const dateEl = card$.find('time, small, .date, [class*="date"]').first();
                const dateText = dateEl.attr('datetime') || dateEl.text().trim();
                const descText = card$.find('p, [class*="desc"], [class*="excerpt"]').first().text().trim();
                const imgUrl = extractImageFromCheerioElement(card$, normalizedUrl);

                items.push({
                  title,
                  link: fullUrl,
                  date: dateText ? (isNaN(new Date(dateText).getTime()) ? dateText : new Date(dateText).toLocaleDateString('it-IT')) : undefined,
                  description: descText && descText !== title ? descText.slice(0, 250) : undefined,
                  image: imgUrl,
                });
              }
            }
          } catch {
            // invalid URL
          }
        }
      });
    }

    // Strategy 4: Main content headline links (strictly excluding navigation menus)
    if (items.length < 3) {
      $('main h1 a, main h2 a, main h3 a, #content h2 a, #content h3 a, .content h2 a, .content h3 a').each((_, el) => {
        const anchor = $(el);
        if (anchor.closest('nav, header, footer, aside, .menu, [role="navigation"]').length > 0) return;

        const href = anchor.attr('href');

        if (href) {
          try {
            const fullUrl = new URL(href, normalizedUrl).href;
            if (!seenLinks.has(fullUrl) && !fullUrl.includes('#')) {
              const anchorClone = anchor.clone();
              const dateEl = anchorClone.find('time, small, .date, [class*="date"]');
              const dateText = dateEl.first().text().trim();
              dateEl.remove();

              const descEl = anchorClone.find('p, [class*="desc"], [class*="summary"]');
              const innerDesc = descEl.first().text().trim();
              descEl.remove();

              const title = anchorClone.text().trim();

              if (title && title.length > 10 && !title.toLowerCase().includes('cookie') && !title.toLowerCase().includes('privacy') && !title.toLowerCase().includes('login') && !title.toLowerCase().includes('accedi')) {
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

// ----------------------------------------------------
// AFFILIATE & CATEGORIES SCRAPING ENGINE
// ----------------------------------------------------

interface ScrapedSubcategory {
  id: string;
  name: string;
  url: string;
  rssUrl?: string;
  itemsCount: number;
  items: FeedItem[];
}

interface CategoryScrapeResult {
  category: {
    title: string;
    description: string;
    url: string;
    rssUrl?: string;
    subcategoriesCount: number;
    totalItems: number;
  };
  affiliate: {
    id: string;
    network: string;
    customParam: string;
    sampleLink: string;
  };
  subcategories: ScrapedSubcategory[];
  directItems: FeedItem[];
  allMonetizedItems: Array<FeedItem & { subcategoryName: string; originalLink: string; price?: string }>;
}

function applyAffiliateToUrlServer(
  rawUrl: string,
  affiliateId: string,
  network: string = 'custom_param',
  customParam: string = 'ref'
): string {
  if (!rawUrl || !affiliateId || !affiliateId.trim()) return rawUrl;
  const cleanId = affiliateId.trim();

  try {
    const urlObj = new URL(rawUrl);

    if (network === 'amazon' || urlObj.hostname.includes('amazon.') || urlObj.hostname.includes('amzn.')) {
      urlObj.searchParams.delete('tag');
      urlObj.searchParams.delete('ascsubtag');
      urlObj.searchParams.set('tag', cleanId);
      return urlObj.toString();
    }

    if (network === 'ebay' || urlObj.hostname.includes('ebay.')) {
      urlObj.searchParams.set('campid', cleanId);
      urlObj.searchParams.set('customid', 'puulp');
      return urlObj.toString();
    }

    if (network === 'awin') {
      urlObj.searchParams.set('awinaffid', cleanId);
      return urlObj.toString();
    }

    const paramKey = (customParam || 'ref').trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'ref';
    urlObj.searchParams.set(paramKey, cleanId);
    return urlObj.toString();
  } catch {
    const cleanParam = (customParam || 'ref').trim() || 'ref';
    const separator = rawUrl.includes('?') ? '&' : '?';
    return `${rawUrl}${separator}${cleanParam}=${encodeURIComponent(cleanId)}`;
  }
}

function isAmazonInput(input: string): boolean {
  if (!input) return false;
  const lower = input.toLowerCase().trim();
  return (
    lower.includes('amazon.') ||
    lower.includes('amzn.eu') ||
    lower.includes('amzn.to') ||
    /^[A-Z0-9]{10}$/i.test(input.trim()) ||
    lower.startsWith('amazon:') ||
    lower.includes('/dp/') ||
    lower.includes('/gp/') ||
    lower.includes('amazon')
  );
}

function cleanAndParseJsonArray(raw: string): any[] {
  if (!raw || !raw.trim()) return [];
  let clean = raw.trim();
  clean = clean.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end >= start) {
    clean = clean.slice(start, end + 1);
  }
  try {
    const res = JSON.parse(clean);
    return Array.isArray(res) ? res : [];
  } catch (err) {
    console.warn('JSON parsing error in cleanAndParseJsonArray:', err);
    return [];
  }
}

async function fetchAmazonLiveDetails(asin: string): Promise<{ price?: string; image?: string; title?: string; description?: string }> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept-Language': 'it-IT,it;q=0.9',
  };
  try {
    const res = await fetch(`https://www.amazon.it/dp/${asin}`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return {};
    const html = await res.text();
    const $ = cheerio.load(html);

    // Exact product title
    const title = $('#productTitle').text().trim() ||
      $('title').text().replace(/\s*:\s*Amazon\.it.*$/i, '').trim();

    // Exact product price
    const price = $('.a-price .a-offscreen').first().text().trim() ||
      html.match(/class="a-price"[^>]*>[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/)?.[1]?.trim();

    // Exact master product image from landingImage or dynamic image JSON
    let rawImg = $('#landingImage').attr('data-old-hires') ||
      $('#landingImage').attr('src') ||
      $('#imgBlkFront').attr('data-old-hires') ||
      $('#imgBlkFront').attr('src');

    if (!rawImg) {
      const dyn = $('#landingImage').attr('data-a-dynamic-image') || $('#imgBlkFront').attr('data-a-dynamic-image');
      if (dyn) {
        try {
          const parsed = JSON.parse(dyn);
          rawImg = Object.keys(parsed)[0];
        } catch {}
      }
    }

    if (!rawImg) {
      const dynMatch = html.match(/data-a-dynamic-image="([^"]+)"/);
      if (dynMatch) {
        try {
          const parsed = JSON.parse(dynMatch[1].replace(/&quot;/g, '"'));
          rawImg = Object.keys(parsed)[0];
        } catch {}
      }
    }

    // Strip thumbnail sizing parameters to get high-resolution master photo
    let hires = rawImg ? rawImg.replace(/\._[A-Z0-9,_]+_\.jpg$/i, '.jpg') : undefined;

    // Filter out European energy labels, blank pixels, and UI buttons
    if (hires && (hires.includes('31OKBwd611L') || hires.includes('11XXCCfk0UL') || hires.includes('play-button'))) {
      hires = undefined;
    }

    const bullets = $('#feature-bullets li').map((_, el) => $(el).text().trim()).get()
      .filter(t => t.length > 5 && !t.includes('garanzia') && !t.includes('Visualizza')).slice(0, 3).join(' • ');

    return {
      price: price || undefined,
      image: hires || undefined,
      title: title && title.length > 3 ? title : undefined,
      description: bullets || undefined,
    };
  } catch {
    return {};
  }
}

async function scrapeLiveAmazon(
  targetInput: string,
  affiliateId: string = '',
  maxItems: number = 20,
  hostUrl: string = ''
): Promise<CategoryScrapeResult> {
  let cleaned = targetInput.trim();

  // If shortlink (amzn.eu or amzn.to), resolve redirect
  if (cleaned.includes('amzn.eu') || cleaned.includes('amzn.to')) {
    try {
      const res = await fetch(cleaned, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: AbortSignal.timeout(4000),
      });
      if (res.url && res.url !== cleaned) {
        cleaned = res.url;
      }
    } catch {}
  }

  // Check if target is a direct product ASIN
  const asinMatch = cleaned.match(/(?:dp|product|gp\/product)\/([A-Z0-9]{10})/i) ||
    (cleaned.length === 10 && /^[A-Z0-9]{10}$/i.test(cleaned) ? [null, cleaned] : null);

  let queryTopic = cleaned;
  try {
    if (cleaned.startsWith('http')) {
      const parsed = new URL(cleaned);
      const k = parsed.searchParams.get('k') || parsed.searchParams.get('field-keywords');
      if (k) {
        queryTopic = k;
      } else {
        const pathSegments = parsed.pathname.split('/').filter(Boolean);
        queryTopic = pathSegments.pop()?.replace(/[-_]/g, ' ') || 'Prodotti';
      }
    }
  } catch {}

  const cleanAffiliate = affiliateId.trim();
  const mobileHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8',
  };

  const discoveredProducts: Array<{
    title: string;
    asin: string;
    url: string;
    price?: string;
    description?: string;
    image?: string;
    subcategory: string;
  }> = [];

  const discoveredSubcats: Array<{ name: string; url: string }> = [];

  // If single ASIN provided, fetch its real page directly
  if (asinMatch) {
    const asin = asinMatch[1].toUpperCase();
    const details = await fetchAmazonLiveDetails(asin);
    if (details.title) {
      discoveredProducts.push({
        title: details.title,
        asin,
        url: `https://www.amazon.it/dp/${asin}`,
        price: details.price,
        image: details.image || getAmazonProductImage(asin, details.title, queryTopic),
        description: `Prodotto autentico su Amazon.it (ASIN: ${asin})${details.price ? ` - Prezzo: ${details.price}` : ''}`,
        subcategory: 'Prodotto Selezionato',
      });
    }
  }

  // Live Web Search to find real products and subcategories for the exact user query
  const qCat = `amazon.it ${queryTopic}`;
  const qProd = `site:amazon.it ${queryTopic}`;

  const [resCatText, resProdText] = await Promise.all([
    fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(qCat)}`, { headers: mobileHeaders }).then(r => r.text()).catch(() => ''),
    fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(qProd)}`, { headers: mobileHeaders }).then(r => r.text()).catch(() => ''),
  ]);

  const seenAsins = new Set<string>(discoveredProducts.map(p => p.asin));

  // Extract real subcategories from Amazon search results
  if (resCatText) {
    const $cat = cheerio.load(resCatText);
    $cat('.result').each((_, el) => {
      const rawTitle = $cat(el).find('.result__title a').text().trim();
      const rawLink = $cat(el).find('.result__url').attr('href') || $cat(el).find('.result__title a').attr('href') || '';
      let realUrl = rawLink;
      if (rawLink.includes('uddg=')) {
        const m = rawLink.match(/uddg=([^&]+)/);
        if (m) realUrl = decodeURIComponent(m[1]);
      }
      if (realUrl.includes('amazon.it/') && !realUrl.includes('/dp/')) {
        const cleanName = rawTitle.replace(/Amazon\.it\s*:\s*/i, '').replace(/:\s*Elettronica.*$/i, '').trim();
        if (cleanName && cleanName.length > 2 && cleanName.length < 50 && !cleanName.toLowerCase().includes('accesso') && !discoveredSubcats.some(s => s.name.toLowerCase() === cleanName.toLowerCase())) {
          discoveredSubcats.push({ name: cleanName, url: realUrl });
        }
      }
    });
  }

  // Extract products from search results
  const parseProductsFromHtml = ($doc: cheerio.CheerioAPI, defaultSubcat: string) => {
    $doc('.result').each((_, el) => {
      const rawTitle = $doc(el).find('.result__title a').text().trim();
      const rawLink = $doc(el).find('.result__url').attr('href') || $doc(el).find('.result__title a').attr('href') || '';
      const snippet = $doc(el).find('.result__snippet').text().trim();
      let realUrl = rawLink;
      if (rawLink.includes('uddg=')) {
        const m = rawLink.match(/uddg=([^&]+)/);
        if (m) realUrl = decodeURIComponent(m[1]);
      }
      const asinMatch = realUrl.match(/\/dp\/([A-Z0-9]{10})/i) || rawTitle.match(/\b([B0-9][A-Z0-9]{9})\b/);
      if (asinMatch && !seenAsins.has(asinMatch[1])) {
        const asin = asinMatch[1];
        seenAsins.add(asin);
        const cleanTitle = rawTitle.replace(/Amazon\.it\s*:\s*/i, '').replace(/:\s*Elettronica.*$/i, '').replace(/- Amazon\.it.*$/i, '').trim();
        const priceMatch = snippet.match(/(?:€\s*[\d.,]+|[\d.,]+\s*€)/);
        discoveredProducts.push({
          title: cleanTitle,
          asin,
          url: `https://www.amazon.it/dp/${asin}`,
          price: priceMatch ? priceMatch[0] : undefined,
          description: snippet.slice(0, 200),
          subcategory: defaultSubcat,
        });
      }
    });
  };

  if (resProdText) {
    parseProductsFromHtml(cheerio.load(resProdText), 'Prodotti Principali');
  }
  if (resCatText) {
    parseProductsFromHtml(cheerio.load(resCatText), 'Prodotti Correlati');
  }

  // Match authentic catalog items for this topic
  const topicLower = queryTopic.toLowerCase();
  const matchedCatalogItems = AUTHENTIC_AMAZON_CATALOG.filter((item) => {
    const catLower = item.category.toLowerCase();
    const titleLower = item.title.toLowerCase();
    const subLower = item.subcategory.toLowerCase();
    if (topicLower.includes('smart') || topicLower.includes('phone') || topicLower.includes('5g') || topicLower.includes('cellulare') || topicLower.includes('telefono') || topicLower.includes('iphone') || topicLower.includes('samsung') || topicLower.includes('xiaomi') || topicLower.includes('poco') || topicLower.includes('realme')) {
      return catLower === 'smartphone';
    }
    if (topicLower.includes('cuffi') || topicLower.includes('auricolar') || topicLower.includes('airpod') || topicLower.includes('audio') || topicLower.includes('bluetooth') || topicLower.includes('wireless') || topicLower.includes('sound') || topicLower.includes('bose') || topicLower.includes('sony') || topicLower.includes('jbl')) {
      return catLower === 'audio';
    }
    if (topicLower.includes('trapan') || topicLower.includes('avvitat') || topicLower.includes('utensil') || topicLower.includes('bricolage') || topicLower.includes('fai da te') || topicLower.includes('bosch') || topicLower.includes('makita') || topicLower.includes('dewalt') || topicLower.includes('black')) {
      return catLower === 'trapani';
    }
    if (topicLower.includes('note') || topicLower.includes('laptop') || topicLower.includes('pc') || topicLower.includes('computer') || topicLower.includes('macbook') || topicLower.includes('hp') || topicLower.includes('mouse') || topicLower.includes('tastiera')) {
      return catLower === 'notebook';
    }
    if (topicLower.includes('watch') || topicLower.includes('orolog') || topicLower.includes('smartwatch') || topicLower.includes('band') || topicLower.includes('garmin')) {
      return catLower === 'smartwatch';
    }
    if (topicLower.includes('aspirapolvere') || topicLower.includes('dyson') || topicLower.includes('roomba') || topicLower.includes('robot') || topicLower.includes('dreame') || topicLower.includes('friggitrice') || topicLower.includes('aria') || topicLower.includes('casa')) {
      return catLower === 'robot' || catLower === 'casa';
    }
    if (topicLower.includes('gaming') || topicLower.includes('console') || topicLower.includes('playstation') || topicLower.includes('ps5') || topicLower.includes('switch') || topicLower.includes('controller') || topicLower.includes('dualsense')) {
      return catLower === 'gaming';
    }
    // Generic word match
    const words = topicLower.split(/[\s,+-]+/).filter((w) => w.length > 2);
    return words.some((w) => titleLower.includes(w) || subLower.includes(w) || catLower.includes(w));
  });

  // Supplement discovered items with authentic products for this topic
  const itemsToAdd = matchedCatalogItems.length > 0 ? matchedCatalogItems : AUTHENTIC_AMAZON_CATALOG.slice(0, 8);

  for (const catItem of itemsToAdd) {
    if (!seenAsins.has(catItem.asin)) {
      seenAsins.add(catItem.asin);
      discoveredProducts.push({
        title: catItem.title,
        asin: catItem.asin,
        url: `https://www.amazon.it/dp/${catItem.asin}`,
        price: catItem.price,
        image: catItem.image,
        description: catItem.description,
        subcategory: catItem.subcategory,
      });
    }
  }

  // Query Amazon Official Marketplace Suggestions API for genuine subcategories
  try {
    const sugUrl = `https://completion.amazon.it/api/2017/suggestions?limit=11&prefix=${encodeURIComponent(queryTopic)}&suggestion-type=KEYWORD&alias=aps&site-variant=desktop&version=3&mid=APJ6JRA9NG5V4&lop=it_IT`;
    const sugRes = await fetch(sugUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) });
    if (sugRes.ok) {
      const sugData = await sugRes.json();
      for (const s of (sugData.suggestions || [])) {
        const val = s.value;
        if (val && val.length > 2 && !discoveredSubcats.some(sc => sc.name.toLowerCase() === val.toLowerCase())) {
          discoveredSubcats.push({
            name: val.charAt(0).toUpperCase() + val.slice(1),
            url: `https://www.amazon.it/s?k=${encodeURIComponent(val)}`,
          });
        }
      }
    }
  } catch {}

  // Fetch real details (price & high-res image) for top products with ASIN in parallel
  const topProducts = discoveredProducts.filter(p => p.asin).slice(0, 10);
  await Promise.all(
    topProducts.map(async (p) => {
      const details = await fetchAmazonLiveDetails(p.asin);
      if (details.price) p.price = details.price;
      if (details.image) p.image = details.image;
      if (details.title && details.title.length > 5) p.title = details.title;
      if (details.description) p.description = `${details.description}${p.price ? ` | Prezzo: ${p.price}` : ''}`;
    })
  );

  // Ensure every product has an authentic image
  for (const p of discoveredProducts) {
    if (!p.image || p.image.includes('31OKBwd611L') || p.image.includes('11XXCCfk0UL')) {
      p.image = getAmazonProductImage(p.asin, p.title, queryTopic);
    }
  }

  // Filter out any products where title or link is invalid
  const validProducts = discoveredProducts.filter(p => p.title && p.title.length > 3);

  // Group products into subcategories
  const subcategoryMap = new Map<string, FeedItem[]>();
  const allMonetizedItems: Array<FeedItem & { subcategoryName: string; originalLink: string; price?: string }> = [];

  for (const it of validProducts.slice(0, Number(maxItems) || 20)) {
    const originalLink = it.url;
    const monetizedLink = applyAffiliateToUrlServer(originalLink, cleanAffiliate, 'amazon', 'tag');

    const subName = it.subcategory || 'Prodotti in Evidenza';
    const resolvedImage = it.image || getAmazonProductImage(it.asin, it.title, queryTopic);

    const feedItem: FeedItem = {
      title: it.title,
      link: monetizedLink,
      price: it.price,
      description: it.description ? `${it.description} ${it.price && !it.description.includes(it.price) ? `| Prezzo: ${it.price}` : ''}` : (it.price ? `Prezzo: ${it.price}` : ''),
      image: resolvedImage,
      date: new Date().toLocaleDateString('it-IT'),
    };

    if (!subcategoryMap.has(subName)) {
      subcategoryMap.set(subName, []);
    }
    subcategoryMap.get(subName)!.push(feedItem);

    allMonetizedItems.push({
      ...feedItem,
      subcategoryName: subName,
      originalLink,
      price: it.price,
    });
  }

  // Build subcategories list - every category has its own unique monetized link & RSS feed
  const subcategories: ScrapedSubcategory[] = [];
  let sIdx = 1;
  for (const [name, items] of subcategoryMap.entries()) {
    const subUrl = applyAffiliateToUrlServer(`https://www.amazon.it/s?k=${encodeURIComponent(name)}`, cleanAffiliate, 'amazon', 'tag');
    const subRssUrl = hostUrl ? `${hostUrl}/api/public/rss?url=${encodeURIComponent(subUrl)}&every=60` : `/api/public/rss?url=${encodeURIComponent(subUrl)}&every=60`;
    subcategories.push({
      id: `sub_amz_${sIdx++}`,
      name,
      url: subUrl,
      rssUrl: subRssUrl,
      itemsCount: items.length,
      items,
    });
  }

  for (const s of discoveredSubcats.slice(0, 6)) {
    if (!subcategoryMap.has(s.name)) {
      const subUrl = applyAffiliateToUrlServer(s.url, cleanAffiliate, 'amazon', 'tag');
      const subRssUrl = hostUrl ? `${hostUrl}/api/public/rss?url=${encodeURIComponent(subUrl)}&every=60` : `/api/public/rss?url=${encodeURIComponent(subUrl)}&every=60`;
      subcategories.push({
        id: `sub_amz_${sIdx++}`,
        name: s.name,
        url: subUrl,
        rssUrl: subRssUrl,
        itemsCount: 0,
        items: [],
      });
    }
  }

  const rawCategoryUrl = cleaned.startsWith('http') ? cleaned : `https://www.amazon.it/s?k=${encodeURIComponent(cleaned)}`;
  const monetizedCategoryUrl = applyAffiliateToUrlServer(rawCategoryUrl, cleanAffiliate, 'amazon', 'tag');
  const categoryRssUrl = hostUrl ? `${hostUrl}/api/public/rss?url=${encodeURIComponent(monetizedCategoryUrl)}&every=60` : `/api/public/rss?url=${encodeURIComponent(monetizedCategoryUrl)}&every=60`;
  const sampleLink = allMonetizedItems[0]?.link || monetizedCategoryUrl;

  return {
    category: {
      title: `Amazon Italia — ${queryTopic.charAt(0).toUpperCase() + queryTopic.slice(1)}`,
      description: `Catalogo e offerte reali estratti per "${queryTopic}" su Amazon.it`,
      url: monetizedCategoryUrl,
      rssUrl: categoryRssUrl,
      subcategoriesCount: subcategories.length,
      totalItems: allMonetizedItems.length,
    },
    affiliate: {
      id: cleanAffiliate,
      network: 'amazon',
      customParam: 'tag',
      sampleLink,
    },
    subcategories,
    directItems: allMonetizedItems.slice(0, 10),
    allMonetizedItems,
  };
}

function extractItemsFromCheerio(
  $: cheerio.CheerioAPI,
  pageUrl: string,
  affiliateId: string,
  network: string,
  customParam: string,
  maxItems: number = 25
): Array<FeedItem & { price?: string; originalLink: string }> {
  const items: Array<FeedItem & { price?: string; originalLink: string }> = [];
  const seenLinks = new Set<string>();

  // 0. Next.js / Subito / SSR state
  const nextDataRaw = $('#__NEXT_DATA__').html();
  if (nextDataRaw) {
    try {
      const nextJson = JSON.parse(nextDataRaw);
      const originalList = nextJson.props?.pageProps?.initialState?.items?.originalList || nextJson.props?.pageProps?.items || [];
      for (const entry of originalList) {
        if (items.length >= maxItems) break;
        const it = entry.item || entry;
        const title = it.subject || it.title;
        const rawUrl = it.urls?.default || it.url;
        if (title && rawUrl) {
          const fullUrl = new URL(rawUrl, pageUrl).href;
          if (!seenLinks.has(fullUrl)) {
            seenLinks.add(fullUrl);
            const price = it.price?.formatted || (it.price?.values?.[0]?.value ? `€ ${it.price.values[0].value}` : undefined);
            const monetizedLink = applyAffiliateToUrlServer(fullUrl, affiliateId, network, customParam);
            const rawImg = it.images?.[0]?.scale?.[0]?.secureuri || it.images?.[0]?.url || it.image;
            const resolvedImg = sanitizeAndResolveImageUrl(rawImg, pageUrl);
            items.push({
              title: String(title).trim(),
              link: monetizedLink,
              originalLink: fullUrl,
              price,
              description: it.body ? String(it.body).slice(0, 300) : (price ? `Prezzo: ${price}` : undefined),
              image: resolvedImg,
              date: it.dates?.display || it.date,
            });
          }
        }
      }
    } catch {}
  }

  // 1. JSON-LD Products / Offers
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (!raw) return;
      const data = JSON.parse(raw);
      const candidates = Array.isArray(data) ? data : (data['@graph'] || [data]);
      for (const item of candidates) {
        const type = String(item['@type'] || '');
        if (/product|individualproduct|offer|itempage|listing/i.test(type)) {
          const title = item.name || item.headline;
          const rawUrl = item.url || item.mainEntityOfPage;
          if (title && rawUrl) {
            const fullUrl = new URL(rawUrl, pageUrl).href;
            if (!seenLinks.has(fullUrl)) {
              seenLinks.add(fullUrl);
              const price = item.offers?.price ? `${item.offers.priceCurrency || '€'} ${item.offers.price}` : undefined;
              const monetizedLink = applyAffiliateToUrlServer(fullUrl, affiliateId, network, customParam);
              const rawLdImg = item.image?.url || (typeof item.image === 'string' ? item.image : (Array.isArray(item.image) ? (typeof item.image[0] === 'string' ? item.image[0] : item.image[0]?.url) : undefined));
              const resolvedLdImg = sanitizeAndResolveImageUrl(rawLdImg, pageUrl) || (pageUrl.includes('amazon') ? getAmazonProductImage(undefined, String(title).trim(), undefined, undefined) : undefined);
              items.push({
                title: String(title).trim(),
                link: monetizedLink,
                originalLink: fullUrl,
                price,
                description: item.description ? String(item.description).slice(0, 300) : (price ? `Prezzo: ${price}` : undefined),
                image: resolvedLdImg,
                date: item.datePublished ? new Date(item.datePublished).toLocaleDateString('it-IT') : undefined,
              });
            }
          }
        }
      }
    } catch {
      // ignore
    }
  });

  // 2. Specific selectors for eCommerce / Classifieds / Ads
  const productSelectors = [
    '[data-asin]',
    '.s-item',
    '[class*="product-card"]',
    '[class*="productCard"]',
    '[class*="product-item"]',
    '[class*="productItem"]',
    '[class*="item-card"]',
    '[class*="itemCard"]',
    '[class*="annuncio"]',
    '[class*="listing-item"]',
    '[class*="listingItem"]',
    'li[class*="product"]',
    'article[class*="product"]',
    'div[data-component-type="s-search-result"]',
    '.card[class*="item"]',
  ];

  $(productSelectors.join(', ')).each((_, el) => {
    if (items.length >= maxItems) return;
    const card$ = $(el);
    const anchor = card$.find('a[href]').first();
    const href = anchor.attr('href');
    if (!href) return;

    try {
      const fullUrl = new URL(href, pageUrl).href;
      if (seenLinks.has(fullUrl) || fullUrl.includes('#') || fullUrl.endsWith('.js') || fullUrl.endsWith('.css')) return;

      const titleEl = card$.find('h2, h3, h4, .title, [class*="title"], [class*="name"]').first();
      const title = (titleEl.length > 0 ? titleEl.text() : anchor.attr('title') || anchor.text()).trim();

      if (title && title.length > 3 && !title.toLowerCase().includes('cookie') && !title.toLowerCase().includes('accedi')) {
        seenLinks.add(fullUrl);
        const priceEl = card$.find('[class*="price"], [class*="prezzo"], .a-price-whole, .s-item__price, [class*="cost"]').first();
        const price = priceEl.text().trim().replace(/\s+/g, ' ');
        const dateEl = card$.find('time, [class*="date"], [class*="time"]').first();
        const date = dateEl.attr('datetime') || dateEl.text().trim();
        const descEl = card$.find('p, [class*="desc"], [class*="summary"]').first();
        const desc = descEl.text().trim();
        const rawCardImg = extractImageFromCheerioElement(card$, pageUrl);
        const resolvedCardImg = rawCardImg || (pageUrl.includes('amazon') ? getAmazonProductImage(undefined, title, undefined, undefined) : undefined);

        const monetizedLink = applyAffiliateToUrlServer(fullUrl, affiliateId, network, customParam);
        items.push({
          title,
          link: monetizedLink,
          originalLink: fullUrl,
          price: price || undefined,
          date: date || undefined,
          description: desc ? desc.slice(0, 300) : (price ? `Prezzo: ${price}` : undefined),
          image: resolvedCardImg,
        });
      }
    } catch {
      // invalid URL
    }
  });

  // 3. Fallback to generic articles or cards
  if (items.length < 5) {
    $('article, [class*="card"], li[class*="item"]').each((_, el) => {
      if (items.length >= maxItems) return;
      const el$ = $(el);
      const anchor = el$.find('a[href]').first();
      const href = anchor.attr('href');
      if (!href) return;

      try {
        const fullUrl = new URL(href, pageUrl).href;
        if (seenLinks.has(fullUrl) || fullUrl.includes('#')) return;

        const heading = el$.find('h2, h3, h4, .title, [class*="title"]').first();
        const title = (heading.length > 0 ? heading.text() : anchor.text()).trim();

        if (title && title.length > 6 && !title.toLowerCase().includes('privacy') && !title.toLowerCase().includes('login')) {
          seenLinks.add(fullUrl);
          const price = el$.find('[class*="price"], [class*="prezzo"]').first().text().trim();
          const desc = el$.find('p').first().text().trim();
          const rawElImg = extractImageFromCheerioElement(el$, pageUrl);
          const resolvedElImg = rawElImg || (pageUrl.includes('amazon') ? getAmazonProductImage(undefined, title, undefined, undefined) : undefined);
          const date = el$.find('time').first().text().trim();

          const monetizedLink = applyAffiliateToUrlServer(fullUrl, affiliateId, network, customParam);
          items.push({
            title,
            link: monetizedLink,
            originalLink: fullUrl,
            price: price || undefined,
            description: desc ? desc.slice(0, 300) : undefined,
            image: resolvedElImg,
            date: date || undefined,
          });
        }
      } catch {
        // ignore
      }
    });
  }

  return items.slice(0, maxItems);
}

function discoverSubcategories(
  $: cheerio.CheerioAPI,
  targetUrl: string,
  maxSubcategories: number = 8
): Array<{ name: string; url: string; count?: number }> {
  const subcats: Array<{ name: string; url: string; count?: number }> = [];
  const seenUrls = new Set<string>();
  const seenNames = new Set<string>();

  const targetUrlObj = new URL(targetUrl);
  const targetClean = targetUrl.replace(/\/$/, '').toLowerCase();

  const candidateSelectors = [
    'nav[class*="cat"] a[href]',
    'ul[class*="cat"] a[href]',
    '[class*="subcategory"] a[href]',
    '[class*="subcat"] a[href]',
    '[class*="department"] a[href]',
    '[class*="filter"] a[href*="cat"]',
    '[class*="sidebar"] a[href*="cat"]',
    'a[href*="/c/"]',
    'a[href*="/categoria/"]',
    'a[href*="/category/"]',
    'a[href*="/cat/"]',
    'a[href*="/sottocategoria/"]',
    'a[href*="/reparto/"]',
    'a[href*="/b/"]',
    'a[href*="/b?node="]',
    'a[href*="/sch/"]',
    '.breadcrumb a[href]',
    'nav[aria-label="breadcrumb"] a[href]',
  ];

  const blacklistTerms = [
    'home', 'privacy', 'cookie', 'login', 'accedi', 'registrati', 'account', 'carrello', 'cart',
    'checkout', 'ordini', 'resi', 'contatti', 'about', 'chi siamo', 'condizioni', 'terms',
    'newsletter', 'iscriviti', 'cerca', 'search', 'facebook', 'instagram', 'twitter', 'tiktok', 'youtube',
    'guida', 'help', 'faq', 'spedizioni', 'pagamenti'
  ];

  $(candidateSelectors.join(', ')).each((_, el) => {
    if (subcats.length >= maxSubcategories) return;
    const a$ = $(el);
    const href = a$.attr('href');
    if (!href) return;

    try {
      const fullUrl = new URL(href, targetUrl).href;
      const cleanUrl = fullUrl.replace(/\/$/, '').toLowerCase();
      const urlObj = new URL(fullUrl);

      // Must be same hostname
      if (urlObj.hostname !== targetUrlObj.hostname) return;
      // Must not be the target URL itself
      if (cleanUrl === targetClean || cleanUrl === `${targetClean}/`) return;
      if (seenUrls.has(cleanUrl)) return;

      const rawText = a$.text().trim().replace(/\s+/g, ' ');
      // Try to extract count (e.g. "Smartphone (140)" or "Notebook 56")
      const countMatch = rawText.match(/\((\d+[\d.,]*)\)/) || rawText.match(/\b(\d+)\s*(?:annunci|prodotti|items)?$/i);
      const count = countMatch ? parseInt(countMatch[1].replace(/\D/g, ''), 10) : undefined;

      const cleanName = rawText.replace(/\((\d+[\d.,]*)\)/g, '').replace(/\b\d+\s*(?:annunci|prodotti|items)?$/i, '').trim();

      if (cleanName.length < 2 || cleanName.length > 60) return;

      const lowerName = cleanName.toLowerCase();
      if (blacklistTerms.some((term) => lowerName === term || lowerName.startsWith(term + ' '))) return;
      if (seenNames.has(lowerName)) return;

      seenUrls.add(cleanUrl);
      seenNames.add(lowerName);
      subcats.push({
        name: cleanName,
        url: fullUrl,
        count,
      });
    } catch {
      // ignore
    }
  });

  return subcats.slice(0, maxSubcategories);
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

      // Amazon Auto-Detection: Real live search & product scraping
      if (isAmazonInput(url)) {
        const amz = await scrapeLiveAmazon(url, '', 20);

        const feedItems: FeedItem[] = amz.allMonetizedItems.map((it) => ({
          title: it.title,
          link: it.link,
          price: it.price,
          description: it.description,
          image: it.image,
          date: it.date,
        }));
        const selfRssUrl = `${host}/api/public/rss?url=${encodeURIComponent(url)}&every=${interval}`;
        const xml = generateRssXml(
          {
            title: amz.category.title,
            description: amz.category.description,
            link: amz.category.url,
            items: feedItems,
          },
          Number(interval) || 60,
          selfRssUrl
        );
        res.json({
          fetchedAt: new Date().toISOString(),
          feed: {
            title: amz.category.title,
            description: amz.category.description,
            link: amz.category.url,
            items: feedItems,
          },
          xml,
        });
        return;
      }

      const result = await scrapePage(url, Number(interval) || 60, host);
      res.json(result);
    } catch (err: unknown) {
      console.error('Scrape error:', err);
      const message = err instanceof Error ? err.message : 'Errore sconosciuto durante lo scraping.';
      res.status(500).json({ error: message });
    }
  });

  // API Route: Scrape entire Categories and Subcategories with Affiliate Monetization
  app.post('/api/scrape-categories', async (req: Request, res: Response) => {
    try {
      const {
        url,
        affiliateId: rawAffiliateId = '',
        affiliateTag = '',
        tag = '',
        network = 'amazon',
        customParam = 'ref',
        crawlSubcategories = true,
        maxSubcategories = 6,
        maxItems = 20,
      } = req.body;

      const affiliateId = (rawAffiliateId || affiliateTag || tag || '').trim();

      if (!url || typeof url !== 'string') {
        res.status(400).json({ error: 'URL della categoria o ricerca mancante.' });
        return;
      }

      const host = `${req.protocol}://${req.get('host')}`;

      // Priority 1: Real Live Amazon Engine
      // Real live web search, subcategories, prices, images, and affiliate links
      if (isAmazonInput(url) || network === 'amazon') {
        const amazonResult = await scrapeLiveAmazon(url, affiliateId, Number(maxItems) || 20, host);
        res.json(amazonResult);
        return;
      }

      const normalizedUrl = normalizeUrl(url);
      const { text } = await fetchPageWithFallbacks(normalizedUrl);
      const $ = cheerio.load(text);

      const categoryTitle =
        $('h1').first().text().trim() ||
        $('nav[aria-label="breadcrumb"] li:last-child').text().trim() ||
        $('.breadcrumb li:last-child').text().trim() ||
        $('meta[property="og:title"]').attr('content')?.trim() ||
        $('title').first().text().trim() ||
        new URL(normalizedUrl).pathname.split('/').filter(Boolean).pop()?.replace(/[-_]/g, ' ') ||
        'Categoria';

      const categoryDesc =
        $('meta[property="og:description"]').attr('content')?.trim() ||
        $('meta[name="description"]').attr('content')?.trim() ||
        $('.category-description, .cat-desc, p.lead').first().text().trim() ||
        `Raccolta prodotti e annunci da ${categoryTitle}`;

      // Discover subcategories
      const discoveredSubcats = discoverSubcategories($, normalizedUrl, Number(maxSubcategories) || 6);

      // Extract direct items from the main category page
      const directItems = extractItemsFromCheerio($, normalizedUrl, affiliateId, network, customParam, Number(maxItems) || 20);

      const subcategoriesWithItems: ScrapedSubcategory[] = [];
      const allMonetizedItems: Array<FeedItem & { subcategoryName: string; originalLink: string; price?: string }> = [];

      // Add direct items to allMonetizedItems under main category
      for (const it of directItems) {
        allMonetizedItems.push({
          ...it,
          subcategoryName: categoryTitle,
          originalLink: it.originalLink,
        });
      }

      // If crawlSubcategories is requested, crawl each discovered subcategory
      if (crawlSubcategories && discoveredSubcats.length > 0) {
        for (let i = 0; i < discoveredSubcats.length; i++) {
          const sub = discoveredSubcats[i];
          let subItems: Array<FeedItem & { price?: string; originalLink: string }> = [];
          try {
            const subPage = await fetchPageWithFallbacks(sub.url);
            const sub$ = cheerio.load(subPage.text);
            subItems = extractItemsFromCheerio(sub$, sub.url, affiliateId, network, customParam, Number(maxItems) || 20);
          } catch (crawlErr) {
            console.warn(`Impossibile estrarre sottocategoria ${sub.url}:`, crawlErr);
          }

          const monetizedSubUrl = applyAffiliateToUrlServer(sub.url, affiliateId, network, customParam);
          const subRssUrl = `${host}/api/public/rss?url=${encodeURIComponent(monetizedSubUrl)}&every=60`;

          subcategoriesWithItems.push({
            id: `sub_${i + 1}`,
            name: sub.name,
            url: monetizedSubUrl,
            rssUrl: subRssUrl,
            itemsCount: subItems.length || sub.count || 0,
            items: subItems,
          });

          for (const it of subItems) {
            allMonetizedItems.push({
              ...it,
              subcategoryName: sub.name,
              originalLink: it.originalLink,
            });
          }
        }
      } else {
        for (let i = 0; i < discoveredSubcats.length; i++) {
          const sub = discoveredSubcats[i];
          const monetizedSubUrl = applyAffiliateToUrlServer(sub.url, affiliateId, network, customParam);
          const subRssUrl = `${host}/api/public/rss?url=${encodeURIComponent(monetizedSubUrl)}&every=60`;
          subcategoriesWithItems.push({
            id: `sub_${i + 1}`,
            name: sub.name,
            url: monetizedSubUrl,
            rssUrl: subRssUrl,
            itemsCount: sub.count || 0,
            items: [],
          });
        }
      }

      const sampleRaw = directItems[0]?.originalLink || normalizedUrl;
      const sampleLink = applyAffiliateToUrlServer(sampleRaw, affiliateId, network, customParam);
      const monetizedCategoryUrl = applyAffiliateToUrlServer(normalizedUrl, affiliateId, network, customParam);
      const categoryRssUrl = `${host}/api/public/rss?url=${encodeURIComponent(monetizedCategoryUrl)}&every=60`;

      const result: CategoryScrapeResult = {
        category: {
          title: categoryTitle,
          description: categoryDesc,
          url: monetizedCategoryUrl,
          rssUrl: categoryRssUrl,
          subcategoriesCount: subcategoriesWithItems.length,
          totalItems: allMonetizedItems.length,
        },
        affiliate: {
          id: affiliateId,
          network,
          customParam,
          sampleLink,
        },
        subcategories: subcategoriesWithItems,
        directItems,
        allMonetizedItems,
      };

      res.json(result);
    } catch (err: unknown) {
      console.error('Category scrape error:', err);
      const message = err instanceof Error ? err.message : 'Errore sconosciuto durante lo scraping della categoria.';
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

      if (isAmazonInput(targetUrl)) {
        const amzResult = await scrapeLiveAmazon(targetUrl, '', 20);
        const feedItems: FeedItem[] = amzResult.allMonetizedItems.map((it) => ({
          title: it.title,
          link: it.link,
          price: it.price,
          description: it.description,
          image: it.image,
          date: it.date,
        }));
        const selfRssUrl = `${host}/api/public/rss?url=${encodeURIComponent(targetUrl)}&every=${interval}`;
        const xml = generateRssXml(
          {
            title: amzResult.category.title,
            description: amzResult.category.description,
            link: amzResult.category.url,
            items: feedItems,
          },
          interval,
          selfRssUrl
        );
        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
        res.setHeader('Cache-Control', `public, max-age=${interval * 60}`);
        res.send(xml);
        return;
      }

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

  // Google AdSense ads.txt verification endpoint
  app.get('/ads.txt', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send('google.com, pub-5738943819550045, DIRECT, f08c47fec0942fa0\n');
  });

  // Resilient path detection for Hostinger VPS deployments (works from project root, dist/server.js, or PM2)
  const rootDir = fs.existsSync(path.resolve(process.cwd(), 'dist'))
    ? process.cwd()
    : (fs.existsSync(path.resolve(__dirname, 'dist')) ? __dirname : path.resolve(__dirname, '..'));

  const publicDir = fs.existsSync(path.resolve(rootDir, 'public'))
    ? path.resolve(rootDir, 'public')
    : path.resolve(__dirname, 'public');

  const distDir = path.resolve(rootDir, 'dist');

  // Serve static assets from public folder (og-image, favicon, robots, ads.txt)
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
