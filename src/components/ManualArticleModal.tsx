import React, { useState, useEffect, useMemo, useRef } from 'react';
import { CustomPage, ManualArticle } from '../lib/firebase';
import { ExternalLink, Sparkles, CheckCircle2, AlertTriangle, Eye, Globe, Share2, Code2, Tag, BookOpen, Terminal, ChevronDown } from 'lucide-react';
import { FormattedArticleContent } from './FormattedArticleContent.tsx';

interface ManualArticleModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: CustomPage[];
  initialPageId?: string;
  articleToEdit?: ManualArticle | null;
  onSave: (articleData: Omit<ManualArticle, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) => Promise<void>;
}

export function ManualArticleModal({
  isOpen,
  onClose,
  pages,
  initialPageId,
  articleToEdit,
  onSave,
}: ManualArticleModalProps) {
  const [activeTab, setActiveTab] = useState<'content' | 'seo' | 'preview'>('content');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [pageId, setPageId] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [image, setImage] = useState('');
  const [author, setAuthor] = useState('Redazione puulp.it');
  const [link, setLink] = useState('');
  const [price, setPrice] = useState('');

  // Code & Content Editor Toolbar State
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [contentViewMode, setContentViewMode] = useState<'edit' | 'preview'>('edit');
  const [selectedCodeLang, setSelectedCodeLang] = useState<string>('javascript');

  // SEO Fields
  const [focusKeyword, setFocusKeyword] = useState('');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [schemaType, setSchemaType] = useState<'NewsArticle' | 'BlogPosting' | 'Product'>('NewsArticle');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [showJsonLd, setShowJsonLd] = useState(false);

  // Code insertion helpers
  function insertSnippet(before: string, after: string = '', defaultPlaceholder: string = '') {
    const textarea = contentTextareaRef.current;
    if (!textarea) {
      setContent((prev) => `${prev ? `${prev}\n\n` : ''}${before}${defaultPlaceholder}${after}\n`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentText = textarea.value;
    const selectedText = currentText.substring(start, end) || defaultPlaceholder;

    const newText = currentText.substring(0, start) + before + selectedText + after + currentText.substring(end);
    setContent(newText);

    setTimeout(() => {
      textarea.focus();
      const newCursorPos = start + before.length + selectedText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 50);
  }

  function insertCodeBlock(lang: string = 'javascript') {
    let sampleCode = '// Scrivi qui il tuo codice\nconsole.log("Hello, world!");';
    if (lang === 'html') sampleCode = '<div class="banner">\n  <h1>Titolo Notizia</h1>\n</div>';
    else if (lang === 'css') sampleCode = '.banner {\n  background-color: #ea580c;\n  color: #ffffff;\n}';
    else if (lang === 'python') sampleCode = '# Script Python\ndef saluta(nome):\n    return f"Ciao {nome}!"\n\nprint(saluta("puulp.it"))';
    else if (lang === 'bash') sampleCode = '# Esegui nel terminale\nnpm install\nnpm run build';
    else if (lang === 'json') sampleCode = '{\n  "status": "success",\n  "version": "1.0.0"\n}';
    else if (lang === 'sql') sampleCode = 'SELECT id, title, created_at\nFROM articles\nWHERE category = "Tech"\nORDER BY created_at DESC;';

    insertSnippet(`\`\`\`${lang}\n`, `\n\`\`\``, sampleCode);
  }

  // Populate state when editing or opening
  useEffect(() => {
    if (articleToEdit) {
      setTitle(articleToEdit.title || '');
      setSlug(articleToEdit.slug || '');
      setPageId(articleToEdit.pageId || (pages[0]?.id || ''));
      setDescription(articleToEdit.description || '');
      setContent(articleToEdit.content || '');
      setImage(articleToEdit.image || '');
      setAuthor(articleToEdit.author || 'Redazione puulp.it');
      setLink(articleToEdit.link || '');
      setPrice(articleToEdit.price || '');
      setFocusKeyword(articleToEdit.focusKeyword || '');
      setMetaTitle(articleToEdit.metaTitle || articleToEdit.title || '');
      setMetaDescription(articleToEdit.metaDescription || articleToEdit.description || '');
      setCanonicalUrl(articleToEdit.canonicalUrl || '');
      setSchemaType(articleToEdit.schemaType || 'NewsArticle');
    } else {
      setTitle('');
      setSlug('');
      setPageId(initialPageId || pages[0]?.id || '');
      setDescription('');
      setContent('');
      setImage('');
      setAuthor('Redazione puulp.it');
      setLink('');
      setPrice('');
      setFocusKeyword('');
      setMetaTitle('');
      setMetaDescription('');
      setCanonicalUrl('');
      setSchemaType('NewsArticle');
    }
    setError(null);
    setActiveTab('content');
  }, [articleToEdit, isOpen, initialPageId, pages]);

  // Auto-generate slug and default SEO title when title changes (if not already set or editing)
  function handleTitleChange(val: string) {
    setTitle(val);
    if (!articleToEdit) {
      const generatedSlug = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setSlug(generatedSlug);
      if (!metaTitle) setMetaTitle(val ? `${val} | puulp.it` : '');
    }
  }

  function handleDescriptionChange(val: string) {
    setDescription(val);
    if (!articleToEdit && !metaDescription) {
      setMetaDescription(val);
    }
  }

  // Selected Category
  const selectedPage = useMemo(() => {
    return pages.find((p) => p.id === pageId) || pages[0];
  }, [pages, pageId]);

  // Effective SEO values for preview & analysis
  const effectiveTitle = (metaTitle || title || 'Titolo Articolo').trim();
  const effectiveDesc = (metaDescription || description || 'Breve sommario per i motori di ricerca e l\'anteprima social.').trim();
  const effectiveSlug = (slug || 'articolo-senza-slug').trim();
  const effectiveCategory = selectedPage ? selectedPage.title : 'Notizie';
  const effectiveCategorySlug = selectedPage ? selectedPage.slug : 'notizie';
  const fullArticleUrl = typeof window !== 'undefined' ? `${window.location.origin}/?p=${encodeURIComponent(effectiveCategorySlug)}&art=${encodeURIComponent(effectiveSlug)}` : `https://puulp.it/?p=${effectiveCategorySlug}&art=${effectiveSlug}`;

  // SEO Score & Checklist Calculation
  const seoChecklist = useMemo(() => {
    const kw = focusKeyword.toLowerCase().trim();
    const t = effectiveTitle.toLowerCase();
    const d = effectiveDesc.toLowerCase();
    const c = content.toLowerCase();

    const titleLengthOk = effectiveTitle.length >= 30 && effectiveTitle.length <= 60;
    const titleLengthWarn = effectiveTitle.length > 0 && (effectiveTitle.length < 30 || effectiveTitle.length > 60);

    const descLengthOk = effectiveDesc.length >= 120 && effectiveDesc.length <= 160;
    const descLengthWarn = effectiveDesc.length > 0 && (effectiveDesc.length < 120 || effectiveDesc.length > 160);

    const hasKeyword = kw.length > 2;
    const kwInTitle = hasKeyword && t.includes(kw);
    const kwInDesc = hasKeyword && d.includes(kw);
    const kwInContent = hasKeyword && c.includes(kw);

    const hasImage = Boolean(image && image.trim().startsWith('http'));
    const slugOk = /^[a-z0-9-]+$/.test(effectiveSlug) && effectiveSlug.length >= 3;
    const contentLongEnough = content.trim().length >= 150;

    let points = 0;
    let total = 7;

    if (titleLengthOk) points += 1;
    else if (titleLengthWarn && effectiveTitle.length > 10) points += 0.5;

    if (descLengthOk) points += 1;
    else if (descLengthWarn && effectiveDesc.length > 30) points += 0.5;

    if (hasKeyword && kwInTitle) points += 1;
    if (hasKeyword && kwInDesc) points += 1;
    if (hasImage) points += 1;
    if (slugOk) points += 1;
    if (contentLongEnough) points += 1;

    const score = Math.round((points / total) * 100);

    return {
      score,
      titleLengthOk,
      titleLengthWarn,
      descLengthOk,
      descLengthWarn,
      hasKeyword,
      kwInTitle,
      kwInDesc,
      kwInContent,
      hasImage,
      slugOk,
      contentLongEnough,
    };
  }, [effectiveTitle, effectiveDesc, effectiveSlug, content, focusKeyword, image]);

  // JSON-LD Structured Data Output
  const schemaJsonLd = useMemo(() => {
    if (schemaType === 'Product') {
      return {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: title || 'Prodotto in Evidenza',
        description: effectiveDesc,
        image: image || undefined,
        offers: {
          '@type': 'Offer',
          price: price ? price.replace(/[^0-9.,]/g, '').replace(',', '.') : '0.00',
          priceCurrency: 'EUR',
          availability: 'https://schema.org/InStock',
          url: link || fullArticleUrl,
        },
      };
    }

    return {
      '@context': 'https://schema.org',
      '@type': schemaType,
      headline: title || 'Titolo Articolo',
      description: effectiveDesc,
      image: image || undefined,
      datePublished: articleToEdit?.createdAt || new Date().toISOString(),
      dateModified: new Date().toISOString(),
      author: {
        '@type': 'Person',
        name: author || 'Redazione puulp.it',
      },
      publisher: {
        '@type': 'Organization',
        name: 'puulp.it',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://puulp.it',
      },
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': fullArticleUrl,
      },
      articleSection: effectiveCategory,
      keywords: focusKeyword || undefined,
    };
  }, [schemaType, title, effectiveDesc, image, price, link, fullArticleUrl, articleToEdit, author, effectiveCategory, focusKeyword]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Inserisci il titolo dell\'articolo.');
      return;
    }
    if (!pageId) {
      setError('Seleziona una categoria o pagina tematica.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const cleanSlug = (slug.trim() || title.trim())
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'articolo';

      await onSave({
        id: articleToEdit?.id,
        title: title.trim(),
        slug: cleanSlug,
        pageId,
        category: selectedPage?.category || selectedPage?.title || 'Generale',
        description: description.trim(),
        content: content.trim(),
        image: image.trim(),
        author: author.trim() || 'Redazione puulp.it',
        link: link.trim(),
        price: price.trim(),
        focusKeyword: focusKeyword.trim(),
        metaTitle: metaTitle.trim() || title.trim(),
        metaDescription: metaDescription.trim() || description.trim(),
        canonicalUrl: canonicalUrl.trim() || fullArticleUrl,
        schemaType,
        isManual: true,
        createdAt: articleToEdit?.createdAt || new Date().toISOString(),
      });
      onClose();
    } catch (err: unknown) {
      console.error('Error saving manual article:', err);
      setError(err instanceof Error ? err.message : 'Errore durante il salvataggio.');
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-background/80 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col border-3 border-border bg-card shadow-[8px_8px_0_0_var(--foreground)] overflow-hidden">
        {/* Header */}
        <div className="bg-muted/40 border-b-2 border-border p-3 sm:p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">✍️</span>
            <div>
              <h2 className="font-extrabold text-base sm:text-lg tracking-tight">
                {articleToEdit ? 'Modifica Articolo' : 'Inserisci Nuovo Articolo'}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Pubblica un articolo manuale nella categoria e ottimizza la SEO per Google e social.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center border-2 border-border bg-card text-foreground font-bold hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer text-sm"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b-2 border-border bg-background/60 shrink-0 text-xs font-bold uppercase tracking-wider overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('content')}
            className={`px-4 py-2.5 flex items-center gap-1.5 border-r-2 border-border transition-colors cursor-pointer ${
              activeTab === 'content'
                ? 'bg-card text-primary border-b-2 border-b-primary -mb-0.5'
                : 'text-muted-foreground hover:bg-muted/40'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Contenuto & Testo</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('seo')}
            className={`px-4 py-2.5 flex items-center gap-1.5 border-r-2 border-border transition-colors cursor-pointer ${
              activeTab === 'seo'
                ? 'bg-card text-primary border-b-2 border-b-primary -mb-0.5'
                : 'text-muted-foreground hover:bg-muted/40'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Ottimizzazione SEO</span>
            <span
              className={`ml-1 text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                seoChecklist.score >= 80
                  ? 'bg-emerald-100 text-emerald-800'
                  : seoChecklist.score >= 50
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {seoChecklist.score}%
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-4 py-2.5 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'preview'
                ? 'bg-card text-primary border-b-2 border-b-primary -mb-0.5'
                : 'text-muted-foreground hover:bg-muted/40'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Anteprima SERP & Social</span>
          </button>
        </div>

        {/* Form Body (Scrollable) */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {error && (
            <div className="p-3 bg-destructive/10 border-2 border-destructive text-destructive text-xs font-semibold">
              ⚠️ {error}
            </div>
          )}

          {/* TAB 1: CONTENUTO */}
          {activeTab === 'content' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-foreground mb-1">
                    Titolo dell'Articolo *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="Es: I 5 Migliori Smartphone per Fotografia del 2026"
                    className="w-full border-2 border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary font-semibold"
                  />
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-1">
                    <span>Ottimale: 30-60 caratteri</span>
                    <span className={title.length >= 30 && title.length <= 60 ? 'text-emerald-600 font-bold' : ''}>
                      {title.length} car.
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-foreground mb-1">
                    Categoria di Destinazione *
                  </label>
                  <select
                    value={pageId}
                    onChange={(e) => setPageId(e.target.value)}
                    className="w-full border-2 border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary font-medium cursor-pointer"
                  >
                    {pages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} {p.category ? `(${p.category})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    La pagina tematica in cui verrà pubblicato l'articolo.
                  </p>
                </div>
              </div>

              {/* Slug & Permalink */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-foreground mb-1">
                    URL Slug (Identificativo univoco) *
                  </label>
                  <div className="flex items-center border-2 border-border bg-background">
                    <span className="px-2 text-xs text-muted-foreground font-mono select-none">/</span>
                    <input
                      type="text"
                      required
                      value={slug}
                      onChange={(e) =>
                        setSlug(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9_-]/g, '-')
                        )
                      }
                      placeholder="migliori-smartphone-2026"
                      className="w-full bg-transparent px-2 py-2 text-xs outline-none font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate">
                    Link: {fullArticleUrl}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-foreground mb-1">
                    Autore
                  </label>
                  <input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Redazione puulp.it"
                    className="w-full border-2 border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Sommario / Description */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-foreground mb-1">
                  Sommario / Breve Descrizione *
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => handleDescriptionChange(e.target.value)}
                  placeholder="Scrivi un sommario accattivante dell'articolo. Verrà usato anche come Meta Description per Google e anteprime social."
                  className="w-full border-2 border-border bg-background p-2.5 text-xs outline-none focus:border-primary leading-relaxed"
                />
                <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-0.5">
                  <span>Ottimale per Google: 120-160 caratteri</span>
                  <span className={description.length >= 120 && description.length <= 160 ? 'text-emerald-600 font-bold' : ''}>
                    {description.length} car.
                  </span>
                </div>
              </div>

              {/* Immagine di Copertina */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-foreground mb-1">
                  Immagine di Copertina (URL)
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="flex-1 border-2 border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary font-mono"
                  />
                  {image && (
                    <button
                      type="button"
                      onClick={() => setImage('')}
                      className="px-2 text-xs text-muted-foreground hover:text-destructive border border-border"
                    >
                      Rimuovi
                    </button>
                  )}
                </div>
                {/* Presets di immagini veloci per testing */}
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">Esempi rapidi:</span>
                  {[
                    { label: '📱 Tech', url: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=800&auto=format&fit=crop&q=80' },
                    { label: '💻 Computer', url: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&auto=format&fit=crop&q=80' },
                    { label: '📰 News', url: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&auto=format&fit=crop&q=80' },
                    { label: '🛍️ Shopping', url: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=800&auto=format&fit=crop&q=80' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setImage(preset.url)}
                      className="text-[10px] bg-muted/80 hover:bg-muted border border-border/60 px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Testo Completo dell'Articolo con Supporto Codice e Toolbar */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-1.5">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <Code2 className="w-4 h-4 text-primary" />
                      <span>Testo dell'Articolo & Snippet di Codice</span>
                    </label>
                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                      Puoi inserire testo formattato, blocchi di codice con sintassi (```lang) e codice inline (`).
                    </span>
                  </div>

                  {/* Editor Mode Toggle: Scrivi vs Anteprima */}
                  <div className="flex items-center gap-1 self-start sm:self-auto border border-border p-0.5 bg-muted/30">
                    <button
                      type="button"
                      onClick={() => setContentViewMode('edit')}
                      className={`px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-colors ${
                        contentViewMode === 'edit'
                          ? 'bg-foreground text-background shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      ✏️ Scrivi
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentViewMode('preview')}
                      className={`px-2.5 py-1 text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1 ${
                        contentViewMode === 'preview'
                          ? 'bg-foreground text-background shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      <span>Anteprima Codice</span>
                    </button>
                  </div>
                </div>

                {/* Toolbar Rapida per Inserimento Codice e Formattazione (Visibile in Scrivi) */}
                {contentViewMode === 'edit' && (
                  <div className="p-2 bg-muted/30 border-2 border-border flex flex-wrap items-center justify-between gap-2 text-xs">
                    {/* Blocco Codice Toolbar */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <div className="flex items-center gap-1 bg-background border border-border px-1.5 py-0.5">
                        <Terminal className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[10px] font-bold uppercase text-muted-foreground">Linguaggio:</span>
                        <select
                          value={selectedCodeLang}
                          onChange={(e) => setSelectedCodeLang(e.target.value)}
                          className="bg-transparent text-[11px] font-mono font-bold outline-none cursor-pointer py-0.5"
                        >
                          <option value="javascript">JavaScript (JS)</option>
                          <option value="typescript">TypeScript (TS)</option>
                          <option value="html">HTML</option>
                          <option value="css">CSS</option>
                          <option value="python">Python</option>
                          <option value="bash">Bash / Terminal</option>
                          <option value="json">JSON</option>
                          <option value="sql">SQL</option>
                          <option value="rust">Rust</option>
                          <option value="go">Go</option>
                          <option value="php">PHP</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={() => insertCodeBlock(selectedCodeLang)}
                        className="border border-border bg-card hover:bg-primary hover:text-primary-foreground px-2 py-1 text-[11px] font-bold font-mono transition-colors cursor-pointer flex items-center gap-1 shadow-[1px_1px_0_0_var(--foreground)]"
                        title="Inserisci blocco di codice evidenziato con pulsante di copia"
                      >
                        <Code2 className="w-3 h-3 text-amber-500" />
                        <span>+ Inserisci Blocco Codice</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => insertSnippet('`', '`', 'codice_inline')}
                        className="border border-border bg-card hover:bg-accent px-2 py-1 text-[11px] font-bold font-mono transition-colors cursor-pointer"
                        title="Inserisci codice inline (`codice`)"
                      >
                        `Codice Inline`
                      </button>
                    </div>

                    {/* Toolbar Struttura Testo */}
                    <div className="flex items-center gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => insertSnippet('## ', '\n', 'Titolo Sezione')}
                        className="border border-border bg-card hover:bg-accent px-1.5 py-0.5 text-[10px] font-bold cursor-pointer"
                        title="Intestazione 2 (## Titolo)"
                      >
                        H2
                      </button>
                      <button
                        type="button"
                        onClick={() => insertSnippet('### ', '\n', 'Sottotitolo')}
                        className="border border-border bg-card hover:bg-accent px-1.5 py-0.5 text-[10px] font-bold cursor-pointer"
                        title="Intestazione 3 (### Sottotitolo)"
                      >
                        H3
                      </button>
                      <button
                        type="button"
                        onClick={() => insertSnippet('**', '**', 'testo in grassetto')}
                        className="border border-border bg-card hover:bg-accent px-1.5 py-0.5 text-[10px] font-bold cursor-pointer"
                        title="Testo in Grassetto"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() => insertSnippet('- ', '\n', 'Punto elenco')}
                        className="border border-border bg-card hover:bg-accent px-1.5 py-0.5 text-[10px] font-bold cursor-pointer"
                        title="Elenco puntato (- )"
                      >
                        • Elenco
                      </button>
                      <button
                        type="button"
                        onClick={() => insertSnippet('> ', '\n', 'Citazione importante')}
                        className="border border-border bg-card hover:bg-accent px-1.5 py-0.5 text-[10px] font-bold cursor-pointer"
                        title="Blocco citazione (> )"
                      >
                        ” Citazione
                      </button>
                    </div>
                  </div>
                )}

                {/* Vista Editor o Vista Anteprima Codice */}
                {contentViewMode === 'edit' ? (
                  <textarea
                    ref={contentTextareaRef}
                    rows={10}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={`Scrivi qui l'articolo o inserisci codice...\n\nEsempio di codice:\n\`\`\`javascript\nconst apiKey = "YOUR_API_KEY";\nconsole.log("Inizializzazione feed puulp.it...");\n\`\`\`\n\nOppure esegui nel terminale:\n\`\`\`bash\nnpm install @google/genai\n\`\`\``}
                    className="w-full border-2 border-border bg-background p-3 text-xs sm:text-sm font-mono outline-none focus:border-primary leading-relaxed"
                  />
                ) : (
                  <div className="border-2 border-border bg-background p-4 min-h-[220px] max-h-[380px] overflow-y-auto">
                    {content.trim() ? (
                      <FormattedArticleContent content={content} />
                    ) : (
                      <div className="text-center py-12 text-muted-foreground text-xs">
                        <Code2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                        <p>Nessun testo o codice inserito al momento.</p>
                        <button
                          type="button"
                          onClick={() => {
                            setContentViewMode('edit');
                            insertCodeBlock('javascript');
                          }}
                          className="mt-2 text-primary font-bold hover:underline cursor-pointer"
                        >
                          Passa a Scrivi e inserisci uno snippet di esempio
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Link Esterno / Fonte / Affiliazione & Prezzo (Opzionale) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-border/40">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-foreground mb-1">
                    Link Esterno / Fonte / Offerta (Opzionale)
                  </label>
                  <input
                    type="url"
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://www.amazon.it/dp/... o https://corriere.it/..."
                    className="w-full border-2 border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Se inserito, i lettori troveranno il pulsante diretto all'offerta o fonte originale.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-foreground mb-1">
                    Prezzo o Offerta (Opzionale)
                  </label>
                  <input
                    type="text"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Es: 199,00 €"
                    className="w-full border-2 border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: OTTIMIZZAZIONE SEO */}
          {activeTab === 'seo' && (
            <div className="space-y-5">
              {/* SEO Score Dashboard */}
              <div className="p-4 border-2 border-border bg-muted/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🎯</span>
                    <h3 className="font-extrabold text-sm uppercase tracking-wider">
                      Audit SEO in Tempo Reale
                    </h3>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Indicatori per massimizzare il posizionamento nei risultati di ricerca Google.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-2xl font-black font-mono">
                      {seoChecklist.score}
                      <span className="text-xs text-muted-foreground">/100</span>
                    </span>
                    <span className="block text-[10px] uppercase font-bold text-muted-foreground">
                      Punteggio SEO
                    </span>
                  </div>
                  <div
                    className={`w-12 h-12 rounded-full border-4 flex items-center justify-center font-bold text-sm ${
                      seoChecklist.score >= 80
                        ? 'border-emerald-500 text-emerald-600 bg-emerald-50'
                        : seoChecklist.score >= 50
                        ? 'border-amber-500 text-amber-600 bg-amber-50'
                        : 'border-rose-500 text-rose-600 bg-rose-50'
                    }`}
                  >
                    {seoChecklist.score >= 80 ? 'A' : seoChecklist.score >= 50 ? 'B' : 'C'}
                  </div>
                </div>
              </div>

              {/* SEO Checklist checklist items */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className={`p-2.5 border flex items-start gap-2 ${seoChecklist.titleLengthOk ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
                  {seoChecklist.titleLengthOk ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-bold block">Lunghezza Titolo SEO (30-60 car.)</span>
                    <span className="text-[11px] text-muted-foreground">
                      Attuale: {effectiveTitle.length} caratteri. {seoChecklist.titleLengthOk ? 'Perfetto per i desktop e mobile SERP.' : 'Consigliato tra 30 e 60 caratteri per evitare troncamenti.'}
                    </span>
                  </div>
                </div>

                <div className={`p-2.5 border flex items-start gap-2 ${seoChecklist.descLengthOk ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-amber-500/40 bg-amber-500/5'}`}>
                  {seoChecklist.descLengthOk ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className="font-bold block">Meta Description (120-160 car.)</span>
                    <span className="text-[11px] text-muted-foreground">
                      Attuale: {effectiveDesc.length} caratteri. {seoChecklist.descLengthOk ? 'Snippet ottimale per Google.' : 'Consigliato tra 120 e 160 caratteri.'}
                    </span>
                  </div>
                </div>

                <div className={`p-2.5 border flex items-start gap-2 ${seoChecklist.kwInTitle ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card'}`}>
                  {seoChecklist.kwInTitle ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <span className="w-4 h-4 text-muted-foreground shrink-0 text-center font-bold mt-0.5">○</span>
                  )}
                  <div>
                    <span className="font-bold block">Parola Chiave nel Titolo</span>
                    <span className="text-[11px] text-muted-foreground">
                      {seoChecklist.kwInTitle ? `Presente nel titolo.` : 'Inserisci la parola chiave nel titolo principale.'}
                    </span>
                  </div>
                </div>

                <div className={`p-2.5 border flex items-start gap-2 ${seoChecklist.kwInDesc ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card'}`}>
                  {seoChecklist.kwInDesc ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <span className="w-4 h-4 text-muted-foreground shrink-0 text-center font-bold mt-0.5">○</span>
                  )}
                  <div>
                    <span className="font-bold block">Parola Chiave nella Descrizione</span>
                    <span className="text-[11px] text-muted-foreground">
                      {seoChecklist.kwInDesc ? `Presente nella meta description.` : 'Includi la parola chiave nel sommario per evidenziarla in grassetto su Google.'}
                    </span>
                  </div>
                </div>

                <div className={`p-2.5 border flex items-start gap-2 ${seoChecklist.hasImage ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card'}`}>
                  {seoChecklist.hasImage ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <span className="w-4 h-4 text-muted-foreground shrink-0 text-center font-bold mt-0.5">○</span>
                  )}
                  <div>
                    <span className="font-bold block">Immagine OpenGraph & Social</span>
                    <span className="text-[11px] text-muted-foreground">
                      {seoChecklist.hasImage ? 'Immagine configurata per rich snippets.' : 'Aggiungi un\'immagine di copertina per abilitare le anteprime social.'}
                    </span>
                  </div>
                </div>

                <div className={`p-2.5 border flex items-start gap-2 ${seoChecklist.slugOk ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card'}`}>
                  {seoChecklist.slugOk ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <span className="w-4 h-4 text-muted-foreground shrink-0 text-center font-bold mt-0.5">○</span>
                  )}
                  <div>
                    <span className="font-bold block">URL Slug Pulito (Kebab-Case)</span>
                    <span className="text-[11px] text-muted-foreground">
                      {seoChecklist.slugOk ? 'Slug ottimizzato per i motori di ricerca.' : 'Usa solo lettere minuscole, numeri e trattini.'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Advanced SEO Configuration Inputs */}
              <div className="space-y-4 pt-3 border-t border-border">
                <h4 className="font-extrabold text-xs uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  <span>Parametri e Metadati Avanzati</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-foreground mb-1">
                      Parola Chiave Focus (Target Keyword)
                    </label>
                    <input
                      type="text"
                      value={focusKeyword}
                      onChange={(e) => setFocusKeyword(e.target.value)}
                      placeholder="Es: smartphone 5g"
                      className="w-full border-2 border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      La frase o termine di ricerca primario su cui posizionare l'articolo.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-foreground mb-1">
                      Tipo di Dati Strutturati (Schema.org)
                    </label>
                    <select
                      value={schemaType}
                      onChange={(e) => setSchemaType(e.target.value as 'NewsArticle' | 'BlogPosting' | 'Product')}
                      className="w-full border-2 border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary cursor-pointer font-medium"
                    >
                      <option value="NewsArticle">NewsArticle (Notizia o Rassegna)</option>
                      <option value="BlogPosting">BlogPosting (Articolo di Blog / Approfondimento)</option>
                      <option value="Product">Product (Offerta Commerciale / Prodotto)</option>
                    </select>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Genera automaticamente il codice JSON-LD per i Rich Results di Google.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-foreground mb-1">
                    Meta Title Personalizzato (Tag &lt;title&gt;)
                  </label>
                  <input
                    type="text"
                    value={metaTitle}
                    onChange={(e) => setMetaTitle(e.target.value)}
                    placeholder={title ? `${title} | puulp.it` : 'Titolo per motori di ricerca'}
                    className="w-full border-2 border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Lascia vuoto per usare il titolo dell'articolo con brand.</span>
                    <span>{metaTitle.length || (title ? `${title} | puulp.it`.length : 0)} / 60 car.</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-foreground mb-1">
                    Meta Description per Motori di Ricerca
                  </label>
                  <textarea
                    rows={2}
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                    placeholder={description || 'Descrizione breve per lo snippet Google'}
                    className="w-full border-2 border-border bg-background p-2 text-xs outline-none focus:border-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                    <span>Ideale: 120-160 caratteri.</span>
                    <span>{metaDescription.length || description.length} / 160 car.</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-foreground mb-1">
                    URL Canonico (Canonical Link)
                  </label>
                  <input
                    type="url"
                    value={canonicalUrl}
                    onChange={(e) => setCanonicalUrl(e.target.value)}
                    placeholder={fullArticleUrl}
                    className="w-full border-2 border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Previene penalizzazioni per contenuti duplicati impostando l'indirizzo sorgente principale.
                  </p>
                </div>

                {/* Schema JSON-LD Inspector */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowJsonLd(!showJsonLd)}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1.5 cursor-pointer underline"
                  >
                    <Code2 className="w-3.5 h-3.5 text-primary" />
                    <span>{showJsonLd ? 'Nascondi Schema.org JSON-LD' : 'Visualizza Schema.org JSON-LD generato'}</span>
                  </button>
                  {showJsonLd && (
                    <div className="mt-2 p-3 bg-muted/30 border-2 border-border font-mono text-[11px] overflow-x-auto relative">
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(JSON.stringify(schemaJsonLd, null, 2))}
                        className="absolute top-2 right-2 border border-border bg-card px-2 py-0.5 text-[10px] font-bold hover:bg-accent cursor-pointer"
                      >
                        Copia JSON-LD
                      </button>
                      <pre>{JSON.stringify(schemaJsonLd, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ANTEPRIMA SERP GOOGLE & SOCIAL */}
          {activeTab === 'preview' && (
            <div className="space-y-6">
              {/* Google SERP Snippet Preview */}
              <div className="border-2 border-border bg-card p-4 sm:p-5 shadow-[3px_3px_0_0_var(--foreground)]">
                <div className="flex items-center justify-between mb-3 border-b border-border/40 pb-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" />
                    <span className="font-extrabold text-xs uppercase tracking-wider">
                      Anteprima Google Search (SERP Snippet)
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('desktop')}
                      className={`px-2 py-0.5 border cursor-pointer font-bold ${
                        previewDevice === 'desktop'
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      Desktop
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('mobile')}
                      className={`px-2 py-0.5 border cursor-pointer font-bold ${
                        previewDevice === 'mobile'
                          ? 'bg-foreground text-background border-foreground'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      Mobile
                    </button>
                  </div>
                </div>

                {/* Google Result Mock */}
                <div className={`p-4 bg-white dark:bg-zinc-950 rounded border border-zinc-200 dark:border-zinc-800 ${previewDevice === 'mobile' ? 'max-w-md mx-auto shadow-sm' : ''}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center font-bold text-xs select-none">
                      P
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs text-zinc-900 dark:text-zinc-100 font-medium block truncate leading-none">
                        puulp.it
                      </span>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate block leading-none mt-0.5">
                        https://puulp.it › {effectiveCategorySlug} › {effectiveSlug}
                      </span>
                    </div>
                  </div>

                  <h3 className="text-blue-700 dark:text-blue-400 hover:underline text-base sm:text-lg font-medium leading-snug cursor-pointer line-clamp-2">
                    {effectiveTitle}
                  </h3>

                  <p className="text-xs text-zinc-600 dark:text-zinc-300 mt-1 line-clamp-2 leading-relaxed">
                    <span className="text-zinc-400 dark:text-zinc-500 mr-1">
                      {new Date().toLocaleDateString('it-IT')} —
                    </span>
                    {effectiveDesc}
                  </p>
                </div>
              </div>

              {/* Social Share Card Preview (OpenGraph / Twitter) */}
              <div className="border-2 border-border bg-card p-4 sm:p-5 shadow-[3px_3px_0_0_var(--foreground)]">
                <div className="flex items-center gap-2 mb-3 border-b border-border/40 pb-2">
                  <Share2 className="w-4 h-4 text-primary" />
                  <span className="font-extrabold text-xs uppercase tracking-wider">
                    Anteprima Condivisione Social (OpenGraph & Twitter Card)
                  </span>
                </div>

                <div className="max-w-md mx-auto border-2 border-border bg-card rounded overflow-hidden shadow-sm">
                  {image ? (
                    <div className="w-full h-44 bg-muted overflow-hidden">
                      <img
                        src={image}
                        alt="Preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&auto=format&fit=crop&q=80';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="w-full h-32 bg-muted/60 flex flex-col items-center justify-center text-muted-foreground text-xs p-4 text-center border-b border-border">
                      <span>Nessuna immagine di copertina impostata.</span>
                      <span className="text-[10px] mt-1">Aggiungi un'immagine nella scheda Contenuto per visualizzare la card completa.</span>
                    </div>
                  )}

                  <div className="p-3 bg-card border-t border-border">
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider block">
                      puulp.it · {effectiveCategory}
                    </span>
                    <h4 className="font-bold text-sm text-foreground leading-snug mt-0.5 line-clamp-2">
                      {effectiveTitle}
                    </h4>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                      {effectiveDesc}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Modal Footer Actions */}
          <div className="pt-4 border-t-2 border-border flex flex-col-reverse sm:flex-row items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>SEO Score:</span>
              <strong className="text-foreground font-mono">{seoChecklist.score}%</strong>
              <span>· Categoria:</span>
              <strong className="text-foreground">{selectedPage?.title || 'Nessuna'}</strong>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 sm:flex-none border-2 border-border px-4 py-2 text-xs font-semibold uppercase hover:bg-muted transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 sm:flex-none border-2 border-border bg-primary px-6 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--foreground)] hover:opacity-95 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <span>{saving ? 'Salvataggio…' : articleToEdit ? 'Aggiorna Articolo' : 'Pubblica Articolo'}</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
