import React, { useState, useMemo } from 'react';
import { VisitorSubscription, saveVisitorSubscription } from '../lib/firebase';

interface NotificationAdCardProps {
  pageTitle?: string;
  activePageId?: string;
  visitorSub: VisitorSubscription | null;
  onOpenModal: () => void;
  onSubscribed?: (sub: VisitorSubscription) => void;
  dateString?: string;
  customDescription?: string;
}

export function NotificationAdCard({
  pageTitle,
  activePageId,
  visitorSub,
  onOpenModal,
  onSubscribed,
  dateString,
  customDescription,
}: NotificationAdCardProps) {
  const [email, setEmail] = useState('');
  const [notifyBrowser, setNotifyBrowser] = useState(true);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Formatta la data dell'annuncio in lingua italiana
  const formattedDate = useMemo(() => {
    if (dateString) return dateString;
    try {
      return new Intl.DateTimeFormat('it-IT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
    } catch {
      return 'Oggi';
    }
  }, [dateString]);

  async function handleQuickSubscribe(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !email.includes('@')) {
      setError('Inserisci un indirizzo email valido.');
      return;
    }

    setLoading(true);
    try {
      // Richiedi il permesso delle notifiche push se selezionato
      if (notifyBrowser && typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      }

      const targetPages = activePageId ? [activePageId] : ['all'];

      await saveVisitorSubscription({
        email: email.trim(),
        pages: targetPages,
        notifyBrowser,
        notifyInApp: true,
      });

      const newSub: VisitorSubscription = {
        id: `sub_${email.trim()}`,
        email: email.trim(),
        pages: targetPages,
        notifyBrowser,
        notifyInApp: true,
        createdAt: new Date().toISOString(),
      };

      setSuccess(true);
      if (onSubscribed) {
        onSubscribed(newSub);
      }
    } catch (err: unknown) {
      console.error('Quick subscribe error:', err);
      setError('Si è verificato un errore durante l’iscrizione. Riprova tra poco.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full my-4 p-4 sm:p-5 border-2 border-border bg-card shadow-[4px_4px_0_0_var(--foreground)] relative overflow-hidden transition-all">
      {/* Testata dell'Annuncio con Data */}
      <div className="flex flex-wrap items-center justify-between border-b border-border/40 pb-2.5 mb-3.5 gap-2 text-xs">
        <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[11px] text-primary">
          <span className="text-sm">🔔</span>
          <span>Avviso di Redazione · puulp.it</span>
        </div>

        {/* Data dell'Annuncio */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
          <span>📅 Data: <strong className="text-foreground font-semibold">{formattedDate}</strong></span>
          <span className="hidden sm:inline">·</span>
          <span className="text-[10px] uppercase font-semibold text-primary hidden sm:inline">
            Aggiornamenti Live
          </span>
        </div>
      </div>

      {/* Titolo e Breve Descrizione dell'Annuncio */}
      <div className="flex flex-col gap-2">
        <h3
          className="text-lg sm:text-xl font-bold tracking-tight text-foreground leading-snug"
          style={{ fontFamily: 'Fraunces, Georgia, serif' }}
        >
          {pageTitle
            ? `Vuoi ricevere subito le nuove notizie di "${pageTitle}"?`
            : 'Vuoi rimanere sempre aggiornato con le notifiche in tempo reale?'}
        </h3>

        {/* Breve Descrizione dell'Annuncio */}
        <div className="bg-muted/30 border-l-2 border-primary/60 p-2.5 sm:p-3 text-xs text-muted-foreground leading-relaxed my-1">
          <span className="font-bold text-foreground block mb-0.5 uppercase tracking-wider text-[10px]">
            Breve Descrizione:
          </span>
          <p>
            {customDescription ||
              `Servizio informativo gratuito di puulp.it: ricevi notifiche istantanee non appena vengono scansionati e pubblicati nuovi articoli dalle fonti verificate di questa pagina. Puoi scegliere tra avvisi Web Push direttamente nel browser o toast in-app, con disiscrizione rapida in qualsiasi momento.`}
          </p>
        </div>
      </div>

      {/* Stato o Modulo di Iscrizione Diretta */}
      <div className="mt-3.5 pt-3 border-t border-border/30">
        {success || visitorSub ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/40 p-3 border border-border/40">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-600 font-bold text-sm">✓</span>
              <span className="text-foreground font-semibold">
                Notifiche attive per <code className="bg-background px-1 py-0.5 border border-border/30">{visitorSub?.email || email}</code>
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenModal}
              className="text-[11px] uppercase tracking-wider font-bold text-primary hover:underline cursor-pointer py-1"
            >
              Gestisci preferenze ↗
            </button>
          </div>
        ) : (
          <form onSubmit={handleQuickSubscribe} className="space-y-3">
            {error && (
              <div className="p-2 border border-destructive bg-destructive/10 text-xs text-destructive">
                {error}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Inserisci la tua email..."
                className="flex-1 border-2 border-border bg-background px-3 py-2 text-base sm:text-xs outline-none focus:border-primary min-h-[42px]"
              />

              <button
                type="submit"
                disabled={loading}
                className="border-2 border-border bg-primary px-4 py-2 font-bold uppercase tracking-wider text-xs text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer disabled:opacity-50 min-h-[42px] shrink-0"
              >
                {loading ? 'Attivazione…' : 'Attiva Notifiche 🔔'}
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={notifyBrowser}
                  onChange={(e) => setNotifyBrowser(e.target.checked)}
                  className="accent-primary h-3.5 w-3.5"
                />
                <span>Consenti notifiche push del browser (Desktop/Mobile)</span>
              </label>

              <button
                type="button"
                onClick={onOpenModal}
                className="text-primary underline hover:text-primary/80 cursor-pointer font-medium"
              >
                Personalizza sezioni da seguire
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
