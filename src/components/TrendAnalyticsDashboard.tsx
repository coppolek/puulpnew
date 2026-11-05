import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  TrendingUp,
  BarChart3,
  Clock,
  Sparkles,
  Calendar,
  Flame,
  ArrowUpRight,
  RefreshCw,
  FileText,
  Share2,
  ExternalLink,
  Layers,
  Hash,
  X,
  ChevronRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { StoredFeed, CustomPage, ManualArticle, SocialShareKit } from '../lib/firebase';
import { buildSiteArticleUrl, getArticleSiteSlug } from '../lib/shareUtils';
import { ShareData } from './ShareModal';

export interface TrendAnalyticsItem {
  id: string;
  title: string;
  link: string;
  description?: string;
  image?: string;
  date?: string;
  timestamp: number; // millisecond timestamp
  feedTitle: string;
  feedId: string;
  category: string;
  isManual?: boolean;
  rawArticle?: ManualArticle;
  socialShare?: SocialShareKit;
}

interface ThematicCategory {
  key: string;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  keywords: string[];
}

const THEMATIC_CATEGORIES: ThematicCategory[] = [
  {
    key: 'tech_ai',
    label: 'Tecnologia & Intelligenza Artificiale',
    icon: '🤖',
    color: '#2563eb',
    bgColor: 'rgba(37, 99, 235, 0.1)',
    keywords: ['ai', 'intelligenza artificiale', 'openai', 'chatgpt', 'google', 'gemini', 'apple', 'meta', 'algoritmo', 'chip', 'nvidia', 'software', 'app', 'smartphone', 'tech', 'digitale', 'robot', 'cloud', 'cybersecurity', 'hacker', 'deepfake', 'llm', 'ollama'],
  },
  {
    key: 'economy_finance',
    label: 'Economia, Finanza & Mercati',
    icon: '📈',
    color: '#059669',
    bgColor: 'rgba(5, 150, 105, 0.1)',
    keywords: ['borsa', 'mercati', 'inflazione', 'tassi', 'bce', 'fed', 'euro', 'dollaro', 'pil', 'banche', 'investimenti', 'finanza', 'economia', 'spread', 'btp', 'fisco', 'tasse', 'azioni', 'trimestrale', 'dividendo', 'bitcoin', 'crypto', 'oro', 'petrolio'],
  },
  {
    key: 'politics_institutions',
    label: 'Politica & Istituzioni',
    icon: '🏛️',
    color: '#dc2626',
    bgColor: 'rgba(220, 38, 38, 0.1)',
    keywords: ['governo', 'parlamento', 'ministro', 'meloni', 'legge', 'decreto', 'elezioni', 'partito', 'politica', 'unione europea', 'ue', 'commissione', 'riforma', 'senato', 'camera', 'opposizione', 'maggioranza', 'voto', 'premier'],
  },
  {
    key: 'world_geopolitics',
    label: 'Esteri & Geopolitica',
    icon: '🌍',
    color: '#7c3aed',
    bgColor: 'rgba(124, 58, 237, 0.1)',
    keywords: ['guerra', 'tregua', 'ucraina', 'russia', 'usa', 'trump', 'biden', 'cina', 'medio oriente', 'israele', 'gaza', 'nato', 'accordo', 'diplomazia', 'onu', 'crisi', 'esteri', 'iran', 'taiwan', 'sanzioni', 'pacifico'],
  },
  {
    key: 'science_health',
    label: 'Scienza, Ambiente & Salute',
    icon: '🔬',
    color: '#0891b2',
    bgColor: 'rgba(8, 145, 178, 0.1)',
    keywords: ['clima', 'scienza', 'spazio', 'nasa', 'salute', 'medicina', 'studio', 'ricerca', 'scoperta', 'vaccino', 'ospedale', 'tumore', 'ambiente', 'energia', 'rinnovabili', 'meteo', 'caldo', 'pianeta', 'terra', 'dna', 'cervello'],
  },
  {
    key: 'sports',
    label: 'Sport & Competizioni',
    icon: '⚽',
    color: '#ea580c',
    bgColor: 'rgba(234, 88, 12, 0.1)',
    keywords: ['calcio', 'serie a', 'champions league', 'milan', 'inter', 'juventus', 'napoli', 'roma', 'gol', 'gara', 'formula 1', 'ferrari', 'motogp', 'tennis', 'sinner', 'alcaraz', 'olimpiadi', 'partita', 'classifica', 'campionato', 'allenatore'],
  },
  {
    key: 'culture_entertainment',
    label: 'Cultura, Cinema & Spettacolo',
    icon: '🎬',
    color: '#db2777',
    bgColor: 'rgba(219, 39, 119, 0.1)',
    keywords: ['film', 'cinema', 'serie tv', 'netflix', 'musica', 'canzone', 'sanremo', 'festival', 'attore', 'regista', 'libro', 'autore', 'mostra', 'teatro', 'concerto', 'oscar', 'streaming', 'cultura', 'arte', 'spettacolo'],
  },
  {
    key: 'deals_shopping',
    label: 'Shopping, Offerte & E-Commerce',
    icon: '🛍️',
    color: '#d97706',
    bgColor: 'rgba(217, 119, 6, 0.1)',
    keywords: ['offerta', 'sconto', 'prezzo', 'amazon', 'volantino', 'promozione', 'miglior', 'recensione', 'shopping', 'acquisto', 'coupon', 'black friday', 'prime', 'garanzia', 'spedizione', 'confronto'],
  },
];

