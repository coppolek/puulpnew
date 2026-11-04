import React, { useEffect, useState } from 'react';
import { ManualArticle } from '../lib/firebase';
import { ExternalLink, Calendar, User, Tag, Clock, Share2, Edit3, Trash2, Globe, Sparkles, Loader2, BookOpen } from 'lucide-react';
import { FormattedArticleContent } from './FormattedArticleContent.tsx';
import { AdSenseBanner } from './AdSenseBanner.tsx';

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
}

interface ArticleDetailModalProps {
  article: ArticleDetailItem | null;
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  adminMode?: boolean;
  onEdit?: (article: ManualArticle) => void;
  onDelete?: (articleId: string) => void;
  onShare?: (data: { title: string; text: string; url: string; image?: string; source?: string }) => void;
  onPrevArticle?: () => void;
  onNextArticle?: () => void;
  hasPrevArticle?: boolean;
  hasNextArticle?: boolean;
  currentIndex?: number;
  totalArticles?: number;
}

export function ArticleDetailModal({
  article,
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

  // SEO and document head update
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

    // Dynamic Schema.org JSON-LD injection
    const scriptId = 'article-jsonld-schema';
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = scriptId;
      scriptEl.type = 'application/ld+json';
      document.head.appendChild(scriptEl);
    }

    const currentUrl =
      article.isManual && article.pageId && article.slug
        ? `${window.location.origin}/?p=${encodeURIComponent(article.pageId)}&art=${encodeURIComponent(article.slug)}`
        : article.link || window.location.href;

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
        '@id': currentUrl,
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
  }, [article, isOpen]);

  if (!isOpen || !article) return null;

  const fontFraunces = { fontFamily: 'Fraunces, Georgia, serif' };
  const shareUrl =
    article.isManual && article.pageId && article.slug
      ? `${window.location.origin}/?p=${encodeURIComponent(article.pageId)}&art=${encodeURIComponent(article.slug)}`
      : article.link || window.location.href;

  const textToCount = fullContent || article.content || article.description || '';
  const readingTimeMinutes = Math.max(1, Math.ceil(textToCount.split(/\s+/).length / 180));
  const isAffiliate = Boolean(article.link && /tag=|campid=|awinaffid=|aff=|ref=|partner=|affiliate/i.test(article.link));
  const displaySource = article.feedTitle || article.category || (article.isManual ? 'Editoriale puulp.it' : 'Fonte Web');

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 bg-background/85 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[92vh] flex flex-col border-3 border-border bg-card shadow-[8px_8px_0_0_var(--foreground)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="bg-muted/40 border-b-2 border-border p-3 sm:p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0 truncate">
            <span className="text-xs uppercase tracking-wider font-bold bg-primary text-primary-foreground px-2 py-0.5 border border-border shrink-0">
              {displaySource}
            </span>
            {article.isManual ? (
              <span className="text-xs font-mono text-muted-foreground hidden sm:inline flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500 inline" /> Articolo Editoriale SEO
              </span>
            ) : (
              <span className="text-xs font-mono text-muted-foreground hidden sm:inline flex items-center gap-1">
                <BookOpen className="w-3 h-3 text-primary inline" /> Modalità Lettura Popup
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Quick Archive Navigation: Previous / Next article */}
            {typeof totalArticles === 'number' && totalArticles > 1 && (
              <div className="flex items-center border-2 border-border bg-card divide-x divide-border text-xs mr-1 sm:mr-2 shadow-[1px_1px_0_0_var(--foreground)]">
                <button
                  type="button"
                  disabled={!hasPrevArticle}
                  onClick={onPrevArticle}
                  className="px-2 py-1 hover:bg-muted disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center gap-1 font-bold text-foreground"
                  title="Articolo Precedente / Più recente (tasto freccia ←)"
                >
                  <span className="text-sm leading-none font-black">‹</span>
                  <span className="hidden sm:inline text-[10px] uppercase tracking-wider">Più recente</span>
                </button>
                {typeof currentIndex === 'number' && (
                  <span className="px-2 py-1 font-mono text-[10px] sm:text-[11px] text-muted-foreground font-semibold bg-muted/30">
                    {currentIndex}/{totalArticles}
                  </span>
                )}
                <button
                  type="button"
                  disabled={!hasNextArticle}
                  onClick={onNextArticle}
                  className="px-2 py-1 hover:bg-muted disabled:opacity-30 disabled:pointer-events-none cursor-pointer flex items-center gap-1 font-bold text-foreground"
                  title="Articolo Successivo / Più vecchio (tasto freccia →)"
                >
                  <span className="hidden sm:inline text-[10px] uppercase tracking-wider">Più vecchio</span>
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
                    className="border border-border bg-card hover:bg-muted px-2 py-1 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    title="Modifica articolo"
                  >
                    <Edit3 className="w-3 h-3" />
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
                    className="border border-destructive bg-card text-destructive hover:bg-destructive hover:text-destructive-foreground px-2 py-1 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    title="Elimina articolo"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span className="hidden xs:inline">Elimina</span>
                  </button>
                )}
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center border-2 border-border bg-card text-foreground font-bold hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer text-sm"
              aria-label="Chiudi popup articolo"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Article Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6">
          {/* Article Title */}
          <h1
            className="text-2xl sm:text-3xl md:text-4xl font-black leading-tight tracking-tight text-foreground"
            style={fontFraunces}
          >
            {article.title}
          </h1>

          {/* Article Metadata Kicker */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-muted-foreground border-y border-border/40 py-2.5">
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
                className="w-full max-h-[380px] object-cover"
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
            <div className="text-base sm:text-lg font-medium text-foreground/90 italic leading-relaxed border-l-4 border-primary pl-4 py-0.5">
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
                  Caricamento del testo completo in corso…
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

          {/* Optional External Offer / Source Link */}
          {article.link && (
            <div className="p-4 bg-muted/30 border-2 border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-6 shadow-[2px_2px_0_0_var(--foreground)]">
              <div className="min-w-0 flex-1">
                <span className="font-extrabold text-xs uppercase tracking-wider block">
                  {article.price || isAffiliate ? 'Offerta o Scheda Prodotto' : 'Fonte Originale o Pagina Completa'}
                </span>
                <span className="text-xs text-muted-foreground font-mono truncate block mt-0.5 max-w-md">
                  {article.link}
                </span>
              </div>
              <a
                href={article.link}
                target="_blank"
                rel="noreferrer"
                className="border-2 border-border bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shrink-0 shadow-[1px_1px_0_0_var(--foreground)]"
              >
                <span>{article.price || isAffiliate ? 'Vedi Offerta Partner' : 'Apri sul Sito Ufficiale'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Navigazione Archivio: Torna indietro sui vecchi articoli */}
          {typeof totalArticles === 'number' && totalArticles > 1 && (
            <div className="my-6 p-4 border-2 border-border bg-card shadow-[3px_3px_0_0_var(--foreground)] space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-muted-foreground border-b border-border/40 pb-2">
                <span className="font-bold text-foreground uppercase tracking-wider text-[11px]">
                  📚 Sfoglia l'Archivio Articoli
                </span>
                <span>
                  Articolo <strong>{currentIndex}</strong> di <strong>{totalArticles}</strong>
                </span>
              </div>
              <div className="flex flex-col xs:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <button
                  type="button"
                  disabled={!hasPrevArticle}
                  onClick={onPrevArticle}
                  className="flex-1 border-2 border-border bg-background px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-1.5 cursor-pointer shadow-[1px_1px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5"
                  title="Vai all'articolo più recente nell'archivio"
                >
                  <span>←</span>
                  <span>Articolo Più Recente</span>
                </button>
                <button
                  type="button"
                  disabled={!hasNextArticle}
                  onClick={onNextArticle}
                  className="flex-1 border-2 border-border bg-background px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-muted disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center gap-1.5 cursor-pointer shadow-[1px_1px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5"
                  title="Vai all'articolo più vecchio nell'archivio"
                >
                  <span>Articolo Più Vecchio</span>
                  <span>→</span>
                </button>
              </div>
              <p className="text-[10px] text-center text-muted-foreground font-mono">
                Suggerimento: puoi usare anche i tasti <strong>Freccia Sinistra (←)</strong> e <strong>Freccia Destra (→)</strong> sulla tastiera.
              </p>
            </div>
          )}

          {/* Article Footer & Sharing Bar */}
          <div className="pt-6 border-t-2 border-border flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-muted-foreground">Condividi articolo:</span>
              <button
                type="button"
                onClick={() => {
                  if (onShare) {
                    onShare({
                      title: article.title,
                      text: article.description || `Leggi "${article.title}" su puulp.it:`,
                      url: shareUrl,
                      image: article.image,
                      source: displaySource,
                    });
                  } else {
                    handleCopyArticleLink();
                  }
                }}
                className="border border-border bg-card px-3 py-1.5 font-bold hover:bg-accent transition-colors flex items-center gap-1.5 cursor-pointer shadow-[1px_1px_0_0_var(--foreground)]"
              >
                <Share2 className="w-3.5 h-3.5 text-primary" />
                <span>Condividi sui Social</span>
              </button>

              <button
                type="button"
                onClick={handleCopyArticleLink}
                className="border border-border bg-card px-3 py-1.5 font-bold hover:bg-accent transition-colors flex items-center gap-1 cursor-pointer"
                title="Copia link diretto all'articolo"
              >
                <span>{copiedLink ? '✓' : '🔗'}</span>
                <span>{copiedLink ? 'Link Copiato!' : 'Copia Link'}</span>
              </button>
            </div>

            {article.focusKeyword && (
              <span className="text-[11px] text-muted-foreground font-mono">
                Keyword SEO: <strong>{article.focusKeyword}</strong>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
