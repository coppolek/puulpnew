import { ManualArticle } from './firebase';

/**
 * High-resolution 1200x630 raster JPEG fallback images by topic/category.
 * Social platforms (WhatsApp, Facebook, X, LinkedIn, Telegram) strictly require
 * JPG/PNG/WebP images and reject .svg files.
 */
const EDITORIAL_FALLBACK_IMAGES: Record<string, string> = {
  tech: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&h=630&fit=crop&q=85',
  ai: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&h=630&fit=crop&q=85',
  finanza: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&h=630&fit=crop&q=85',
  sport: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200&h=630&fit=crop&q=85',
  scienza: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=1200&h=630&fit=crop&q=85',
  shopping: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200&h=630&fit=crop&q=85',
  cultura: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?w=1200&h=630&fit=crop&q=85',
  default: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=1200&h=630&fit=crop&q=85',
};

/**
 * Returns a valid 1200x630 JPEG fallback image based on title/category keywords
 */
export function getFallbackSocialImage(title?: string, category?: string): string {
  const combined = `${title || ''} ${category || ''}`.toLowerCase();
  if (/intelligenza artificiale|ollama|llm|gpt|gemini|openai|neural|machine learning/.test(combined)) {
    return EDITORIAL_FALLBACK_IMAGES.ai;
  }
  if (/tech|software|svilupp|codice|cloud|cyber|smartphone|apple|android|computer|hardware/.test(combined)) {
    return EDITORIAL_FALLBACK_IMAGES.tech;
  }
  if (/finanz|mercat|borsa|econom|pil|inflazion|tassi|cripto|bitcoin|investiment/.test(combined)) {
    return EDITORIAL_FALLBACK_IMAGES.finanza;
  }
  if (/sport|calcio|serie a|champions|f1|motogp|tennis|olimpiad/.test(combined)) {
    return EDITORIAL_FALLBACK_IMAGES.sport;
  }
  if (/scienz|spazio|nasa|esa|clima|ambiente|medicin|salute|ricerca/.test(combined)) {
    return EDITORIAL_FALLBACK_IMAGES.scienza;
  }
  if (/shop|offert|amazon|scont|prezz|affiliat|prodott/.test(combined)) {
    return EDITORIAL_FALLBACK_IMAGES.shopping;
  }
  if (/cultur|cinema|film|libr|music|arte|spettacol/.test(combined)) {
    return EDITORIAL_FALLBACK_IMAGES.cultura;
  }
  return EDITORIAL_FALLBACK_IMAGES.default;
}

/**
 * Resolves a guaranteed raster social preview image URL (never .svg, never empty).
 */
export function resolveSocialImage(
  candidateImage?: string,
  title?: string,
  category?: string
): string {
  const trimmed = (candidateImage || '').trim();
  if (
    trimmed &&
    /^https?:\/\//i.test(trimmed) &&
    !trimmed.toLowerCase().endsWith('.svg') &&
    !trimmed.includes('/og-image.svg')
  ) {
    return trimmed;
  }
  return getFallbackSocialImage(title, category);
}

/**
 * Builds the server-side proxied OpenGraph image URL (/api/og-image?img=...)
 * so social crawlers (WhatsApp, Facebook, X, LinkedIn, Telegram) always receive
 * a valid 1200x630 image/jpeg from our own domain without hotlink blocks.
 */
export function buildProxiedOgImageUrl(
  rawImage?: string,
  title?: string,
  category?: string
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://puulp.it';
  const resolved = resolveSocialImage(rawImage, title, category);
  const url = new URL('/api/og-image', origin);
  url.searchParams.set('img', resolved);
  if (category) {
    url.searchParams.set('cat', category.slice(0, 32));
  }
  return url.toString();
}

/**
 * Synchronizes document <head> OpenGraph & Twitter Card meta tags on the client
 */