const ITALIAN_STOPWORDS = new Set([
  'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una',
  'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra',
  'e', 'ed', 'o', 'od', 'ma', 'se', 'perché', 'come', 'quando',
  'del', 'dello', 'della', 'dei', 'degli', 'delle',
  'al', 'allo', 'alla', 'ai', 'agli', 'alle',
  'dal', 'dallo', 'dalla', 'dai', 'dagli', 'dalle',
  'nel', 'nello', 'nella', 'nei', 'negli', 'nelle',
  'sul', 'sullo', 'sulla', 'sui', 'sugli', 'sulle',
  'che', 'chi', 'cui', 'quale', 'quali', 'questo', 'questa', 'questi', 'queste',
  'quello', 'quella', 'quelli', 'quelle', 'tutto', 'tutti', 'tutta', 'tutte',
  'non', 'più', 'meno', 'molto', 'poco', 'troppo', 'anche', 'ancora',
  'già', 'poi', 'dopo', 'prima', 'ora', 'adesso', 'sempre', 'mai',
  'sono', 'era', 'stato', 'stata', 'stati', 'state', 'essere', 'avere',
  'ha', 'hanno', 'aveva', 'sarà', 'saranno', 'può', 'possono', 'fare',
  'fatto', 'dice', 'detto', 'cosa', 'così', 'bene', 'male', 'dove',
  'senza', 'verso', 'contro', 'sotto', 'sopra', 'dentro', 'fuori',
  'suo', 'sua', 'suoi', 'sue', 'loro', 'nostro', 'nostra', 'vostro',
  'nuovo', 'nuova', 'nuovi', 'nuove', 'primo', 'prima', 'primi', 'prime',
  'ultimo', 'ultima', 'ultimi', 'ultime', 'due', 'tre', 'quattro', 'cinque',
  'ogni', 'alcuni', 'alcune', 'mentre', 'invece', 'quindi', 'infatti',
  'rss', 'feed', 'puulp', 'http', 'https', 'www', 'com', 'it', 'link',
  'oggi', 'ieri', 'anno', 'anni', 'giorno', 'giorni', 'mese', 'mesi', 'ore'
]);

interface TrendAnalyticsDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  savedFeeds: StoredFeed[];
  manualArticles: ManualArticle[];
  pages: CustomPage[];
  activePage?: CustomPage | null;
  onOpenArticle: (item: any) => void;
  onOpenShare: (data: ShareData) => void;
}

