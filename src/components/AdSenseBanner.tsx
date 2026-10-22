import React, { useEffect, useRef, useMemo } from 'react';

declare global {
  interface Window {
    adsbygoogle?: any[];
  }
}

interface AdSenseBannerProps {
  customDescription?: string;
  customDate?: string;
}

export function AdSenseBanner({ customDescription, customDate }: AdSenseBannerProps) {
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
    try {
      if (!isPushed.current && typeof window !== 'undefined') {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        isPushed.current = true;
      }
    } catch (e) {
      console.warn('AdSense push notice:', e);
    }
  }, []);

  return (
    <div className="w-full my-4 flex flex-col items-center justify-center p-3.5 sm:p-4 border-2 border-dashed border-border/50 bg-card/60 max-w-full overflow-hidden shadow-xs">
      {/* Intestazione Annuncio con Data e Tipologia */}
      <div className="w-full max-w-[340px] flex items-center justify-between text-[11px] text-muted-foreground border-b border-border/30 pb-1.5 mb-2.5 font-mono">
        <span className="uppercase tracking-widest text-[10px] font-bold text-muted-foreground/80 select-none">
          📢 Pubblicità
        </span>
        <span>Data: <strong className="text-foreground font-semibold">{formattedDate}</strong></span>
      </div>

      {/* Banner 300x250 */}
      <div className="flex items-center justify-center max-w-full overflow-x-auto my-1">
        <ins
          ref={adRef}
          className="adsbygoogle"
          style={{ display: 'inline-block', width: '300px', height: '250px', maxWidth: '100%' }}
          data-ad-client="ca-pub-5738943819550045"
          data-ad-slot="1392677483"
        />
      </div>

      {/* Breve Descrizione dell'Annuncio */}
      <p className="mt-2.5 text-[10px] text-center text-muted-foreground max-w-xs leading-normal">
        {customDescription ||
          'Breve descrizione: Inserzione promozionale automatica selezionata per supportare i costi dei server e garantire l’accesso libero ai feed di puulp.it.'}
      </p>
    </div>
  );
}
