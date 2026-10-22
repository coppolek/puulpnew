import React, { useState } from 'react';

export interface ShareData {
  title: string;
  text?: string;
  url: string;
  image?: string;
  source?: string;
}

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ShareData | null;
}

export function ShareModal({ isOpen, onClose, data }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !data) return null;

  const shareText = data.text ? `${data.text} ${data.url}` : `${data.title} ${data.url}`;
  const encodedUrl = encodeURIComponent(data.url);
  const encodedText = encodeURIComponent(data.title);
  const encodedFull = encodeURIComponent(shareText);

  // Social sharing target URLs
  const socialTargets = [
    {
      name: 'WhatsApp',
      icon: (
        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
      ),
      href: `https://api.whatsapp.com/send?text=${encodedFull}`,
      bg: 'hover:bg-[#25D366] hover:text-white hover:border-[#25D366]',
    },
    {
      name: 'Telegram',
      icon: (
        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
      ),
      href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
      bg: 'hover:bg-[#229ED9] hover:text-white hover:border-[#229ED9]',
    },
    {
      name: 'X (Twitter)',
      icon: (
        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      ),
      href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}&via=puulp_it`,
      bg: 'hover:bg-black hover:text-white hover:border-black',
    },
    {
      name: 'LinkedIn',
      icon: (
        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
          <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.62 1.62 0 1 0 0-3.24 1.62 1.62 0 0 0 0 3.24M7.86 18.5V10.13H5.07V18.5h2.79Z"/>
        </svg>
      ),
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      bg: 'hover:bg-[#0077B5] hover:text-white hover:border-[#0077B5]',
    },
    {
      name: 'Facebook',
      icon: (
        <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      ),
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      bg: 'hover:bg-[#1877F2] hover:text-white hover:border-[#1877F2]',
    },
  ];

  function handleCopy() {
    if (!data) return;
    navigator.clipboard.writeText(data.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // Native mobile Web Share API if supported
  async function handleNativeShare() {
    if (!data) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: data.title,
          text: data.text || data.title,
          url: data.url,
        });
        onClose();
      } catch (err) {
        // User cancelled or not supported
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-lg border-3 sm:border-4 border-border bg-card p-4 sm:p-6 shadow-[5px_5px_0_0_var(--foreground)] sm:shadow-[8px_8px_0_0_var(--foreground)] max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-border pb-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary block">
              puulp.it · Diffondi la notizia
            </span>
            <h3 className="text-lg sm:text-xl font-bold tracking-tight" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
              Condividi sui Social
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center text-lg font-bold hover:text-primary cursor-pointer border border-transparent hover:border-border transition-colors"
            title="Chiudi"
            aria-label="Chiudi finestra di condivisione"
          >
            ✕
          </button>
        </div>

        {/* Content Card Preview */}
        <div className="mt-3.5 sm:mt-4 border-2 border-border bg-background/80 p-3 sm:p-3.5 flex flex-col sm:flex-row gap-3 sm:gap-3.5 items-start">
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
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block mb-0.5">
                {data.source}
              </span>
            )}
            <h4 className="font-extrabold text-foreground text-sm line-clamp-2 leading-snug" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
              {data.title}
            </h4>
            <p className="mt-1 text-[11px] text-muted-foreground truncate font-mono">
              {data.url}
            </p>
          </div>
        </div>

        {/* 1-Click Social Grid */}
        <div className="mt-4 sm:mt-5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Condividi direttamente:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-bold uppercase">
            {socialTargets.map((s) => (
              <a
                key={s.name}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
                className={`flex items-center justify-center gap-2 border-2 border-border bg-background p-2.5 min-h-[44px] transition-all cursor-pointer shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${s.bg}`}
              >
                {s.icon}
                <span className="text-[11px] tracking-wide">{s.name}</span>
              </a>
            ))}

            {/* Native Mobile Share Button */}
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                type="button"
                onClick={handleNativeShare}
                className="col-span-2 sm:col-span-1 flex items-center justify-center gap-2 border-2 border-border bg-primary text-primary-foreground p-2.5 min-h-[44px] transition-all cursor-pointer shadow-[2px_2px_0_0_var(--foreground)] hover:opacity-90 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                <span>📲</span>
                <span className="text-[11px] tracking-wide">Altre App (Native)</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Link Copy Field */}
        <div className="mt-4 sm:mt-5 border-t border-border/40 pt-4 text-xs">
          <label className="block text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">
            Oppure copia il link diretto:
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              readOnly
              value={data.url}
              className="flex-1 border-2 border-border bg-background px-3 py-2.5 text-xs outline-none font-mono select-all text-muted-foreground min-h-[44px]"
            />
            <button
              type="button"
              onClick={handleCopy}
              className={`border-2 border-border px-4 py-2.5 min-h-[44px] font-bold uppercase tracking-wider transition-all cursor-pointer shrink-0 shadow-[2px_2px_0_0_var(--foreground)] ${
                copied
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-foreground text-background hover:bg-foreground/90'
              }`}
            >
              {copied ? '✓ Copiato!' : 'Copia Link'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