export function syncDocumentSocialMeta(params: {
  title: string;
  description?: string;
  image?: string;
  url?: string;
  category?: string;
  type?: 'website' | 'article';
}) {
  if (typeof document === 'undefined') return;
  const resolvedImg = resolveSocialImage(params.image, params.title, params.category);
  const proxiedImg = buildProxiedOgImageUrl(resolvedImg, params.title, params.category);
  const cleanTitle = params.title.includes('puulp.it') ? params.title : `${params.title} — puulp.it`;
  const cleanDesc =
    (params.description || '').trim() ||
    `Leggi "${params.title}" e scopri tutti gli approfondimenti in tempo reale su puulp.it.`;

  const setMeta = (selector: string, attrName: 'property' | 'name', attrVal: string, content: string) => {
    let el = document.querySelector(selector) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attrName, attrVal);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  document.title = cleanTitle;
  setMeta('meta[name="description"]', 'name', 'description', cleanDesc);
  setMeta('meta[property="og:type"]', 'property', 'og:type', params.type || 'article');
  setMeta('meta[property="og:title"]', 'property', 'og:title', cleanTitle);
  setMeta('meta[property="og:description"]', 'property', 'og:description', cleanDesc);
  setMeta('meta[property="og:image"]', 'property', 'og:image', proxiedImg);
  setMeta('meta[property="og:image:secure_url"]', 'property', 'og:image:secure_url', proxiedImg);
  setMeta('meta[property="og:image:type"]', 'property', 'og:image:type', 'image/jpeg');
  setMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', cleanTitle);
  if (params.url) {
    setMeta('meta[property="og:url"]', 'property', 'og:url', params.url);
  }
  setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', cleanTitle);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', cleanDesc);
  setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', proxiedImg);
}

/**
 * Simple deterministic string hash in base36 for short unique article identifiers
 */
export function shortHash(input: string): string {
  let hash = 0;
  const str = (input || '').trim();
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).slice(0, 7);
}

/**
 * Converts a string into a clean URL-friendly slug
 */
export function slugifyText(text: string, maxLength = 48): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

/**
 * Returns a deterministic, unique slug for ANY article (Manual Editorial or RSS Feed item)
 * so that it can be opened directly inside puulp.it via /?p=...&art=...
 */
export function getArticleSiteSlug(item: {
  id?: string;
  slug?: string;
  title?: string;
  link?: string;
  rawArticle?: ManualArticle;
}): string {
  if (item.rawArticle?.slug) {
    return item.rawArticle.slug;
  }
  if (item.slug && item.slug.trim()) {
    return item.slug.trim();
  }
  const baseTitle = slugifyText(item.title || 'articolo', 44) || 'articolo';
  const uniqueSeed = (item.link || item.id || item.title || '').trim();
  if (!uniqueSeed) return baseTitle;
  return `${baseTitle}-${shortHash(uniqueSeed)}`;
}

/**
 * Builds an internal puulp.it URL that ALWAYS points to our site (window.location.origin)
 * and NEVER to the external news source.
 * Also embeds `img` and `t` when available so social crawlers (WhatsApp, Facebook, X, LinkedIn, Telegram)
 * immediately render the exact article image and title in the social post preview.
 */
export function buildSiteArticleUrl(
  item: {
    id?: string;
    slug?: string;
    pageId?: string;
    title?: string;
    description?: string;
    image?: string;
    link?: string;
    category?: string;
    rawArticle?: ManualArticle;
  },
  fallbackPageSlugOrId?: string
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://puulp.it';
  const pageParam =
    item.rawArticle?.pageId ||
    item.pageId ||
    fallbackPageSlugOrId ||
    '';
  const artSlug = getArticleSiteSlug(item);
  const rawImg = item.image || item.rawArticle?.image;
  const resolvedImg = resolveSocialImage(rawImg, item.title, item.category);

  const url = new URL('/', origin);
  if (pageParam) {
    url.searchParams.set('p', pageParam);
  }
  if (artSlug) {
    url.searchParams.set('art', artSlug);
  }
  if (item.title) {
    url.searchParams.set('t', item.title.trim().slice(0, 95));
  }
  if (resolvedImg) {
    url.searchParams.set('img', resolvedImg);
  }
  return url.toString();
}

