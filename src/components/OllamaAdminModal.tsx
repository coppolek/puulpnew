import React, { useState, useEffect } from 'react';
import { CustomPage, ManualArticle, SocialShareKit } from '../lib/firebase';
import { Bot, CheckCircle2, AlertCircle, RefreshCw, Sparkles, Terminal, Globe, Rss, FileText, Send, ArrowRight, Play, Server, HelpCircle, Code, Zap, Share2, MessageCircle, Copy, Check, ExternalLink } from 'lucide-react';

export interface OllamaAdminPlan {
  thought: string;
  page: {
    action: 'create' | 'update';
    title: string;
    slug: string;
    category: string;
    description: string;
  };
  suggestedFeeds: Array<{
    title: string;
    url: string;
    interval?: number;
    reason?: string;
  }>;
  editorialArticle: {
    title: string;
    slug: string;
    category: string;
    description: string;
    focusKeyword?: string;
    metaTitle?: string;
    metaDescription?: string;
    author?: string;
    content: string;
  };
  liveNotification?: {
    title: string;
    message?: string;
  };
  socialShare?: SocialShareKit;
}

interface OllamaAdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  pages: CustomPage[];
  activePage: CustomPage | null;
  onPageCreatedOrUpdated: (pageId: string) => void;
  onScrapeAndSaveFeed: (url: string, interval: number, pageId: string) => Promise<string>;
  onSaveEditorialArticle: (article: Omit<ManualArticle, 'id' | 'createdAt'>) => Promise<void>;
  onPublishNotification?: (notif: { title: string; message?: string; link: string; pageId?: string; feedTitle?: string }) => Promise<any>;
}

