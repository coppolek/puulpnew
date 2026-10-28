import React, { useState, useEffect } from 'react';
import {
  X,
  Coins,
  Sparkles,
  Link2,
  ExternalLink,
  Copy,
  Check,
  Download,
  Layers,
  FolderTree,
  ChevronDown,
  ChevronUp,
  Tag,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Plus,
  ShoppingBag,
  Info,
  Rss,
  Link as LinkIcon,
} from 'lucide-react';
import {
  AffiliateSetting,
  saveAffiliateSetting,
  getLocalAffiliateSetting,
  applyAffiliateToUrl,
  createCustomPage,
  saveFeedToDatabase,
  addFeedsToPage,
  CustomPage,
  StoredFeed,
} from '../lib/firebase.ts';

interface FeedItem {
  title: string;
  link: string;
  originalLink?: string;
  date?: string;
  description?: string;
  image?: string;
  price?: string;
}

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

interface AffiliateCategoryScraperModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: CustomPage[];
  onPageCreated?: (pageId: string) => void;
  onFeedsAdded?: (feedIds: string[]) => void;
}

export function AffiliateCategoryScraperModal({
  isOpen,
  onClose,
  pages,
  onPageCreated,
  onFeedsAdded,
}: AffiliateCategoryScraperModalProps) {
  // Affiliate Configuration
  const [affiliateId, setAffiliateId] = useState<string>('');
  const [network, setNetwork] = useState<'amazon' | 'ebay' | 'awin' | 'custom_param'>('amazon');
  const [customParam, setCustomParam] = useState<string>('tag');
  const [saveSettingNotice, setSaveSettingNotice] = useState<boolean>(false);

  // Scraper Input & Settings
  const [categoryUrl, setCategoryUrl] = useState<string>('');
  const [crawlSubcategories, setCrawlSubcategories] = useState<boolean>(true);
  const [maxSubcategories, setMaxSubcategories] = useState<number>(6);
  const [maxItems, setMaxItems] = useState<number>(20);
  const [autoCreatePage, setAutoCreatePage] = useState<boolean>(true);
  const [targetExistingPageId, setTargetExistingPageId] = useState<string>('');

  // Execution States
  const [loading, setLoading] = useState<boolean>(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scrapeResult, setScrapeResult] = useState<CategoryScrapeResult | null>(null);

  // UI Interactive States
  const [expandedSubcatId, setExpandedSubcatId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [allCopiedNotice, setAllCopiedNotice] = useState<boolean>(false);
  const [savingToPuulp, setSavingToPuulp] = useState<boolean>(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<string | null>(null);

  // Load saved affiliate configuration on open & handle Escape key
  useEffect(() => {
    if (isOpen) {
      const saved = getLocalAffiliateSetting();
      if (saved.affiliateId) {
        setAffiliateId(saved.affiliateId);
        setNetwork(saved.network || 'amazon');
        setCustomParam(saved.customParam || 'tag');
      }

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen, onClose]);

  // Live preview of transformed affiliate link
  const isAmazonMode = network === 'amazon' || categoryUrl.toLowerCase().includes('amazon') || categoryUrl.toLowerCase().includes('amzn');
  const sampleTestTarget = isAmazonMode
    ? 'https://www.amazon.it/dp/B0CRV68W6C'
    : 'https://www.negozio.it/prodotto/smartphone-xyz';
  const livePreviewUrl = applyAffiliateToUrl(
    sampleTestTarget,
    affiliateId || 'TUO_ID',
    isAmazonMode ? 'amazon' : network,
    isAmazonMode ? 'tag' : (customParam || 'tag')
  );

  async function handleSaveAffiliateConfig() {
    if (!affiliateId.trim()) return;
    try {
      await saveAffiliateSetting({
        affiliateId: affiliateId.trim(),
        network,
        customParam: customParam.trim() || 'tag',
      });
      setSaveSettingNotice(true);
      setTimeout(() => setSaveSettingNotice(false), 3000);
    } catch (err) {
      console.warn('Errore salvataggio ID affiliato:', err);
    }
  }

  async function handleStartCategoryScrape(e: React.FormEvent) {
    e.preventDefault();
    if (!categoryUrl.trim()) return;

    if (!affiliateId.trim()) {
      setError('Inserisci il tuo ID Affiliato prima di avviare lo scraping per monetizzare i link.');
      return;
    }

    setLoading(true);
    setError(null);
    setProgressStep('Connessione alla categoria madre e scoperta struttura…');

    try {
      // Auto-save affiliate config as preferred
      await handleSaveAffiliateConfig();

      const response = await fetch('/api/scrape-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: categoryUrl.trim(),
          affiliateId: affiliateId.trim(),
          network,
          customParam: customParam.trim() || 'tag',
          crawlSubcategories,
          maxSubcategories: Number(maxSubcategories) || 6,
          maxItems: Number(maxItems) || 20,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Errore durante lo scraping della categoria.');
      }

      setScrapeResult(data);
      if (data.subcategories && data.subcategories.length > 0) {
        setExpandedSubcatId(data.subcategories[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto durante lo scraping.';
      setError(msg);
    } finally {
      setLoading(false);
      setProgressStep(null);
    }
  }

  // Copy single link
  function handleCopyLink(link: string) {
    navigator.clipboard.writeText(link);
    setCopiedLink(link);
    setTimeout(() => setCopiedLink(null), 2000);
  }

  // Copy all links as formatted list for Telegram, WhatsApp, social, or newsletter
  function handleCopyAllLinks() {
    if (!scrapeResult) return;
    const lines = [
      `📢 ${scrapeResult.category.title} — Offerte & Annunci con Link Affiliato`,
      `Fonte: ${scrapeResult.category.url}`,
      `ID Affiliato: ${scrapeResult.affiliate.id} (${scrapeResult.affiliate.network})`,
      '----------------------------------------',
      '',
    ];

    for (const item of scrapeResult.allMonetizedItems) {
      lines.push(`• ${item.title}`);
      if (item.price) lines.push(`  Prezzo: ${item.price}`);
      if (item.subcategoryName) lines.push(`  Categoria: ${item.subcategoryName}`);
      lines.push(`  Link: ${item.link}`);
      lines.push('');
    }

    navigator.clipboard.writeText(lines.join('\n'));
    setAllCopiedNotice(true);
    setTimeout(() => setAllCopiedNotice(false), 3000);
  }

  // Copy all category & subcategory links as a structured summary
  function handleCopyCategoryLinks() {
    if (!scrapeResult) return;
    const lines = [
      `📁 CATEGORIA PRINCIPALE: ${scrapeResult.category.title}`,
      `🔗 Link Categoria: ${scrapeResult.category.url}`,
      scrapeResult.category.rssUrl ? `📡 Feed RSS: ${scrapeResult.category.rssUrl}` : '',
      `ID Affiliato: ${scrapeResult.affiliate.id} (${scrapeResult.affiliate.network})`,
      '========================================',
      `📂 SOTTOCATEGORIE RILEVATE (${scrapeResult.subcategories.length}):`,
      '',
    ];

    scrapeResult.subcategories.forEach((sub, idx) => {
      lines.push(`${idx + 1}. ${sub.name} (${sub.itemsCount || sub.items?.length || 0} annunci)`);
      lines.push(`   🔗 Link Diretto: ${sub.url}`);
      if (sub.rssUrl) lines.push(`   📡 Feed RSS: ${sub.rssUrl}`);
      lines.push('');
    });

    navigator.clipboard.writeText(lines.filter(Boolean).join('\n'));
    setCopiedLink('ALL_CATEGORIES');
    setTimeout(() => setCopiedLink(null), 3000);
  }

  // Export as CSV with dedicated subcategory and category links
  function handleExportCsv() {
    if (!scrapeResult) return;
    const subUrlMap = new Map<string, string>();
    for (const s of scrapeResult.subcategories) {
      subUrlMap.set(s.name, s.url);
    }

    const headers = ['Titolo', 'Sottocategoria', 'Link Sottocategoria', 'Prezzo', 'Link Affiliato Prodotto', 'Link Originale', 'Data', 'Link Categoria Madre'];
    const rows = scrapeResult.allMonetizedItems.map((item) => [
      `"${(item.title || '').replace(/"/g, '""')}"`,
      `"${(item.subcategoryName || '').replace(/"/g, '""')}"`,
      `"${(subUrlMap.get(item.subcategoryName) || scrapeResult.category.url).replace(/"/g, '""')}"`,
      `"${(item.price || '').replace(/"/g, '""')}"`,
      `"${(item.link || '').replace(/"/g, '""')}"`,
      `"${(item.originalLink || '').replace(/"/g, '""')}"`,
      `"${(item.date || '').replace(/"/g, '""')}"`,
      `"${scrapeResult.category.url.replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `puulp_affiliati_${scrapeResult.category.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Save everything directly to puulp.it (New Custom Page + Feeds per Subcategory)
  async function handleSaveEverythingToPuulp() {
    if (!scrapeResult) return;
    setSavingToPuulp(true);
    setSaveSuccessNotice(null);

    try {
      let pageIdToUse = targetExistingPageId;

      // 1. Create a new Page if requested or if no existing page selected
      if (autoCreatePage || !pageIdToUse) {
        const pageSlug = `aff_${scrapeResult.category.title.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40)}_${Date.now().toString(36)}`;
        pageIdToUse = await createCustomPage({
          title: scrapeResult.category.title.slice(0, 180),
          slug: pageSlug,
          description: `Rassegna annunci e prodotti monetizzati da ${scrapeResult.category.title}. Aggiornati con link affiliato.`,
          category: 'Affiliazioni',
          feedIds: [],
        });
        if (onPageCreated) onPageCreated(pageIdToUse);
      }

      // 2. Save each subcategory as a Feed in Firestore
      const createdFeedIds: string[] = [];

      // Save main direct items feed if exists
      if (scrapeResult.directItems && scrapeResult.directItems.length > 0) {
        const mainFeedXml = `<rss version="2.0"><channel><title>${scrapeResult.category.title}</title><link>${scrapeResult.category.url}</link><description>Feed principale monetizzato</description></channel></rss>`;
        const mainFeedId = await saveFeedToDatabase({
          url: scrapeResult.category.url,
          title: `${scrapeResult.category.title} (Principale)`,
          description: scrapeResult.category.description,
          interval: 60,
          itemsCount: scrapeResult.directItems.length,
          lastCheckedAt: new Date().toISOString(),
          xml: mainFeedXml,
          pageId: pageIdToUse,
          items: scrapeResult.directItems.map((it) => ({
            title: it.title,
            link: it.link,
            date: it.date || new Date().toLocaleDateString('it-IT'),
            description: it.description || (it.price ? `Prezzo: ${it.price}` : ''),
            image: it.image,
          })),
        });
        createdFeedIds.push(mainFeedId);
      }

      // Save each subcategory
      for (const sub of scrapeResult.subcategories) {
        if (sub.items && sub.items.length > 0) {
          const subXml = `<rss version="2.0"><channel><title>${sub.name}</title><link>${sub.url}</link><description>Feed sottocategoria monetizzata</description></channel></rss>`;
          const subFeedId = await saveFeedToDatabase({
            url: sub.url,
            title: `${sub.name}`,
            description: `Sottocategoria di ${scrapeResult.category.title} monetizzata con ID ${affiliateId}`,
            interval: 60,
            itemsCount: sub.items.length,
            lastCheckedAt: new Date().toISOString(),
            xml: subXml,
            pageId: pageIdToUse,
            items: sub.items.map((it) => ({
              title: it.title,
              link: it.link,
              date: it.date || new Date().toLocaleDateString('it-IT'),
              description: it.description || (it.price ? `Prezzo: ${it.price}` : ''),
              image: it.image,
            })),
          });
          createdFeedIds.push(subFeedId);
        }
      }

      // 3. Connect feeds to the page
      if (createdFeedIds.length > 0 && pageIdToUse) {
        await addFeedsToPage(pageIdToUse, createdFeedIds, []);
      }

      if (onFeedsAdded) onFeedsAdded(createdFeedIds);

      setSaveSuccessNotice(
        `Pubblicato con successo su puulp.it! Creata nuova pagina con ${createdFeedIds.length} feed e ${scrapeResult.allMonetizedItems.length} annunci con link affiliato attivo.`
      );
    } catch (err: unknown) {
      console.error('Errore salvataggio su puulp.it:', err);
      setError(err instanceof Error ? err.message : 'Errore nel salvataggio su puulp.it');
    } finally {
      setSavingToPuulp(false);
    }
  }

  // Save single subcategory as feed
  async function handleSaveSingleSubcategory(sub: ScrapedSubcategory) {
    if (!sub.items || sub.items.length === 0) return;
    try {
      const feedXml = `<rss version="2.0"><channel><title>${sub.name}</title><link>${sub.url}</link><description>Feed monetizzato</description></channel></rss>`;
      const feedId = await saveFeedToDatabase({
        url: sub.url,
        title: sub.name,
        description: `Feed estratto con link affiliato ${affiliateId}`,
        interval: 60,
        itemsCount: sub.items.length,
        lastCheckedAt: new Date().toISOString(),
        xml: feedXml,
        items: sub.items.map((it) => ({
          title: it.title,
          link: it.link,
          date: it.date || '',
          description: it.description || '',
          image: it.image,
        })),
      });

      if (targetExistingPageId) {
        await addFeedsToPage(targetExistingPageId, [feedId], []);
      }

      if (onFeedsAdded) onFeedsAdded([feedId]);
      setSaveSuccessNotice(`Sottocategoria "${sub.name}" salvata nei feed di puulp.it!`);
      setTimeout(() => setSaveSuccessNotice(null), 4000);
    } catch (err: unknown) {
      setError(`Errore nel salvataggio: ${err instanceof Error ? err.message : 'Errore imprevisto'}`);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="affiliate-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-neutral-100 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="affiliate-modal-title" className="text-lg font-bold text-neutral-900">
                  Scraping Categorie & Monetizzazione Affiliati
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                  Amministratore
                </span>
              </div>
              <p className="text-xs text-neutral-500">
                Estrai intere categorie e sottocategorie, inietta automaticamente il tuo ID affiliato e monetizza con un clic
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Chiudi finestra"
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* SECTION 1: Configurazione ID Affiliato & Programma Partner */}
          <div className="p-4 sm:p-5 rounded-xl border border-amber-200 bg-amber-50/40 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-600" />
                <h4 className="text-sm font-bold text-neutral-900">1. Il Tuo ID Affiliato / Partner</h4>
              </div>
              {saveSettingNotice && (
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  <Check className="w-3.5 h-3.5" /> Salvato come predefinito
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-4">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Piattaforma / Network
                </label>
                <select
                  value={network}
                  onChange={(e) => {
                    const net = e.target.value as 'amazon' | 'ebay' | 'awin' | 'custom_param';
                    setNetwork(net);
                    if (net === 'amazon') setCustomParam('tag');
                    if (net === 'ebay') setCustomParam('campid');
                    if (net === 'awin') setCustomParam('awinaffid');
                  }}
                  className="w-full text-xs font-medium px-3 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="amazon">Amazon Associates (?tag=...)</option>
                  <option value="ebay">eBay Partner Network (?campid=...)</option>
                  <option value="awin">Awin / Zanox (?awinaffid=...)</option>
                  <option value="custom_param">Parametro Personalizzato (?ref=, ?aff=...)</option>
                </select>
              </div>

              <div className="sm:col-span-5">
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  ID Affiliato / Tracking Tag <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={affiliateId}
                    onChange={(e) => setAffiliateId(e.target.value)}
                    placeholder="es. puulp-21 oppure mio-tag"
                    className="w-full text-xs font-mono font-medium px-3 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {network === 'custom_param' && (
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">
                    Nome Parametro URL
                  </label>
                  <input
                    type="text"
                    value={customParam}
                    onChange={(e) => setCustomParam(e.target.value)}
                    placeholder="es. ref, aff, tag"
                    className="w-full text-xs font-mono px-3 py-2 rounded-lg border border-neutral-300 bg-white text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              )}

              <div className={network === 'custom_param' ? 'sm:col-span-12' : 'sm:col-span-3'}>
                <button
                  type="button"
                  onClick={handleSaveAffiliateConfig}
                  className="w-full text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50 hover:border-neutral-400 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Salva ID
                </button>
              </div>
            </div>

            {/* Live Preview of Tagged URL */}
            <div className="pt-2 border-t border-amber-200/60 text-xs text-neutral-600 flex items-center flex-wrap gap-1.5">
              <span className="font-semibold text-neutral-700">Anteprima link monetizzato:</span>
              <code className="px-2 py-0.5 rounded bg-white border border-neutral-200 text-amber-900 font-mono text-[11px] truncate max-w-full">
                {livePreviewUrl}
              </code>
            </div>
          </div>

          {/* SECTION 2: URL Categoria & Opzioni Scraping */}
          <form onSubmit={handleStartCategoryScrape} className="space-y-4">
            {network === 'amazon' && (
              <div className="p-3 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 text-xs flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-neutral-800">
                  <p className="font-bold text-amber-950">
                    🛡️ Motore Intelligente Amazon Attivo (Bypass Anti-Bot 503)
                  </p>
                  <p className="text-[11px] text-amber-900 mt-0.5">
                    Risolve il blocco "503 Ci dispiace" di Amazon: puoi inserire link di ricerca (es. <code className="bg-white/80 px-1 py-0.5 rounded font-mono">amazon.it/s?k=...</code>), link categoria (<code className="bg-white/80 px-1 py-0.5 rounded font-mono">amazon.it/b?node=...</code>), link prodotto (<code className="bg-white/80 px-1 py-0.5 rounded font-mono">/dp/ASIN</code>), link brevi <code className="bg-white/80 px-1 py-0.5 rounded font-mono">amzn.eu</code>, codici ASIN, oppure digitare direttamente un termine come <code className="bg-white/80 px-1 py-0.5 rounded font-mono">Smartphone 5G</code>!
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-neutral-800 uppercase tracking-wider">
                2. URL Categoria Principale o Termine di Ricerca
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={categoryUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCategoryUrl(val);
                    const lower = val.toLowerCase();
                    if (lower.includes('amazon.') || lower.includes('amzn.eu') || lower.includes('amzn.to')) {
                      setNetwork('amazon');
                      setCustomParam('tag');
                    }
                  }}
                  placeholder={
                    network === 'amazon'
                      ? 'https://www.amazon.it/s?k=smartphone oppure link amzn.eu o nome categoria...'
                      : 'https://negozio.it/categoria/elettronica oppure catalogo prodotti o annunci...'
                  }
                  required
                  className="flex-1 text-sm px-3.5 py-2.5 rounded-xl border border-neutral-300 bg-white text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  disabled={loading || !categoryUrl.trim()}
                  className="px-5 py-2.5 rounded-xl bg-neutral-900 text-white font-semibold text-sm hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 shadow-sm shrink-0 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                      Scraping in corso…
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Avvia Scraping Categorie
                    </>
                  )}
                </button>
              </div>

              {/* Quick Category Presets for fast 1-click test & monetization */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1.5">
                <span className="text-[11px] font-semibold text-neutral-500">Preset rapidi Amazon:</span>
                {[
                  { label: '📱 Smartphone 5G', query: 'https://www.amazon.it/s?k=smartphone+5g' },
                  { label: '🎧 Cuffie Wireless', query: 'https://www.amazon.it/s?k=cuffie+bluetooth' },
                  { label: '💻 Notebook & PC', query: 'https://www.amazon.it/s?k=notebook+portatile' },
                  { label: '⌚ Smartwatch', query: 'https://www.amazon.it/s?k=smartwatch' },
                  { label: '🎮 Accessori Gaming', query: 'https://www.amazon.it/s?k=gaming+accessori' },
                  { label: '🏠 Smart Home', query: 'https://www.amazon.it/s?k=smart+home+alexa' },
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setCategoryUrl(preset.query);
                      setNetwork('amazon');
                      setCustomParam('tag');
                    }}
                    className="text-[11px] px-2 py-0.5 rounded-md bg-neutral-100 hover:bg-amber-100 text-neutral-700 hover:text-amber-900 border border-neutral-200 hover:border-amber-300 transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Opzioni avanzate */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-neutral-50 border border-neutral-200">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={crawlSubcategories}
                  onChange={(e) => setCrawlSubcategories(e.target.checked)}
                  className="mt-0.5 rounded text-amber-600 focus:ring-amber-500"
                />
                <div className="text-xs">
                  <span className="font-semibold text-neutral-800 block">Deep Crawl Sottocategorie</span>
                  <span className="text-neutral-500 text-[11px]">
                    Visita automaticamente le sottocategorie scoperte ed estrae gli annunci
                  </span>
                </div>
              </label>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Max Sottocategorie
                </label>
                <select
                  value={maxSubcategories}
                  onChange={(e) => setMaxSubcategories(Number(e.target.value))}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white"
                >
                  <option value={4}>Fino a 4 sottocategorie</option>
                  <option value={6}>Fino a 6 sottocategorie</option>
                  <option value={8}>Fino a 8 sottocategorie</option>
                  <option value={12}>Fino a 12 sottocategorie</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Destinazione su puulp.it
                </label>
                <select
                  value={targetExistingPageId}
                  onChange={(e) => {
                    setTargetExistingPageId(e.target.value);
                    if (e.target.value) setAutoCreatePage(false);
                  }}
                  className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-neutral-300 bg-white"
                >
                  <option value="">Crea nuova Pagina Tematica</option>
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      Aggiungi a: {p.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </form>

          {/* Stato di caricamento in tempo reale */}
          {loading && (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900">{progressStep || 'Analisi categoria in corso…'}</p>
                <p className="text-xs text-amber-700">
                  L'algoritmo sta scoprendo il menu, le sottocategorie e applicando l'ID affiliato a ciascun link.
                </p>
              </div>
            </div>
          )}

          {/* Errore */}
          {error && (
            <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm flex items-start gap-2.5">
              <Info className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-xs uppercase tracking-wide">Scraping non riuscito</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Notifica salvataggio completato */}
          {saveSuccessNotice && (
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm flex items-start gap-2.5 shadow-sm">
              <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-xs uppercase tracking-wide text-emerald-800">Operazione completata</p>
                <p className="text-xs mt-0.5 font-medium">{saveSuccessNotice}</p>
              </div>
            </div>
          )}

          {/* SECTION 3: Risultati Interattivi dello Scraping */}
          {scrapeResult && (
            <div className="space-y-5 pt-3 border-t border-neutral-200">
              {/* Header Risultati & Statistiche */}
              <div className="p-4 rounded-xl bg-neutral-900 text-white flex flex-col justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <FolderTree className="w-4 h-4 text-amber-400" />
                      <h4 className="text-base font-bold">{scrapeResult.category.title}</h4>
                    </div>
                    <p className="text-xs text-neutral-400 mt-0.5 truncate max-w-xl">
                      {scrapeResult.category.description}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-neutral-800 text-amber-300 border border-neutral-700">
                        {scrapeResult.subcategories.length} Sottocategorie
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        {scrapeResult.allMonetizedItems.length} Annunci / Prodotti Monetizzati
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-neutral-800 text-neutral-300">
                        tag: {scrapeResult.affiliate.id}
                      </span>
                    </div>
                  </div>

                  {/* Pulsanti Azione Globale */}
                  <div className="flex items-center flex-wrap gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyCategoryLinks}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-300 font-semibold text-xs flex items-center gap-1.5 border border-amber-500/40 transition-colors shadow-sm"
                      title="Copia l'elenco di tutti i link delle categorie e sottocategorie"
                    >
                      {copiedLink === 'ALL_CATEGORIES' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <LinkIcon className="w-3.5 h-3.5 text-amber-400" />}
                      {copiedLink === 'ALL_CATEGORIES' ? 'Link Categorie Copiati!' : 'Copia Link Categorie'}
                    </button>

                    <button
                      type="button"
                      onClick={handleCopyAllLinks}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-xs flex items-center gap-1.5 border border-neutral-700 transition-colors"
                    >
                      {allCopiedNotice ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {allCopiedNotice ? 'Copiati!' : 'Copia Tutti i Link'}
                    </button>

                    <button
                      type="button"
                      onClick={handleExportCsv}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-xs flex items-center gap-1.5 border border-neutral-700 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                      Esporta CSV
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveEverythingToPuulp}
                      disabled={savingToPuulp}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-xs hover:from-amber-600 hover:to-orange-600 transition-all shadow-md shadow-amber-500/30 flex items-center gap-1.5"
                    >
                      {savingToPuulp ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Plus className="w-3.5 h-3.5" />
                      )}
                      Salva Tutto su puulp.it
                    </button>
                  </div>
                </div>

                {/* Link Categoria Madre Diretto & Esclusivo */}
                <div className="mt-2 pt-3 border-t border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[11px] font-bold shrink-0 border border-amber-500/30 flex items-center gap-1">
                      <LinkIcon className="w-3 h-3" />
                      Link Categoria Madre:
                    </span>
                    <span className="font-mono text-neutral-300 text-xs truncate max-w-sm sm:max-w-md select-all" title={scrapeResult.category.url}>
                      {scrapeResult.category.url}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyLink(scrapeResult.category.url)}
                      className="px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Copia link diretto monetizzato della categoria madre"
                    >
                      {copiedLink === scrapeResult.category.url ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
                      {copiedLink === scrapeResult.category.url ? 'Copiato!' : 'Copia Link'}
                    </button>
                    <a
                      href={scrapeResult.category.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Apri pagina categoria madre"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Apri
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        const rss = scrapeResult.category.rssUrl || `${window.location.origin}/api/public/rss?url=${encodeURIComponent(scrapeResult.category.url)}&every=60`;
                        handleCopyLink(rss);
                      }}
                      className="px-2.5 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 text-amber-400 border border-neutral-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Copia feed RSS pubblico della categoria"
                    >
                      <Rss className="w-3.5 h-3.5 text-orange-400" />
                      Feed RSS
                    </button>
                  </div>
                </div>
              </div>

              {/* Elenco Sottocategorie & Annunci */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h5 className="text-xs font-bold text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-amber-500" />
                    Sottocategorie con Link Proprio ({scrapeResult.subcategories.length})
                  </h5>
                  <span className="text-[11px] text-neutral-500 font-medium">
                    Tutte le sottocategorie hanno il proprio link monetizzato e feed RSS
                  </span>
                </div>

                {scrapeResult.subcategories.length === 0 && (
                  <p className="text-xs text-neutral-500 p-4 border border-dashed rounded-xl text-center">
                    Nessuna sottocategoria nidificata rilevata; tutti i prodotti sono stati estratti direttamente dalla categoria madre.
                  </p>
                )}

                {scrapeResult.subcategories.map((sub) => {
                  const isExpanded = expandedSubcatId === sub.id;
                  return (
                    <div
                      key={sub.id}
                      className="border border-neutral-200 rounded-xl overflow-hidden bg-white shadow-sm"
                    >
                      {/* Subcategory Bar with its OWN prominent link */}
                      <div
                        onClick={() => setExpandedSubcatId(isExpanded ? null : sub.id)}
                        className="px-4 py-3 bg-neutral-50 hover:bg-neutral-100/80 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors select-none"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4 text-neutral-500 shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-neutral-500 shrink-0" />
                            )}
                            <span className="font-bold text-sm text-neutral-900 truncate">
                              {sub.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 shrink-0">
                              {sub.items?.length || sub.itemsCount || 0} annunci
                            </span>
                          </div>

                          {/* Sottocategoria: il suo link specifico visualizzato */}
                          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-neutral-600 font-mono">
                            <LinkIcon className="w-3 h-3 text-amber-600 shrink-0" />
                            <span className="truncate max-w-sm sm:max-w-md md:max-w-xl select-all" title={sub.url}>
                              {sub.url}
                            </span>
                          </div>
                        </div>

                        {/* Azioni dirette sul Link della Sottocategoria */}
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => handleCopyLink(sub.url)}
                            className="text-xs font-semibold px-2.5 py-1 rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100 hover:border-neutral-400 transition-colors flex items-center gap-1 shadow-sm"
                            title="Copia link monetizzato di questa sottocategoria"
                          >
                            {copiedLink === sub.url ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-amber-600" />}
                            {copiedLink === sub.url ? 'Copiato!' : 'Copia Link'}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const rss = sub.rssUrl || `${window.location.origin}/api/public/rss?url=${encodeURIComponent(sub.url)}&every=60`;
                              handleCopyLink(rss);
                            }}
                            className="text-xs font-semibold px-2 py-1 rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100 hover:border-neutral-400 transition-colors flex items-center gap-1 shadow-sm"
                            title="Copia feed RSS pubblico di questa sottocategoria"
                          >
                            <Rss className="w-3.5 h-3.5 text-orange-500" />
                            Feed RSS
                          </button>

                          <a
                            href={sub.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold px-2 py-1 rounded-md bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center gap-1 shadow-sm"
                            title="Apri pagina della sottocategoria"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-neutral-600" />
                            Apri
                          </a>

                          <button
                            type="button"
                            onClick={() => handleSaveSingleSubcategory(sub)}
                            className="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1 shadow-sm"
                            title="Salva questa sottocategoria come feed indipendente su puulp.it"
                          >
                            <Plus className="w-3 h-3 text-white" />
                            Salva Feed
                          </button>
                        </div>
                      </div>

                      {/* Items Grid */}
                      {isExpanded && (
                        <div className="p-4 border-t border-neutral-200 bg-white">
                          {(!sub.items || sub.items.length === 0) ? (
                            <p className="text-xs text-neutral-400 italic">
                              Nessun annuncio estratto per questa sottocategoria.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {sub.items.map((item, idx) => (
                                <div
                                  key={idx}
                                  className="p-3 rounded-lg border border-neutral-200 hover:border-amber-300 bg-neutral-50/50 flex gap-3 text-xs"
                                >
                                  {item.image ? (
                                    <img
                                      src={item.image}
                                      alt={item.title}
                                      className="w-16 h-16 object-cover rounded-md border border-neutral-200 shrink-0 bg-white"
                                      onError={(e) => {
                                        const target = e.currentTarget;
                                        target.onerror = null;
                                        target.src = 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=200&auto=format&fit=crop&q=80';
                                      }}
                                    />
                                  ) : (
                                    <div className="w-16 h-16 rounded-md border border-neutral-200 bg-white flex items-center justify-center shrink-0 text-neutral-400">
                                      <ShoppingBag className="w-6 h-6" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                                    <div>
                                      <h6 className="font-semibold text-neutral-900 line-clamp-2" title={item.title}>
                                        {item.title}
                                      </h6>
                                      {item.price && (
                                        <span className="inline-block mt-1 font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">
                                          {item.price}
                                        </span>
                                      )}
                                      {item.date && (
                                        <span className="text-[10px] text-neutral-400 ml-2">
                                          {item.date}
                                        </span>
                                      )}
                                    </div>

                                    {/* Affiliate Link Actions */}
                                    <div className="mt-2 pt-2 border-t border-neutral-200 flex items-center justify-between gap-2">
                                      <span className="text-[10px] font-mono text-amber-700 font-semibold truncate">
                                        Link monetizzato
                                      </span>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => handleCopyLink(item.link)}
                                          className="p-1 rounded text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200 transition-colors"
                                          title="Copia link affiliato"
                                        >
                                          {copiedLink === item.link ? (
                                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                                          ) : (
                                            <Copy className="w-3.5 h-3.5" />
                                          )}
                                        </button>
                                        <a
                                          href={item.link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="px-2 py-0.5 rounded bg-amber-500 text-white font-semibold text-[11px] hover:bg-amber-600 flex items-center gap-1 transition-colors"
                                          title="Test link affiliato in nuova scheda"
                                        >
                                          Test <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Direct Items from Main Category (if any) */}
              {scrapeResult.directItems && scrapeResult.directItems.length > 0 && (
                <div className="p-4 border border-neutral-200 rounded-xl bg-neutral-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
                      <ShoppingBag className="w-4 h-4 text-neutral-600" />
                      Annunci Diretti Categoria Principale ({scrapeResult.directItems.length})
                    </h5>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {scrapeResult.directItems.slice(0, 8).map((it, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg border border-neutral-200 bg-white text-xs flex gap-2.5 items-center hover:border-amber-300 transition-colors"
                      >
                        {it.image ? (
                          <img
                            src={it.image}
                            alt={it.title}
                            className="w-12 h-12 object-cover rounded-md border border-neutral-200 shrink-0 bg-neutral-50"
                            onError={(e) => {
                              const target = e.currentTarget;
                              target.onerror = null;
                              target.src = 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=200&auto=format&fit=crop&q=80';
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-md border border-neutral-200 bg-neutral-100 flex items-center justify-center shrink-0 text-neutral-400">
                            <ShoppingBag className="w-5 h-5" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-neutral-900 line-clamp-1 block" title={it.title}>
                            {it.title}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {it.price && (
                              <span className="font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded text-[10px]">
                                {it.price}
                              </span>
                            )}
                            <span className="text-[10px] text-amber-700 font-mono">Link monetizzato</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopyLink(it.link)}
                            className="p-1 rounded text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                            title="Copia link affiliato"
                          >
                            {copiedLink === it.link ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <a
                            href={it.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 px-1.5 rounded bg-amber-500 text-white font-medium text-[10px] hover:bg-amber-600 flex items-center gap-0.5 transition-colors"
                            title="Test link affiliato in nuova scheda"
                          >
                            Test <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-amber-500" />
            <span>Monetizzazione 100% integrata in puulp.it</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 font-semibold hover:bg-neutral-100 active:bg-neutral-200 transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