/**
 * Builds an internal puulp.it URL for a thematic page/category
 */
export function buildSitePageUrl(pageSlugOrId?: string, pageTitle?: string, pageImage?: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://puulp.it';
  const url = new URL('/', origin);
  if (pageSlugOrId) {
    url.searchParams.set('p', pageSlugOrId);
  }
  if (pageTitle) {
    url.searchParams.set('t', pageTitle.trim().slice(0, 90));
  }
  const resolvedImg = resolveSocialImage(pageImage, pageTitle, pageSlugOrId);
  if (resolvedImg) {
    url.searchParams.set('img', resolvedImg);
  }
  return url.toString();
}

/**
 * Guarantees that any URL passed to social sharing is an internal site URL (window.location.origin)
 * and NEVER an external source URL (e.g. ansa.it, wired.it, amazon.it), while preserving/attaching
 * the `img` and `t` parameters so social post previews always show the article image.
 */
export function ensureInternalSiteUrl(
  candidateUrl: string,
  context?: {
    title?: string;
    description?: string;
    image?: string;
    category?: string;
    pageSlugOrId?: string;
    articleSlug?: string;
  }
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://puulp.it';
  const resolvedImg = resolveSocialImage(context?.image, context?.title, context?.category);

  try {
    const parsed = new URL(candidateUrl, origin);
    if (parsed.origin === origin) {
      if (
        !parsed.searchParams.has('art') &&
        !parsed.searchParams.has('p') &&
        !parsed.pathname.startsWith('/share/')
      ) {
        if (context?.pageSlugOrId) parsed.searchParams.set('p', context.pageSlugOrId);
        if (context?.articleSlug) parsed.searchParams.set('art', context.articleSlug);
      }
      if (context?.title && !parsed.searchParams.has('t')) {
        parsed.searchParams.set('t', context.title.trim().slice(0, 95));
      }
      if (resolvedImg) {
        parsed.searchParams.set('img', resolvedImg);
      }
      return parsed.toString();
    }
  } catch {
    // Fallback below
  }

  return buildSiteArticleUrl(
    {
      slug: context?.articleSlug,
      title: context?.title || 'articolo',
      image: resolvedImg,
      category: context?.category,
      link: candidateUrl,
      pageId: context?.pageSlugOrId,
    },
    context?.pageSlugOrId
  );
}

/**
 * Checks if a candidate article matches the `?art=` query parameter from the URL
 */
export function matchesArticleParam(
  targetArtParam: string,
  item: {
    id?: string;
    slug?: string;
    title?: string;
    link?: string;
    rawArticle?: ManualArticle;
  }
): boolean {
  if (!targetArtParam) return false;
  const cleanTarget = targetArtParam.trim().toLowerCase();

  if (item.slug && item.slug.trim().toLowerCase() === cleanTarget) return true;
  if (item.id && item.id.trim().toLowerCase() === cleanTarget) return true;
  if (item.rawArticle?.slug && item.rawArticle.slug.trim().toLowerCase() === cleanTarget) return true;
  if (item.rawArticle?.id && item.rawArticle.id.trim().toLowerCase() === cleanTarget) return true;

  const generatedSlug = getArticleSiteSlug(item).toLowerCase();
  if (generatedSlug === cleanTarget) return true;

  const titleOnlySlug = slugifyText(item.title || '', 44).toLowerCase();
  if (titleOnlySlug && titleOnlySlug.length > 5 && cleanTarget.startsWith(titleOnlySlug)) return true;

  if (item.link && item.link.trim().toLowerCase() === cleanTarget) return true;

  return false;
}
