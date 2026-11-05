/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User } from 'firebase/auth';
import {
  testConnection,
  saveFeedToDatabase,
  deleteFeedFromDatabase,
  listenToSavedFeeds,
  createCustomPage,
  deleteCustomPage,
  listenToCustomPages,
  addFeedsToPage,
  removeFeedFromPage,
  saveVisitorSubscription,
  deleteVisitorSubscription,
  getLocalVisitorSubscription,
  publishLiveNotification,
  listenToLiveNotifications,
  signInAdminWithGoogle,
  signInAdminWithCode,
  signOutAdmin,
  listenToAuthState,
  isUserAdmin,
  ADMIN_EMAIL,
  ADMIN_FALLBACK_CODE,
  StoredFeed,
  CustomPage,
  VisitorSubscription,
  LiveNotification,
  ManualArticle,
  saveManualArticle,
  deleteManualArticle,
  listenToManualArticles,
} from './lib/firebase.ts';
import { AdSenseBanner } from './components/AdSenseBanner.tsx';
import { NotificationAdCard } from './components/NotificationAdCard.tsx';
import { ShareModal, ShareData } from './components/ShareModal.tsx';
import { AffiliateCategoryScraperModal } from './components/AffiliateCategoryScraperModal.tsx';
import { ManualArticleModal } from './components/ManualArticleModal.tsx';
import { ArticleDetailModal, ArticleDetailItem } from './components/ArticleDetailModal.tsx';
import { OllamaAdminModal } from './components/OllamaAdminModal.tsx';
import { TrendAnalyticsDashboard } from './components/TrendAnalyticsDashboard.tsx';
import {
  buildSiteArticleUrl,
  buildSitePageUrl,
  ensureInternalSiteUrl,
  getArticleSiteSlug,
  matchesArticleParam,
} from './lib/shareUtils.ts';

const isAffiliateLink = (link: string): boolean => {
  if (!link) return false;
  return /tag=|campid=|awinaffid=|aff=|ref=|partner=|affiliate/i.test(link);
};

interface FeedItem {
  title: string;
  link: string;
  date?: string;
  description?: string;
  image?: string;
  price?: string;
  isManual?: boolean;
  rawArticle?: ManualArticle;
}

interface ScrapedFeed {
  fetchedAt: string;
  feed: {
    title: string;
    description: string;
    link: string;
    items: FeedItem[];
  };
  xml: string;
}

const INTERVAL_OPTIONS = [15, 30, 60, 180, 360, 720, 1440];

const formatInterval = (minutes: number) => {
  if (minutes < 60) return `${minutes} minuti`;
  if (minutes === 60) return '1 ora';
  if (minutes < 1440) return `${minutes / 60} ore`;
  return '1 giorno';
};

// Determina se nello slot pubblicitario mostrare il banner AdSense o l'invito alle notifiche (casuale 50/50 stabile)
const isNotificationAdSlot = (idx: number, seedKey: string = '') => {
  let hash = (idx + 1) * 31;
  for (let i = 0; i < seedKey.length; i++) {
    hash = (hash << 5) - hash + seedKey.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 2 === 0;
};

const fontFraunces: React.CSSProperties = {
  fontFamily: 'Fraunces, Georgia, serif',
};

const fontMono: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
};