export function TrendAnalyticsDashboard({
  isOpen,
  onClose,
  savedFeeds,
  manualArticles,
  pages,
  activePage,
  onOpenArticle,
  onOpenShare,
}: TrendAnalyticsDashboardProps) {
  // Time Range Window: 24h, 48h, 7d, all
  const [timeRange, setTimeRange] = useState<'24h' | '48h' | '7d' | 'all'>('24h');
  // Scope filter: all vs active page only
  const [scopeFilter, setScopeFilter] = useState<'all' | 'active_page'>('all');
  // Interactive filters from chart interactions
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [selectedHourBucket, setSelectedHourBucket] = useState<number | null>(null);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // AI Ollama Trend Analysis state
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState<boolean>(false);
  const [aiAnalysisData, setAiAnalysisData] = useState<{
    summary?: string;
    topThemes?: Array<{ name: string; description: string; keyPoints: string[]; sentiment: string }>;
    emergingSignals?: string[];
    editorialAdvice?: string;
  } | null>(null);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Normalize articles from both RSS feeds and Manual Editorial items
  const allNormalizedArticles = useMemo<TrendAnalyticsItem[]>(() => {
    const list: TrendAnalyticsItem[] = [];
    const seenLinks = new Set<string>();

    // 1. Manual Editorial Articles
    for (const art of manualArticles) {
      const artUrl = art.link || `/?p=${encodeURIComponent(art.pageId)}&art=${encodeURIComponent(art.slug)}`;
      if (seenLinks.has(artUrl)) continue;
      seenLinks.add(artUrl);

      const parsedTime = art.createdAt ? new Date(art.createdAt).getTime() : Date.now();
      const pageRef = pages.find((p) => p.id === art.pageId);

      list.push({
        id: `manual_${art.id}`,
        title: art.title || 'Articolo Editoriale',
        link: artUrl,
        description: art.description || '',
        image: art.image,
        date: art.createdAt,
        timestamp: isNaN(parsedTime) ? Date.now() : parsedTime,
        feedTitle: `✍️ ${art.category || pageRef?.title || 'Editoriale'}`,
        feedId: `page_${art.pageId}`,
        category: art.category || pageRef?.category || 'Editoriale',
        isManual: true,
        rawArticle: art,
        socialShare: art.socialShare,
      });
    }

    // 2. RSS Feed Articles
    for (const feed of savedFeeds) {
      const feedDateFallback = feed.lastCheckedAt || feed.createdAt;
      const feedTimeFallback = feedDateFallback ? new Date(feedDateFallback).getTime() : Date.now();

      for (const item of feed.items || []) {
        if (!item.link || !item.title) continue;
        if (seenLinks.has(item.link)) continue;
        seenLinks.add(item.link);

        let itemTime = item.date ? new Date(item.date).getTime() : NaN;
        if (isNaN(itemTime)) {
          itemTime = isNaN(feedTimeFallback) ? Date.now() : feedTimeFallback;
        }

        const pageRef = feed.pageId ? pages.find((p) => p.id === feed.pageId) : null;

        list.push({
          id: `feed_${item.link}`,
          title: item.title,
          link: item.link,
          description: item.description || '',
          image: item.image,
          date: item.date || feed.lastCheckedAt,
          timestamp: itemTime,
          feedTitle: feed.title || 'Feed RSS',
          feedId: feed.id,
          category: pageRef?.category || pageRef?.title || 'News',
          isManual: false,
        });
      }
    }

    // Sort newest first
    list.sort((a, b) => b.timestamp - a.timestamp);
    return list;
  }, [savedFeeds, manualArticles, pages]);

  // Filter by Scope (All vs Active Page)
  const scopedArticles = useMemo(() => {
    if (scopeFilter === 'active_page' && activePage) {
      const pageFeedIds = new Set(activePage.feedIds || []);
      return allNormalizedArticles.filter((a) => {
        if (a.isManual && a.rawArticle?.pageId === activePage.id) return true;
        if (pageFeedIds.has(a.feedId)) return true;
        return false;
      });
    }
    return allNormalizedArticles;
  }, [allNormalizedArticles, scopeFilter, activePage]);

  // Filter by Time Range Window
  const timeWindowArticles = useMemo(() => {
    const now = Date.now();
    let msCutoff = 24 * 60 * 60 * 1000; // 24h default

    if (timeRange === '48h') msCutoff = 48 * 60 * 60 * 1000;
    else if (timeRange === '7d') msCutoff = 7 * 24 * 60 * 60 * 1000;
    else if (timeRange === 'all') msCutoff = Infinity;

    const filtered = scopedArticles.filter((art) => {
      if (msCutoff === Infinity) return true;
      const age = now - art.timestamp;
      return age >= 0 && age <= msCutoff;
    });

    // If strictly in 24h filter and feeds were parsed recently but dates inside RSS had timezone or slight offset,
    // or if the test database only has items from the current session, ensure we have a robust fallback
    if (filtered.length === 0 && timeRange === '24h' && scopedArticles.length > 0) {
      // Fallback to latest 50 articles from the stored database
      return scopedArticles.slice(0, 50);
    }

    return filtered;
  }, [scopedArticles, timeRange]);

  // KPI Calculations
  const kpis = useMemo(() => {
    const total = timeWindowArticles.length;
    const uniqueFeeds = new Set(timeWindowArticles.map((a) => a.feedTitle)).size;

    // Calculate hourly breakdown to find peak hour
    const hourCounts: { [hour: number]: number } = {};
    for (const art of timeWindowArticles) {
      const d = new Date(art.timestamp);
      const h = d.getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    }

    let peakHour = 12;
    let maxHourCount = 0;
    Object.entries(hourCounts).forEach(([h, count]) => {
      if (count > maxHourCount) {
        maxHourCount = count;
        peakHour = parseInt(h, 10);
      }
    });

    const peakHourLabel = `${peakHour.toString().padStart(2, '0')}:00 - ${((peakHour + 1) % 24).toString().padStart(2, '0')}:00`;

    return {
      total,
      uniqueFeeds,
      peakHourLabel,
      peakHourCount: maxHourCount,
    };
  }, [timeWindowArticles]);

  // 24-Hour Velocity Histogram Data (Hourly buckets from 24h ago to now)
  const hourlyChartData = useMemo(() => {
    const now = new Date();
    const buckets: Array<{
      hourIndex: number;
      label: string;
      hour: number;
      count: number;
      articles: TrendAnalyticsItem[];
      isCurrent: boolean;
    }> = [];

    // 24 buckets representing the last 24 hours in sequence
    for (let i = 23; i >= 0; i--) {
      const targetTime = new Date(now.getTime() - i * 60 * 60 * 1000);
      const targetHour = targetTime.getHours();
      const hourStart = new Date(targetTime);
      hourStart.setMinutes(0, 0, 0);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

      const matching = timeWindowArticles.filter((a) => {
        return a.timestamp >= hourStart.getTime() && a.timestamp < hourEnd.getTime();
      });

      buckets.push({
        hourIndex: 23 - i,
        label: `${targetHour.toString().padStart(2, '0')}:00`,
        hour: targetHour,
        count: matching.length,
        articles: matching,
        isCurrent: i === 0,
      });
    }

    const maxCount = Math.max(1, ...buckets.map((b) => b.count));
    return { buckets, maxCount };
  }, [timeWindowArticles]);

  // Thematic Category Breakdown
  const categoryBreakdown = useMemo(() => {
    const counts: { [key: string]: { category: ThematicCategory; count: number; articles: TrendAnalyticsItem[] } } = {};

    THEMATIC_CATEGORIES.forEach((cat) => {
      counts[cat.key] = { category: cat, count: 0, articles: [] };
    });

    const otherCategory: ThematicCategory = {
      key: 'other',
      label: 'Attualità & Altri Temi',
      icon: '📰',
      color: '#64748b',
      bgColor: 'rgba(100, 116, 139, 0.1)',
      keywords: [],
    };
    counts['other'] = { category: otherCategory, count: 0, articles: [] };

    for (const art of timeWindowArticles) {
      const textToSearch = `${art.title} ${art.description} ${art.category}`.toLowerCase();
      let matched = false;

      for (const cat of THEMATIC_CATEGORIES) {
        const hasKeyword = cat.keywords.some((k) => textToSearch.includes(k));
        if (hasKeyword) {
          counts[cat.key].count += 1;
          counts[cat.key].articles.push(art);
          matched = true;
          break;
        }
      }

      if (!matched) {
        counts['other'].count += 1;
        counts['other'].articles.push(art);
      }
    }

    const total = Math.max(1, timeWindowArticles.length);
    const sorted = Object.values(counts)
      .filter((c) => c.count > 0 || c.category.key !== 'other')
      .map((c) => ({
        ...c,
        percentage: Math.round((c.count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);

    return sorted;
  }, [timeWindowArticles]);

  // Top Trending Keywords & Entities Extracted with Italian NLP Tokenizer
  const topKeywords = useMemo(() => {
    const wordFreq: { [word: string]: { count: number; articles: TrendAnalyticsItem[] } } = {};

    for (const art of timeWindowArticles) {
      const fullText = `${art.title} ${art.description || ''}`;
      // Clean and normalize tokens
      const words = fullText
        .toLowerCase()
        .replace(/['’]/g, ' ')
        .replace(/[^a-zA-Z0-9àèéìòùáéíóú\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !ITALIAN_STOPWORDS.has(w) && !/^\d+$/.test(w));

      // Use a set per article so a word mentioned multiple times in the same headline counts once per article
      const uniqueWordsInArt = Array.from(new Set(words));
      for (const w of uniqueWordsInArt) {
        if (!wordFreq[w]) {
          wordFreq[w] = { count: 0, articles: [] };
        }
        wordFreq[w].count += 1;
        wordFreq[w].articles.push(art);
      }
    }

    const sortedWords = Object.entries(wordFreq)
      .map(([word, data]) => ({
        word: word.charAt(0).toUpperCase() + word.slice(1),
        count: data.count,
        articles: data.articles,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 16);

    return sortedWords;
  }, [timeWindowArticles]);

  // Most Active Sources / Feeds in 24h
  const topSources = useMemo(() => {
    const sourceMap: { [feedTitle: string]: { count: number; feedId: string } } = {};
    for (const art of timeWindowArticles) {
      const name = art.feedTitle;
      if (!sourceMap[name]) {
        sourceMap[name] = { count: 0, feedId: art.feedId };
      }
      sourceMap[name].count += 1;
    }
    return Object.entries(sourceMap)
      .map(([title, data]) => ({ title, count: data.count, feedId: data.feedId }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [timeWindowArticles]);

  // Filtered Articles for drill-down view below charts
  const filteredArticles = useMemo(() => {
    let list = timeWindowArticles;

    if (selectedCategoryKey) {
      const catEntry = categoryBreakdown.find((c) => c.category.key === selectedCategoryKey);
      if (catEntry) {
        list = catEntry.articles;
      }
    }

    if (selectedHourBucket !== null) {
      const bucket = hourlyChartData.buckets.find((b) => b.hour === selectedHourBucket);
      if (bucket) {
        list = bucket.articles;
      }
    }

    if (selectedKeyword) {
      const kw = selectedKeyword.toLowerCase();
      list = list.filter((a) => {
        const txt = `${a.title} ${a.description || ''}`.toLowerCase();
        return txt.includes(kw);
      });
    }

    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter((a) => {
        return (
          a.title.toLowerCase().includes(q) ||
          (a.description && a.description.toLowerCase().includes(q)) ||
          a.feedTitle.toLowerCase().includes(q)
        );
      });
    }

    return list;
  }, [
    timeWindowArticles,
    selectedCategoryKey,
    selectedHourBucket,
    selectedKeyword,
    searchFilter,
    categoryBreakdown,
    hourlyChartData.buckets,
  ]);

  // Run Ollama / AI Trend Brief Analysis
  async function handleRunAiAnalysis() {
    setAiAnalysisLoading(true);
    setAiAnalysisError(null);

    try {
      const sampleHeadlines = timeWindowArticles.slice(0, 30).map((a) => ({
        title: a.title,
        description: a.description ? a.description.slice(0, 180) : '',
        feedTitle: a.feedTitle,
        category: a.category,
      }));

      const res = await fetch('/api/analytics/trend-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articles: sampleHeadlines,
          timeWindow: timeRange,
          totalArticles: timeWindowArticles.length,
          topKeywords: topKeywords.slice(0, 8).map((k) => k.word),
        }),
      });

      if (!res.ok) {
        throw new Error(`Errore HTTP ${res.status}`);
      }

      const data = await res.json();
      setAiAnalysisData(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Errore imprevisto durante l\'elaborazione con Ollama.';
      setAiAnalysisError(msg);
    } finally {
      setAiAnalysisLoading(false);
    }
  }

  function handleResetFilters() {
    setSelectedCategoryKey(null);
    setSelectedHourBucket(null);
    setSelectedKeyword(null);
    setSearchFilter('');
  }

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="analytics-dashboard-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 md:p-6 bg-black/75 backdrop-blur-sm overflow-y-auto"
    >
      <div className="relative w-full max-w-6xl bg-card border-t-3 sm:border-2 border-border shadow-2xl rounded-t-2xl sm:rounded-xl overflow-hidden flex flex-col mt-auto sm:my-auto max-h-[94dvh] sm:max-h-[94vh] pb-safe">
        {/* Mobile Drag Handle */}
        <div className="w-10 h-1.5 bg-border/30 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0" />

        {/* Top Header Bar */}
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3.5 sm:px-6 py-3 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 id="analytics-dashboard-title" className="text-sm sm:text-lg font-bold text-foreground truncate">
                  Dashboard Analisi Trend
                </h2>
                <span className="text-[10px] sm:text-xs font-mono font-bold px-2 py-0.5 rounded bg-primary/15 text-primary border border-primary/30 shrink-0">
                  {timeRange === '24h' ? 'Ultime 24 Ore' : timeRange === '48h' ? 'Ultime 48 Ore' : timeRange === '7d' ? 'Ultimi 7 Giorni' : 'Archivio Completo'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Aggregazione in tempo reale dei flussi RSS e articoli memorizzati su puulp.it
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRunAiAnalysis}
              disabled={aiAnalysisLoading}
              className="border border-border bg-background hover:bg-muted text-foreground px-3 py-2 min-h-[40px] rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
              title="Elabora sintesi strategica con Ollama AI"
            >
              <Sparkles className={`h-3.5 w-3.5 text-primary ${aiAnalysisLoading ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{aiAnalysisLoading ? 'Elaborazione AI...' : 'Sintesi Ollama AI'}</span>
              <span className="md:hidden">AI</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="border border-border/80 bg-background hover:bg-destructive hover:text-white hover:border-destructive text-muted-foreground h-10 w-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
              aria-label="Chiudi dashboard"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-background/95 border-b border-border px-3.5 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          {/* Time range selector tabs */}
          <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-lg border border-border/60">
            {(
              [
                { id: '24h', label: 'Ultime 24h' },
                { id: '48h', label: '48h' },
                { id: '7d', label: '7 Giorni' },
                { id: 'all', label: 'Tutto' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setTimeRange(tab.id);
                  handleResetFilters();
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  timeRange === tab.id
                    ? 'bg-card text-foreground shadow-sm border border-border/80'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Scope filter selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">Ambito:</span>
            <div className="flex items-center gap-1 p-1 bg-muted/60 rounded-lg border border-border/60">
              <button
                type="button"
                onClick={() => {
                  setScopeFilter('all');
                  handleResetFilters();
                }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  scopeFilter === 'all'
                    ? 'bg-card text-foreground shadow-sm border border-border/80'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Tutti i Feed ({allNormalizedArticles.length})
              </button>
              {activePage && (
                <button
                  type="button"
                  onClick={() => {
                    setScopeFilter('active_page');
                    handleResetFilters();
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    scopeFilter === 'active_page'
                      ? 'bg-card text-foreground shadow-sm border border-border/80'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {activePage.title}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Dashboard Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="border border-border bg-card p-3.5 rounded-lg shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
                <span>Articoli nel Periodo</span>
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-foreground tabular-nums">
                {kpis.total}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                <span className="text-emerald-600 font-semibold">100% indicizzati</span>
                <span>· da RSS & editoriali</span>
              </div>
            </div>

            <div className="border border-border bg-card p-3.5 rounded-lg shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
                <span>Fonti & Feed Attivi</span>
                <Layers className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="text-2xl sm:text-3xl font-bold font-mono tracking-tight text-foreground tabular-nums">
                {kpis.uniqueFeeds}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                testate e canali monitorati
              </div>
            </div>

            <div className="border border-border bg-card p-3.5 rounded-lg shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
                <span>Picco di Pubblicazione</span>
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <div className="text-lg sm:text-xl font-bold font-mono tracking-tight text-foreground tabular-nums truncate">
                {kpis.peakHourLabel}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {kpis.peakHourCount} articoli pubblicati in quest'ora
              </div>
            </div>

            <div className="border border-border bg-card p-3.5 rounded-lg shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground text-xs mb-1">
                <span>Macro-Tema Dominante</span>
                <Flame className="h-4 w-4 text-destructive" />
              </div>
              <div className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
                {categoryBreakdown[0] ? `${categoryBreakdown[0].category.icon} ${categoryBreakdown[0].category.label.split('&')[0].trim()}` : 'In attesa dati'}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {categoryBreakdown[0] ? `${categoryBreakdown[0].percentage}% delle notizie nel periodo` : '—'}
              </div>
            </div>
          </div>

          {/* AI Ollama Trend Brief Card (if active or loaded) */}
          {aiAnalysisData && (
            <div className="border-2 border-primary/40 bg-primary/5 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🤖</span>
                  <h3 className="text-sm font-bold text-foreground">
                    Analisi Strategica dei Trend Elaborata da Ollama
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/20 text-primary font-bold">
                    AI ORCHESTRATOR
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAiAnalysisData(null)}
                  className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Nascondi
                </button>
              </div>

              {aiAnalysisData.summary && (
                <p className="text-xs sm:text-sm text-foreground/90 leading-relaxed font-medium bg-card/60 p-3 rounded-lg border border-border">
                  {aiAnalysisData.summary}
                </p>
              )}

              {aiAnalysisData.topThemes && aiAnalysisData.topThemes.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {aiAnalysisData.topThemes.map((theme, idx) => (
                    <div key={idx} className="border border-border bg-card p-3 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-primary">{theme.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          Tema {idx + 1}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">{theme.description}</p>
                      {theme.keyPoints && theme.keyPoints.length > 0 && (
                        <ul className="text-[11px] text-foreground space-y-1 pt-1 list-disc list-inside">
                          {theme.keyPoints.slice(0, 2).map((kp, kIdx) => (
                            <li key={kIdx} className="truncate">{kp}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {aiAnalysisData.editorialAdvice && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground pt-1 border-t border-border/60">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-foreground">Consiglio per la Redazione:</strong> {aiAnalysisData.editorialAdvice}
                  </span>
                </div>
              )}
            </div>
          )}

          {aiAnalysisError && (
            <div className="border border-destructive/30 bg-destructive/10 text-destructive text-xs p-3 rounded-lg flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{aiAnalysisError}</span>
            </div>
          )}

          {/* Charts Row: Hourly Velocity + Macro-Themes Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Chart 1: 24h Hourly Publication Velocity */}
            <div className="lg:col-span-7 border border-border bg-card p-4 sm:p-5 rounded-xl shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <span>Velocità di Pubblicazione nelle 24 Ore</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Volume di articoli pubblicati ora per ora (clicca su una colonna per filtrare)
                  </p>
                </div>
                {selectedHourBucket !== null && (
                  <button
                    type="button"
                    onClick={() => setSelectedHourBucket(null)}
                    className="text-xs text-primary underline font-medium cursor-pointer"
                  >
                    Reset ora
                  </button>
                )}
              </div>

              {/* Interactive SVG / Bar Chart */}
              <div className="flex-1 flex flex-col justify-end pt-4">
                <div className="h-44 flex items-end gap-1 sm:gap-1.5 w-full border-b border-border pb-1">
                  {hourlyChartData.buckets.map((b) => {
                    const heightPercent = Math.max(8, Math.round((b.count / hourlyChartData.maxCount) * 100));
                    const isSelected = selectedHourBucket === b.hour;

                    return (
                      <div
                        key={b.hourIndex}
                        onClick={() => setSelectedHourBucket(isSelected ? null : b.hour)}
                        className="group relative flex-1 h-full flex flex-col justify-end items-center cursor-pointer"
                        title={`${b.label}: ${b.count} articoli`}
                      >
                        {/* Tooltip on hover */}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none absolute -top-10 z-20 bg-foreground text-background text-[10px] font-mono font-bold px-2 py-1 rounded shadow-lg whitespace-nowrap">
                          {b.label} · {b.count} art.
                        </div>

                        {/* Bar */}
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className={`w-full rounded-t transition-all ${
                            isSelected
                              ? 'bg-primary ring-2 ring-primary ring-offset-1'
                              : b.isCurrent
                              ? 'bg-primary/80 group-hover:bg-primary'
                              : b.count > 0
                              ? 'bg-primary/40 group-hover:bg-primary/70'
                              : 'bg-muted/40'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* X-axis labels */}
                <div className="flex justify-between text-[10px] font-mono text-muted-foreground pt-2">
                  <span>-24h</span>
                  <span>-18h</span>
                  <span>-12h</span>
                  <span>-6h</span>
                  <span className="font-bold text-primary">Adesso</span>
                </div>
              </div>
            </div>

            {/* Chart 2: Thematic Category Distribution */}
            <div className="lg:col-span-5 border border-border bg-card p-4 sm:p-5 rounded-xl shadow-sm flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Layers className="h-4 w-4 text-emerald-600" />
                    <span>Distribuzione Macro-Temi</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Classificazione tematica delle notizie rilevate
                  </p>
                </div>
                {selectedCategoryKey && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategoryKey(null)}
                    className="text-xs text-primary underline font-medium cursor-pointer"
                  >
                    Tutti i temi
                  </button>
                )}
              </div>

              {/* Progress bars list */}
              <div className="space-y-3 flex-1 overflow-y-auto max-h-56 pr-1">
                {categoryBreakdown.map((item) => {
                  const isSelected = selectedCategoryKey === item.category.key;

                  return (
                    <div
                      key={item.category.key}
                      onClick={() => setSelectedCategoryKey(isSelected ? null : item.category.key)}
                      className={`p-2 rounded-lg cursor-pointer transition-colors border ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-transparent hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-semibold text-foreground flex items-center gap-1.5 truncate">
                          <span>{item.category.icon}</span>
                          <span className="truncate">{item.category.label}</span>
                        </span>
                        <span className="font-mono text-muted-foreground tabular-nums text-[11px] shrink-0 ml-2">
                          <strong className="text-foreground">{item.count}</strong> ({item.percentage}%)
                        </span>
                      </div>

                      {/* Bar fill */}
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          style={{
                            width: `${Math.max(4, item.percentage)}%`,
                            backgroundColor: item.category.color,
                          }}
                          className="h-full rounded-full transition-all duration-300"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Second Row: Hot Keywords & Active Sources */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Hot Trending Keywords */}
            <div className="lg:col-span-8 border border-border bg-card p-4 sm:p-5 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-amber-500" />
                  <h3 className="text-sm font-bold text-foreground">
                    Parole Chiave & Trend Tematici più Discussi
                  </h3>
                </div>
                {selectedKeyword && (
                  <button
                    type="button"
                    onClick={() => setSelectedKeyword(null)}
                    className="text-xs text-primary underline font-medium cursor-pointer"
                  >
                    Reset filtro parola
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Termini più frequenti nei titoli e sommari nelle ultime 24 ore. Clicca per visualizzare gli articoli corrispondenti.
              </p>

              <div className="flex flex-wrap gap-2">
                {topKeywords.map((kw, idx) => {
                  const isSelected = selectedKeyword === kw.word;
                  const isHot = idx < 3;

                  return (
                    <button
                      key={kw.word}
                      type="button"
                      onClick={() => setSelectedKeyword(isSelected ? null : kw.word)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center gap-2 ${
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                          : isHot
                          ? 'border-amber-500/50 bg-amber-500/10 text-foreground hover:bg-amber-500/20'
                          : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                    >
                      <span>{kw.word}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                          isSelected
                            ? 'bg-primary-foreground/20 text-primary-foreground font-bold'
                            : 'bg-background/80 text-foreground font-bold'
                        }`}
                      >
                        {kw.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active Sources */}
            <div className="lg:col-span-4 border border-border bg-card p-4 sm:p-5 rounded-xl shadow-sm">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-1">
                <Flame className="h-4 w-4 text-destructive" />
                <span>Fonti più Attive</span>
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Feed con maggior frequenza di aggiornamento
              </p>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {topSources.map((s, idx) => (
                  <div
                    key={s.title}
                    className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0"
                  >
                    <span className="truncate pr-2 font-medium text-foreground">
                      <span className="text-muted-foreground font-mono mr-1.5">{idx + 1}.</span>
                      {s.title}
                    </span>
                    <span className="font-mono text-muted-foreground tabular-nums text-[11px] shrink-0 font-semibold">
                      {s.count} art.
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Drill-Down Articles Section */}
          <div className="border border-border bg-card rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span>Articoli nel Periodo Selezionato ({filteredArticles.length})</span>
                </h3>
                <p className="text-xs text-muted-foreground">
                  {selectedCategoryKey
                    ? `Filtrato per: ${categoryBreakdown.find((c) => c.category.key === selectedCategoryKey)?.category.label}`
                    : selectedKeyword
                    ? `Filtrato per termine: "${selectedKeyword}"`
                    : selectedHourBucket !== null
                    ? `Filtrato per fascia oraria: ${selectedHourBucket.toString().padStart(2, '0')}:00`
                    : 'Tutti gli articoli indicizzati'}
                </p>
              </div>

              {/* Active Filter Indicators & Search Bar */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Cerca negli articoli..."
                  className="border border-border bg-background px-3 py-2 min-h-[42px] text-base sm:text-xs rounded-md flex-1 sm:w-56 focus:outline-none focus:ring-1 focus:ring-primary"
                />

                {(selectedCategoryKey || selectedKeyword || selectedHourBucket !== null || searchFilter) && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="border border-border bg-muted/60 hover:bg-muted text-foreground text-xs px-3 py-2 min-h-[42px] rounded-md font-medium cursor-pointer shrink-0"
                  >
                    Azzera
                  </button>
                )}
              </div>
            </div>

            {/* Articles List Grid */}
            {filteredArticles.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-xs">
                Nessun articolo corrisponde ai filtri selezionati. Prova a reimpostare i filtri.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pr-1">
                {filteredArticles.slice(0, 40).map((art) => {
                  const siteArtUrl = buildSiteArticleUrl(
                    {
                      id: art.id,
                      title: art.title,
                      link: art.link,
                      rawArticle: art.rawArticle,
                    },
                    activePage?.slug || activePage?.id
                  );

                  return (
                    <div
                      key={art.id}
                      className="border border-border bg-background/60 hover:bg-muted/40 p-3.5 rounded-lg flex flex-col justify-between transition-colors group"
                    >
                      <div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1 gap-2">
                          <span className="font-semibold text-primary truncate">{art.feedTitle}</span>
                          <span className="font-mono shrink-0 tabular-nums">
                            {art.date ? new Date(art.date).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '24h'}
                          </span>
                        </div>
                        <h4
                          onClick={() => {
                            onClose();
                            onOpenArticle(art);
                          }}
                          className="text-sm font-bold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors cursor-pointer"
                        >
                          {art.title}
                        </h4>
                        {art.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-normal">
                            {art.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-3 mt-2.5 border-t border-border/40 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenArticle(art);
                          }}
                          className="text-xs font-bold text-primary hover:underline cursor-pointer flex items-center gap-1 min-h-[38px] px-2 -ml-2 rounded hover:bg-primary/5"
                        >
                          <span>Leggi sul Sito</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            onOpenShare({
                              title: art.socialShare?.ogTitle || art.title,
                              text: art.socialShare?.ogDescription || art.description || `Leggi "${art.title}" su puulp.it:`,
                              url: siteArtUrl,
                              externalSourceUrl: art.link,
                              pageSlug: activePage?.slug || activePage?.id,
                              articleSlug: getArticleSiteSlug(art),
                              image: art.image,
                              source: art.feedTitle,
                              socialShare: art.socialShare,
                            });
                          }}
                          className="border border-border/80 bg-card hover:bg-muted text-foreground text-xs font-semibold flex items-center gap-1.5 cursor-pointer px-3 py-1.5 min-h-[38px] rounded shadow-xs"
                          title="Condividi link al sito con kit Ollama"
                        >
                          <Share2 className="h-3.5 w-3.5 text-primary" />
                          <span>Condividi Sito</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border bg-muted/30 px-4 sm:px-6 py-3 flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <span className="truncate mr-2">
            Dati calcolati in tempo reale su puulp.it
          </span>
          <button
            type="button"
            onClick={onClose}
            className="border border-border bg-background hover:bg-muted text-foreground px-4 py-2 min-h-[40px] rounded-lg text-xs font-semibold cursor-pointer shrink-0"
          >
            Chiudi Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
