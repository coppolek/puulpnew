import React, { useEffect } from 'react';
import { ManualArticle } from '../lib/firebase';
import { ExternalLink, Calendar, User, Tag, Clock, Share2, Edit3, Trash2 } from 'lucide-react';
import { FormattedArticleContent } from './FormattedArticleContent.tsx';

interface ArticleDetailModalProps {
  article: ManualArticle | null;
  isOpen: boolean;
  onClose: () => void;
  isAdmin?: boolean;
  adminMode?: boolean;
  onEdit?: (article: ManualArticle) => void;
  onDelete?: (articleId: string) => void;
  onShare?: (data: { title: string; text: string; url: string; image?: string; source?: string }) => void;
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
}: ArticleDetailModalProps) {
  useEffect(() => {
    if (!article || !isOpen) return;

    // Dynamically update document title & meta tags for optimal SEO while reading
    const prevTitle = document.title;
    const effectiveTitle = article.metaTitle || article.title;
    document.title = `${effectiveTitle} — puulp.it`;

    const metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc ? metaDesc.getAttribute('content') : null;
    if (metaDesc && article.description) {
      metaDesc.setAttribute('content', article.metaDescription || article.description);
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

    const currentUrl = `${window.location.origin}/?p=${encodeURIComponent(article.pageId)}&art=${encodeURIComponent(article.slug)}`;
    const schemaData = {
      '@context': 'https://schema.org',
      '@type': article.schemaType || 'NewsArticle',
      headline: article.title,
      description: article.metaDescription || article.description,
      image: article.image || undefined,
      datePublished: article.createdAt,
      dateModified: article.updatedAt || article.createdAt,
      author: {
        '@type': 'Person',
        name: article.author || 'Redazione puulp.it',
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
  const shareUrl = `${window.location.origin}/?p=${encodeURIComponent(article.pageId)}&art=${encodeURIComponent(article.slug)}`;
  const readingTimeMinutes = Math.max(1, Math.ceil((article.content?.split(/\s+/).length || 50) / 180));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-background/80 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col border-3 border-border bg-card shadow-[8px_8px_0_0_var(--foreground)] overflow-hidden">
        {/* Header Bar */}
        <div className="bg-muted/40 border-b-2 border-border p-3 sm:p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs uppercase tracking-wider font-bold bg-primary text-primary-foreground px-2 py-0.5 border border-border">
              {article.category || 'Editoriale'}
            </span>
            <span className="text-xs font-mono text-muted-foreground hidden sm:inline">
              Articolo puulp.it
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && adminMode && (
              <>
                {onEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onEdit(article);
                    }}
                    className="border border-border bg-card hover:bg-muted px-2 py-1 text-xs font-bold flex items-center gap-1 cursor-pointer"
                    title="Modifica articolo"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span className="hidden xs:inline">Modifica</span>
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Sei sicuro di voler eliminare questo articolo?')) {
                        onDelete(article.id);
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
              aria-label="Chiudi articolo"
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
              <span>{article.author || 'Redazione puulp.it'}</span>
            </span>

            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>{new Date(article.createdAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
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

          {/* Lead Summary */}
          {article.description && (
            <p className="text-base sm:text-lg font-medium text-foreground/90 italic leading-relaxed border-l-3 border-primary pl-4">
              {article.description}
            </p>
          )}

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

          {/* Full Text Content with Syntax-Highlighted Code Blocks */}
          <div className="max-w-none pt-2">
            {article.content ? (
              <FormattedArticleContent content={article.content} />
            ) : (
              <p className="text-sm sm:text-base leading-relaxed text-foreground/90">{article.description}</p>
            )}
          </div>

          {/* Optional External Offer / Source Link */}
          {article.link && (
            <div className="p-4 bg-muted/30 border-2 border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-6">
              <div>
                <span className="font-extrabold text-xs uppercase tracking-wider block">
                  {article.price ? 'Offerta o Scheda Prodotto' : 'Fonte Originale o Approfondimento'}
                </span>
                <span className="text-xs text-muted-foreground font-mono truncate max-w-md block mt-0.5">
                  {article.link}
                </span>
              </div>
              <a
                href={article.link}
                target="_blank"
                rel="noreferrer"
                className="border-2 border-border bg-primary px-4 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0_0_var(--foreground)]"
              >
                <span>{article.price ? 'Vedi Offerta Partner' : 'Visita Link Esterno'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Article Footer & Sharing Bar */}
          <div className="pt-6 border-t-2 border-border flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
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
                      source: article.category || 'puulp.it',
                    });
                  } else {
                    navigator.clipboard.writeText(shareUrl);
                    alert('Link copiato negli appunti!');
                  }
                }}
                className="border border-border bg-card px-3 py-1.5 font-bold hover:bg-accent transition-colors flex items-center gap-1.5 cursor-pointer shadow-[1px_1px_0_0_var(--foreground)]"
              >
                <Share2 className="w-3.5 h-3.5 text-primary" />
                <span>Condividi sui Social</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  alert('Link dell\'articolo copiato!');
                }}
                className="border border-border bg-card px-3 py-1.5 font-bold hover:bg-accent transition-colors flex items-center gap-1 cursor-pointer"
                title="Copia link diretto all'articolo"
              >
                <span>🔗</span>
                <span>Copia Link</span>
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
