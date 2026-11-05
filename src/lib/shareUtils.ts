import { ManualArticle, SocialShareKit } from './firebase';

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
 * When visited, the site opens on the right category page and pops up the article reader.
 */
export function buildSiteArticleUrl(
  item: {
    id?: string;
    slug?: string;
    pageId?: string;
    title?: string;
    link?: string;
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

  const url = new URL('/', origin);
  if (pageParam) {
    url.searchParams.set('p', pageParam);
  }
  if (artSlug) {
    url.searchParams.set('art', artSlug);
  }
  return url.toString();
}

/**
 * Builds an internal puulp.it URL for a thematic page/category
 */
export function buildSitePageUrl(pageSlugOrId?: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://puulp.it';
  const url = new URL('/', origin);
  if (pageSlugOrId) {
    url.searchParams.set('p', pageSlugOrId);
  }
  return url.toString();
}

/**
 * Guarantees that any URL passed to social sharing is an internal site URL (window.location.origin)
 * and NEVER an external source URL (e.g. ansa.it, wired.it, amazon.it).
 */
export function ensureInternalSiteUrl(
  candidateUrl: string,
  context?: {
    title?: string;
    pageSlugOrId?: string;
    articleSlug?: string;
  }
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://puulp.it';

  try {
    const parsed = new URL(candidateUrl, origin);
    // If it already points to our site origin, keep it (and ensure it has at least ?p= or ?art= if available)
    if (parsed.origin === origin) {
      if (
        !parsed.searchParams.has('art') &&
        !parsed.searchParams.has('p') &&
        !parsed.pathname.startsWith('/share/')
      ) {
        if (context?.pageSlugOrId) parsed.searchParams.set('p', context.pageSlugOrId);
        if (context?.articleSlug) parsed.searchParams.set('art', context.articleSlug);
      }
      return parsed.toString();
    }
  } catch {
    // Fallback below
  }

  // Candidate URL was an external source link! Convert it to an internal site URL:
  return buildSiteArticleUrl(
    {
      slug: context?.articleSlug,
      title: context?.title || 'articolo',
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