export function OllamaAdminModal({
  isOpen,
  onClose,
  pages,
  activePage,
  onPageCreatedOrUpdated,
  onScrapeAndSaveFeed,
  onSaveEditorialArticle,
  onPublishNotification,
}: OllamaAdminModalProps) {
  // Connection state
  const [endpoint, setEndpoint] = useState<string>(() => {
    return localStorage.getItem('puulp_ollama_endpoint') || 'http://localhost:11434';
  });
  const [model, setModel] = useState<string>(() => {
    return localStorage.getItem('puulp_ollama_model') || 'llama3.2';
  });
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connected' | 'error'>('idle');
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);

  // Prompt & Generation state
  const [prompt, setPrompt] = useState<string>('');
  const [targetMode, setTargetMode] = useState<'create_new' | 'update_page'>('create_new');
  const [autoExecute, setAutoExecute] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedPlan, setGeneratedPlan] = useState<OllamaAdminPlan | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<{
    used: boolean;
    reason?: string;
    model?: string;
  } | null>(null);

  // Execution state
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionLogs, setExecutionLogs] = useState<string[]>([]);
  const [executionCompleted, setExecutionCompleted] = useState<boolean>(false);
  const [completedPageId, setCompletedPageId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'prompt' | 'plan' | 'settings'>('prompt');

  // Social kit copy feedback states
  const [copiedSocialX, setCopiedSocialX] = useState<boolean>(false);
  const [copiedSocialLinkedIn, setCopiedSocialLinkedIn] = useState<boolean>(false);
  const [copiedSocialWhatsApp, setCopiedSocialWhatsApp] = useState<boolean>(false);

  // Load models on initial open if not loaded
  useEffect(() => {
    if (isOpen && availableModels.length === 0) {
      testOllamaConnection(endpoint);
    }
  }, [isOpen]);

  async function testOllamaConnection(targetEndpoint: string) {
    setTestingConnection(true);
    setConnectionMessage(null);
    try {
      const res = await fetch('/api/ollama/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: targetEndpoint }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        if (data.connected) {
          setConnectionStatus('connected');
          setConnectionMessage(data.message || `Connesso! Rilevati ${data.models?.length || 0} modelli.`);
        } else {
          setConnectionStatus('idle');
          setConnectionMessage(data.message || 'Ollama non raggiungibile dal cloud. Cloud AI Fallback pronto.');
        }

        const modelsList = data.models || [];
        setAvailableModels(modelsList);
        if (modelsList.length > 0 && !modelsList.includes(model)) {
          setModel(modelsList[0]);
          localStorage.setItem('puulp_ollama_model', modelsList[0]);
        }
        localStorage.setItem('puulp_ollama_endpoint', targetEndpoint);
      } else {
        setConnectionStatus('idle');
        setConnectionMessage(data.error || 'Server in attesa. Cloud AI Fallback pronto.');
      }
    } catch {
      setConnectionStatus('idle');
      setConnectionMessage('Controllo completato. Cloud AI Fallback pronto all\'uso.');
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleGeneratePlan(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setGenerationError(null);
    setGeneratedPlan(null);
    setExecutionLogs([]);
    setExecutionCompleted(false);
    setFallbackNotice(null);

    try {
      const res = await fetch('/api/ollama/admin-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          model,
          prompt,
          targetMode,
          activePage: targetMode === 'update_page' ? activePage : undefined,
          categories: ['Tech', 'News', 'Finanza', 'Sport', 'Scienza', 'Cultura', 'Shopping', 'Lifestyle'],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok || !data.plan) {
        throw new Error(data?.error || 'Errore nella generazione del piano da parte del motore AI.');
      }

      if (data.fallbackUsed) {
        setFallbackNotice({
          used: true,
          reason: data.fallbackReason,
          model: data.model,
        });
      } else {
        setFallbackNotice(null);
      }

      setGeneratedPlan(data.plan);
      setActiveTab('plan');

      // Se autopilot è attivo, esegui subito
      if (autoExecute) {
        await executePlan(data.plan);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setGenerationError(msg);
    } finally {
      setIsGenerating(false);
    }
  }

  async function executePlan(plan: OllamaAdminPlan) {
    setIsExecuting(true);
    setExecutionCompleted(false);
    const logs: string[] = [];

    function addLog(msg: string) {
      logs.push(`[${new Date().toLocaleTimeString('it-IT')}] ${msg}`);
      setExecutionLogs([...logs]);
    }

    try {
      addLog('🤖 Avvio esecuzione delle direttive di Ollama...');

      // 1. Risolvi o Crea la Pagina
      let targetPageId = activePage?.id || '';
      let finalSlug = plan.page.slug || 'nuova-pagina';
      finalSlug = finalSlug.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 50);

      if (plan.page.action === 'create' || targetMode === 'create_new' || !targetPageId) {
        addLog(`📄 Creazione nuova pagina "${plan.page.title}" (${plan.page.category})...`);
        const { createCustomPage } = await import('../lib/firebase');
        targetPageId = await createCustomPage({
          title: plan.page.title,
          slug: finalSlug,
          category: plan.page.category || 'Tech',
          description: plan.page.description,
          feedIds: [],
          socialShare: plan.socialShare,
        });
        addLog(`✓ Pagina creata con successo! ID: ${targetPageId}`);
      } else {
        addLog(`📄 Aggiornamento pagina esistente "${plan.page.title}"...`);
        const { updateCustomPage } = await import('../lib/firebase');
        await updateCustomPage(targetPageId, {
          title: plan.page.title,
          description: plan.page.description,
          category: plan.page.category,
          socialShare: plan.socialShare,
        });
        addLog(`✓ Pagina aggiornata.`);
      }

      setCompletedPageId(targetPageId);

      // 2. Scansione e associazione Feed suggeriti
      if (plan.suggestedFeeds && plan.suggestedFeeds.length > 0) {
        addLog(`📡 Scansione di ${plan.suggestedFeeds.length} sorgenti feed consigliate...`);
        let savedFeedsCount = 0;

        for (const feed of plan.suggestedFeeds) {
          try {
            addLog(`🔍 Scansione fonte: ${feed.title} (${feed.url})...`);
            await onScrapeAndSaveFeed(feed.url, feed.interval || 60, targetPageId);
            savedFeedsCount++;
            addLog(`✓ Feed "${feed.title}" memorizzato e collegato alla pagina!`);
          } catch (feedErr: unknown) {
            const feedErrMsg = feedErr instanceof Error ? feedErr.message : String(feedErr);
            addLog(`⚠️ Avviso feed "${feed.title}": ${feedErrMsg}`);
          }
        }
        addLog(`✓ Completata elaborazione feed: ${savedFeedsCount} sorgenti operative.`);
      }

      // 3. Pubblicazione Articolo Editoriale SEO con Codice
      if (plan.editorialArticle && plan.editorialArticle.title) {
        addLog(`✍️ Pubblicazione articolo editoriale SEO: "${plan.editorialArticle.title}"...`);
        const artSlug = (plan.editorialArticle.slug || plan.editorialArticle.title)
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, '_')
          .slice(0, 50);

        await onSaveEditorialArticle({
          title: plan.editorialArticle.title,
          slug: artSlug,
          category: plan.editorialArticle.category || plan.page.category || 'Editoriale',
          description: plan.editorialArticle.description,
          content: plan.editorialArticle.content,
          focusKeyword: plan.editorialArticle.focusKeyword,
          metaTitle: plan.editorialArticle.metaTitle,
          metaDescription: plan.editorialArticle.metaDescription,
          author: plan.editorialArticle.author || `Ollama AI (${model})`,
          pageId: targetPageId,
          isManual: true,
          socialShare: plan.socialShare,
        });
        addLog(`✓ Articolo editoriale pubblicato e ottimizzato per i motori di ricerca!`);
      }

      // 4. Invio notifica live
      if (plan.liveNotification && plan.liveNotification.title && onPublishNotification) {
        try {
          await onPublishNotification({
            title: plan.liveNotification.title,
            message: plan.liveNotification.message,
            link: `${window.location.origin}/?p=${encodeURIComponent(finalSlug)}`,
            pageId: targetPageId,
            feedTitle: `🤖 Ollama AI Admin (${model})`,
          });
          addLog(`🔔 Notifica push live inviata a tutti i lettori iscritti.`);
        } catch {
          // notifica facoltativa
        }
      }

      // 5. Configurazione Kit Social Media Elaborato da Ollama
      if (plan.socialShare) {
        addLog(`📱 Kit Social Media registrato: post X/Twitter, LinkedIn, WhatsApp e OpenGraph configurati con successo!`);
      }

      addLog(`🎉 Gestione completa della pagina completata con successo da Ollama!`);
      setExecutionCompleted(true);
      onPageCreatedOrUpdated(targetPageId);
    } catch (execErr: unknown) {
      const msg = execErr instanceof Error ? execErr.message : String(execErr);
      addLog(`❌ Errore durante l'esecuzione: ${msg}`);
    } finally {
      setIsExecuting(false);
    }
  }

  if (!isOpen) return null;

  const fontFraunces = { fontFamily: 'Fraunces, Georgia, serif' };

  const promptPresets = [
    {
      label: '🚀 Nuova Pagina AI & Modelli Open Source (con Codice Python)',
      text: 'Crea una pagina tematica intitolata "Intelligenza Artificiale Open Source" con categoria Tech, collega i feed di Wired Tech, The Verge e Hacker News, e redigi un articolo editoriale di guida con codice Python completo per chiamare Ollama via API REST locale.',
    },
    {
      label: '🛡️ Pagina Cybersecurity & Hacking Etico (con Script Bash)',
      text: 'Crea una pagina "Cybersecurity & Minacce Zero-Day" con categoria News, collegando i principali bollettini di sicurezza informatica. Scrivi un articolo di approfondimento sull\'audit delle vulnerabilità con script Bash di scansione porte e sicurezza.',
    },
    {
      label: '📈 Finanza, Mercati & Macroeconomia',
      text: 'Crea una pagina "Mercati & Finanza Globale" con categoria Finanza, collegando feed economici autorevoli. Redigi un articolo di analisi sull\'inflazione e tassi BCE con focus keyword SEO e tabella previsioni.',
    },
    {
      label: '🔄 Arricchisci la Pagina Attiva',
      text: 'Arricchisci la pagina attiva con nuove fonti autorevoli e redigi un editoriale d\'apertura che commenta le tendenze più importanti di questa settimana.',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5 bg-background/85 backdrop-blur-sm animate-in fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[94dvh] sm:max-h-[92vh] flex flex-col border-t-3 sm:border-3 border-border bg-card rounded-t-2xl sm:rounded-none shadow-[0_-8px_30px_rgba(0,0,0,0.35)] sm:shadow-[8px_8px_0_0_var(--foreground)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center pt-2 pb-1 bg-muted/40">
          <div className="w-10 h-1.5 rounded-full bg-border" />
        </div>
        {/* Header Bar */}
        <div className="bg-muted/40 border-b-2 border-border p-3.5 sm:p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-xs shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold leading-tight truncate" style={fontFraunces}>
                  Ollama AI Administrator
                </h2>
                <span className="text-[10px] uppercase tracking-wider font-extrabold bg-foreground text-background px-2 py-0.5 rounded-sm shrink-0">
                  Super Admin
                </span>
              </div>
              <p className="text-xs text-muted-foreground hidden xs:block truncate">
                Gestione autonoma di intere pagine, feed RSS e contenuti editoriali da prompt
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Status Pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono border rounded-full ${
                connectionStatus === 'connected'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                  : connectionStatus === 'error'
                  ? 'border-rose-400 bg-rose-50 text-rose-800'
                  : 'border-amber-400/80 bg-amber-50 text-amber-900'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-emerald-500 animate-pulse'
                    : connectionStatus === 'error'
                    ? 'bg-rose-500'
                    : 'bg-amber-500'
                }`}
              />
              <span className="font-semibold hidden sm:inline">
                {connectionStatus === 'connected'
                  ? `Ollama: ${model}`
                  : connectionStatus === 'error'
                  ? 'Offline'
                  : 'Cloud AI Ready'}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center border-2 border-border bg-card text-foreground font-bold hover:bg-destructive hover:text-destructive-foreground transition-colors cursor-pointer text-sm"
              aria-label="Chiudi modale"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b-2 border-border bg-muted/20 text-xs font-bold uppercase tracking-wider shrink-0 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('prompt')}
            className={`px-4 py-2.5 flex items-center gap-1.5 border-r border-border transition-colors cursor-pointer ${
              activeTab === 'prompt' ? 'bg-card text-primary border-b-2 border-b-primary -mb-[2px]' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Prompt di Comando</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('plan')}
            disabled={!generatedPlan && !isGenerating}
            className={`px-4 py-2.5 flex items-center gap-1.5 border-r border-border transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none ${
              activeTab === 'plan' ? 'bg-card text-primary border-b-2 border-b-primary -mb-[2px]' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Piano Esecutivo {generatedPlan && '✓'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`px-4 py-2.5 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'settings' ? 'bg-card text-primary border-b-2 border-b-primary -mb-[2px]' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>Connessione Ollama</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* TAB 1: PROMPT DI COMANDO */}
          {activeTab === 'prompt' && (
            <div className="space-y-5">
              {/* Target Mode Selector */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 border-2 border-border bg-card">
                <div>
                  <span className="text-xs uppercase font-extrabold text-foreground tracking-wider block">
                    Ambito di Amministrazione
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Scegli se Ollama deve creare una nuova pagina da zero o aggiornare quella corrente.
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setTargetMode('create_new')}
                    className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border cursor-pointer transition-colors ${
                      targetMode === 'create_new'
                        ? 'bg-foreground text-background border-foreground font-black'
                        : 'bg-card text-muted-foreground border-border hover:bg-muted'
                    }`}
                  >
                    🆕 Nuova Pagina
                  </button>
                  {activePage && (
                    <button
                      type="button"
                      onClick={() => setTargetMode('update_page')}
                      className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border cursor-pointer transition-colors ${
                        targetMode === 'update_page'
                          ? 'bg-foreground text-background border-foreground font-black'
                          : 'bg-card text-muted-foreground border-border hover:bg-muted'
                      }`}
                    >
                      🔄 Aggiorna "{activePage.title}"
                    </button>
                  )}
                </div>
              </div>

              {/* Presets di Prompt */}
              <div>
                <label className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground mb-2 block">
                  💡 Esempi di gestione pronti all'uso (clicca per applicare):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {promptPresets.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setPrompt(preset.text);
                        if (preset.label.includes('Attiva') && activePage) {
                          setTargetMode('update_page');
                        } else {
                          setTargetMode('create_new');
                        }
                      }}
                      className="text-left p-2.5 border border-border/80 bg-card hover:border-primary hover:bg-primary/5 transition-all cursor-pointer text-xs group"
                    >
                      <span className="font-bold text-foreground group-hover:text-primary block mb-0.5">
                        {preset.label}
                      </span>
                      <span className="text-muted-foreground text-[11px] line-clamp-2">
                        {preset.text}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Prompt */}
              <form onSubmit={handleGeneratePlan} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-extrabold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-primary" />
                      <span>Prompt per l'Amministratore Ollama</span>
                    </label>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      Modello attivo: <strong className="text-foreground">{model}</strong>
                    </span>
                  </div>

                  <textarea
                    rows={5}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Descrivi cosa desideri creare o gestire. Ad esempio: 'Crea una pagina tematica su Intelligenza Artificiale con categoria Tech, collega i feed di TechCrunch e Wired, e scrivi un articolo editoriale di approfondimento con codice Python per chiamare Ollama in locale'..."
                    className="w-full border-2 border-border bg-background p-3 text-sm font-sans focus:border-primary outline-none resize-y leading-relaxed"
                  />
                </div>

                {/* Opzioni di Esecuzione */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-muted/30 border border-border text-xs">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-foreground select-none">
                    <input
                      type="checkbox"
                      checked={autoExecute}
                      onChange={(e) => setAutoExecute(e.target.checked)}
                      className="accent-primary w-4 h-4"
                    />
                    <span>🚀 Modalità Autopilot: Esegui automaticamente (crea pagina, scansiona feed e pubblica articolo)</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    className="text-[11px] text-muted-foreground underline hover:text-foreground cursor-pointer flex items-center gap-1"
                  >
                    <Server className="w-3 h-3" />
                    <span>Configura Endpoint ({endpoint})</span>
                  </button>
                </div>

                {generationError && (
                  <div className="p-3 border-2 border-rose-500 bg-rose-50 text-rose-900 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    <div>
                      <p className="font-bold">Impossibile completare la richiesta:</p>
                      <p className="mt-0.5 font-mono text-[11px]">{generationError}</p>
                      <p className="mt-1 text-[11px]">
                        Suggerimento: Verifica nella scheda "Connessione Ollama" che il server locale o remoto sia attivo.
                      </p>
                    </div>
                  </div>
                )}

                {fallbackNotice?.used && (
                  <div className="p-3.5 border-2 border-amber-500 bg-amber-50 text-amber-950 text-xs flex items-start gap-2.5">
                    <Zap className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold uppercase tracking-wide text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-xs">
                          Cloud Fallback Attivo
                        </span>
                        <span className="font-bold text-xs text-amber-950">
                          Operazione elaborata con {fallbackNotice.model || 'Gemini 3.8 Flash'}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-900 leading-relaxed">
                        {fallbackNotice.reason}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full sm:w-auto border-2 border-border px-4 py-2.5 text-xs font-medium uppercase hover:bg-muted cursor-pointer"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={isGenerating || !prompt.trim()}
                    className="w-full sm:w-auto border-2 border-border bg-primary px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--foreground)] hover:opacity-95 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Ollama sta elaborando la strategia...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>{autoExecute ? 'Genera ed Esegui con Ollama 🚀' : 'Formula Piano Esecutivo'}</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: PIANO ESECUTIVO & LOG */}
          {activeTab === 'plan' && (
            <div className="space-y-6">
              {isGenerating && (
                <div className="p-8 border-2 border-dashed border-primary text-center space-y-3 bg-primary/5">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary" />
                  <p className="text-sm font-bold text-foreground">
                    Ollama ({model}) sta analizzando il prompt ed elaborando il piano...
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    Traduzione istruzioni in azioni Firestore: creazione pagina, selezione feed e articolo editoriale.
                  </p>
                </div>
              )}

              {generatedPlan && (
                <div className="space-y-5">
                  {fallbackNotice?.used && (
                    <div className="p-3.5 border-2 border-amber-500 bg-amber-50 text-amber-950 text-xs flex items-start gap-2.5">
                      <Zap className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold uppercase tracking-wide text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-xs">
                            Cloud Fallback Attivo
                          </span>
                          <span className="font-bold text-xs text-amber-950">
                            Piano formulato con {fallbackNotice.model || 'Google Gemini 3.8 Flash'}
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-900 leading-relaxed">
                          {fallbackNotice.reason}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Strategic Rationale */}
                  <div className="p-4 border-2 border-border bg-card shadow-xs">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary font-mono block mb-1">
                      🧠 Ragionamento Editoriale di Ollama
                    </span>
                    <p className="text-xs sm:text-sm text-foreground/90 italic leading-relaxed">
                      "{generatedPlan.thought}"
                    </p>
                  </div>

                  {/* 1. Pagina da creare / aggiornare */}
                  <div className="p-4 border-2 border-border bg-muted/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <Globe className="w-4 h-4 text-primary" />
                        <span>1. Pagina Tematica</span>
                      </span>
                      <span className="text-[10px] uppercase font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded">
                        {generatedPlan.page.category}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Titolo:</span>
                        <strong className="text-sm text-foreground font-bold">{generatedPlan.page.title}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px]">Slug URL:</span>
                        <code className="text-xs font-mono text-primary bg-card px-1.5 py-0.5 border border-border">
                          /?p={generatedPlan.page.slug}
                        </code>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      {generatedPlan.page.description}
                    </p>
                  </div>

                  {/* 2. Feed RSS suggeriti */}
                  <div className="p-4 border-2 border-border bg-muted/20 space-y-2.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <Rss className="w-4 h-4 text-primary" />
                      <span>2. Feed RSS da Scansionare e Collegare ({generatedPlan.suggestedFeeds.length})</span>
                    </span>
                    <div className="space-y-2">
                      {generatedPlan.suggestedFeeds.map((feed, idx) => (
                        <div key={idx} className="p-2.5 border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div>
                            <span className="font-bold text-foreground block">{feed.title}</span>
                            <span className="text-muted-foreground font-mono text-[11px] truncate block max-w-md">
                              {feed.url}
                            </span>
                          </div>
                          {feed.reason && (
                            <span className="text-[10px] text-muted-foreground italic shrink-0">
                              {feed.reason}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 3. Articolo Editoriale SEO con Codice */}
                  {generatedPlan.editorialArticle && (
                    <div className="p-4 border-2 border-border bg-muted/20 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-primary" />
                          <span>3. Articolo Editoriale SEO con Codice</span>
                        </span>
                        {generatedPlan.editorialArticle.focusKeyword && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            Keyword: <strong>{generatedPlan.editorialArticle.focusKeyword}</strong>
                          </span>
                        )}
                      </div>
                      <h4 className="text-base font-extrabold text-foreground" style={fontFraunces}>
                        {generatedPlan.editorialArticle.title}
                      </h4>
                      <p className="text-xs text-muted-foreground italic">
                        {generatedPlan.editorialArticle.description}
                      </p>
                      <div className="max-h-48 overflow-y-auto p-3 bg-card border border-border text-xs font-mono text-foreground/90 whitespace-pre-wrap leading-relaxed">
                        {generatedPlan.editorialArticle.content}
                      </div>
                    </div>
                  )}

                  {/* 4. Kit Social Media Elaborato da Ollama */}
                  {generatedPlan.socialShare && (
                    <div className="p-4 border-2 border-border bg-muted/20 space-y-3.5 shadow-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                          <Share2 className="w-4 h-4 text-primary" />
                          <span>4. Kit Condivisione Social Elaborato da Ollama</span>
                        </span>
                        <span className="text-[10px] font-mono uppercase bg-primary text-primary-foreground px-2 py-0.5 rounded-xs font-extrabold">
                          Multi-Piattaforma
                        </span>
                      </div>

                      {/* X (Twitter) Copy Box */}
                      <div className="p-3.5 border-2 border-border bg-card space-y-2 shadow-xs">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-foreground flex items-center gap-1.5">
                            <span>🐦</span>
                            <span>Post per X (Twitter)</span>
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {generatedPlan.socialShare.twitterPost.length} / 280 caratteri
                          </span>
                        </div>
                        <div className="text-xs font-mono bg-muted/30 p-2.5 border border-border text-foreground/90 whitespace-pre-wrap select-all leading-relaxed">
                          {generatedPlan.socialShare.twitterPost}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                          <div className="flex items-center gap-1 flex-wrap">
                            {generatedPlan.socialShare.hashtags?.map((tag) => (
                              <span key={tag} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 border text-muted-foreground">
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <a
                              href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(generatedPlan.socialShare.twitterPost)}&url=${encodeURIComponent(`${window.location.origin}/?p=${encodeURIComponent(generatedPlan.page.slug)}`)}&via=puulp_it`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 text-[11px] font-bold uppercase border-2 border-border bg-background hover:bg-muted flex items-center gap-1 cursor-pointer"
                            >
                              <span>Apri X</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(`${generatedPlan.socialShare!.twitterPost}\n\n${window.location.origin}/?p=${generatedPlan.page.slug}`);
                                setCopiedSocialX(true);
                                setTimeout(() => setCopiedSocialX(false), 2000);
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold uppercase border-2 border-border bg-foreground text-background hover:opacity-90 flex items-center gap-1 cursor-pointer shadow-xs"
                            >
                              {copiedSocialX ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedSocialX ? 'Copiato!' : 'Copia'}</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* LinkedIn Copy Box */}
                      <div className="p-3.5 border-2 border-border bg-card space-y-2 shadow-xs">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-foreground flex items-center gap-1.5">
                            <span>💼</span>
                            <span>Post per LinkedIn (Professionale & Punti Chiave)</span>
                          </span>
                        </div>
                        <div className="text-xs bg-muted/30 p-2.5 border border-border text-foreground/90 whitespace-pre-wrap select-all max-h-36 overflow-y-auto leading-relaxed">
                          {generatedPlan.socialShare.linkedInPost}
                        </div>
                        <div className="flex items-center justify-end gap-1.5 pt-1">
                          <a
                            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`${window.location.origin}/?p=${encodeURIComponent(generatedPlan.page.slug)}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 text-[11px] font-bold uppercase border-2 border-border bg-background hover:bg-muted flex items-center gap-1 cursor-pointer"
                          >
                            <span>Condividi su LinkedIn</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`${generatedPlan.socialShare!.linkedInPost}\n\n${window.location.origin}/?p=${generatedPlan.page.slug}`);
                              setCopiedSocialLinkedIn(true);
                              setTimeout(() => setCopiedSocialLinkedIn(false), 2000);
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold uppercase border-2 border-border bg-foreground text-background hover:opacity-90 flex items-center gap-1 cursor-pointer shadow-xs"
                          >
                            {copiedSocialLinkedIn ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedSocialLinkedIn ? 'Copiato!' : 'Copia'}</span>
                          </button>
                        </div>
                      </div>

                      {/* WhatsApp & Telegram Message Box */}
                      <div className="p-3.5 border-2 border-border bg-card space-y-2 shadow-xs">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-foreground flex items-center gap-1.5">
                            <MessageCircle className="w-4 h-4 text-emerald-600" />
                            <span>Messaggio WhatsApp & Telegram</span>
                          </span>
                        </div>
                        <div className="text-xs bg-emerald-50/50 p-2.5 border border-emerald-200 text-emerald-950 whitespace-pre-wrap select-all leading-relaxed">
                          {generatedPlan.socialShare.whatsAppMessage}
                        </div>
                        <div className="flex items-center justify-end gap-1.5 pt-1">
                          <a
                            href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${generatedPlan.socialShare.whatsAppMessage}\n\n${window.location.origin}/?p=${encodeURIComponent(generatedPlan.page.slug)}`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1 text-[11px] font-bold uppercase border-2 border-border bg-[#25D366] text-white hover:opacity-90 flex items-center gap-1 cursor-pointer"
                          >
                            <span>Invia su WhatsApp</span>
                            <Send className="w-3 h-3" />
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`${generatedPlan.socialShare!.whatsAppMessage}\n\n${window.location.origin}/?p=${generatedPlan.page.slug}`);
                              setCopiedSocialWhatsApp(true);
                              setTimeout(() => setCopiedSocialWhatsApp(false), 2000);
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold uppercase border-2 border-border bg-foreground text-background hover:opacity-90 flex items-center gap-1 cursor-pointer shadow-xs"
                          >
                            {copiedSocialWhatsApp ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedSocialWhatsApp ? 'Copiato!' : 'Copia'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Open Graph Card Summary */}
                      <div className="p-3 bg-background border border-border text-xs space-y-1 font-mono text-[11px]">
                        <div><strong className="text-primary">og:title:</strong> {generatedPlan.socialShare.ogTitle}</div>
                        <div><strong className="text-primary">og:description:</strong> {generatedPlan.socialShare.ogDescription}</div>
                      </div>
                    </div>
                  )}

                  {/* Execution Logs */}
                  {executionLogs.length > 0 && (
                    <div className="p-4 border-2 border-foreground bg-foreground text-background font-mono text-xs space-y-1 max-h-52 overflow-y-auto shadow-inner">
                      <div className="flex items-center gap-2 font-bold uppercase tracking-wider border-b border-background/20 pb-1 mb-1 text-[11px]">
                        <Terminal className="w-3.5 h-3.5" />
                        <span>Console di Esecuzione Live</span>
                      </div>
                      {executionLogs.map((log, idx) => (
                        <div key={idx} className="leading-tight">
                          {log}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Success Banner */}
                  {executionCompleted && (
                    <div className="p-4 border-2 border-emerald-500 bg-emerald-50 text-emerald-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[3px_3px_0_0_#10b981]">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                          <p className="font-bold text-sm">Operazione Completata con Successo!</p>
                          <p className="text-xs text-emerald-800">
                            La pagina, i feed e l'articolo editoriale sono ora memorizzati nel database e visibili a tutti i lettori.
                          </p>
                        </div>
                      </div>
                      {completedPageId && (
                        <button
                          type="button"
                          onClick={() => {
                            onPageCreatedOrUpdated(completedPageId);
                            onClose();
                          }}
                          className="px-4 py-2 border-2 border-emerald-800 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <span>Apri la Pagina Creata</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Actions Bar */}
                  {!executionCompleted && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t-2 border-border">
                      <button
                        type="button"
                        onClick={() => setActiveTab('prompt')}
                        className="text-xs text-muted-foreground hover:text-foreground font-bold cursor-pointer"
                      >
                        ← Modifica Prompt
                      </button>

                      <button
                        type="button"
                        disabled={isExecuting}
                        onClick={() => executePlan(generatedPlan)}
                        className="border-2 border-border bg-primary px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--foreground)] hover:opacity-95 active:translate-x-0.5 active:translate-y-0.5 cursor-pointer disabled:opacity-50 flex items-center gap-2"
                      >
                        {isExecuting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Esecuzione in corso...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            <span>Conferma ed Esegui Direttive</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CONFIGURAZIONE & CONNESSIONE OLLAMA */}
          {activeTab === 'settings' && (
            <div className="space-y-5">
              <div className="p-4 border-2 border-border bg-card space-y-4">
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <Server className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                    Parametri di Connessione al Servizio Ollama
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-extrabold uppercase tracking-wider text-foreground block mb-1.5">
                      Endpoint Ollama (URL locale o remoto)
                    </label>
                    <input
                      type="text"
                      value={endpoint}
                      onChange={(e) => setEndpoint(e.target.value)}
                      placeholder="http://localhost:11434"
                      className="w-full border-2 border-border bg-background px-3 py-2 text-xs font-mono outline-none focus:border-primary"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Predefinito: <code>http://localhost:11434</code> (oppure IP del server / VPS / Docker / Ngrok).
                    </p>
                  </div>

                  <div>
                    <label className="text-xs font-extrabold uppercase tracking-wider text-foreground block mb-1.5">
                      Modello LLM Selezionato
                    </label>
                    {availableModels.length > 0 ? (
                      <select
                        value={model}
                        onChange={(e) => {
                          setModel(e.target.value);
                          localStorage.setItem('puulp_ollama_model', e.target.value);
                        }}
                        className="w-full border-2 border-border bg-background px-3 py-2 text-xs font-mono outline-none focus:border-primary cursor-pointer"
                      >
                        {availableModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={model}
                        onChange={(e) => {
                          setModel(e.target.value);
                          localStorage.setItem('puulp_ollama_model', e.target.value);
                        }}
                        placeholder="llama3.2"
                        className="w-full border-2 border-border bg-background px-3 py-2 text-xs font-mono outline-none focus:border-primary"
                      />
                    )}
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Modelli consigliati per amministrazione: <code>llama3.2</code>, <code>llama3.1</code>, <code>mistral</code>, <code>qwen2.5</code>.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
                  <button
                    type="button"
                    disabled={testingConnection}
                    onClick={() => testOllamaConnection(endpoint)}
                    className="border-2 border-border bg-card hover:bg-muted px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
                    <span>{testingConnection ? 'Verifica in corso...' : 'Testa Connessione & Rileva Modelli'}</span>
                  </button>

                  {connectionMessage && (
                    <span
                      className={`text-xs font-mono ${
                        connectionStatus === 'connected' ? 'text-emerald-700 font-bold' : 'text-rose-600'
                      }`}
                    >
                      {connectionMessage}
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Guide on how to run Ollama for puulp.it */}
              <div className="p-4 border-2 border-dashed border-border bg-muted/20 text-xs space-y-2.5">
                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-foreground">
                  <HelpCircle className="w-4 h-4 text-primary" />
                  <span>Guida Rapida: Avviare Ollama per l'Amministrazione</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  Per consentire ad Ollama di ricevere le chiamate dal pannello amministrativo, assicurati di abilitare le origini cross-origin con la variabile d'ambiente <code>OLLAMA_ORIGINS="*"</code>:
                </p>
                <div className="p-2.5 bg-card border border-border font-mono text-[11px] text-primary select-all">
                  OLLAMA_ORIGINS="*" ollama serve
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Se utilizzi Windows o Docker, puoi impostare <code>OLLAMA_ORIGINS="*"</code> nelle variabili d'ambiente di sistema o nel file <code>docker-compose.yml</code>.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('prompt')}
                  className="border-2 border-border bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] cursor-pointer"
                >
                  Torna al Prompt di Comando →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
