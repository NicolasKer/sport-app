import React, { useEffect, useId, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Share2, ShieldCheck, X } from 'lucide-react';

const PUBLIC_APP_URL = 'https://nicolasker.github.io/sport-app/';

interface ShareAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShareAppModal: React.FC<ShareAppModalProps> = ({ isOpen, onClose }) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      setCopied(false);
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    let cancelled = false;
    if (isOpen) {
      QRCode.toDataURL(PUBLIC_APP_URL, {
        width: 240,
        margin: 2,
        color: { dark: '#090d16', light: '#ffffff' },
      })
        .then((url) => {
          if (!cancelled) setQrDataUrl(url);
        })
        .catch(() => {
          if (!cancelled) setQrDataUrl('');
        });
    } else {
      setQrDataUrl('');
    }
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Fallback click-outside dismissal for browsers lacking <dialog closedby="any">
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e) && dialog.open) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, []);

  const handleCloseEvent = () => {
    const dialog = dialogRef.current;
    if (dialog) dialog.returnValue = '';
    onClose();
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(PUBLIC_APP_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Ignore
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator.share !== 'function') return;
    try {
      await navigator.share({
        title: 'IronPulse — Suivi Musculation',
        text: "Teste IronPulse ! L'appli fonctionne en mode local et hors-ligne directement sur ton téléphone.",
        url: PUBLIC_APP_URL,
      });
    } catch {
      // User cancelled share sheet
    }
  };

  const supportsNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <dialog
      ref={dialogRef}
      className="native-dialog share-app-dialog"
      aria-labelledby={titleId}
      onClose={handleCloseEvent}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="native-dialog-card">
        <div className="modal-header">
          <h2 id={titleId}>📲 Partager IronPulse</h2>
          <button
            type="button"
            className="icon-ghost-btn"
            onClick={() => dialogRef.current?.close()}
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="share-safety-pill">
          <ShieldCheck size={16} />
          <span>100 % Mode Local vierge · Aucune de tes données partagée</span>
        </div>

        <div className="qr-preview-box" style={{ marginTop: '0.75rem' }}>
          {qrDataUrl && (
            <img
              src={qrDataUrl}
              alt="QR Code public IronPulse pour tes amis"
              width={220}
              height={220}
            />
          )}
          <span style={{ color: '#6ee7b7' }}>
            Scanne avec l&apos;appareil photo pour installer l&apos;appli
          </span>
          <a
            href={PUBLIC_APP_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              wordBreak: 'break-all',
              textDecoration: 'underline',
            }}
          >
            nicolasker.github.io/sport-app
          </a>
        </div>

        <div className="pairing-actions-row" style={{ marginTop: '0.85rem' }}>
          <button
            type="button"
            className="secondary-btn"
            style={{ flex: 1, justifyContent: 'center', minHeight: '46px' }}
            onClick={handleCopyLink}
          >
            {copied ? <Check size={15} color="#34d399" /> : <Copy size={15} />}
            <span>{copied ? 'Lien copié !' : 'Copier le lien'}</span>
          </button>

          {supportsNativeShare && (
            <button
              type="button"
              className="primary-btn-sm"
              style={{ flex: 1, justifyContent: 'center', minHeight: '46px' }}
              onClick={handleNativeShare}
            >
              <Share2 size={15} />
              <span>Partager…</span>
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
};