export default function App() {
  // Pages and feeds from Firestore
  const [pages, setPages] = useState<CustomPage[]>([]);
  const [activePageId, setActivePageId] = useState<string>('');
  const [savedFeeds, setSavedFeeds] = useState<StoredFeed[]>([]);
  const [, setDbStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  // Dropdown Menu ("Menu a tendina") state & ref
  const [pageDropdownOpen, setPageDropdownOpen] = useState<boolean>(false);
  const [dropdownSearch, setDropdownSearch] = useState<string>('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Authentication & Admin Role
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [adminCodeInput, setAdminCodeInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);

  // Redazione Panel visibility (accessible only when isAdmin is true)
  const [adminMode, setAdminMode] = useState<boolean>(false);

  // Search feature ("Cerca")
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchScope, setSearchScope] = useState<'page' | 'all'>('page');
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  function handleScrollToSearch() {
    if (searchInputRef.current) {
      searchInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 300);
    }
  }

  function handleScrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Real-time Notifications & Visitor Subscriptions
  const [liveNotifications, setLiveNotifications] = useState<LiveNotification[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const [showNotifModal, setShowNotifModal] = useState<boolean>(false);
  const [visitorSub, setVisitorSub] = useState<VisitorSubscription | null>(null);
  const [subEmail, setSubEmail] = useState<string>('');
  const [subAllPages, setSubAllPages] = useState<boolean>(true);
  const [subSelectedPages, setSubSelectedPages] = useState<string[]>([]);
  const [subNotifyBrowser, setSubNotifyBrowser] = useState<boolean>(true);
  const [subNotifyInApp, setSubNotifyInApp] = useState<boolean>(true);
  const [subSaving, setSubSaving] = useState<boolean>(false);
  const [subSuccessNotice, setSubSuccessNotice] = useState<string | null>(null);
  const [activeToast, setActiveToast] = useState<LiveNotification | null>(null);

  // Social Content Sharing Modal
  const [shareModalData, setShareModalData] = useState<ShareData | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);

  // 24h Trend Analytics Dashboard Modal
  const [showAnalyticsDashboard, setShowAnalyticsDashboard] = useState<boolean>(false);

  // New Page Modal State (for admin mode)
  const [showNewPageModal, setShowNewPageModal] = useState<boolean>(false);
  const [newPageTitle, setNewPageTitle] = useState('');
  const [newPageSlug, setNewPageSlug] = useState('');
  const [newPageDesc, setNewPageDesc] = useState('');
  const [newPageCategory, setNewPageCategory] = useState('Tech');
  const [newPageUrlsText, setNewPageUrlsText] = useState('');
  const [newPageSelectedDbFeedIds, setNewPageSelectedDbFeedIds] = useState<string[]>([]);
  const [creatingPage, setCreatingPage] = useState<boolean>(false);
  const [createProgressText, setCreateProgressText] = useState<string | null>(null);

  // Add Feeds to Active Page Modal State (for admin mode)
  const [showAddFeedsModal, setShowAddFeedsModal] = useState<boolean>(false);
  const [addFeedsTab, setAddFeedsTab] = useState<'newUrls' | 'fromDb'>('newUrls');
  const [addFeedsUrlsText, setAddFeedsUrlsText] = useState('');
  const [addFeedsInterval, setAddFeedsInterval] = useState(60);
  const [addFeedsSelectedDbIds, setAddFeedsSelectedDbIds] = useState<string[]>([]);
  const [addingFeedsLoading, setAddingFeedsLoading] = useState<boolean>(false);
  const [addingProgressText, setAddingProgressText] = useState<string | null>(null);

  // Scraper State for Admin Tooling
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState(60);
  const [dbSaveNotice, setDbSaveNotice] = useState<string | null>(null);
  const [refreshingAllFeeds, setRefreshingAllFeeds] = useState(false);

  // Feedback states
  const [copiedFeedId, setCopiedFeedId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [pageCopiedRss, setPageCopiedRss] = useState(false);
  const [pageCopiedLink, setPageCopiedLink] = useState(false);
  const [copiedDropdownId, setCopiedDropdownId] = useState<string | null>(null);

  // Affiliate & Category Scraper Modal State
  const [showAffiliateModal, setShowAffiliateModal] = useState<boolean>(false);

  // Ollama AI Super Administrator Modal State
  const [showOllamaModal, setShowOllamaModal] = useState<boolean>(false);

  // Manual Editorial Articles & SEO state
  const [manualArticles, setManualArticles] = useState<ManualArticle[]>([]);
  const [showManualArticleModal, setShowManualArticleModal] = useState<boolean>(false);
  const [articleToEdit, setArticleToEdit] = useState<ManualArticle | null>(null);
  const [readingArticle, setReadingArticle] = useState<ArticleDetailItem | null>(null);
  const deepLinkResolvedRef = useRef<string | null>(null);

  // Timeline Pagination, Archive Navigation & Sorting state
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(20);

  // Listen to Firestore database, Auth state, and Notifications on boot
  useEffect(() => {
    testConnection()
      .then(() => setDbStatus('connected'))
      .catch((err) => {
        console.error('Firestore connection test failed:', err);
        setDbStatus('error');
      });

    // Check stored visitor subscription
    const localSub = getLocalVisitorSubscription();
    if (localSub) {
      setVisitorSub(localSub);
      setSubEmail(localSub.email);
      setSubAllPages(localSub.pages.includes('all'));
      setSubSelectedPages(localSub.pages);
      setSubNotifyBrowser(localSub.notifyBrowser);
      setSubNotifyInApp(localSub.notifyInApp);
    }

    // Check query params for admin mode
    const params = new URLSearchParams(window.location.search);
    const hasAdminParam = params.get('admin') === 'true' || params.get('admin') === '1' || window.location.hash === '#admin';

    // Check stored admin session
    const localAdminSession = localStorage.getItem('feedforge_admin_session');
    if (localAdminSession === 'ADMIN_ACTIVE' || hasAdminParam) {
      setIsAdmin(true);
      if (hasAdminParam) setAdminMode(true);
    }

    // Listen to Firebase Auth
    const unsubscribeAuth = listenToAuthState((user) => {
      setCurrentUser(user);
      const isAdm = isUserAdmin(user, localStorage.getItem('feedforge_admin_session'));
      setIsAdmin(isAdm);
      if (isAdm && hasAdminParam) {
        setAdminMode(true);
      }
    });

    // Listen to live notifications
    let initialNotifsLoaded = false;
    const unsubscribeNotifs = listenToLiveNotifications((notifs) => {
      setLiveNotifications(notifs);

      // Trigger toast & browser push for newest notification if not initial boot
      if (initialNotifsLoaded && notifs.length > 0) {
        const latest = notifs[0];
        setUnreadNotifCount((prev) => prev + 1);

        // Show in-app toast
        setActiveToast(latest);
        setTimeout(() => setActiveToast(null), 6000);

        // Trigger native browser notification if granted
        if (
          typeof window !== 'undefined' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          try {
            new Notification(`puulp.it · ${latest.title}`, {
              body: latest.message || 'Nuovo articolo appena pubblicato!',
              icon: '/favicon.ico',
            });
          } catch {
            // ignore
          }
        }
      }
      initialNotifsLoaded = true;
    });

    // Listen to Feeds
    const unsubscribeFeeds = listenToSavedFeeds(
      (feeds) => setSavedFeeds(feeds),
      (err) => console.error('Feeds snapshot error:', err)
    );

    // Listen to Pages with deep link support
    const unsubscribePages = listenToCustomPages(
      (customPages) => {
        setPages(customPages);
        if (customPages.length === 0) {
          seedStarterPages();
        } else {
          setActivePageId((current) => {
            const urlParams = new URLSearchParams(window.location.search);
            const targetP = urlParams.get('p') || urlParams.get('page');
            const targetCat = urlParams.get('cat') || urlParams.get('categoria');
            if (targetP) {
              const matched = customPages.find((p) => p.slug === targetP || p.id === targetP);
              if (matched) return matched.id;
            }
            if (targetCat) {
              const matched = customPages.find((p) => p.category?.toLowerCase() === targetCat.toLowerCase());
              if (matched) return matched.id;
            }
            if (!current || !customPages.some((p) => p.id === current)) {
              return customPages[0].id;
            }
            return current;
          });
        }
      },
      (err) => console.error('Pages snapshot error:', err)
    );

    // Listen to manual articles with SEO
    const unsubscribeArticles = listenToManualArticles(
      (articles) => {
        setManualArticles(articles);
        const urlParams = new URLSearchParams(window.location.search);
        const targetArt = urlParams.get('art') || urlParams.get('article');
        if (targetArt) {
          const matchedArt = articles.find((a) => a.slug === targetArt || a.id === targetArt);
          if (matchedArt) {
            setReadingArticle(matchedArt);
          }
        }
      },
      (err) => console.error('Articles snapshot error:', err)
    );

    return () => {
      unsubscribeAuth();
      unsubscribeNotifs();
      unsubscribeFeeds();
      unsubscribePages();
      unsubscribeArticles();
    };
  }, []);

  async function seedStarterPages() {
    try {
      const pageId = await createCustomPage({
        title: 'Tecnologia & Dev',
        slug: 'tech-dev',
        description: 'Raccolta e feed unificato dei migliori blog di sviluppo, architettura software e innovazione.',
        category: 'Tech',
        feedIds: [],
      });
      await createCustomPage({
        title: 'Notizie & Attualità',
        slug: 'news-attualita',
        description: 'Rassegna stampa di cronaca, trend emergenti e discussioni comunitarie.',
        category: 'News',
        feedIds: [],
      });
      setActivePageId(pageId);
    } catch {
      // Ignored if already seeded
    }
  }

  // Active page object
  const activePage = useMemo(() => {
    if (!pages || pages.length === 0) return null;
    return pages.find((p) => p.id === activePageId) || pages[0] || null;
  }, [activePageId, pages]);

  // Feeds associated with active custom page
  const pageFeeds = useMemo(() => {
    if (!activePage) return [];
    return savedFeeds.filter(
      (f) =>
        (activePage.feedIds && activePage.feedIds.includes(f.id)) ||
        f.pageId === activePage.id
    );
  }, [activePage, savedFeeds]);

  // Close dropdown on click outside or escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setPageDropdownOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPageDropdownOpen(false);
      }
    }
    if (pageDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [pageDropdownOpen]);

  // Active page feed count
  const activePageFeedCount = useMemo(() => {
    if (!activePage) return 0;
    return savedFeeds.filter(
      (f) => (activePage.feedIds && activePage.feedIds.includes(f.id)) || f.pageId === activePage.id
    ).length;
  }, [activePage, savedFeeds]);

  // Filtered pages for dropdown search
  const filteredDropdownPages = useMemo(() => {
    if (!dropdownSearch.trim()) return pages;
    const q = dropdownSearch.toLowerCase().trim();
    return pages.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }, [pages, dropdownSearch]);

  // Dynamic SEO & OpenGraph synchronization when active page changes
  useEffect(() => {
    if (activePage) {
      document.title = `${activePage.title} — puulp.it`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        metaDesc.setAttribute(
          'content',
          activePage.description
            ? `${activePage.description} — Rassegna stampa e feed su puulp.it`
            : `Leggi gli ultimi articoli e notizie di ${activePage.title} su puulp.it`
        );
      }
      const ogTitle = document.querySelector('meta[property="og:title"]');
      if (ogTitle) ogTitle.setAttribute('content', `${activePage.title} — puulp.it`);
      const twTitle = document.querySelector('meta[name="twitter:title"]');
      if (twTitle) twTitle.setAttribute('content', `${activePage.title} — puulp.it`);

      // Sync URL query parameter so every category & page has its own direct shareable link
      try {
        const slug = activePage.slug || activePage.id;
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get('p') !== slug) {
          currentUrl.searchParams.set('p', slug);
          window.history.replaceState({}, '', currentUrl.toString());
        }
      } catch {}
    } else {
      document.title = 'puulp.it — Rassegna Stampa, Pagine Tematiche e Feed RSS';
    }
  }, [activePage]);

  function handleCopyPageLink() {
    if (!activePage) return;
    const directUrl = buildSitePageUrl(activePage.slug || activePage.id);
    navigator.clipboard.writeText(directUrl);
    setPageCopiedLink(true);
    setTimeout(() => setPageCopiedLink(false), 2000);
  }

  function handleOpenShare(data: ShareData) {
    const fallbackPage = data.pageSlug || activePage?.slug || activePage?.id;
    const internalUrl = ensureInternalSiteUrl(data.url, {
      title: data.title,
      pageSlugOrId: fallbackPage,
      articleSlug: data.articleSlug,
    });
    setShareModalData({
      ...data,
      url: internalUrl,
      pageSlug: fallbackPage,
    });
    setIsShareModalOpen(true);
  }

  // Deep-link resolution for shared article URLs (?art=<slug>) across BOTH manual articles and RSS feed items
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const targetArt = urlParams.get('art') || urlParams.get('article');
    if (!targetArt || deepLinkResolvedRef.current === targetArt) return;

    // 1. Check manual editorial articles first
    const matchedManual = manualArticles.find((a) => matchesArticleParam(targetArt, a));
    if (matchedManual) {
      deepLinkResolvedRef.current = targetArt;
      setReadingArticle(matchedManual);
      if (matchedManual.pageId && pages.some((p) => p.id === matchedManual.pageId)) {
        setActivePageId(matchedManual.pageId);
      }
      return;
    }

    // 2. Check all saved RSS feed items so shared feed articles open inside puulp.it popup reader
    for (const feed of savedFeeds) {
      const matchedItem = (feed.items || []).find((item) => matchesArticleParam(targetArt, item));
      if (matchedItem) {
        deepLinkResolvedRef.current = targetArt;
        const feedPage = pages.find(
          (p) => (p.feedIds && p.feedIds.includes(feed.id)) || feed.pageId === p.id
        );
        if (feedPage && !urlParams.get('p')) {
          setActivePageId(feedPage.id);
        }
        setReadingArticle({
          title: matchedItem.title,
          link: matchedItem.link,
          image: matchedItem.image,
          description: matchedItem.description,
          date: matchedItem.date,
          createdAt: matchedItem.date || new Date().toISOString(),
          feedTitle: feed.title,
          category: feedPage?.category || feedPage?.title || 'Articolo',
          price: (matchedItem as { price?: string }).price,
          isManual: false,
          pageId: feedPage?.slug || feedPage?.id,
          slug: getArticleSiteSlug(matchedItem),
        });
        return;
      }
    }
  }, [manualArticles, savedFeeds, pages]);

  // All articles across current scope (both manual editorial articles & feed items)
  const scopedArticles = useMemo(() => {
    const list: Array<FeedItem & { feedTitle: string; feedId: string }> = [];
    const seenLinks = new Set<string>();

    // 1. Manual Editorial Articles in this scope
    const targetManualArticles =
      searchScope === 'all'
        ? manualArticles
        : manualArticles.filter((a) => a.pageId === activePage?.id);

    for (const a of targetManualArticles) {
      const artUrl =
        a.link ||
        `${window.location.origin}/?p=${encodeURIComponent(a.pageId)}&art=${encodeURIComponent(a.slug)}`;
      if (!seenLinks.has(artUrl)) {
        seenLinks.add(artUrl);
        list.push({
          title: a.title,
          link: artUrl,
          date: new Date(a.createdAt).toLocaleDateString('it-IT'),
          description: a.description,
          image: a.image,
          price: a.price,
          isManual: true,
          rawArticle: a,
          feedTitle: `✍️ ${a.category || activePage?.category || 'Editoriale'}`,
          feedId: `manual_${a.id}`,
        });
      }
    }

    // 2. Automated Feed Articles
    const targetFeeds = searchScope === 'all' ? savedFeeds : pageFeeds;

    for (const f of targetFeeds) {
      for (const item of f.items || []) {
        if (!seenLinks.has(item.link)) {
          seenLinks.add(item.link);
          list.push({
            ...item,
            feedTitle: f.title,
            feedId: f.id,
          });
        }
      }
    }

    list.sort((a, b) => {
      // If both published on same date and one is manual, show manual editorial first
      if (a.isManual && !b.isManual && a.date === b.date) return sortOrder === 'newest' ? -1 : 1;
      if (!a.date || !b.date) return 0;
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      if (isNaN(timeA) || isNaN(timeB)) return 0;
      return sortOrder === 'newest' ? timeB - timeA : timeA - timeB;
    });

    return list;
  }, [searchScope, pageFeeds, savedFeeds, manualArticles, activePage, sortOrder]);

  async function handleSaveManualArticle(
    data: Omit<ManualArticle, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
  ) {
    await saveManualArticle(data);
    setDbSaveNotice('Articolo salvato e pubblicato nella categoria con ottimizzazione SEO!');
    setTimeout(() => setDbSaveNotice(null), 3500);
  }

  async function handleDeleteManualArticle(articleId: string) {
    await deleteManualArticle(articleId);
    setDbSaveNotice('Articolo eliminato.');
    setTimeout(() => setDbSaveNotice(null), 2500);
  }

  // Open ANY article (feed or manual) in in-app popup reader
  function handleOpenArticle(item: FeedItem & { feedTitle?: string }) {
    if (item.rawArticle) {
      setReadingArticle(item.rawArticle);
      return;
    }

    setReadingArticle({
      title: item.title,
      link: item.link,
      image: item.image,
      description: item.description,
      date: item.date,
      createdAt: item.date || new Date().toISOString(),
      feedTitle: item.feedTitle || activePage?.title,
      category: activePage?.category || activePage?.title || 'Articolo',
      price: item.price,
      isManual: false,
      pageId: activePage?.slug || activePage?.id,
      slug: getArticleSiteSlug(item),
    });
  }

  function handleCloseArticleModal() {
    setReadingArticle(null);
    try {
      const currentUrl = new URL(window.location.href);
      if (currentUrl.searchParams.has('art') || currentUrl.searchParams.has('article')) {
        currentUrl.searchParams.delete('art');
        currentUrl.searchParams.delete('article');
        window.history.replaceState({}, '', currentUrl.toString());
      }
    } catch {
      // ignore
    }
  }

  // Filtered articles based on search query ("Cerca") and source chip
  const displayedArticles = useMemo(() => {
    let filtered = scopedArticles;

    if (selectedSourceFilter && searchScope === 'page') {
      filtered = filtered.filter((it) => it.feedTitle === selectedSourceFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter((it) => {
        const titleMatch = it.title && it.title.toLowerCase().includes(q);
        const descMatch = it.description && it.description.toLowerCase().includes(q);
        const feedMatch = it.feedTitle && it.feedTitle.toLowerCase().includes(q);
        const dateMatch = it.date && it.date.toLowerCase().includes(q);
        return Boolean(titleMatch || descMatch || feedMatch || dateMatch);
      });
    }

    return filtered;
  }, [scopedArticles, selectedSourceFilter, searchScope, searchQuery]);

  // Reset pagination to page 1 whenever filters, search, page or sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [activePageId, searchQuery, selectedSourceFilter, searchScope, sortOrder, pageSize]);

  const effectivePageSize = pageSize === 'all' ? Math.max(1, displayedArticles.length) : pageSize;
  const totalPages = Math.max(1, Math.ceil(displayedArticles.length / effectivePageSize));
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedArticles = useMemo(() => {
    if (pageSize === 'all') return displayedArticles;
    const start = (validCurrentPage - 1) * pageSize;
    return displayedArticles.slice(start, start + pageSize);
  }, [displayedArticles, validCurrentPage, pageSize]);

  // Index and navigation inside in-app article popup reader
  const readingArticleIndex = useMemo(() => {
    if (!readingArticle) return -1;
    return displayedArticles.findIndex((a) => a.link === readingArticle.link);
  }, [readingArticle, displayedArticles]);

  const hasPrevArticle = readingArticleIndex > 0;
  const hasNextArticle = readingArticleIndex >= 0 && readingArticleIndex < displayedArticles.length - 1;

  function handlePrevArticle() {
    if (readingArticleIndex > 0) {
      handleOpenArticle(displayedArticles[readingArticleIndex - 1]);
    }
  }

  function handleNextArticle() {
    if (readingArticleIndex >= 0 && readingArticleIndex < displayedArticles.length - 1) {
      handleOpenArticle(displayedArticles[readingArticleIndex + 1]);
    }
  }

  // Feeds available in the database that are NOT yet in this page
  const availableDbFeedsForActivePage = useMemo(() => {
    if (!activePage) return savedFeeds;
    const currentIds = new Set(pageFeeds.map((f) => f.id));
    return savedFeeds.filter((f) => !currentIds.has(f.id));
  }, [activePage, pageFeeds, savedFeeds]);

  const pageAggregatedRssUrl =
    typeof window !== 'undefined' && pageFeeds.length > 0 && activePage
      ? `${window.location.origin}/api/public/page-rss?title=${encodeURIComponent(
          activePage.title
        )}&description=${encodeURIComponent(
          activePage.description || ''
        )}&urls=${encodeURIComponent(pageFeeds.map((f) => f.url).join(','))}&slug=${encodeURIComponent(
          activePage.slug
        )}`
      : '';

  // Core scraper helper
  async function scrapeSingleUrl(targetUrl: string, pollInterval = 60, assignPageId?: string): Promise<string> {
    const finalUrl = /^https?:\/\//i.test(targetUrl.trim()) ? targetUrl.trim() : `https://${targetUrl.trim()}`;
    const response = await fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: finalUrl, interval: pollInterval }),
    });

    const data: ScrapedFeed = await response.json();
    if (!response.ok) {
      throw new Error((data as unknown as { error?: string }).error || `Errore durante la lettura di ${finalUrl}`);
    }

    const feedId = await saveFeedToDatabase({
      url: data.feed.link,
      title: data.feed.title,
      description: data.feed.description,
      interval: pollInterval,
      itemsCount: data.feed.items.length,
      lastCheckedAt: data.fetchedAt,
      xml: data.xml,
      items: data.feed.items,
      pageId: assignPageId,
    });

    // Broadcast real-time notification for the top article to all subscribed visitors
    if (data.feed.items && data.feed.items.length > 0) {
      const topArticle = data.feed.items[0];
      try {
        await publishLiveNotification({
          title: topArticle.title,
          message: topArticle.description || `Nuovo articolo pubblicato su ${data.feed.title}`,
          link: topArticle.link,
          pageId: assignPageId,
          feedTitle: data.feed.title,
        });
      } catch (e) {
        console.warn('Notification broadcast note:', e);
      }
    }

    return feedId;
  }

  // Single scrape from admin form
  async function performScrape(targetUrl: string) {
    setLoading(true);
    setError(null);
    setDbSaveNotice(null);

    try {
      const finalUrl = /^https?:\/\//i.test(targetUrl.trim()) ? targetUrl.trim() : `https://${targetUrl.trim()}`;
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: finalUrl, interval }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Errore durante la lettura della pagina.');
      }

      const targetPageId = activePage?.id;
      const feedId = await saveFeedToDatabase({
        url: data.feed.link,
        title: data.feed.title,
        description: data.feed.description,
        interval,
        itemsCount: data.feed.items.length,
        lastCheckedAt: data.fetchedAt,
        xml: data.xml,
        items: data.feed.items,
        pageId: targetPageId,
      });

      if (targetPageId && activePage) {
        await addFeedsToPage(targetPageId, [feedId], activePage.feedIds || []);
      }

      // Publish live notification
      if (data.feed.items && data.feed.items.length > 0) {
        const topArticle = data.feed.items[0];
        await publishLiveNotification({
          title: topArticle.title,
          message: topArticle.description || `Nuovo articolo da ${data.feed.title}`,
          link: topArticle.link,
          pageId: targetPageId,
          feedTitle: data.feed.title,
        });
      }

      setUrl('');
      setDbSaveNotice('Feed salvato nel database, collegato e notificato ai lettori');
      setTimeout(() => setDbSaveNotice(null), 3500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore imprevisto';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // Refresh all feeds on active page
  async function handleRefreshAllPageFeeds() {
    if (pageFeeds.length === 0 || refreshingAllFeeds) return;
    setRefreshingAllFeeds(true);
    let updatedCount = 0;

    for (const feed of pageFeeds) {
      try {
        await scrapeSingleUrl(feed.url, feed.interval, activePage?.id);
        updatedCount++;
      } catch (err) {
        console.warn(`Aggiornamento fallito per ${feed.url}:`, err);
      }
    }

    setRefreshingAllFeeds(false);
    setDbSaveNotice(`${updatedCount} feed aggiornati con successo`);
    setTimeout(() => setDbSaveNotice(null), 3000);
  }

  // Add multiple feeds to active page
  async function handleAddFeedsToActivePageSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activePage) return;

    setAddingFeedsLoading(true);
    setAddingProgressText('Inizio aggiunta feed…');

    const addedFeedIds: string[] = [];

    if (addFeedsTab === 'fromDb' || addFeedsSelectedDbIds.length > 0) {
      addedFeedIds.push(...addFeedsSelectedDbIds);
    }

    if (addFeedsTab === 'newUrls' && addFeedsUrlsText.trim()) {
      const rawUrls = addFeedsUrlsText
        .split(/[\n,]+/)
        .map((u) => u.trim())
        .filter((u) => u.length > 3);

      for (let i = 0; i < rawUrls.length; i++) {
        const target = rawUrls[i];
        setAddingProgressText(`Scraping feed ${i + 1} di ${rawUrls.length}…`);
        try {
          const feedId = await scrapeSingleUrl(target, addFeedsInterval, activePage.id);
          addedFeedIds.push(feedId);
        } catch (err) {
          console.error(`Scrape fallito per ${target}:`, err);
        }
      }
    }

    if (addedFeedIds.length > 0) {
      await addFeedsToPage(activePage.id, addedFeedIds, activePage.feedIds || []);
    }

    setAddFeedsUrlsText('');
    setAddFeedsSelectedDbIds([]);
    setAddingProgressText(null);
    setAddingFeedsLoading(false);
    setShowAddFeedsModal(false);
    setDbSaveNotice(`${addedFeedIds.length} feed collegati alla pagina`);
    setTimeout(() => setDbSaveNotice(null), 3500);
  }

  // Create new page
  async function handleCreatePageSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newPageTitle.trim()) return;

    setCreatingPage(true);
    setCreateProgressText('Creazione pagina in corso…');

    try {
      const autoSlug = newPageSlug.trim()
        ? newPageSlug.trim()
        : newPageTitle
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || 'pagina';

      const initialFeedIds: string[] = [...newPageSelectedDbFeedIds];

      if (newPageUrlsText.trim()) {
        const rawUrls = newPageUrlsText
          .split(/[\n,]+/)
          .map((u) => u.trim())
          .filter((u) => u.length > 3);

        for (let i = 0; i < rawUrls.length; i++) {
          const target = rawUrls[i];
          setCreateProgressText(`Scraping feed ${i + 1} di ${rawUrls.length}…`);
          try {
            const feedId = await scrapeSingleUrl(target, 60);
            initialFeedIds.push(feedId);
          } catch (err) {
            console.error(`Errore su feed ${target}:`, err);
          }
        }
      }

      const pageId = await createCustomPage({
        title: newPageTitle.trim(),
        slug: autoSlug,
        description: newPageDesc.trim(),
        category: newPageCategory.trim() || 'Generale',
        feedIds: initialFeedIds,
      });

      setNewPageTitle('');
      setNewPageSlug('');
      setNewPageDesc('');
      setNewPageUrlsText('');
      setNewPageSelectedDbFeedIds([]);
      setCreateProgressText(null);
      setShowNewPageModal(false);
      setActivePageId(pageId);
    } catch (err) {
      console.error('Failed to create page:', err);
    } finally {
      setCreatingPage(false);
    }
  }

  async function handleDeletePage(pageId: string) {
    if (confirm('Sei sicuro di voler eliminare questa pagina e il relativo menu?')) {
      try {
        await deleteCustomPage(pageId);
        const remaining = pages.filter((p) => p.id !== pageId);
        if (remaining.length > 0) {
          setActivePageId(remaining[0].id);
        }
      } catch (err) {
        console.error('Failed to delete page:', err);
      }
    }
  }

  function handleCopyPageRss() {
    if (!pageAggregatedRssUrl) return;
    navigator.clipboard.writeText(pageAggregatedRssUrl);
    setPageCopiedRss(true);
    setTimeout(() => setPageCopiedRss(false), 2000);
  }

  function handleCopySavedFeedUrl(saved: StoredFeed) {
    const directUrl = `${window.location.origin}/api/public/rss?url=${encodeURIComponent(
      saved.url
    )}&every=${saved.interval}`;
    navigator.clipboard.writeText(directUrl);
    setCopiedFeedId(saved.id);
    setTimeout(() => {
      setCopiedFeedId((curr) => (curr === saved.id ? null : curr));
    }, 2000);
  }

  // --- ADMIN LOGIN HANDLERS ---
  async function handleGoogleLogin() {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const user = await signInAdminWithGoogle();
      setCurrentUser(user);
      setIsAdmin(true);
      setAdminMode(true);
      setShowLoginModal(false);
    } catch (err: unknown) {
      console.error('Login error:', err);
      setLoginError('Impossibile accedere con popup Google. Usa il Codice Amministratore qui sotto.');
    } finally {
      setLoginLoading(false);
    }
  }

  function handleCodeLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    if (!adminCodeInput.trim()) {
      setLoginError('Inserisci il codice amministratore.');
      return;
    }

    const success = signInAdminWithCode(adminCodeInput);
    if (success) {
      setIsAdmin(true);
      setAdminMode(true);
      setShowLoginModal(false);
      setAdminCodeInput('');
    } else {
      setLoginError(`Codice non valido. Il codice predefinito è: ${ADMIN_FALLBACK_CODE}`);
    }
  }

  async function handleLogout() {
    await signOutAdmin();
    setCurrentUser(null);
    setIsAdmin(false);
    setAdminMode(false);
  }

  // --- VISITOR REAL-TIME NOTIFICATIONS SIGNUP ---
  async function handleVisitorSubscribe(e: React.FormEvent) {
    e.preventDefault();
    if (!subEmail.trim() || !subEmail.includes('@')) {
      alert('Inserisci un indirizzo email valido per le notifiche.');
      return;
    }

    setSubSaving(true);
    try {
      // Request browser notification permission if checked
      if (subNotifyBrowser && typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      }

      const targetPages = subAllPages ? ['all'] : subSelectedPages.length > 0 ? subSelectedPages : ['all'];

      await saveVisitorSubscription({
        email: subEmail.trim(),
        pages: targetPages,
        notifyBrowser: subNotifyBrowser,
        notifyInApp: subNotifyInApp,
        userId: currentUser?.uid,
      });

      setVisitorSub({
        id: `sub_${subEmail}`,
        email: subEmail.trim(),
        pages: targetPages,
        notifyBrowser: subNotifyBrowser,
        notifyInApp: subNotifyInApp,
        createdAt: new Date().toISOString(),
      });

      setSubSuccessNotice('Iscrizione completata con successo! Riceverai notifiche in tempo reale.');
      setTimeout(() => setSubSuccessNotice(null), 4000);
    } catch (err) {
      console.error('Subscription error:', err);
      alert('Errore durante il salvataggio della registrazione alle notifiche.');
    } finally {
      setSubSaving(false);
    }
  }

  async function handleVisitorUnsubscribe() {
    if (!visitorSub) return;
    if (confirm('Vuoi davvero annullare l\'iscrizione alle notifiche?')) {
      try {
        await deleteVisitorSubscription(visitorSub.email);
        setVisitorSub(null);
        setSubSuccessNotice('Iscrizione cancellata.');
        setTimeout(() => setSubSuccessNotice(null), 3000);
      } catch (err) {
        console.error('Unsubscribe error:', err);
      }
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col" style={fontMono}>
      {/* Real-time In-App Toast Alert */}
      {activeToast && (
        <div className="fixed bottom-16 sm:bottom-6 inset-x-3 sm:inset-x-auto sm:right-6 z-50 sm:max-w-sm border-3 border-border bg-card p-3.5 sm:p-4 shadow-[5px_5px_0_0_var(--foreground)] animate-bounce-short">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">🔔</span>
              <span className="text-xs font-bold uppercase text-primary tracking-wider">
                Nuovo Articolo Live!
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveToast(null)}
              className="w-8 h-8 flex items-center justify-center text-xs font-bold hover:text-primary cursor-pointer"
            >
              ✕
            </button>
          </div>
          <p className="mt-1 text-sm font-bold leading-tight" style={fontFraunces}>
            {activeToast.title}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate max-w-[180px]">{activeToast.feedTitle}</span>
            <button
              type="button"
              onClick={() => {
                handleOpenArticle({
                  title: activeToast.title,
                  link: activeToast.link,
                  description: activeToast.message,
                  feedTitle: activeToast.feedTitle,
                  date: new Date().toLocaleDateString('it-IT'),
                });
                setActiveToast(null);
              }}
              className="font-bold underline text-foreground hover:text-primary cursor-pointer min-h-[36px] flex items-center"
            >
              Leggi nel Sito →
            </button>
          </div>
        </div>
      )}

      {/* Top Bar Navigation: Pages Menu + Notifications + Admin Login */}
      <header className="border-b-2 border-border bg-card px-3 sm:px-6 py-2.5 sm:py-3.5 sticky top-0 z-40 shadow-xs">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 sm:gap-4">
          {/* Logo / Masthead */}
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="text-xl sm:text-2xl font-extrabold tracking-tight select-none cursor-pointer"
              style={fontFraunces}
              onClick={() => {
                if (pages.length > 0) setActivePageId(pages[0].id);
                setSearchQuery('');
                setSelectedSourceFilter(null);
                handleScrollToTop();
              }}
            >
              puulp<span className="text-primary">.it</span>
            </span>
          </div>

          {/* MENU A TENDINA: Dropdown Menu per la selezione delle Pagine */}
          <div className="relative flex-1 max-w-[200px] sm:max-w-md mx-1 sm:mx-2" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => {
                setPageDropdownOpen((prev) => !prev);
                setDropdownSearch('');
              }}
              className="w-full flex items-center justify-between gap-1.5 sm:gap-2 border-2 border-border bg-card px-2 sm:px-3 py-1.5 min-h-[38px] text-xs font-semibold uppercase tracking-wider shadow-[2px_2px_0_0_var(--foreground)] hover:bg-muted active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
              title="Apri il menu a tendina delle pagine"
              aria-expanded={pageDropdownOpen}
            >
              <div className="flex items-center gap-1.5 min-w-0 truncate">
                <span className="text-primary font-bold text-sm">☰</span>
                <span className="text-muted-foreground font-normal text-[11px] hidden md:inline">
                  Menu:
                </span>
                <span className="font-extrabold text-foreground truncate text-[11px] sm:text-xs" style={fontFraunces}>
                  {activePage ? activePage.title : 'Seleziona Pagina'}
                </span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {activePageFeedCount > 0 && (
                  <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                    {activePageFeedCount}
                  </span>
                )}
                <svg
                  className={`w-3.5 h-3.5 text-foreground transition-transform duration-200 ${
                    pageDropdownOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Mobile backdrop when dropdown is open */}
            {pageDropdownOpen && (
              <div
                className="fixed inset-0 bg-black/40 z-40 sm:hidden animate-in fade-in"
                onClick={() => setPageDropdownOpen(false)}
              />
            )}

            {/* Il Menu a Tendina aperto */}
            {pageDropdownOpen && (
              <div className="fixed inset-x-3 top-14 sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-2 w-auto sm:w-84 max-w-[calc(100vw-24px)] border-3 border-border bg-card shadow-[6px_6px_0_0_var(--foreground)] z-50 overflow-hidden animate-in fade-in slide-in-from-top-1">
                {/* Intestazione tendina */}
                <div className="bg-muted/40 border-b-2 border-border p-3 flex items-center justify-between">
                  <div>
                    <span className="font-bold uppercase tracking-wider text-[11px] text-foreground block">
                      Tutte le Pagine
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {pages.length} {pages.length === 1 ? 'sezione creata' : 'sezioni create'}
                    </span>
                  </div>

                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setPageDropdownOpen(false);
                        setShowNewPageModal(true);
                      }}
                      className="border border-primary bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      + Nuova Pagina
                    </button>
                  )}
                </div>

                {/* Ricerca interna al menu a tendina se ci sono più di 3 pagine */}
                {pages.length > 3 && (
                  <div className="p-2 border-b border-border/40 bg-background/50">
                    <input
                      type="text"
                      value={dropdownSearch}
                      onChange={(e) => setDropdownSearch(e.target.value)}
                      placeholder="Filtra pagine nel menu…"
                      className="w-full border border-border bg-card px-2.5 py-1 text-xs outline-none focus:border-primary"
                    />
                  </div>
                )}

                {/* Elenco pagine a tendina */}
                <div className="max-h-72 overflow-y-auto divide-y divide-border/20 text-xs">
                  {filteredDropdownPages.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground italic text-xs">
                      Nessuna pagina trovata per "{dropdownSearch}"
                    </div>
                  ) : (
                    filteredDropdownPages.map((p) => {
                      const count = savedFeeds.filter(
                        (f) => (p.feedIds && p.feedIds.includes(f.id)) || f.pageId === p.id
                      ).length;
                      const isActive = activePage?.id === p.id;
                      const pageUrl = `${window.location.origin}/?p=${encodeURIComponent(p.slug || p.id)}`;
                      return (
                        <div
                          key={p.id}
                          className={`w-full p-2.5 sm:p-3 flex items-start justify-between gap-2.5 transition-colors border-b border-border/30 last:border-b-0 ${
                            isActive
                              ? 'bg-foreground text-background font-bold'
                              : 'hover:bg-muted/60 text-foreground'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setActivePageId(p.id);
                              setSelectedSourceFilter(null);
                              setSearchQuery('');
                              setPageDropdownOpen(false);
                            }}
                            className="min-w-0 flex-1 text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold truncate text-sm" style={fontFraunces}>
                                {p.title}
                              </span>
                              {isActive && (
                                <span className="text-primary font-bold text-xs shrink-0">✓</span>
                              )}
                            </div>
                            {p.description && (
                              <p
                                className={`text-[11px] line-clamp-1 mt-0.5 ${
                                  isActive ? 'text-background/80' : 'text-muted-foreground'
                                }`}
                              >
                                {p.description}
                              </p>
                            )}
                          </button>

                          <div className="flex flex-col items-end shrink-0 gap-1.5">
                            <div className="flex items-center gap-1">
                              {p.category && (
                                <span
                                  className={`text-[9px] uppercase tracking-wider px-1.5 py-0.2 border ${
                                    isActive
                                      ? 'border-background/40 bg-background/20 text-background'
                                      : 'border-border/60 bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {p.category}
                                </span>
                              )}
                              {count > 0 && (
                                <span
                                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                                    isActive
                                      ? 'bg-primary text-primary-foreground'
                                      : 'bg-muted/80 text-muted-foreground'
                                  }`}
                                >
                                  {count} {count === 1 ? 'feed' : 'feed'}
                                </span>
                              )}
                            </div>

                            {/* Direct category permalink button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(pageUrl);
                                setCopiedDropdownId(p.id);
                                setTimeout(() => setCopiedDropdownId(null), 1500);
                              }}
                              className={`px-1.5 py-0.5 text-[10px] border transition-colors cursor-pointer flex items-center gap-1 ${
                                isActive
                                  ? 'border-background/60 bg-background/10 hover:bg-background/25 text-background'
                                  : 'border-border bg-card hover:bg-accent text-foreground'
                              }`}
                              title={`Copia link diretto per la categoria: ${p.title}`}
                            >
                              <span>{copiedDropdownId === p.id ? '✓' : '🔗'}</span>
                              <span>{copiedDropdownId === p.id ? 'Copiato!' : 'Link'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer tendina */}
                <div className="p-2 bg-muted/20 border-t border-border/40 text-center">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                    Clicca per passare direttamente alla pagina
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Right Header Zone: Real-Time Notifications Bell, 24h Trend Dashboard & Admin Access */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* 24h Trend Analytics Dashboard Trigger */}
            <button
              type="button"
              onClick={() => setShowAnalyticsDashboard(true)}
              className="border-2 border-border bg-background hover:bg-muted px-2.5 py-1.5 min-h-[40px] text-xs font-semibold uppercase transition-colors cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5"
              title="Visualizza grafici e analisi sui trend tematici delle ultime 24 ore"
            >
              <span>📊</span>
              <span className="hidden md:inline">Trend 24h</span>
              <span className="hidden xs:inline md:hidden">Trend</span>
            </button>

            {/* Real-time Notifications Bell */}
            <button
              type="button"
              onClick={() => {
                setShowNotifModal(true);
                setUnreadNotifCount(0);
              }}
              className="relative border-2 border-border bg-background px-2.5 py-1.5 min-h-[40px] text-xs font-semibold uppercase hover:bg-muted transition-colors cursor-pointer flex items-center gap-1.5"
              title="Notifiche in tempo reale per nuovi articoli"
            >
              <span>🔔</span>
              <span className="hidden md:inline">
                {visitorSub ? 'Notifiche Attive' : 'Ricevi Notifiche'}
              </span>
              {unreadNotifCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] font-bold h-4.5 w-4.5 rounded-full flex items-center justify-center animate-pulse">
                  {unreadNotifCount}
                </span>
              )}
            </button>

            {/* Admin Login / Status Trigger */}
            {isAdmin ? (
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Desktop Admin Quick Buttons */}
                <button
                  type="button"
                  onClick={() => {
                    setArticleToEdit(null);
                    setShowManualArticleModal(true);
                  }}
                  className="hidden sm:flex border-2 border-border bg-primary text-primary-foreground hover:opacity-90 px-2.5 py-1.5 min-h-[40px] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer items-center gap-1 shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5"
                  title="Inserisci manualmente un articolo in una categoria con ottimizzazione SEO"
                >
                  <span>✍️</span>
                  <span>+ Nuovo Articolo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAffiliateModal(true)}
                  className="hidden lg:flex border-2 border-amber-500 bg-amber-50 hover:bg-amber-100 text-amber-900 px-2.5 py-1.5 min-h-[40px] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer items-center gap-1 shadow-[2px_2px_0_0_#d97706]"
                  title="Scraping di intere categorie e relative sottocategorie con link affiliato per monetizzare"
                >
                  <span className="text-amber-600 font-bold">💰</span>
                  <span>Monetizza Categorie</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowOllamaModal(true)}
                  className="hidden sm:flex border-2 border-foreground bg-foreground text-background hover:opacity-90 px-2.5 py-1.5 min-h-[40px] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer items-center gap-1.5 shadow-[2px_2px_0_0_var(--primary)] active:translate-x-0.5 active:translate-y-0.5"
                  title="Collega Ollama come amministratore per gestire intere pagine da prompt"
                >
                  <span className="text-sm">🤖</span>
                  <span>Ollama AI</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAdminMode(!adminMode)}
                  className={`border-2 border-border px-2.5 sm:px-3 py-1.5 min-h-[40px] text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    adminMode
                      ? 'bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)]'
                      : 'bg-card hover:bg-muted text-foreground'
                  }`}
                  title="Attiva/disattiva gli strumenti di redazione"
                >
                  {adminMode ? '⚙ Redazione' : '⚙ Admin'}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="border border-border/60 bg-background px-2 py-1.5 min-h-[40px] text-[11px] uppercase hover:bg-destructive hover:text-white transition-colors cursor-pointer hidden md:block"
                  title="Disconnetti account amministratore"
                >
                  Esci
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowLoginModal(true)}
                className="border border-border/80 bg-background px-2.5 py-1.5 min-h-[40px] text-xs font-medium uppercase text-muted-foreground hover:text-foreground hover:border-border transition-colors cursor-pointer flex items-center gap-1"
                title="Accedi come amministratore per gestire pagine e feed"
              >
                <span>🔒</span>
                <span className="hidden md:inline">Login Admin</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Admin Quick-Action Strip: horizontally scrollable so mobile header stays uncluttered */}
        {isAdmin && (
          <div className="sm:hidden mt-2 pt-2 border-t border-border/50 flex items-center gap-2 overflow-x-auto no-scrollbar -mx-3 px-3">
            <button
              type="button"
              onClick={() => {
                setArticleToEdit(null);
                setShowManualArticleModal(true);
              }}
              className="shrink-0 border-2 border-border bg-primary text-primary-foreground px-3 py-1.5 min-h-[38px] text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-[2px_2px_0_0_var(--foreground)] cursor-pointer"
            >
              <span>✍️</span>
              <span>+ Articolo SEO</span>
            </button>
            <button
              type="button"
              onClick={() => setShowOllamaModal(true)}
              className="shrink-0 border-2 border-foreground bg-foreground text-background px-3 py-1.5 min-h-[38px] text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-[2px_2px_0_0_var(--primary)] cursor-pointer"
            >
              <span>🤖</span>
              <span>Ollama AI Admin</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAffiliateModal(true)}
              className="shrink-0 border-2 border-amber-500 bg-amber-50 text-amber-900 px-3 py-1.5 min-h-[38px] text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-[2px_2px_0_0_#d97706] cursor-pointer"
            >
              <span>💰</span>
              <span>Monetizza</span>
            </button>
            <button
              type="button"
              onClick={() => setShowNewPageModal(true)}
              className="shrink-0 border-2 border-border bg-card text-foreground px-3 py-1.5 min-h-[38px] text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
            >
              <span>+ Pagina</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="shrink-0 border border-border/60 bg-background px-2.5 py-1.5 min-h-[38px] text-[11px] uppercase text-muted-foreground hover:text-destructive cursor-pointer"
            >
              Esci
            </button>
          </div>
        )}
      </header>

      {/* Admin Info Bar: visible only when Redazione is activated by logged in editor */}
      {isAdmin && adminMode && (
        <div className="bg-primary/10 border-b border-primary/30 px-6 py-2.5 text-xs">
          <div className="mx-auto flex max-w-5xl w-full items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="font-semibold text-primary">
                Pannello Redazione Attivo ({currentUser?.email || 'Admin Connesso'})
              </span>
              <span className="text-muted-foreground hidden sm:inline">
                — Puoi aggiungere feed, creare pagine, estrarre categorie e lanciare scansioni.
              </span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => setShowAffiliateModal(true)}
                className="border border-amber-600 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 text-xs font-bold uppercase shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer flex items-center gap-1.5"
                title="Estrai intere categorie e relative sottocategorie con link affiliato per monetizzare"
              >
                <span>💰</span>
                <span>Scraping Categorie & Affiliati</span>
              </button>
              <button
                type="button"
                onClick={() => setShowNewPageModal(true)}
                className="border border-border bg-primary px-3 py-1 text-xs font-bold uppercase text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer"
              >
                + Nuova Pagina
              </button>
              <button
                type="button"
                onClick={() => setAdminMode(false)}
                className="text-primary underline font-medium hover:text-primary/80 cursor-pointer"
              >
                Torna a Vista Visitatore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="mx-auto max-w-4xl px-3.5 sm:px-6 py-4 sm:py-8 flex-1 w-full pb-24 sm:pb-12">
        {/* Newspaper Style Page Header */}
        {activePage ? (
          <header className="border-b-4 border-double border-border pb-4 sm:pb-6">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="uppercase tracking-[0.2em] sm:tracking-[0.3em] text-[10px] sm:text-xs">
                {activePage.category ? `Sezione · ${activePage.category}` : 'Rassegna Articoli'}
              </span>

              {/* In admin mode: page delete button */}
              {isAdmin && adminMode && (
                <button
                  type="button"
                  onClick={() => handleDeletePage(activePage.id)}
                  className="text-xs text-destructive hover:underline cursor-pointer"
                >
                  Elimina Pagina
                </button>
              )}
            </div>

            <div className="mt-2 flex flex-col md:flex-row md:items-baseline md:justify-between gap-3 sm:gap-4">
              <h1
                className="text-2xl sm:text-4xl md:text-6xl font-extrabold leading-tight tracking-tight"
                style={fontFraunces}
              >
                {activePage.title}
              </h1>

              {/* Quick Actions (Copia Link Categoria + Scrivi Articolo + Condividi + Notifiche + RSS) */}
              <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 shrink-0 sm:flex-wrap w-full md:w-auto">
                <button
                  type="button"
                  onClick={handleCopyPageLink}
                  className="border-2 border-border bg-card px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-[42px] sm:min-h-[38px] text-xs uppercase font-bold hover:bg-accent transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5"
                  title="Copia link diretto di questa categoria / pagina su puulp.it"
                >
                  <span className="text-primary font-bold">{pageCopiedLink ? '✓' : '🔗'}</span>
                  <span className="truncate">{pageCopiedLink ? 'Link Copiato!' : 'Link Categoria'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleOpenShare({
                      title: activePage.socialShare?.ogTitle || `${activePage.title} — puulp.it`,
                      text: activePage.socialShare?.ogDescription || `Scopri la rassegna e i feed di "${activePage.title}" su puulp.it:`,
                      url: buildSitePageUrl(activePage.slug || activePage.id),
                      source: activePage.category || 'puulp.it',
                      socialShare: activePage.socialShare,
                      pageSlug: activePage.slug || activePage.id,
                    })
                  }
                  className="border-2 border-border bg-primary text-primary-foreground px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-[42px] sm:min-h-[38px] text-xs uppercase font-bold hover:opacity-95 transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5"
                  title="Condividi questa pagina del sito sui social con copy elaborato da Ollama"
                >
                  <span>📤</span>
                  <span className="truncate">Condividi Pagina</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setArticleToEdit(null);
                    setShowManualArticleModal(true);
                  }}
                  className="border-2 border-border bg-card hover:bg-primary hover:text-primary-foreground px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-[42px] sm:min-h-[38px] text-xs uppercase font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5"
                  title="Inserisci manualmente un articolo in questa categoria con ottimizzazione SEO"
                >
                  <span className="text-primary font-bold">✍️</span>
                  <span className="truncate">+ Scrivi Articolo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAnalyticsDashboard(true)}
                  className="border-2 border-border bg-card px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-[42px] sm:min-h-[38px] text-xs uppercase font-medium hover:bg-accent transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5"
                  title="Grafici e trend tematici delle ultime 24 ore"
                >
                  <span className="text-primary font-bold">📊</span>
                  <span className="truncate">Trend 24h</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowNotifModal(true)}
                  className="border-2 border-border bg-card px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-[42px] sm:min-h-[38px] text-xs uppercase font-medium hover:bg-accent transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5"
                >
                  <span>🔔</span>
                  <span className="truncate">Notifiche Live</span>
                </button>

                {pageFeeds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleCopyPageRss}
                    className="border-2 border-border bg-card px-2.5 sm:px-3 py-2 sm:py-1.5 min-h-[42px] sm:min-h-[38px] text-xs uppercase font-medium hover:bg-accent transition-colors cursor-pointer flex items-center justify-center shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5"
                    title="Copia link RSS unificato di questa pagina"
                  >
                    {pageCopiedRss ? '✓ Copiato!' : '📡 Feed RSS'}
                  </button>
                )}
              </div>
            </div>

            {activePage.description && (
              <p className="mt-2.5 sm:mt-3 max-w-2xl text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {activePage.description}
              </p>
            )}

            {/* Admin Toolbar on Page */}
            {isAdmin && adminMode && (
              <div className="mt-4 sm:mt-5 flex flex-wrap items-center gap-2 sm:gap-3 pt-3 border-t border-border/40">
                <button
                  type="button"
                  onClick={() => setShowAddFeedsModal(true)}
                  className="border-2 border-border bg-primary px-3 py-1.5 text-xs font-bold uppercase text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-transform cursor-pointer"
                >
                  + Aggiungi Feed alla Pagina
                </button>
                {pageFeeds.length > 0 && (
                  <button
                    type="button"
                    disabled={refreshingAllFeeds}
                    onClick={handleRefreshAllPageFeeds}
                    className="border border-border bg-card px-3 py-1.5 text-xs uppercase hover:bg-muted transition-colors cursor-pointer disabled:opacity-60"
                  >
                    {refreshingAllFeeds ? 'Aggiornamento…' : '↻ Aggiorna feed'}
                  </button>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {pageFeeds.length} {pageFeeds.length === 1 ? 'feed collegato' : 'feed collegati'}
                </span>
              </div>
            )}
          </header>
        ) : (
          <header className="border-b-4 border-double border-border pb-6">
            <h1 className="text-3xl sm:text-4xl font-extrabold" style={fontFraunces}>
              puulp.it
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Caricamento delle pagine in corso…
            </p>
          </header>
        )}

        {/* PROMINENT SEARCH BAR ("CERCA") - The central visitor interaction */}
        <section className="mt-5 sm:mt-6">
          <div className="relative">
            <div className="flex items-center border-2 border-border bg-card px-3 sm:px-4 py-2.5 sm:py-3 shadow-[3px_3px_0_0_var(--foreground)] focus-within:border-primary transition-colors">
              <span className="text-muted-foreground mr-2.5 sm:mr-3 text-base select-none">🔍</span>
              <input
                ref={searchInputRef}
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activePage
                    ? searchScope === 'all'
                      ? 'Cerca tra tutti gli articoli di tutte le pagine…'
                      : `Cerca in "${activePage.title}"…`
                    : 'Cerca articoli…'
                }
                className="w-full bg-transparent text-base sm:text-sm outline-none placeholder:text-muted-foreground/60"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground font-bold px-2 py-1 cursor-pointer min-h-[36px] flex items-center"
                >
                  Cancella
                </button>
              )}
            </div>

            {/* Search Scope selector, Sort Order & Results info */}
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs text-muted-foreground px-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="uppercase text-[10px] sm:text-[11px] font-semibold">Ambito:</span>
                  <button
                    type="button"
                    onClick={() => setSearchScope('page')}
                    className={`px-2.5 py-1 min-h-[32px] border cursor-pointer transition-colors ${
                      searchScope === 'page'
                        ? 'border-foreground bg-foreground text-background font-bold'
                        : 'border-border/60 hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {activePage ? activePage.title : 'Pagina corrente'}
                  </button>
                  {pages.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSearchScope('all')}
                      className={`px-2.5 py-1 min-h-[32px] border cursor-pointer transition-colors ${
                        searchScope === 'all'
                          ? 'border-foreground bg-foreground text-background font-bold'
                          : 'border-border/60 hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      Tutte le Pagine
                    </button>
                  )}
                </div>

                {/* Sorter: Più recenti vs Più vecchi per andare indietro nell'archivio */}
                <div className="flex items-center gap-1.5 border-l border-border/50 pl-2">
                  <span className="uppercase text-[10px] sm:text-[11px] font-semibold">Cronologia:</span>
                  <button
                    type="button"
                    onClick={() => setSortOrder(sortOrder === 'newest' ? 'oldest' : 'newest')}
                    className="px-2.5 py-1 min-h-[32px] border border-border/70 bg-card hover:border-foreground text-foreground text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                    title="Alterna tra articoli più recenti e articoli storici più vecchi"
                  >
                    <span>{sortOrder === 'newest' ? '🕒 Più Recenti Prima' : '📜 Più Vecchi Prima (Archivio)'}</span>
                    <span className="text-primary text-[10px] font-bold">⇄</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {searchQuery.trim() ? (
                  <span className="text-foreground text-[11px] sm:text-xs">
                    Trovati <strong className="font-bold text-primary">{displayedArticles.length}</strong>{' '}
                    {displayedArticles.length === 1 ? 'articolo' : 'articoli'}
                  </span>
                ) : (
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Archivio: <strong className="text-foreground">{displayedArticles.length}</strong> articoli totali
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Source Filter Chips: horizontally scrollable carousel on mobile */}
          {searchScope === 'page' && pageFeeds.length > 1 && !searchQuery.trim() && (
            <div className="mt-3.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 text-xs -mx-3.5 px-3.5 sm:mx-0 sm:px-0 whitespace-nowrap">
              <span className="text-muted-foreground uppercase text-[10px] sm:text-[11px] shrink-0 mr-0.5">
                Fonti:
              </span>
              <button
                type="button"
                onClick={() => setSelectedSourceFilter(null)}
                className={`px-2.5 py-1 min-h-[32px] shrink-0 border transition-colors cursor-pointer text-xs ${
                  selectedSourceFilter === null
                    ? 'border-primary bg-primary text-primary-foreground font-bold'
                    : 'border-border/60 bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                Tutte ({scopedArticles.length})
              </button>
              {pageFeeds.map((feed) => {
                const count = (feed.items || []).length;
                return (
                  <button
                    key={feed.id}
                    type="button"
                    onClick={() =>
                      setSelectedSourceFilter(selectedSourceFilter === feed.title ? null : feed.title)
                    }
                    className={`px-2.5 py-1 min-h-[32px] shrink-0 border transition-colors cursor-pointer text-xs ${
                      selectedSourceFilter === feed.title
                        ? 'border-primary bg-primary text-primary-foreground font-bold'
                        : 'border-border/60 bg-card text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {feed.title} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* FEEDBACK NOTICE */}
        {dbSaveNotice && (
          <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-primary">
            ✓ {dbSaveNotice}
          </p>
        )}

        {/* ARTICLES TIMELINE LIST */}
        <section id="articles-timeline-section" className="mt-6 sm:mt-8">
          {displayedArticles.length === 0 ? (
            <div className="border-2 border-dashed border-border/40 p-8 sm:p-12 text-center text-xs text-muted-foreground">
              {searchQuery.trim() ? (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">
                    Nessun articolo trovato per "{searchQuery}"
                  </p>
                  <p>Prova a modificare i termini di ricerca o a cancellare il filtro.</p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="mt-4 border border-border px-3 py-1.5 uppercase hover:bg-card text-xs font-medium cursor-pointer"
                  >
                    Azzera ricerca
                  </button>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">
                    Nessun articolo presente in questa sezione al momento.
                  </p>
                  <p>Gli articoli compariranno qui non appena sincronizzati con le fonti.</p>
                  {isAdmin && adminMode && (
                    <button
                      type="button"
                      onClick={() => setShowAddFeedsModal(true)}
                      className="mt-4 border-2 border-border bg-primary px-4 py-2 text-xs font-bold uppercase text-primary-foreground cursor-pointer shadow-[2px_2px_0_0_var(--foreground)]"
                    >
                      Aggiungi Feed a questa Pagina
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <ol className="divide-y divide-border/30">
              {paginatedArticles.map((item, idx) => {
                const globalIdx = pageSize === 'all' ? idx : (validCurrentPage - 1) * pageSize + idx;
                const siteArticleUrl = buildSiteArticleUrl(
                  {
                    title: item.title,
                    link: item.link,
                    slug: item.rawArticle?.slug,
                    id: item.rawArticle?.id,
                    pageId: item.rawArticle?.pageId || activePage?.slug || activePage?.id,
                  },
                  activePage?.slug || activePage?.id
                );
                return (
                  <React.Fragment key={item.link + idx}>
                    <li className="py-4 sm:py-5 hover:bg-muted/10 transition-colors">
                      {/* Top kicker bar on mobile and desktop */}
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mb-2">
                        <div className="flex items-center gap-2 min-w-0 truncate">
                          <span
                            className="text-lg sm:text-xl font-extrabold text-primary shrink-0 select-none"
                            style={fontFraunces}
                          >
                            {String(globalIdx + 1).padStart(2, '0')}
                          </span>
                          <span className="font-bold text-foreground uppercase tracking-wider text-[11px] truncate flex items-center gap-1.5">
                            {item.feedTitle}
                            {item.isManual && (
                              <span className="bg-primary/10 text-primary border border-primary/30 text-[9px] uppercase font-bold px-1.5 py-0.2 rounded select-none">
                                SEO Ottimizzato
                              </span>
                            )}
                          </span>
                          {item.date && (
                            <>
                              <span className="text-muted-foreground/60 hidden xs:inline">·</span>
                              <span className="shrink-0 text-[11px] hidden xs:inline">{item.date}</span>
                            </>
                          )}
                        </div>

                        {/* Quick Article Share Button (Always shares internal puulp.it URL) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleOpenShare({
                              title: item.rawArticle?.socialShare?.ogTitle || item.title,
                              text:
                                item.rawArticle?.socialShare?.ogDescription ||
                                item.description ||
                                `Leggi questo articolo su puulp.it:`,
                              url: siteArticleUrl,
                              image: item.image,
                              source: item.feedTitle,
                              socialShare: item.rawArticle?.socialShare,
                              pageSlug: activePage?.slug || activePage?.id,
                              articleSlug: getArticleSiteSlug(item),
                            });
                          }}
                          className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground hover:text-primary transition-colors cursor-pointer px-2.5 py-1.5 min-h-[38px] border border-border/70 hover:border-primary/60 bg-card shrink-0 shadow-[1px_1px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5"
                          title="Condividi il link diretto all'articolo sul sito puulp.it"
                        >
                          <svg className="w-3.5 h-3.5 fill-current text-primary" viewBox="0 0 24 24">
                            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
                          </svg>
                          <span>Condividi</span>
                        </button>
                      </div>

                      {/* Responsive Article Card Body: stacks neatly on mobile */}
                      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-start">
                        {/* Article Image (if available) */}
                        {item.image && (
                          <div
                            onClick={() => handleOpenArticle(item)}
                            className="w-full sm:w-36 sm:h-24 shrink-0 block overflow-hidden border-2 border-border bg-muted group cursor-pointer"
                            title="Clicca per aprire l'articolo nel sito in popup"
                          >
                            <img
                              src={item.image}
                              alt={item.title}
                              loading="lazy"
                              onError={(e) => {
                                const target = e.currentTarget;
                                if (!target.dataset.triedFallback) {
                                  target.dataset.triedFallback = 'true';
                                  target.src = 'https://images.unsplash.com/photo-1526738549149-8e07eca6c147?w=400&auto=format&fit=crop&q=80';
                                } else if (target.parentElement) {
                                  target.parentElement.style.display = 'none';
                                }
                              }}
                              className="w-full h-44 sm:h-24 object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                        )}

                        {/* Content */}
                        <div className="min-w-0 flex-1 w-full">
                          <button
                            type="button"
                            onClick={() => handleOpenArticle(item)}
                            className="text-left text-lg sm:text-xl font-extrabold hover:text-primary transition-colors leading-snug block cursor-pointer w-full"
                            style={fontFraunces}
                            title="Clicca per aprire l'articolo nel sito in popup"
                          >
                            {item.title}
                          </button>

                          {item.description && (
                            <p
                              onClick={() => handleOpenArticle(item)}
                              className="mt-1.5 text-xs sm:text-[13px] text-muted-foreground line-clamp-3 leading-relaxed cursor-pointer hover:text-foreground transition-colors"
                              title="Clicca per leggere l'articolo in popup"
                            >
                              {item.description}
                            </p>
                          )}

                          {/* Footer Affordances on Article (Mobile Thumb-Friendly Action Row) */}
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleOpenArticle(item)}
                                className="font-bold border border-primary/50 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-1 px-2.5 py-1.5 min-h-[38px] cursor-pointer"
                                title="Apri articolo all'interno del sito in popup"
                              >
                                <span>
                                  {item.isManual
                                    ? '📖 Leggi Articolo'
                                    : isAffiliateLink(item.link)
                                    ? '🛍️ Scheda Offerta'
                                    : '📖 Leggi nel Sito'}
                                </span>
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleOpenShare({
                                    title: item.rawArticle?.socialShare?.ogTitle || item.title,
                                    text:
                                      item.rawArticle?.socialShare?.ogDescription ||
                                      item.description ||
                                      `Leggi "${item.title}" su puulp.it:`,
                                    url: siteArticleUrl,
                                    image: item.image,
                                    source: item.feedTitle,
                                    socialShare: item.rawArticle?.socialShare,
                                    pageSlug: activePage?.slug || activePage?.id,
                                    articleSlug: getArticleSiteSlug(item),
                                  })
                                }
                                className="border border-border/80 bg-card text-foreground hover:border-primary hover:text-primary cursor-pointer transition-colors px-2.5 py-1.5 min-h-[38px] flex items-center gap-1 font-bold"
                                title="Condividi articolo sui social (porta al sito puulp.it)"
                              >
                                <span>📤 Condividi Sito</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(siteArticleUrl);
                                  setCopiedFeedId(siteArticleUrl);
                                  setTimeout(() => setCopiedFeedId(null), 2000);
                                }}
                                className="border border-border/60 bg-background text-muted-foreground hover:text-foreground cursor-pointer transition-colors px-2.5 py-1.5 min-h-[38px] flex items-center gap-1"
                                title="Copia il link diretto all'articolo sul sito puulp.it"
                              >
                                <span>{copiedFeedId === siteArticleUrl ? '✓ Link Sito Copiato!' : '🔗 Copia Link Sito'}</span>
                              </button>

                              {isAffiliateLink(item.link) && (
                                <span className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded">
                                  Partner Link
                                </span>
                              )}

                              {item.price && (
                                <span className="text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200 px-1.5 py-0.5 rounded">
                                  {item.price}
                                </span>
                              )}

                              {/* In admin mode: edit/delete actions for manual articles */}
                              {isAdmin && adminMode && item.isManual && item.rawArticle && (
                                <div className="flex items-center gap-2 border-l border-border pl-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setArticleToEdit(item.rawArticle!);
                                      setShowManualArticleModal(true);
                                    }}
                                    className="text-xs text-muted-foreground hover:text-foreground cursor-pointer font-bold min-h-[36px] px-1.5"
                                    title="Modifica articolo manuale"
                                  >
                                    ✎ Modifica
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (confirm('Sei sicuro di voler eliminare questo articolo manuale?')) {
                                        handleDeleteManualArticle(item.rawArticle!.id);
                                      }
                                    }}
                                    className="text-xs text-destructive hover:underline cursor-pointer font-bold min-h-[36px] px-1.5"
                                    title="Elimina articolo manuale"
                                  >
                                    ✕ Elimina
                                  </button>
                                </div>
                              )}
                            </div>

                            {item.date && (
                              <span className="text-muted-foreground xs:hidden text-[10px]">
                                {item.date}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>

                  {/* Spazio Annunci / Intervallo tra articoli: casualmente Banner AdSense o Invito Notifiche */}
                  {((idx + 1) % 4 === 0 ||
                    (displayedArticles.length <= 3 && idx === displayedArticles.length - 1)) && (
                    <li className="list-none py-2" key={`ad-slot-${idx}`}>
                      {isNotificationAdSlot(idx, item.link || item.title) ? (
                        <NotificationAdCard
                          pageTitle={activePage?.title}
                          activePageId={activePage?.id}
                          visitorSub={visitorSub}
                          onOpenModal={() => setShowNotifModal(true)}
                          onSubscribed={(newSub) => {
                            setVisitorSub(newSub);
                            setSubEmail(newSub.email);
                            setSubAllPages(newSub.pages.includes('all'));
                          }}
                        />
                      ) : (
                        <AdSenseBanner />
                      )}
                    </li>
                  )}
                </React.Fragment>
              );
            })}
          </ol>
        )}

        {/* Navigazione Archivio & Paginazione: Sfoglia gli articoli storici */}
        {displayedArticles.length > 0 && (
          <div className="mt-8 pt-6 border-t-2 border-border flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Info Archivio & Conteggio */}
            <div className="text-xs text-muted-foreground font-mono">
              <span>
                Archivio: Visualizzati{' '}
                <strong className="text-foreground">
                  {pageSize === 'all'
                    ? `tutti i ${displayedArticles.length}`
                    : `${(validCurrentPage - 1) * (typeof pageSize === 'number' ? pageSize : 20) + 1} - ${Math.min(
                        validCurrentPage * (typeof pageSize === 'number' ? pageSize : 20),
                        displayedArticles.length
                      )}`}
                </strong>{' '}
                di <strong className="text-primary">{displayedArticles.length}</strong> articoli
              </span>
            </div>

            {/* Pulsanti Paginazione */}
            {totalPages > 1 && pageSize !== 'all' && (
              <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-center">
                <button
                  type="button"
                  disabled={validCurrentPage <= 1}
                  onClick={() => {
                    setCurrentPage((p) => Math.max(1, p - 1));
                    document.getElementById('articles-timeline-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 min-h-[36px] border-2 border-border bg-card text-xs font-bold uppercase tracking-wider hover:bg-muted disabled:opacity-30 disabled:pointer-events-none cursor-pointer shadow-[1px_1px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5"
                  title="Torna agli articoli più recenti"
                >
                  ← Più Recenti
                </button>

                {/* Numeri Pagine */}
                <div className="flex items-center gap-1 mx-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => {
                      return (
                        p === 1 ||
                        p === totalPages ||
                        Math.abs(p - validCurrentPage) <= 2
                      );
                    })
                    .map((p, pIdx, arr) => {
                      const prev = arr[pIdx - 1];
                      const showEllipsis = prev && p - prev > 1;
                      return (
                        <React.Fragment key={p}>
                          {showEllipsis && (
                            <span className="px-1 text-muted-foreground font-mono text-xs select-none">
                              …
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setCurrentPage(p);
                              document.getElementById('articles-timeline-section')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className={`w-8 h-8 flex items-center justify-center text-xs font-bold font-mono border-2 cursor-pointer transition-colors ${
                              p === validCurrentPage
                                ? 'border-primary bg-primary text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)]'
                                : 'border-border bg-card hover:bg-muted text-foreground'
                            }`}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      );
                    })}
                </div>

                <button
                  type="button"
                  disabled={validCurrentPage >= totalPages}
                  onClick={() => {
                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                    document.getElementById('articles-timeline-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 min-h-[36px] border-2 border-border bg-card text-xs font-bold uppercase tracking-wider hover:bg-muted disabled:opacity-30 disabled:pointer-events-none cursor-pointer shadow-[1px_1px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5"
                  title="Vai indietro sui vecchi articoli dell'archivio"
                >
                  Più Vecchi →
                </button>
              </div>
            )}

            {/* Selettore dimensione pagina */}
            <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
              <span>Per pagina:</span>
              {[20, 50, 'all'].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPageSize(size as number | 'all')}
                  className={`px-2 py-1 border text-xs cursor-pointer font-bold ${
                    pageSize === size
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-border/60 hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {size === 'all' ? 'Tutti' : size}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

        {/* ADMIN TOOLING (Only visible to authenticated editor when adminMode is active) */}
        {isAdmin && adminMode && (
          <section className="mt-16 border-t-4 border-border pt-8 bg-card/40 p-6 border-2">
            <div className="flex items-baseline justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold tracking-tight" style={fontFraunces}>
                  Strumenti di Scansione & Archivio
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Inserisci nuovi URL per estrarre articoli, salvarli nel database e notificare i lettori.
                </p>
              </div>
              <span className="text-xs uppercase font-bold text-primary">
                {savedFeeds.length} Feed nel DB
              </span>
            </div>

            {/* Promo Card: Ollama AI Super Administrator */}
            <div className="mb-6 p-4 sm:p-5 rounded-xl border-2 border-primary bg-primary/5 shadow-[4px_4px_0_0_var(--foreground)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🤖</span>
                  <h4 className="font-extrabold text-sm sm:text-base text-foreground uppercase tracking-wide">
                    Amministratore AI con Ollama (Gestione Pagine da Prompt)
                  </h4>
                </div>
                <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                  Collega il tuo modello locale (Llama 3.2, Mistral, Qwen, DeepSeek) per impostare da un singolo prompt la creazione di intere pagine tematiche, la selezione e scansione automatica dei feed RSS e la redazione di articoli editoriali SEO con codice.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowOllamaModal(true)}
                className="px-4 py-2.5 rounded-lg bg-foreground hover:bg-foreground/90 text-background font-bold text-xs uppercase tracking-wider shadow-sm flex items-center gap-2 shrink-0 cursor-pointer transition-colors"
              >
                <span>Avvia Console Ollama</span>
                <span>⚡</span>
              </button>
            </div>

            {/* Promo Card: Scraping Categorie & Affiliati */}
            <div className="mb-6 p-4 sm:p-5 rounded-xl border-2 border-amber-500 bg-amber-50/60 shadow-[4px_4px_0_0_#d97706] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">💰</span>
                  <h4 className="font-extrabold text-sm sm:text-base text-amber-950 uppercase tracking-wide">
                    Scraping Intere Categorie & Link Affiliato
                  </h4>
                </div>
                <p className="text-xs text-amber-900 mt-1 max-w-xl">
                  Inserisci il tuo ID affiliato (Amazon, eBay, Awin, ecc.) e l'URL di una categoria: il crawler scopre automaticamente le sottocategorie e genera annunci monetizzati al 100%.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAffiliateModal(true)}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm flex items-center gap-2 shrink-0 cursor-pointer transition-colors"
              >
                <span>Apri Scanner Affiliazioni</span>
                <span>→</span>
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (url.trim()) performScrape(url);
              }}
              className="flex flex-col gap-3 md:flex-row"
            >
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://esempio.it/blog"
                required
                className="flex-1 border-2 border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary"
              />

              <select
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
                className="border-2 border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary cursor-pointer"
              >
                {INTERVAL_OPTIONS.map((val) => (
                  <option key={val} value={val}>
                    Controlla ogni {formatInterval(val)}
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={loading}
                className="border-2 border-border bg-primary px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-[3px_3px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-60 cursor-pointer shrink-0"
              >
                {loading ? 'Scraping…' : 'Scansiona'}
              </button>
            </form>

            {loading && (
              <p className="mt-4 animate-pulse text-xs text-muted-foreground">
                Lettura della pagina in corso, estrazione articoli e generazione feed…
              </p>
            )}

            {error && (
              <div className="mt-4 border-2 border-destructive p-3 text-xs text-destructive bg-destructive/5">
                {error}
              </div>
            )}

            {/* List of feeds in DB */}
            <div className="mt-6 border-t border-border/40 pt-4">
              <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                Feed salvati nel Database:
              </p>
              <div className="divide-y divide-border/20 max-h-56 overflow-y-auto border border-border bg-background text-xs">
                {savedFeeds.map((feed) => (
                  <div key={feed.id} className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold truncate">{feed.title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{feed.url}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleCopySavedFeedUrl(feed)}
                        className="border border-border px-2.5 py-1 text-[11px] uppercase hover:bg-muted cursor-pointer"
                      >
                        {copiedFeedId === feed.id ? 'Copiato' : 'Copia RSS'}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (deleteConfirmId === feed.id) {
                            deleteFeedFromDatabase(feed.id);
                            setDeleteConfirmId(null);
                          } else {
                            setDeleteConfirmId(feed.id);
                            setTimeout(() => setDeleteConfirmId(null), 3000);
                          }
                        }}
                        className={`border px-2 py-1 text-[11px] cursor-pointer ${
                          deleteConfirmId === feed.id ? 'bg-destructive text-white' : 'text-destructive border-destructive/40'
                        }`}
                      >
                        {deleteConfirmId === feed.id ? 'Sicuro?' : 'Elimina'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* FOOTER */}
      <footer className="border-t-2 border-border bg-card px-4 sm:px-6 py-4 sm:py-5 text-xs text-muted-foreground mt-auto mb-14 sm:mb-0">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 text-center sm:text-left">
          <p>© puulp.it · Rassegna stampa e aggregatore di feed RSS con notifiche in tempo reale</p>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowNotifModal(true)}
              className="hover:text-foreground cursor-pointer underline flex items-center gap-1 min-h-[36px]"
            >
              <span>🔔</span> Iscrizione Notifiche
            </button>

            {isAdmin ? (
              <span className="text-[11px] text-primary font-bold">
                ✓ Amministratore attivo ({currentUser?.email || 'Sessione'})
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setShowLoginModal(true)}
                className="text-[11px] text-muted-foreground/70 hover:text-foreground cursor-pointer transition-colors min-h-[36px] flex items-center"
                title="Login per amministratori"
              >
                🔒 Login Redazione
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* MOBILE STICKY BOTTOM NAVIGATION BAR (5-tab thumb-friendly native app navigation on mobile) */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur-md border-t-2 border-border z-40 px-1 py-1 grid grid-cols-5 items-center pb-safe shadow-[0_-4px_12px_rgba(0,0,0,0.08)]">
        {/* Toggle Pages Dropdown */}
        <button
          type="button"
          onClick={() => {
            setPageDropdownOpen((prev) => !prev);
            setDropdownSearch('');
          }}
          className={`flex flex-col items-center justify-center py-1 px-1 min-h-[46px] cursor-pointer rounded-sm transition-colors ${
            pageDropdownOpen ? 'text-primary font-bold bg-muted/60' : 'text-foreground hover:text-primary'
          }`}
          title="Sfoglia pagine"
        >
          <span className="text-base leading-none">☰</span>
          <span className="text-[10px] uppercase font-bold tracking-tight mt-0.5 truncate">Pagine</span>
        </button>

        {/* Scroll & Focus Search */}
        <button
          type="button"
          onClick={handleScrollToSearch}
          className="flex flex-col items-center justify-center py-1 px-1 min-h-[46px] text-foreground hover:text-primary cursor-pointer transition-colors"
          title="Cerca articoli"
        >
          <span className="text-base leading-none">🔍</span>
          <span className="text-[10px] uppercase font-bold tracking-tight mt-0.5 truncate">Cerca</span>
        </button>

        {/* 24h Trend Analytics Dashboard */}
        <button
          type="button"
          onClick={() => setShowAnalyticsDashboard(true)}
          className="flex flex-col items-center justify-center py-1 px-1 min-h-[46px] text-foreground hover:text-primary cursor-pointer transition-colors"
          title="Trend Tematici 24h"
        >
          <span className="text-base leading-none">📊</span>
          <span className="text-[10px] uppercase font-bold tracking-tight mt-0.5 truncate">Trend 24h</span>
        </button>

        {/* Notifications Modal */}
        <button
          type="button"
          onClick={() => {
            setShowNotifModal(true);
            setUnreadNotifCount(0);
          }}
          className="relative flex flex-col items-center justify-center py-1 px-1 min-h-[46px] text-foreground hover:text-primary cursor-pointer transition-colors"
          title="Notifiche Live"
        >
          <span className="text-base leading-none">🔔</span>
          <span className="text-[10px] uppercase font-bold tracking-tight mt-0.5 truncate">Avvisi</span>
          {unreadNotifCount > 0 && (
            <span className="absolute top-1 right-3 bg-primary text-primary-foreground text-[9px] font-bold h-4 w-4 rounded-full flex items-center justify-center animate-pulse">
              {unreadNotifCount}
            </span>
          )}
        </button>

        {/* Scroll to Top */}
        <button
          type="button"
          onClick={handleScrollToTop}
          className="flex flex-col items-center justify-center py-1 px-1 min-h-[46px] text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          title="Torna in cima"
        >
          <span className="text-base leading-none">⬆</span>
          <span className="text-[10px] uppercase font-bold tracking-tight mt-0.5 truncate">In Cima</span>
        </button>
      </nav>

      {/* MODAL: ADMIN LOGIN */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-md border-t-3 sm:border-4 border-border bg-card rounded-t-2xl sm:rounded-none p-4 sm:p-6 shadow-[0_-8px_30px_rgba(0,0,0,0.35)] sm:shadow-[8px_8px_0_0_var(--foreground)] max-h-[92dvh] overflow-y-auto">
            <div className="sm:hidden flex justify-center pb-2">
              <div className="w-10 h-1.5 rounded-full bg-border" />
            </div>
            <div className="flex items-center justify-between border-b-2 border-border pb-3">
              <div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight" style={fontFraunces}>
                  Login Amministratore
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Accedi per gestire pagine, aggiungere feed e moderare i contenuti.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="w-10 h-10 flex items-center justify-center text-lg font-bold hover:text-primary cursor-pointer border border-transparent hover:border-border transition-colors"
                title="Chiudi"
                aria-label="Chiudi finestra login"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 sm:mt-5 space-y-4 text-xs">
              {loginError && (
                <div className="border border-destructive bg-destructive/10 p-3 text-destructive rounded-none">
                  {loginError}
                </div>
              )}

              {/* Method 1: Google Sign-In */}
              <div>
                <p className="font-semibold text-muted-foreground uppercase text-[11px] mb-2">
                  Metodo 1: Accesso con Google ({ADMIN_EMAIL})
                </p>
                <button
                  type="button"
                  disabled={loginLoading}
                  onClick={handleGoogleLogin}
                  className="w-full border-2 border-border bg-background py-2.5 px-4 min-h-[44px] font-bold uppercase tracking-wider hover:bg-muted transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-[2px_2px_0_0_var(--foreground)]"
                >
                  <span className="font-bold">G</span>
                  <span>{loginLoading ? 'Connessione…' : 'Accedi con Account Google'}</span>
                </button>
              </div>

              <div className="relative my-3 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/40" />
                </div>
                <span className="relative bg-card px-2 text-[10px] uppercase text-muted-foreground">
                  Oppure
                </span>
              </div>

              {/* Method 2: Master Code / Passcode */}
              <form onSubmit={handleCodeLogin}>
                <p className="font-semibold text-muted-foreground uppercase text-[11px] mb-1">
                  Metodo 2: Codice Amministratore
                </p>
                <p className="text-[11px] text-muted-foreground mb-2">
                  (Codice predefinito: <code className="bg-muted px-1">{ADMIN_FALLBACK_CODE}</code>)
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="password"
                    value={adminCodeInput}
                    onChange={(e) => setAdminCodeInput(e.target.value)}
                    placeholder="Inserisci codice..."
                    className="flex-1 border-2 border-border bg-background px-3 py-2.5 text-base sm:text-sm outline-none focus:border-primary min-h-[44px]"
                  />
                  <button
                    type="submit"
                    className="border-2 border-border bg-primary px-5 py-2.5 min-h-[44px] font-bold uppercase text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] cursor-pointer"
                  >
                    Entra
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REAL-TIME NOTIFICATIONS REGISTRATION & FEED */}
      {showNotifModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-lg border-t-3 sm:border-4 border-border bg-card rounded-t-2xl sm:rounded-none p-4 sm:p-6 shadow-[0_-8px_30px_rgba(0,0,0,0.35)] sm:shadow-[8px_8px_0_0_var(--foreground)] max-h-[92dvh] overflow-y-auto">
            <div className="sm:hidden flex justify-center pb-2">
              <div className="w-10 h-1.5 rounded-full bg-border" />
            </div>
            <div className="flex items-center justify-between border-b-2 border-border pb-3">
              <div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2" style={fontFraunces}>
                  <span>🔔</span> Notifiche in Tempo Reale
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Rimani aggiornato non appena vengono pubblicati nuovi articoli.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowNotifModal(false)}
                className="w-10 h-10 flex items-center justify-center text-lg font-bold hover:text-primary cursor-pointer border border-transparent hover:border-border transition-colors"
                title="Chiudi"
                aria-label="Chiudi finestra notifiche"
              >
                ✕
              </button>
            </div>

            {subSuccessNotice && (
              <div className="mt-4 border border-green-600 bg-green-500/10 p-3 text-xs text-green-700 font-semibold">
                ✓ {subSuccessNotice}
              </div>
            )}

            {/* Registration Form */}
            <form onSubmit={handleVisitorSubscribe} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                  La tua Email per le Notifiche *
                </label>
                <input
                  type="email"
                  required
                  value={subEmail}
                  onChange={(e) => setSubEmail(e.target.value)}
                  placeholder="nome@dominio.it"
                  className="w-full border-2 border-border bg-background px-3 py-2.5 text-base sm:text-sm outline-none focus:border-primary min-h-[44px]"
                />
              </div>

              {/* Pages Selection */}
              <div>
                <label className="block uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
                  Seleziona le Pagine da Seguire:
                </label>
                <div className="space-y-2 border border-border p-3 bg-background">
                  <label className="flex items-center gap-2.5 cursor-pointer font-bold min-h-[30px]">
                    <input
                      type="checkbox"
                      checked={subAllPages}
                      onChange={(e) => {
                        setSubAllPages(e.target.checked);
                        if (e.target.checked) {
                          setSubSelectedPages([]);
                        }
                      }}
                      className="accent-primary h-4 w-4"
                    />
                    <span>Tutte le Pagine e Sezioni</span>
                  </label>

                  {!subAllPages && (
                    <div className="pt-2 pl-3 border-t border-border/40 space-y-2">
                      {pages.map((p) => {
                        const isChecked = subSelectedPages.includes(p.id);
                        return (
                          <label key={p.id} className="flex items-center gap-2.5 cursor-pointer min-h-[30px]">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSubSelectedPages((prev) => [...prev, p.id]);
                                } else {
                                  setSubSelectedPages((prev) => prev.filter((id) => id !== p.id));
                                }
                              }}
                              className="accent-primary h-4 w-4"
                            />
                            <span>{p.title}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Channel Options */}
              <div className="space-y-2.5 pt-1">
                <label className="flex items-start gap-2.5 cursor-pointer min-h-[30px]">
                  <input
                    type="checkbox"
                    checked={subNotifyBrowser}
                    onChange={(e) => setSubNotifyBrowser(e.target.checked)}
                    className="accent-primary h-4 w-4 mt-0.5"
                  />
                  <span>Attiva Notifiche Push nel Browser (Desktop/Mobile)</span>
                </label>
                <label className="flex items-start gap-2.5 cursor-pointer min-h-[30px]">
                  <input
                    type="checkbox"
                    checked={subNotifyInApp}
                    onChange={(e) => setSubNotifyInApp(e.target.checked)}
                    className="accent-primary h-4 w-4 mt-0.5"
                  />
                  <span>Attiva Notifiche In-App in Tempo Reale (Toast a comparsa)</span>
                </label>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border">
                {visitorSub ? (
                  <button
                    type="button"
                    onClick={handleVisitorUnsubscribe}
                    className="text-destructive underline hover:text-destructive/80 cursor-pointer py-1.5"
                  >
                    Disiscriviti
                  </button>
                ) : (
                  <span />
                )}

                <button
                  type="submit"
                  disabled={subSaving}
                  className="w-full sm:w-auto border-2 border-border bg-primary px-5 py-2.5 min-h-[44px] font-bold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer disabled:opacity-50"
                >
                  {subSaving ? 'Salvataggio…' : visitorSub ? 'Aggiorna Iscrizione' : 'Iscriviti alle Notifiche'}
                </button>
              </div>
            </form>

            {/* Live Feed History */}
            <div className="mt-5 sm:mt-6 border-t-2 border-border pt-4">
              <h4 className="font-bold uppercase tracking-wider text-xs text-muted-foreground mb-2 flex items-center justify-between">
                <span>Ultime Notifiche ({liveNotifications.length})</span>
                <span className="text-[10px] text-primary">In Diretta</span>
              </h4>

              {liveNotifications.length === 0 ? (
                <p className="text-xs text-muted-foreground italic p-3 border border-dashed border-border/40 text-center">
                  Nessuna notifica recente. Non appena viene scansionato un nuovo articolo, apparirà qui in tempo reale.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto divide-y divide-border/20 border border-border bg-background text-xs">
                  {liveNotifications.map((notif) => (
                    <div key={notif.id} className="p-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground mb-1">
                        <span className="font-bold text-foreground truncate">{notif.feedTitle || 'Feed'}</span>
                        <span className="shrink-0">{new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowNotifModal(false);
                          handleOpenArticle({
                            title: notif.title,
                            link: notif.link,
                            description: notif.message,
                            feedTitle: notif.feedTitle,
                            date: new Date(notif.createdAt).toLocaleDateString('it-IT'),
                          });
                        }}
                        className="text-left font-bold hover:text-primary block line-clamp-2 cursor-pointer w-full"
                      >
                        {notif.title}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD FEEDS TO PAGE (ADMIN) */}
      {showAddFeedsModal && activePage && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-lg border-t-3 sm:border-4 border-border bg-card rounded-t-2xl sm:rounded-none p-4 sm:p-6 shadow-[0_-8px_30px_rgba(0,0,0,0.35)] sm:shadow-[8px_8px_0_0_var(--foreground)] max-h-[92dvh] overflow-y-auto">
            <div className="sm:hidden flex justify-center pb-2">
              <div className="w-10 h-1.5 rounded-full bg-border" />
            </div>
            <div className="flex items-center justify-between border-b-2 border-border pb-3">
              <div>
                <h3 className="text-lg sm:text-xl font-bold tracking-tight" style={fontFraunces}>
                  Aggiungi Feed a "{activePage.title}"
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Incolla nuovi link o collega feed già salvati nel database.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddFeedsModal(false)}
                className="w-10 h-10 flex items-center justify-center text-lg font-bold hover:text-primary cursor-pointer border border-transparent hover:border-border transition-colors"
                title="Chiudi"
                aria-label="Chiudi finestra"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex gap-4 border-b-2 border-border text-xs uppercase tracking-wider">
              <button
                type="button"
                onClick={() => setAddFeedsTab('newUrls')}
                className={`pb-2.5 font-semibold cursor-pointer min-h-[36px] ${
                  addFeedsTab === 'newUrls'
                    ? 'border-b-2 border-primary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Incolla Nuovi URL
              </button>
              <button
                type="button"
                onClick={() => setAddFeedsTab('fromDb')}
                className={`pb-2.5 font-semibold cursor-pointer min-h-[36px] ${
                  addFeedsTab === 'fromDb'
                    ? 'border-b-2 border-primary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Dall'Archivio ({availableDbFeedsForActivePage.length})
              </button>
            </div>

            <form onSubmit={handleAddFeedsToActivePageSubmit} className="mt-4 space-y-4 text-xs">
              {addFeedsTab === 'newUrls' ? (
                <div>
                  <label className="block uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                    URL dei Blog o Siti (uno per riga) *
                  </label>
                  <textarea
                    rows={4}
                    value={addFeedsUrlsText}
                    onChange={(e) => setAddFeedsUrlsText(e.target.value)}
                    placeholder={'https://overreacted.io\nhttps://blog.cloudflare.com'}
                    required={addFeedsSelectedDbIds.length === 0}
                    className="w-full border-2 border-border bg-background p-3 text-base sm:text-sm outline-none focus:border-primary font-mono"
                  />

                  <div className="mt-3">
                    <label className="block uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                      Frequenza di controllo
                    </label>
                    <select
                      value={addFeedsInterval}
                      onChange={(e) => setAddFeedsInterval(Number(e.target.value))}
                      className="border-2 border-border bg-background px-3 py-2.5 text-base sm:text-xs outline-none focus:border-primary cursor-pointer w-full min-h-[44px]"
                    >
                      {INTERVAL_OPTIONS.map((val) => (
                        <option key={val} value={val}>
                          Controlla ogni {formatInterval(val)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  {availableDbFeedsForActivePage.length === 0 ? (
                    <p className="p-4 border border-dashed border-border/40 text-center text-xs text-muted-foreground">
                      Tutti i feed salvati nel database sono già associati a questa pagina.
                    </p>
                  ) : (
                    <div className="max-h-60 overflow-y-auto border-2 border-border divide-y divide-border/20 bg-background">
                      {availableDbFeedsForActivePage.map((feed) => {
                        const isChecked = addFeedsSelectedDbIds.includes(feed.id);
                        return (
                          <label
                            key={feed.id}
                            className="flex items-center gap-3 p-3 hover:bg-muted/40 cursor-pointer min-h-[44px]"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAddFeedsSelectedDbIds((prev) => [...prev, feed.id]);
                                } else {
                                  setAddFeedsSelectedDbIds((prev) => prev.filter((id) => id !== feed.id));
                                }
                              }}
                              className="accent-primary h-4 w-4"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="font-bold truncate text-foreground">{feed.title}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{feed.url}</p>
                            </div>
                            <span className="text-[11px] text-muted-foreground shrink-0">
                              {feed.itemsCount} art.
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {addingProgressText && (
                <p className="animate-pulse text-xs text-primary font-semibold">
                  {addingProgressText}
                </p>
              )}

              <div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 pt-3 border-t-2 border-border">
                <button
                  type="button"
                  onClick={() => setShowAddFeedsModal(false)}
                  className="border-2 border-border px-4 py-2.5 min-h-[44px] font-medium uppercase hover:bg-muted cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={addingFeedsLoading}
                  className="border-2 border-border bg-primary px-5 py-2.5 min-h-[44px] font-bold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer disabled:opacity-50"
                >
                  {addingFeedsLoading ? 'Salvataggio…' : 'Collega alla Pagina'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW PAGE (ADMIN) */}
      {showNewPageModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-in fade-in">
          <div className="w-full max-w-lg border-t-3 sm:border-4 border-border bg-card rounded-t-2xl sm:rounded-none p-4 sm:p-6 shadow-[0_-8px_30px_rgba(0,0,0,0.35)] sm:shadow-[8px_8px_0_0_var(--foreground)] max-h-[92dvh] overflow-y-auto">
            <div className="sm:hidden flex justify-center pb-2">
              <div className="w-10 h-1.5 rounded-full bg-border" />
            </div>
            <div className="flex items-center justify-between border-b-2 border-border pb-3">
              <h3 className="text-lg sm:text-xl font-bold tracking-tight" style={fontFraunces}>
                Crea Nuova Pagina Tematica
              </h3>
              <button
                type="button"
                onClick={() => setShowNewPageModal(false)}
                className="w-10 h-10 flex items-center justify-center text-lg font-bold hover:text-primary cursor-pointer border border-transparent hover:border-border transition-colors"
                title="Chiudi"
                aria-label="Chiudi finestra"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePageSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                  Titolo della Pagina *
                </label>
                <input
                  type="text"
                  required
                  value={newPageTitle}
                  onChange={(e) => {
                    setNewPageTitle(e.target.value);
                    if (!newPageSlug) {
                      setNewPageSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, '-')
                          .replace(/^-|-$/g, '')
                      );
                    }
                  }}
                  placeholder="es. Intelligenza Artificiale, Notizie Tech"
                  className="w-full border-2 border-border bg-background px-3 py-2.5 text-base sm:text-sm outline-none focus:border-primary min-h-[44px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                    Slug URL
                  </label>
                  <input
                    type="text"
                    value={newPageSlug}
                    onChange={(e) => setNewPageSlug(e.target.value)}
                    placeholder="es. ia-news"
                    className="w-full border-2 border-border bg-background px-3 py-2.5 text-base sm:text-sm outline-none focus:border-primary min-h-[44px]"
                  />
                </div>
                <div>
                  <label className="block uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                    Categoria Menu
                  </label>
                  <input
                    type="text"
                    value={newPageCategory}
                    onChange={(e) => setNewPageCategory(e.target.value)}
                    placeholder="es. Tech, News"
                    className="w-full border-2 border-border bg-background px-3 py-2.5 text-base sm:text-sm outline-none focus:border-primary min-h-[44px]"
                  />
                </div>
              </div>

              <div>
                <label className="block uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                  Descrizione della Pagina
                </label>
                <textarea
                  rows={2}
                  value={newPageDesc}
                  onChange={(e) => setNewPageDesc(e.target.value)}
                  placeholder="Descrizione dell'argomento e delle fonti aggregate..."
                  className="w-full border-2 border-border bg-background px-3 py-2.5 text-base sm:text-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                  Feed da Inserire (uno per riga, opzionale)
                </label>
                <textarea
                  rows={3}
                  value={newPageUrlsText}
                  onChange={(e) => setNewPageUrlsText(e.target.value)}
                  placeholder={'https://overreacted.io\nhttps://blog.cloudflare.com'}
                  className="w-full border-2 border-border bg-background p-3 text-base sm:text-sm outline-none focus:border-primary font-mono"
                />
              </div>

              {savedFeeds.length > 0 && (
                <div>
                  <label className="block uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                    Collega feed già salvati nel database:
                  </label>
                  <div className="max-h-36 overflow-y-auto border-2 border-border divide-y divide-border/20 bg-background">
                    {savedFeeds.map((feed) => {
                      const isChecked = newPageSelectedDbFeedIds.includes(feed.id);
                      return (
                        <label
                          key={feed.id}
                          className="flex items-center gap-2.5 p-2.5 hover:bg-muted/40 cursor-pointer text-xs min-h-[40px]"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewPageSelectedDbFeedIds((prev) => [...prev, feed.id]);
                              } else {
                                setNewPageSelectedDbFeedIds((prev) =>
                                  prev.filter((id) => id !== feed.id)
                                );
                              }
                            }}
                            className="accent-primary h-4 w-4"
                          />
                          <span className="font-semibold truncate">{feed.title}</span>
                          <span className="text-[10px] text-muted-foreground truncate">
                            ({feed.url})
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {createProgressText && (
                <p className="animate-pulse text-xs text-primary font-semibold">
                  {createProgressText}
                </p>
              )}

              <div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 pt-3 border-t-2 border-border">
                <button
                  type="button"
                  onClick={() => setShowNewPageModal(false)}
                  className="border-2 border-border px-4 py-2.5 min-h-[44px] font-medium uppercase hover:bg-muted cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={creatingPage}
                  className="border-2 border-border bg-primary px-5 py-2.5 min-h-[44px] font-bold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer disabled:opacity-50"
                >
                  {creatingPage ? 'Creazione…' : 'Crea Pagina & Menu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SOCIAL CONTENT SHARING */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        data={shareModalData}
      />

      {/* MODAL: AFFILIATE CATEGORY SCRAPER & MONETIZATION */}
      <AffiliateCategoryScraperModal
        isOpen={showAffiliateModal}
        onClose={() => setShowAffiliateModal(false)}
        pages={pages}
        onPageCreated={(newPageId) => {
          setActivePageId(newPageId);
        }}
        onFeedsAdded={() => {
          // Feeds are reactively loaded via Firestore snapshot listener
        }}
      />

      {/* MODAL: MANUAL ARTICLE CREATION & EDITING WITH SEO OPTIMIZATION */}
      <ManualArticleModal
        isOpen={showManualArticleModal}
        onClose={() => {
          setShowManualArticleModal(false);
          setArticleToEdit(null);
        }}
        pages={pages}
        initialPageId={activePage?.id}
        articleToEdit={articleToEdit}
        onSave={handleSaveManualArticle}
      />

      {/* MODAL: ARTICLE DETAIL & IN-APP EDITORIAL READER */}
      <ArticleDetailModal
        article={readingArticle}
        isOpen={Boolean(readingArticle)}
        onClose={handleCloseArticleModal}
        isAdmin={isAdmin}
        adminMode={adminMode}
        onEdit={(art) => {
          handleCloseArticleModal();
          setArticleToEdit(art);
          setShowManualArticleModal(true);
        }}
        onDelete={handleDeleteManualArticle}
        onShare={handleOpenShare}
        onPrevArticle={handlePrevArticle}
        onNextArticle={handleNextArticle}
        hasPrevArticle={hasPrevArticle}
        hasNextArticle={hasNextArticle}
        currentIndex={readingArticleIndex >= 0 ? readingArticleIndex + 1 : undefined}
        totalArticles={displayedArticles.length}
        activePageSlugOrId={activePage?.slug || activePage?.id}
      />

      {/* MODAL: OLLAMA AI SUPER ADMINISTRATOR */}
      <OllamaAdminModal
        isOpen={showOllamaModal}
        onClose={() => setShowOllamaModal(false)}
        pages={pages}
        activePage={activePage}
        onPageCreatedOrUpdated={(newPageId) => {
          setActivePageId(newPageId);
          setSelectedSourceFilter(null);
          setSearchQuery('');
        }}
        onScrapeAndSaveFeed={async (feedUrl, feedInterval, targetPageId) => {
          return await scrapeSingleUrl(feedUrl, feedInterval, targetPageId);
        }}
        onSaveEditorialArticle={handleSaveManualArticle}
        onPublishNotification={publishLiveNotification}
      />

      {/* MODAL: 24-HOUR THEMATIC TREND ANALYTICS DASHBOARD */}
      <TrendAnalyticsDashboard
        isOpen={showAnalyticsDashboard}
        onClose={() => setShowAnalyticsDashboard(false)}
        savedFeeds={savedFeeds}
        manualArticles={manualArticles}
        pages={pages}
        activePage={activePage}
        onOpenArticle={handleOpenArticle}
        onOpenShare={handleOpenShare}
      />
    </main>
  );
}
