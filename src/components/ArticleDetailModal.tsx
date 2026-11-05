import React, { useEffect, useState } from 'react';
import { ManualArticle, SocialShareKit } from '../lib/firebase';
import { buildSiteArticleUrl, getArticleSiteSlug } from '../lib/shareUtils';
import { ExternalLink, Calendar, User, Clock, Share2, Edit3, Trash2, Sparkles, Loader2, BookOpen, Check, Copy } from 'lucide-react';
import { FormattedArticleContent } from './FormattedArticleContent.tsx';
import { AdSenseBanner } from './AdSenseBanner.tsx';
import { ShareData } from './ShareModal.tsx';

export interface ArticleDetailItem {
  id?: string;
  title: string;
  slug?: string;
  pageId?: string;
  category?: string;
  feedTitle?: string;
  author?: string;
  date?: string;
  createdAt?: string;
  updatedAt?: string;
  description?: string;
  content?: string;
  image?: string;
  link?: string;
  price?: string;
  isManual?: boolean;
  focusKeyword?: string;
  metaTitle?: string;
  metaDescription?: string;
  schemaType?: 'NewsArticle' | 'BlogPosting' | 'Product';
  rawArticle?: ManualArticle;
  socialShare?: SocialShareKit;
}

interface ArticleDetailModalProps {
  article: ArticleDetailItem | null;
  activePageSlugOrId?: string;
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  adminMode?: boolean;
  onEdit?: (article: ManualArticle) => void;
  onDelete?: (articleId: string) => void;
  onShare?: (data: ShareData) => void;
  onPrevArticle?: () => void;
  onNextArticle?: () => void;
  hasPrevArticle?: boolean;
  hasNextArticle?: boolean;
  currentIndex?: number;
  totalArticles?: number;
}

