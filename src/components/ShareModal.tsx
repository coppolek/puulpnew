import React, { useState, useEffect } from 'react';
import { SocialShareKit } from '../lib/firebase';
import { ensureInternalSiteUrl } from '../lib/shareUtils';
import { Sparkles, Check, Copy, ExternalLink, Share2, MessageCircle, Send, Globe, RefreshCw, ShieldCheck } from 'lucide-react';

export interface ShareData {
  title: string;
  text?: string;
  url: string;
  externalSourceUrl?: string;
  pageSlug?: string;
  articleSlug?: string;
  image?: string;
  source?: string;
  socialShare?: SocialShareKit;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ShareData | null;
}

export function ShareModal({ isOpen, onClose, data }: ShareModalProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedTwitter, setCopiedTwitter] = useState(false);
  const [copiedLinkedIn, setCopiedLinkedIn] = useState(false);
  const [copiedWhatsApp, setCopiedWhatsApp] = useState(false);
  const [activeTab, setActiveTab] = useState<'quick' | 'ollama_copy' | 'preview'>('quick');
  const [dynamicSocial, setDynamicSocial] = useState<SocialShareKit | null>(null);
  const [generatingOllama, setGeneratingOllama] = useState(false);

  // Reset state when modal opens for a new item
  useEffect(() => {
    if (!isOpen || !data) {
      setDynamicSocial(null);
      setGeneratingOllama(false);
      return;
    }
    if (data.socialShare) {
      setDynamicSocial(data.socialShare);
      return;
    }

    // Auto-elaborate social share kit via Ollama endpoint if not pre-populated
    let cancelled = false;
    setGeneratingOllama(true);
    fetch('/api/ollama/social-kit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.title,
        description: data.text || '',
        source: data.source || 'puulp.it',
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((resData) => {
        if (!cancelled && resData?.socialShare) {
          setDynamicSocial(resData.socialShare);
        }
      })
      .catch(() => {
        // Fallback deterministic copy is already handled below
      })
      .finally(() => {
        if (!cancelled) setGeneratingOllama(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, data]);

  if (!isOpen || !data) return null;

  // CRITICAL: Ensure the shared URL ALWAYS points to our site (puulp.it / window.location.origin)
  // and NEVER to the external news source!
  const siteUrl = ensureInternalSiteUrl(data.url, {
    title: data.title,
    pageSlugOrId: data.pageSlug,
    articleSlug: data.articleSlug,
  });

  const social = dynamicSocial || data.socialShare;

  // Optimized copy texts (use Ollama copy if available, else derive rich Italian copy pointing to puulp.it)
  const twitterText =
    social?.twitterPost ||
    `🔥 ${data.title}\n\nLeggi l'articolo completo e tutti gli aggiornamenti su puulp.it 👇\n${
      social?.hashtags?.join(' ') || '#puulp #News #RassegnaStampa'
    }`;
  const whatsAppText =
    social?.whatsAppMessage ||
    `📰 *${data.title}*\n\n${data.text ? `${data.text.slice(0, 180)}...\n\n` : ''}👉 Leggi l'articolo su *puulp.it*:`;
  const telegramText =
    social?.telegramMessage ||
    `⚡ *${data.title}*\n\n${data.text ? `${data.text.slice(0, 180)}...\n\n` : ''}🔗 Apri su puulp.it:`;
  const linkedInText =
    social?.linkedInPost ||
    `📢 ${data.title}\n\n${data.text || 'Approfondimento e rassegna stampa in tempo reale su puulp.it.'}\n\nConsulta l'articolo completo sul nostro portale:\n${
      social?.hashtags?.join(' ') || '#puulp #Innovazione #Informazione #News'
    }`;
  const ogTitle = social?.ogTitle || `${data.title} — puulp.it`;
  const ogDescription =
    social?.ogDescription || data.text || 'Leggi tutti i dettagli, i feed e gli approfondimenti su puulp.it.';

  const encodedUrl = encodeURIComponent(siteUrl);
  const encodedTwitter = encodeURIComponent(twitterText);
  const encodedWhatsApp = encodeURIComponent(`${whatsAppText}\n${siteUrl}`);
  const encodedTelegram = encodeURIComponent(telegramText);

  const socialTargets = [
    {
      name: 'WhatsApp',
      icon: (
        <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
        </svg>
      ),
      href: `https://api.whatsapp.com/send?text=${encodedWhatsApp}`,
      bg: 'hover:bg-[#25D366] hover:text-white hover:border-[#25D366]',
    },
    {
      name: 'Telegram',
      icon: (
        <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
      ),
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTelegram}`,
      bg: 'hover:bg-[#229ED9] hover:text-white hover:border-[#229ED9]',
    },
    {
      name: 'X (Twitter)',
      icon: (
        <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
      href: `https://twitter.com/intent/tweet?text=${encodedTwitter}&url=${encodedUrl}&via=puulp_it`,
      bg: 'hover:bg-black hover:text-white hover:border-black',
    },
    {
      name: 'LinkedIn',
      icon: (
        <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.62 1.62 0 1 0 0-3.24 1.62 1.62 0 0 0 0 3.24M7.86 18.5V10.13H5.07V18.5h2.79Z" />
        </svg>
      ),
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      bg: 'hover:bg-[#0077B5] hover:text-white hover:border-[#0077B5]',
    },
    {
      name: 'Facebook',
      icon: (
        <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      bg: 'hover:bg-[#1877F2] hover:text-white hover:border-[#1877F2]',
    },
  ];

  function copyText(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  async function handleRegenerateOllamaCopy() {
    if (!data || generatingOllama) return;
    setGeneratingOllama(true);
    try {
      const res = await fetch('/api/ollama/social-kit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: data.title,
          description: data.text || '',
          source: data.source || 'puulp.it',
        }),
      });
      if (res.ok) {
        const resData = await res.json();
        if (resData?.socialShare) {
          setDynamicSocial(resData.socialShare);
        }
      }
    } catch {
      // ignore
    } finally {
      setGeneratingOllama(false);
    }
  }

  async function handleNativeShare() {
    if (!data) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: ogTitle,
          text: twitterText,
          url: siteUrl,
        });
        onClose();
      } catch {
        // Ignored
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-0 sm:p-5 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-t-2xl sm:rounded-none border-t-3 sm:border-4 border-border bg-card p-4 sm:p-6 shadow-[0_-8px_24px_rgba(0,0,0,0.2)] sm:shadow-[10px_10px_0_0_var(--foreground)] max-h-[92dvh] sm:max-h-[92vh] flex flex-col overflow-hidden pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="w-10 h-1.5 bg-border/30 rounded-full mx-auto mb-2.5 sm:hidden shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-border pb-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-widest text-primary block">
                puulp.it · Social Hub
              </span>
              <span className="text-[9px] uppercase font-extrabold bg-emerald-500/15 text-emerald-700 px-1.5 py-0.5 border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-2.5 h-2.5" />
                <span>Link Interno al Sito</span>
              </span>
              {generatingOllama ? (
                <span className="text-[9px] uppercase font-bold bg-primary/10 text-primary px-1.5 py-0.5 border border-primary/30 flex items-center gap-1">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  <span>Ollama AI...</span>
                </span>
              ) : (
                <span className="text-[9px] uppercase font-extrabold bg-primary/10 text-primary px-1.5 py-0.5 border border-primary/30 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Elaborato da Ollama</span>
                </span>
              )}
            </div>
            <h3
              className="text-base sm:text-xl font-extrabold tracking-tight truncate mt-0.5"
              style={{ fontFamily: 'Fraunces, Georgia, serif' }}
            >
              Condividi sul Sito puulp.it
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-sm font-bold border-2 border-border bg-background hover:bg-muted transition-colors cursor-pointer shrink-0 ml-2 shadow-[2px_2px_0_0_var(--foreground)]"
            title="Chiudi"
            aria-label="Chiudi finestra"
          >
            ✕
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b-2 border-border bg-muted/25 text-xs font-bold uppercase tracking-wider shrink-0 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('quick')}
            className={`px-3.5 sm:px-4 py-2.5 min-h-[44px] flex items-center gap-1.5 border-r border-border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'quick'
                ? 'bg-card text-primary border-b-2 border-b-primary -mb-[2px]'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>1-Click Social</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ollama_copy')}
            className={`px-3.5 sm:px-4 py-2.5 min-h-[44px] flex items-center gap-1.5 border-r border-border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'ollama_copy'
                ? 'bg-card text-primary border-b-2 border-b-primary -mb-[2px]'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span>Copy Ollama ✓</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            className={`px-3.5 sm:px-4 py-2.5 min-h-[44px] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              activeTab === 'preview'
                ? 'bg-card text-primary border-b-2 border-b-primary -mb-[2px]'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Anteprima Card</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-1 sm:p-2 space-y-4 mt-2.5">
          {/* TAB 1: QUICK 1-CLICK SHARE */}
          {activeTab === 'quick' && (
            <div className="space-y-4">
              {/* Content Preview Snippet */}
              <div className="border-2 border-border bg-muted/20 p-3 flex flex-col sm:flex-row gap-3 items-start shadow-xs">
                {data.image && (
                  <img
                    src={data.image}
                    alt=""
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    className="h-28 w-full sm:h-16 sm:w-24 shrink-0 border border-border object-cover bg-muted"
                  />
                )}
                <div className="min-w-0 flex-1 text-xs">
                  {data.source && (
                    <span className="text-[10px] uppercase font-bold tracking-wider text-primary block mb-0.5">
                      Canale · {data.source}
                    </span>
                  )}
                  <h4
                    className="font-extrabold text-foreground text-sm line-clamp-2 leading-snug"
                    style={{ fontFamily: 'Fraunces, Georgia, serif' }}
                  >
                    {data.title}
                  </h4>
                  <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                    {ogDescription}
                  </p>
                </div>
              </div>

              {/* 1-Click Social Grid */}
              <div>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <span className="text-[11px] uppercase tracking-wider font-extrabold text-foreground">
                    Condividi ora (porta i lettori su puulp.it):
                  </span>
                  <button
                    type="button"
                    onClick={handleRegenerateOllamaCopy}
                    disabled={generatingOllama}
                    className="text-[10px] font-mono text-primary hover:underline font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${generatingOllama ? 'animate-spin' : ''}`} />
                    <span>Rigenera Copy AI</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-bold uppercase">
                  {socialTargets.map((s) => (
                    <a
                      key={s.name}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center justify-center gap-2 border-2 border-border bg-background p-3 min-h-[48px] transition-all cursor-pointer shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${s.bg}`}
                    >
                      {s.icon}
                      <span className="text-[11px] tracking-wide whitespace-nowrap">{s.name}</span>
                    </a>
                  ))}

                  {/* Native Mobile Share Button */}
                  {typeof navigator !== 'undefined' && 'share' in navigator && (
                    <button
                      type="button"
                      onClick={handleNativeShare}
                      className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 border-2 border-border bg-primary text-primary-foreground p-3 min-h-[48px] transition-all cursor-pointer shadow-[2px_2px_0_0_var(--foreground)] hover:opacity-90 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                    >
                      <span>📲</span>
                      <span className="text-[11px] tracking-wide whitespace-nowrap">Condividi su Telefono</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Link Copy Field (Strictly pointing to puulp.it) */}
              <div className="border-t border-border/50 pt-3 text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] uppercase tracking-wider font-extrabold text-foreground">
                    🔗 Link Diretto al Sito (apre l'articolo su puulp.it):
                  </label>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    readOnly
                    value={siteUrl}
                    className="flex-1 border-2 border-border bg-background px-3 py-2 text-sm sm:text-xs outline-none font-mono select-all text-foreground min-h-[44px]"
                  />
                  <button
                    type="button"
                    onClick={() => copyText(siteUrl, setCopiedLink)}
                    className={`border-2 border-border px-4 py-2 min-h-[44px] font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 shadow-[2px_2px_0_0_var(--foreground)] flex items-center justify-center gap-1.5 ${
                      copiedLink
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-foreground text-background hover:bg-foreground/90'
                    }`}
                  >
                    {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedLink ? 'Link Sito Copiato!' : 'Copia Link Sito'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: OLLAMA SOCIAL COPYWRITING SUITE */}
          {activeTab === 'ollama_copy' && (
            <div className="space-y-4">
              <div className="p-3 border border-primary/30 bg-primary/5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary shrink-0" />
                  <span className="font-semibold text-foreground">
                    Copy ottimizzato da Ollama con link diretto al tuo sito
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleRegenerateOllamaCopy}
                  disabled={generatingOllama}
                  className="border border-primary bg-card text-primary px-2.5 py-1 text-[11px] font-bold uppercase flex items-center justify-center gap-1 cursor-pointer min-h-[34px]"
                >
                  <RefreshCw className={`w-3 h-3 ${generatingOllama ? 'animate-spin' : ''}`} />
                  <span>{generatingOllama ? 'Elaborazione...' : 'Rigenera con Ollama'}</span>
                </button>
              </div>

              {/* 1. X (Twitter) Post Card */}
              <div className="border-2 border-border bg-card p-3.5 space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <span>🐦</span>
                    <span>X (Twitter) · Post Completo</span>
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {twitterText.length} / 280 car.
                  </span>
                </div>
                <div className="p-3 bg-muted/30 border border-border text-xs font-mono whitespace-pre-wrap text-foreground select-all leading-relaxed">
                  {twitterText}
                  <div className="text-primary mt-1.5 text-[11px] underline break-all">{siteUrl}</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodedTwitter}&url=${encodedUrl}&via=puulp_it`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-2 border-border bg-background px-3 py-2 min-h-[42px] text-xs font-bold uppercase hover:bg-muted transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>Apri X</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() => copyText(`${twitterText}\n\n${siteUrl}`, setCopiedTwitter)}
                    className="border-2 border-border bg-foreground text-background px-3 py-2 min-h-[42px] text-xs font-bold uppercase hover:bg-foreground/90 transition-colors flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0_0_var(--foreground)]"
                  >
                    {copiedTwitter ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedTwitter ? 'Tweet Copiato!' : 'Copia Tweet'}</span>
                  </button>
                </div>
              </div>

              {/* 2. LinkedIn Post Card */}
              <div className="border-2 border-border bg-card p-3.5 space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <span>💼</span>
                    <span>LinkedIn · Post Professionale</span>
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">Link al sito</span>
                </div>
                <div className="p-3 bg-muted/30 border border-border text-xs whitespace-pre-wrap text-foreground select-all leading-relaxed max-h-48 overflow-y-auto">
                  {linkedInText}
                  <div className="text-primary mt-2 text-[11px] underline break-all">{siteUrl}</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <a
                    href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-2 border-border bg-background px-3 py-2 min-h-[42px] text-xs font-bold uppercase hover:bg-muted transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>LinkedIn</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() => copyText(`${linkedInText}\n\n${siteUrl}`, setCopiedLinkedIn)}
                    className="border-2 border-border bg-foreground text-background px-3 py-2 min-h-[42px] text-xs font-bold uppercase hover:bg-foreground/90 transition-colors flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0_0_var(--foreground)]"
                  >
                    {copiedLinkedIn ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLinkedIn ? 'Post Copiato!' : 'Copia Post'}</span>
                  </button>
                </div>
              </div>

              {/* 3. WhatsApp & Telegram Chat Bubble */}
              <div className="border-2 border-border bg-card p-3.5 space-y-2 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                    <span>WhatsApp & Telegram</span>
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">Chat diretta</span>
                </div>
                <div className="p-3 bg-emerald-50/50 border border-emerald-200 text-xs whitespace-pre-wrap text-emerald-950 select-all leading-relaxed rounded-xs">
                  {whatsAppText}
                  <div className="text-emerald-700 font-mono mt-1.5 text-[11px] break-all">{siteUrl}</div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodedWhatsApp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-2 border-border bg-[#25D366] text-white px-3 py-2 min-h-[42px] text-xs font-bold uppercase hover:opacity-90 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <span>WhatsApp</span>
                    <Send className="w-3 h-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() => copyText(`${whatsAppText}\n\n${siteUrl}`, setCopiedWhatsApp)}
                    className="border-2 border-border bg-foreground text-background px-3 py-2 min-h-[42px] text-xs font-bold uppercase hover:bg-foreground/90 transition-colors flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0_0_var(--foreground)]"
                  >
                    {copiedWhatsApp ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedWhatsApp ? 'Copiato!' : 'Copia Messaggio'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: OPENGRAPH SOCIAL PREVIEW CARD */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Anteprima della Social Card che porta i visitatori direttamente su <strong>puulp.it</strong>:
              </div>

              {/* Social Card Simulation */}
              <div className="border-2 border-border rounded-lg overflow-hidden bg-card shadow-[4px_4px_0_0_var(--foreground)]">
                <div className="relative aspect-[1200/630] w-full bg-stone-900 flex items-center justify-center overflow-hidden">
                  {data.image ? (
                    <img
                      src={data.image}
                      alt={ogTitle}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="p-6 text-center text-stone-200">
                      <div className="text-2xl font-black" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
                        puulp.it
                      </div>
                      <p className="text-xs mt-1 text-stone-400">Rassegna Stampa & Feed Live</p>
                    </div>
                  )}
                  <span className="absolute bottom-2 left-2 bg-black/75 text-white text-[10px] font-mono px-2 py-0.5 rounded">
                    1200 × 630 px · OpenGraph Card
                  </span>
                </div>

                {/* Card Snippet Body */}
                <div className="p-4 space-y-1.5 bg-background border-t-2 border-border">
                  <span className="text-[10px] font-mono uppercase font-bold text-primary tracking-wider block">
                    puulp.it · {data.source || 'Articolo sul Sito'}
                  </span>
                  <h4
                    className="font-bold text-foreground text-base sm:text-lg leading-snug line-clamp-2"
                    style={{ fontFamily: 'Fraunces, Georgia, serif' }}
                  >
                    {ogTitle}
                  </h4>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {ogDescription}
                  </p>
                  <div className="pt-2 flex items-center justify-between text-[11px] text-muted-foreground border-t border-border/40 mt-2 font-mono">
                    <span className="truncate max-w-[75%]">{siteUrl.replace(/^https?:\/\//, '')}</span>
                    <span className="text-primary font-bold shrink-0">puulp.it</span>
                  </div>
                </div>
              </div>

              {/* Metadata Details */}
              <div className="p-3 bg-muted/20 border border-border text-xs space-y-1 font-mono break-all">
                <div><strong>og:title:</strong> {ogTitle}</div>
                <div><strong>og:description:</strong> {ogDescription}</div>
                <div><strong>og:url (Destinazione Sito):</strong> {siteUrl}</div>
                {social?.hashtags && (
                  <div><strong>Hashtags:</strong> {social.hashtags.join(', ')}</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
