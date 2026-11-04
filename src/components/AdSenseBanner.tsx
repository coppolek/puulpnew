import React, { useEffect, useRef, useMemo } from 'react';

declare global {
  interface Window {
    adsbygoogle?: any[];
  }
}

export interface AdSenseBannerProps {
  customDescription?: string;
  customDate?: string;
  label?: string;
  slotId?: string;
  position?: 'feed' | 'after-image' | 'end-of-article';
  className?: string;
}

export function AdSenseBanner({
  customDescription,
  customDate,
  label = '📢 Pubblicità',
  slotId = '1392677483',
  position = 'feed',
  className = '',
}: AdSenseBannerProps) {
  const adRef = useRef<HTMLModElement>(null);
  const isPushed = useRef(false);

  const formattedDate = useMemo(() => {
    if (customDate) return customDate;
    try {
      return new Intl.DateTimeFormat('it-IT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
    } catch {
      return 'Oggi';
    }
  }, [customDate]);

  useEffect(() => {
    // Breve ritardo per garantire che la modale o la pagina abbia calcolato le dimensioni
    const timer = setTimeout(() => {
      try {
        if (!isPushed.current && typeof window !== 'undefined' && adRef.current) {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
          isPushed.current = true;
        }
      } catch (e) {
        console.warn('AdSense push notice:', e);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, []);

  const defaultDesc = useMemo(() => {
    if (position === 'after-image') {
      return 'Inserzione promozionale verificata puulp.it · Spazio sponsorizzato Google AdSense a supporto dell’editoria digitale indipendente.';
    }
    if (position === 'end-of-article') {
      return 'Spazio pubblicitario di chiusura lettura · Supporta la gestione dei server e garantisce l’accesso gratuito e illimitato ai feed RSS.';
    }
    return 'Breve descrizione: Inserzione promozionale automatica selezionata per supportare i costi dei server e garantire l’accesso libero ai feed di puulp.it.';
  }, [position]);

  return (
    <div
      className={`w-full my-4 flex flex-col items-center justify-center p-3 sm:p-4 border-2 border-dashed border-border/70 bg-card/80 max-w-full overflow-hidden shadow-xs relative ${className}`}
    >
      {/* Intestazione Annuncio con Data e Tipologia */}
      <div className="w-full max-w-[340px] flex items-center justify-between text-[11px] text-muted-foreground border-b border-border/40 pb-1.5 mb-2.5 font-mono">
        <span className="uppercase tracking-wider text-[10px] font-bold text-primary select-none flex items-center gap-1">
          {label}
        </span>
        <span className="text-[10px]">
          Data: <strong className="text-foreground font-semibold">{formattedDate}</strong>
        </span>
      </div>

      {/* Contenitore Banner 300x250 con Fallback Integrato */}
      <div className="relative flex items-center justify-center max-w-full overflow-hidden my-1 min-h-[250px] w-[300px] bg-muted/40 border border-border/50">
        {/* Placeholder visibile prima che AdSense carichi o in caso di ad-blocker */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center pointer-events-none select-none z-0">
          <div className="w-8 h-8 rounded-full border border-border bg-card flex items-center justify-center mb-2 shadow-xs">
            <span className="text-primary text-xs font-bold">Ad</span>
          </div>
          <span className="text-xs font-bold text-foreground uppercase tracking-wider mb-1 font-mono">
            Google AdSense
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            pub-5738943819550045
          </span>
          <span className="text-[9px] text-muted-foreground/80 font-mono mt-0.5">
            Slot: {slotId} · 300x250
          </span>
          <span className="mt-2 text-[9px] text-primary/80 uppercase font-semibold tracking-wider">
            {position === 'after-image' ? 'Banner Top Articolo' : position === 'end-of-article' ? 'Banner Fine Articolo' : 'Spazio Pubblicitario'}
          </span>
        </div>

        {/* Tag AdSense Google reale */}
        <ins
          ref={adRef}
          className="adsbygoogle relative z-10"
          style={{ display: 'inline-block', width: '300px', height: '250px', maxWidth: '100%' }}
          data-ad-client="ca-pub-5738943819550045"
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>

      {/* Breve Descrizione dell'Annuncio */}
      <p className="mt-2.5 text-[10px] text-center text-muted-foreground max-w-sm leading-normal font-mono">
        {customDescription || defaultDesc}
      </p>
    </div>
  );
}