export function ArticleDetailModal({
  article,
  activePageSlugOrId,
  isOpen,
  onClose,
  isAdmin,
  adminMode,
  onEdit,
  onDelete,
  onShare,
  onPrevArticle,
  onNextArticle,
  hasPrevArticle,
  hasNextArticle,
  currentIndex,
  totalArticles,
}: ArticleDetailModalProps) {
  const [fullContent, setFullContent] = useState<string>('');
  const [loadingFullContent, setLoadingFullContent] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // Load / fetch content whenever active article changes
  useEffect(() => {
    if (!article || !isOpen) {
      setFullContent('');
      setLoadingFullContent(false);
      return;
    }

    if (article.content) {
      setFullContent(article.content);
      setLoadingFullContent(false);
      return;
    }

    // If it's a feed article with an external link, try to load full readable body
    if (!article.isManual && article.link && article.link.startsWith('http')) {
      setLoadingFullContent(true);
      let isCancelled = false;

      fetch(`/api/article-content?url=${encodeURIComponent(article.link)}`)
        .then((res) => (res.ok ? res.json() : Promise.reject('Fetch error')))
        .then((data) => {
          if (!isCancelled && data && data.content && data.content.trim().length > 50) {
            setFullContent(data.content);
          }
        })
        .catch(() => {
          // Graceful fallback to description
        })
        .finally(() => {
          if (!isCancelled) setLoadingFullContent(false);
        });

      return () => {
        isCancelled = true;
      };
    } else {
      setFullContent('');
      setLoadingFullContent(false);
    }
  }, [article, isOpen]);

  // Handle keyboard shortcuts (Escape to close, ArrowLeft for previous, ArrowRight for next/older)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && hasPrevArticle && onPrevArticle) {
        onPrevArticle();
      } else if (e.key === 'ArrowRight' && hasNextArticle && onNextArticle) {
        onNextArticle();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, hasPrevArticle, hasNextArticle, onPrevArticle, onNextArticle]);

  // SEO, URL sync, and document head update
  useEffect(() => {
    if (!article || !isOpen) return;

    const prevTitle = document.title;
    const effectiveTitle = article.metaTitle || article.title;
    document.title = `${effectiveTitle} — puulp.it`;

    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc ? metaDesc.getAttribute('content') : null;
    if (metaDesc && (article.metaDescription || article.description)) {
      metaDesc.setAttribute('content', article.metaDescription || article.description || '');
    }

    const siteArticleUrl = buildSiteArticleUrl(article, article.pageId || activePageSlugOrId);

    // Sync browser address bar with ?art=... so even copying from the browser bar shares the site!
    try {
      const artSlug = getArticleSiteSlug(article);
      const currentBrowserUrl = new URL(window.location.href);
      if (artSlug && currentBrowserUrl.searchParams.get('art') !== artSlug) {
        currentBrowserUrl.searchParams.set('art', artSlug);
        window.history.replaceState({}, '', currentBrowserUrl.toString());
      }
    } catch {
      // ignore
    }

    // Dynamic Schema.org JSON-LD injection
    const scriptId = 'article-jsonld-schema';
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = scriptId;
      scriptEl.type = 'application/ld+json';
      document.head.appendChild(scriptEl);
    }

    const schemaData = {
      '@context': 'https://schema.org',
      '@type': article.schemaType || 'NewsArticle',
      headline: article.title,
      description: article.metaDescription || article.description,
      image: article.image || undefined,
      datePublished: article.createdAt || article.date || new Date().toISOString(),
      dateModified: article.updatedAt || article.createdAt || new Date().toISOString(),
      author: {
        '@type': 'Person',
        name: article.author || article.feedTitle || 'Redazione puulp.it',
      },
      publisher: {
        '@type': 'Organization',
        name: 'puulp.it',
        url: window.location.origin,
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': siteArticleUrl,
      },
      articleSection: article.category,
      keywords: article.focusKeyword || undefined,
    };
    scriptEl.textContent = JSON.stringify(schemaData);

    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc) metaDesc.setAttribute('content', prevDesc);
      if (scriptEl && scriptEl.parentElement) {
        scriptEl.parentElement.removeChild(scriptEl);
      }
    };
  }, [article, isOpen, activePageSlugOrId]);

  if (!isOpen || !article) return null;

  const fontFraunces = { fontFamily: 'Fraunces, Georgia, serif' };

  // CRITICAL: Share URL ALWAYS points to our site (puulp.it) and NEVER to the external source!
  const shareUrl = buildSiteArticleUrl(article, article.pageId || activePageSlugOrId);
  const articleSiteSlug = getArticleSiteSlug(article);

  const textToCount = fullContent || article.content || article.description || '';
  const readingTimeMinutes = Math.max(1, Math.ceil(textToCount.split(/\s+/).length / 180));
  const isAffiliate = Boolean(article.link && /tag=|campid=|awinaffid=|aff=|ref=|partner=|affiliate/i.test(article.link));
  const displaySource = article.feedTitle || article.category || (article.isManual ? 'Editoriale puulp.it' : 'Canale puulp.it');

  const displayDate = article.date
    ? article.date
    : article.createdAt
    ? new Date(article.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('it-IT');

  function handleCopyArticleLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  function handleTriggerShare() {
    if (!article) return;
    const activeSocial = article.socialShare || article.rawArticle?.socialShare;
    if (onShare) {
      onShare({
        title: activeSocial?.ogTitle || article.title,
        text: activeSocial?.ogDescription || article.description || `Leggi "${article.title}" su puulp.it:`,
        url: shareUrl,
        externalSourceUrl: article.link,
        pageSlug: article.pageId || activePageSlugOrId,
        articleSlug: articleSiteSlug,
        image: article.image,
        source: displaySource,
        socialShare: activeSocial,
      });
    } else {
      handleCopyArticleLink();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5 bg-black/75 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[95dvh] sm:max-h-[92vh] rounded-t-2xl sm:rounded-none flex flex-col border-t-3 sm:border-3 border-border bg-card shadow-[0_-8px_24px_rgba(0,0,0,0.25)] sm:shadow-[8px_8px_0_0_var(--foreground)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="w-10 h-1.5 bg-border/30 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0" />

        {/* Header Bar */}
        <div className="bg-muted/40 border-b-2 border-border px-3.5 py-2.5 sm:p-4 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0 truncate">
            <span className="text-[11px] sm:text-xs uppercase tracking-wider font-bold bg-primary text-primary-foreground px-2 py-0.5 border border-border truncate max-w-[170px] sm:max-w-xs">
              {displaySource}
            </span>
            {article.isManual ? (
              <span className="text-xs font-mono text-muted-foreground hidden md:inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500 inline" /> Articolo Editoriale SEO
              </span>
            ) : (
              <span className="text-xs font-mono text-muted-foreground hidden md:inline-flex items-center gap-1">
                <BookOpen className="w-3 h-3 text-primary inline" /> Lettura sul Sito
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Desktop Quick Archive Navigation */}
            {typeof totalArticles === 'number' && totalArticles > 1 && (
              <div className="hidden sm:flex items-center border-2 border-border bg-card divide-x divide-border text-xs mr-1 shadow-[1px_1px_0_0_var(--foreground)]">
                <button
                  type="button"
                  disabled={!hasPrevArticle}
                  onClick={onPrevArticle}
                  className="px-2.5 py-1.5 min-h-[36px] hover:bg-muted disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center gap-1 font-bold text-foreground"
                  title="Articolo Precedente / Più recente (tasto freccia ←)"
                >
                  <span className="text-sm leading-none font-black">‹</span>
                  <span className="text-[10px] uppercase tracking-wider">Recente</span>
                </button>
                {typeof currentIndex === 'number' && (
                  <span className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground font-semibold bg-muted/30">
                    {currentIndex}/{totalArticles}
                  </span>
                )}
                <button
                  type="button"
                  disabled={!hasNextArticle}
                  onClick={onNextArticle}
                  className="px-2.5 py-1.5 min-h-[36px] hover:bg-muted disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center gap-1 font-bold text-foreground"
                  title="Articolo Successivo / Più vecchio (tasto freccia →)"
                >
                  <span className="text-[10px] uppercase tracking-wider">Vecchio</span>
                  <span className="text-sm leading-none font-black">›</span>
                </button>
              </div>
            )}

            {isAdmin && adminMode && article.isManual && (
              <>
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      const manualToEdit = article.rawArticle || (article.isManual ? (article as unknown as ManualArticle) : null);
                      if (manualToEdit) {
                        onEdit(manualToEdit);
                      }
                    }}
                    className="border border-border bg-card hover:bg-muted px-2.5 py-1.5 min-h-[38px] text-xs font-bold flex items-center gap-1 cursor-pointer"
                    title="Modifica articolo"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Modifica</span>
                  </button>
                )}
                {onDelete && article.id && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Sei sicuro di voler eliminare questo articolo?')) {
                        onDelete(article.id!);
                        onClose();
                      }
                    }}
                    className="border border-destructive bg-card text-destructive hover:bg-destructive hover:text-destructive-foreground px-2.5 py-1.5 min-h-[38px] text-xs font-bold flex items-center gap-1 cursor-pointer"
                    title="Elimina articolo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Elimina</span>
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center border-2 border-border bg-card text-foreground font-bold hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer text-sm shadow-[2px_2px_0_0_var(--foreground)]"
              aria-label="Chiudi popup articolo"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Article Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-5 sm:space-y-6">
          {/* Article Title */}
          <h1
            className="text-xl sm:text-3xl md:text-4xl font-black leading-tight tracking-tight text-foreground"
            style={fontFraunces}
          >
            {article.title}
          </h1>

          {/* Article Metadata Kicker */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-4 text-xs text-muted-foreground border-y border-border/40 py-2.5">
            <span className="flex items-center gap-1 text-foreground font-bold">
              <User className="w-3.5 h-3.5 text-primary" />
              <span>{article.author || article.feedTitle || 'Redazione puulp.it'}</span>
            </span>

            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>{displayDate}</span>
            </span>

            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{readingTimeMinutes} min lettura</span>
            </span>

            {article.price && (
              <span className="font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded text-[11px]">
                {article.price}
              </span>
            )}
          </div>

          {/* Featured Image */}
          {article.image && (
            <div className="border-2 border-border overflow-hidden bg-muted">
              <img
                src={article.image}
                alt={article.title}
                className="w-full max-h-[280px] sm:max-h-[380px] object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}

          {/* BANNER 1: DOPO L'IMMAGINE */}
          <div className="pt-1">
            <AdSenseBanner
              position="after-image"
              label="📢 Annuncio Sponsorizzato · Top Articolo"
              customDescription="Spazio promozionale verificato puulp.it · Google AdSense & Inserzioni Partner"
              customDate={displayDate}
            />
          </div>

          {/* Lead Summary */}
          {article.description && (
            <div className="text-sm sm:text-lg font-medium text-foreground/90 italic leading-relaxed bg-muted/30 border border-border p-3.5 sm:p-4">
              <p>{article.description}</p>
            </div>
          )}

          {/* Full Text Content with Syntax-Highlighted Code Blocks */}
          <div className="max-w-none pt-1">
            {fullContent ? (
              <FormattedArticleContent content={fullContent} />
            ) : article.content ? (
              <FormattedArticleContent content={article.content} />
            ) : loadingFullContent ? (
              <div className="p-6 border-2 border-dashed border-border/60 text-center space-y-2 bg-muted/20">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Caricamento del testo completo sul sito in corso…
                </p>
              </div>
            ) : null}
          </div>

          {/* BANNER 2: A FINE ARTICOLO */}
          <div className="pt-2">
            <AdSenseBanner
              position="end-of-article"
              label="📢 Annuncio Consigliato · Fine Lettura"
              customDescription="Inserzione promozionale di chiusura articolo · Supporta la gestione e l'accesso gratuito ai feed di puulp.it"
              customDate={displayDate}
            />
          </div>

          {/* Optional External Offer / Source Reference */}
          {article.link && (
            <div className="p-3.5 sm:p-4 bg-muted/30 border-2 border-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-4 shadow-[2px_2px_0_0_var(--foreground)]">
              <div className="min-w-0 flex-1">
                <span className="font-extrabold text-xs uppercase tracking-wider block">
                  {article.price || isAffiliate ? 'Offerta Partner Verificata' : 'Riferimento Fonte Originale'}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono truncate block mt-0.5">
                  {article.link}
                </span>
              </div>
              <a
                href={article.link}
                target="_blank"
                rel="noreferrer"
                className="border-2 border-border bg-card hover:bg-muted px-4 py-2.5 min-h-[42px] text-xs font-bold uppercase tracking-wider text-foreground transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0 shadow-[1px_1px_0_0_var(--foreground)]"
              >
                <span>{article.price || isAffiliate ? 'Vedi Offerta Partner' : 'Riferimento Esterno'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Desktop Footer & Sharing Bar */}
          <div className="hidden sm:flex pt-5 border-t-2 border-border flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={handleTriggerShare}
                className="border-2 border-border bg-primary text-primary-foreground px-4 py-2 min-h-[42px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0_0_var(--foreground)]"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Condividi Link del Sito (Ollama AI)</span>
              </button>

              <button
                type="button"
                onClick={handleCopyArticleLink}
                className="border-2 border-border bg-card px-3.5 py-2 min-h-[42px] font-bold uppercase tracking-wider hover:bg-accent transition-colors flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0_0_var(--foreground)]"
                title="Copia link diretto all'articolo su puulp.it"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Link Sito Copiato!' : 'Copia Link Sito'}</span>
              </button>
            </div>

            {article.focusKeyword && (
              <span className="text-[11px] text-muted-foreground font-mono">
                Keyword SEO: <strong>{article.focusKeyword}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Sticky Mobile Bottom Action & Navigation Bar (Thumb-Zone Optimized) */}
        <div className="sm:hidden border-t-2 border-border bg-card/95 backdrop-blur-md px-3 py-2.5 flex items-center justify-between gap-2 shrink-0 pb-safe">
          {typeof totalArticles === 'number' && totalArticles > 1 && (
            <button
              type="button"
              disabled={!hasPrevArticle}
              onClick={onPrevArticle}
              className="border-2 border-border bg-background px-2.5 py-2 min-h-[44px] min-w-[44px] text-xs font-bold uppercase flex items-center justify-center disabled:opacity-30 cursor-pointer"
              title="Articolo più recente"
            >
              ‹
            </button>
          )}

          <button
            type="button"
            onClick={handleTriggerShare}
            className="flex-1 border-2 border-border bg-primary text-primary-foreground px-3 py-2 min-h-[44px] text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Condividi Sito</span>
          </button>

          <button
            type="button"
            onClick={handleCopyArticleLink}
            className="border-2 border-border bg-background px-3 py-2 min-h-[44px] text-xs font-bold uppercase flex items-center justify-center gap-1 cursor-pointer shadow-[2px_2px_0_0_var(--foreground)]"
            title="Copia link diretto al sito"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Copiato' : 'Link'}</span>
          </button>

          {typeof totalArticles === 'number' && totalArticles > 1 && (
            <button
              type="button"
              disabled={!hasNextArticle}
              onClick={onNextArticle}
              className="border-2 border-border bg-background px-2.5 py-2 min-h-[44px] min-w-[44px] text-xs font-bold uppercase flex items-center justify-center disabled:opacity-30 cursor-pointer"
              title="Articolo più vecchio"
            >
              ›
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
