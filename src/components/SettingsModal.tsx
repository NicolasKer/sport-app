import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  CheckCircle2,
  ChevronDown,
  Cloud,
  Copy,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileSpreadsheet,
  HardDrive,
  KeyRound,
  Link2,
  LogOut,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import {
  buildMagicPairingLink,
  disconnectCloudAccount,
  exportBackupJson,
  exportJournalCsv,
  getApiKey,
  getAppsScriptUrl,
  getProfileName,
  getSheetMeta,
  importBackupJson,
  isValidAppsScriptUrl,
  setApiKey,
  setAppsScriptUrl,
  setProfileName,
} from '../services/sheetsApi';
import { JournalRow } from '../types/workout';

interface SettingsModalProps {
  isOpen: boolean;
  dataSource: 'gsheets-plugin' | 'apps-script' | 'local-guest' | 'local-cache';
  offlineQueueCount: number;
  journalRows: JournalRow[];
  canInstallApp: boolean;
  isInstallingApp: boolean;
  onInstallApp: () => void;
  onClose: () => void;
  onRefreshSheet: () => void;
  onFlushOfflineQueue: () => void;
  onDisconnected: () => void;
}

function buildAppsScriptSnippet(secretKey: string): string {
  const safeKey = (secretKey || 'CHANGE_MOI_PAR_TA_CLE_SECRETE').replace(/"/g, '');
  return `const SECRET_API_KEY = "${safeKey}";
const SHEET_JOURNAL = "Journal d'entraînement";
const SHEET_PROGRAMME = "Référence Programme";
const SHEET_WEIGHT = "Suivi Poids";

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function isAuthorized(providedKey) {
  if (!SECRET_API_KEY || SECRET_API_KEY === "CHANGE_MOI_PAR_TA_CLE_SECRETE") return true;
  return String(providedKey || "").trim() === SECRET_API_KEY;
}

function buildReadResponse() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const journalSheet = ss.getSheetByName(SHEET_JOURNAL);
  const progSheet = ss.getSheetByName(SHEET_PROGRAMME);
  const weightSheet = ss.getSheetByName(SHEET_WEIGHT);
  const sheets = {};
  if (journalSheet) sheets[SHEET_JOURNAL] = journalSheet.getDataRange().getDisplayValues();
  if (progSheet) sheets[SHEET_PROGRAMME] = progSheet.getDataRange().getDisplayValues();
  if (weightSheet) sheets[SHEET_WEIGHT] = weightSheet.getDataRange().getDisplayValues();
  return jsonResponse({ ok: true, source: "apps-script", sheetName: ss.getName(), sheetUrl: ss.getUrl(), sheets: sheets });
}

function doGet(e) {
  const providedKey = e && e.parameter ? e.parameter.key : "";
  if (!isAuthorized(providedKey)) return jsonResponse({ ok: false, error: "Unauthorized: Clé secrète API invalide." });
  return buildReadResponse();
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (!isAuthorized(payload.key)) return jsonResponse({ ok: false, error: "Unauthorized: Clé secrète API invalide." });
    if (payload.action === "read") return buildReadResponse();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (payload.action === "saveProgram" && Array.isArray(payload.rows)) {
      const progSheet = ss.getSheetByName(SHEET_PROGRAMME);
      const lastRow = progSheet.getLastRow();
      if (lastRow >= 5) progSheet.getRange(5, 2, lastRow - 4, 6).clearContent();
      if (payload.rows.length > 0) progSheet.getRange(5, 2, payload.rows.length, 6).setValues(payload.rows);
      return jsonResponse({ ok: true });
    }
    if (payload.action === "saveBodyWeight" && Array.isArray(payload.rows)) {
      let weightSheet = ss.getSheetByName(SHEET_WEIGHT);
      if (!weightSheet) {
        weightSheet = ss.insertSheet(SHEET_WEIGHT);
        weightSheet.getRange(1, 1, 1, 3).setValues([["Date", "Poids (kg)", "Notes"]]);
      }
      const lastRow = weightSheet.getLastRow();
      if (lastRow >= 2) weightSheet.getRange(2, 1, lastRow - 1, 3).clearContent();
      if (payload.rows.length > 0) weightSheet.getRange(2, 1, payload.rows.length, 3).setValues(payload.rows);
      return jsonResponse({ ok: true });
    }
    const journalSheet = ss.getSheetByName(SHEET_JOURNAL);
    if (payload.action === "batchWrite" && Array.isArray(payload.operations)) {
      payload.operations.forEach(function (op) {
        const bangIdx = op.range.indexOf("!");
        const a1 = bangIdx >= 0 ? op.range.slice(bangIdx + 1) : op.range;
        if (op.op === "write" && Array.isArray(op.data) && op.data.length > 0) {
          journalSheet.getRange(a1).setValues(op.data);
        } else if (op.op === "append" && Array.isArray(op.data) && op.data.length > 0) {
          const startRow = Math.max(5, journalSheet.getLastRow() + 1);
          journalSheet.getRange(startRow, 2, op.data.length, op.data[0].length).setValues(op.data);
        }
      });
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ ok: false, error: "Action non reconnue" });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}`;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  dataSource,
  offlineQueueCount,
  journalRows,
  canInstallApp,
  isInstallingApp,
  onInstallApp,
  onClose,
  onRefreshSheet,
  onFlushOfflineQueue,
  onDisconnected,
}) => {
  const [gasUrl, setGasUrl] = useState<string>(getAppsScriptUrl());
  const [apiKey, setApiKeyState] = useState<string>(getApiKey());
  const [profileName, setProfileNameState] = useState<string>(getProfileName());
  const [showKey, setShowKey] = useState<boolean>(false);
  const [savedNotice, setSavedNotice] = useState<boolean>(false);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);
  const [copiedMagicLink, setCopiedMagicLink] = useState<boolean>(false);
  const [showQrCode, setShowQrCode] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setGasUrl(getAppsScriptUrl());
      setApiKeyState(getApiKey());
      setProfileNameState(getProfileName());
      setTestResult(null);
      setShowQrCode(false);
      setBackupNotice(null);
    }
  }, [isOpen]);

  const magicLink = isValidAppsScriptUrl(gasUrl)
    ? buildMagicPairingLink(gasUrl, apiKey, profileName)
    : null;

  useEffect(() => {
    let cancelled = false;
    if (showQrCode && magicLink) {
      QRCode.toDataURL(magicLink, {
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
  }, [showQrCode, magicLink]);

  if (!isOpen) return null;

  const sheetMeta = getSheetMeta();
  const hasCloudConfigured = Boolean(getAppsScriptUrl());

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = gasUrl.trim();
    if (trimmedUrl && !isValidAppsScriptUrl(trimmedUrl)) {
      setTestResult({
        ok: false,
        msg: "URL invalide : elle doit commencer par https://script.google.com/macros/s/ et se terminer par /exec.",
      });
      return;
    }
    setAppsScriptUrl(trimmedUrl);
    setApiKey(apiKey);
    setProfileName(profileName);
    setSavedNotice(true);
    setTestResult(null);
    window.setTimeout(() => setSavedNotice(false), 2500);
    onRefreshSheet();
  };

  const handleTestConnection = async () => {
    const trimmedUrl = gasUrl.trim();
    if (!isValidAppsScriptUrl(trimmedUrl)) {
      setTestResult({
        ok: false,
        msg: "Colle d'abord une URL Google Apps Script valide (https://script.google.com/macros/s/.../exec).",
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      let res = await fetch(trimmedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'read', key: apiKey.trim() }),
      });
      let text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }

      if (json && !json.ok && String(json.error || '').includes('Action non reconnue')) {
        const getUrl = apiKey.trim()
          ? `${trimmedUrl}?key=${encodeURIComponent(apiKey.trim())}`
          : trimmedUrl;
        res = await fetch(getUrl, { method: 'GET' });
        text = await res.text();
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }

      if (text.includes('Fonction de script introuvable') || text.includes('Script function not found')) {
        setTestResult({
          ok: false,
          msg: "Google répond : « Fonction introuvable ». Dans Apps Script, appuie sur Ctrl+S, puis Déployer > Gérer les déploiements > Modifier > Nouvelle version > Déployer.",
        });
      } else if (json && json.ok && json.sheets) {
        setAppsScriptUrl(trimmedUrl);
        setApiKey(apiKey);
        setProfileName(profileName);
        setTestResult({
          ok: true,
          msg: `Connexion sécurisée opérationnelle ! Tableur relié : ${json.sheetName || 'Google Sheet'}.`,
        });
        onRefreshSheet();
      } else if (json && !json.ok) {
        setTestResult({
          ok: false,
          msg: json.error || `Accès refusé : vérifie ta clé secrète API.`,
        });
      } else {
        setTestResult({
          ok: false,
          msg: `Réponse inattendue : ${text.slice(0, 120)}`,
        });
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        msg: `Impossible de joindre l'URL Apps Script (${err?.message || 'Erreur réseau / CORS'}).`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(buildAppsScriptSnippet(apiKey.trim()));
      setCopiedScript(true);
      window.setTimeout(() => setCopiedScript(false), 2500);
    } catch {
      // Ignore
    }
  };

  const handleCopyMagicLink = async () => {
    if (!magicLink) return;
    try {
      await navigator.clipboard.writeText(magicLink);
      setCopiedMagicLink(true);
      window.setTimeout(() => setCopiedMagicLink(false), 2800);
    } catch {
      // Ignore
    }
  };

  const handleDisconnect = () => {
    disconnectCloudAccount();
    setGasUrl('');
    setApiKeyState('');
    setProfileNameState('');
    setShowQrCode(false);
    setTestResult(null);
    onDisconnected();
    onClose();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = importBackupJson(text);
      setBackupNotice(res.msg);
      if (res.ok) {
        onRefreshSheet();
      }
    } catch {
      setBackupNotice('Erreur lors de la lecture du fichier.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={onClose}
    >
      <div
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90dvh', overflowY: 'auto' }}
      >
        <div className="modal-header">
          <h2 id="settings-title">Paramètres &amp; Synchronisation</h2>
          <button type="button" className="icon-ghost-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </div>

        {/* 1. Active Status Card */}
        <div className="connection-status-card">
          <div className="conn-row">
            <ShieldCheck size={20} className="conn-icon-ok" />
            <div>
              <div className="conn-title">
                Mode actif :{' '}
                <strong>
                  {dataSource === 'gsheets-plugin'
                    ? 'Plugin Google Sheets Direct'
                    : dataSource === 'apps-script'
                    ? 'Google Sheet Sécurisé (Cloud)'
                    : dataSource === 'local-guest'
                    ? 'Mode Local (Privé sur cet appareil)'
                    : 'Cache Hors-Ligne'}
                </strong>
              </div>
              <div className="conn-sub">
                {sheetMeta.sheetName ? (
                  <>
                    Tableur : <code>{sheetMeta.sheetName}</code>
                  </>
                ) : (
                  'Tes séances restent enregistrées uniquement sur cet appareil.'
                )}
              </div>
            </div>
          </div>

          <div className="conn-actions-row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="secondary-btn" onClick={onRefreshSheet}>
              <RefreshCw size={15} /> Actualiser
            </button>
            {offlineQueueCount > 0 && hasCloudConfigured && (
              <button type="button" className="primary-btn-sm" onClick={onFlushOfflineQueue}>
                <Cloud size={15} /> Envoyer {offlineQueueCount} modif(s)
              </button>
            )}
            {hasCloudConfigured && (
              <button
                type="button"
                className="secondary-btn"
                style={{ color: '#fda4af', borderColor: 'rgba(244, 63, 94, 0.35)' }}
                onClick={handleDisconnect}
              >
                <LogOut size={15} /> Déconnecter
              </button>
            )}
            {canInstallApp && (
              <button
                type="button"
                className="primary-btn-sm"
                aria-disabled={isInstallingApp ? 'true' : undefined}
                onClick={() => {
                  if (!isInstallingApp) onInstallApp();
                }}
              >
                <Download size={15} />{' '}
                {isInstallingApp ? 'Installation...' : "Installer l'application"}
              </button>
            )}
          </div>
        </div>

        {/* Backup & Export Section (Local JSON & Excel CSV) */}
        <section className="settings-section-card backup-card">
          <div className="settings-section-header">
            <HardDrive size={17} color="#34d399" />
            <div>
              <h3>Sauvegarde &amp; Export de mes données</h3>
              <p>
                Exporte ton historique en CSV (Excel) ou sauvegarde tes séances locales en JSON pour ne rien perdre.
              </p>
            </div>
          </div>

          <div className="pairing-actions-row">
            <button
              type="button"
              className="secondary-btn"
              style={{ flex: '1 1 46%', justifyContent: 'center' }}
              onClick={() => {
                exportBackupJson();
                setBackupNotice('✅ Sauvegarde JSON téléchargée !');
              }}
            >
              <Download size={14} /> Sauvegarde (.json)
            </button>
            <button
              type="button"
              className="secondary-btn"
              style={{ flex: '1 1 46%', justifyContent: 'center' }}
              onClick={() => importInputRef.current?.click()}
            >
              <Upload size={14} /> Restaurer (.json)
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json,application/json"
              className="visually-hidden"
              onChange={handleImportFile}
            />
            <button
              type="button"
              className="secondary-btn"
              style={{ flex: '1 1 100%', justifyContent: 'center' }}
              onClick={() => {
                exportJournalCsv(journalRows);
                setBackupNotice('✅ Export CSV (Excel) téléchargé !');
              }}
            >
              <FileSpreadsheet size={14} /> Exporter mon journal en CSV / Excel
            </button>
          </div>

          {backupNotice && (
            <div style={{ marginTop: '0.55rem', fontSize: '0.76rem', color: '#6ee7b7', fontWeight: 600 }}>
              {backupNotice}
            </div>
          )}
        </section>

        {/* 2. Transfer to another device (PC <-> Phone) via QR Code or Private Link */}
        {magicLink && (
          <section className="settings-section-card pairing-card">
            <div className="settings-section-header">
              <Smartphone size={17} color="#38bdf8" />
              <div>
                <h3>Connecter un autre appareil (PC ↔ Téléphone)</h3>
                <p>
                  Transfère ta connexion vers ton téléphone sans rien recopier.{' '}
                  <strong>Ne partage pas ce QR Code ni ce lien</strong> (il contient ta clé privée).
                </p>
              </div>
            </div>

            <div className="pairing-actions-row">
              <button
                type="button"
                className="primary-btn-sm"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setShowQrCode((prev) => !prev)}
                aria-expanded={showQrCode}
              >
                <QrCode size={15} />
                <span>{showQrCode ? 'Masquer le QR Code' : 'Afficher le QR Code'}</span>
              </button>
              <button
                type="button"
                className="secondary-btn"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={handleCopyMagicLink}
              >
                <Link2 size={15} />
                <span>{copiedMagicLink ? 'Lien privé copié !' : 'Copier le lien privé'}</span>
              </button>
            </div>

            {showQrCode && qrDataUrl && (
              <div className="qr-preview-box">
                <img
                  src={qrDataUrl}
                  alt="QR Code d'appairage privé IronPulse"
                  width={210}
                  height={210}
                />
                <span>Scanne avec l&apos;appareil photo de ton téléphone pour te connecter en 1 clic</span>
              </div>
            )}
          </section>
        )}

        {/* 3. Google Sheet Connection Form */}
        <form onSubmit={handleSave} className="gas-form">
          <div className="field-group" style={{ marginBottom: '0.7rem' }}>
            <label htmlFor="profile-name-input">Prénom / Nom du profil (affiché sur cet appareil)</label>
            <input
              id="profile-name-input"
              name="profileName"
              type="text"
              autoComplete="given-name"
              placeholder="Ex : Nicolas, Guillaume..."
              value={profileName}
              onChange={(e) => setProfileNameState(e.target.value)}
            />
          </div>

          <div className="field-group" style={{ marginBottom: '0.7rem' }}>
            <label htmlFor="gas-url-input">
              URL Web App Google Apps Script (pour synchroniser avec ton Google Sheet)
            </label>
            <input
              id="gas-url-input"
              name="gasUrl"
              type="url"
              inputMode="url"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="https://script.google.com/macros/s/.../exec"
              value={gasUrl}
              onChange={(e) => setGasUrl(e.target.value)}
            />
          </div>

          <div className="field-group" style={{ marginBottom: '0.75rem' }}>
            <label htmlFor="gas-api-key-input">
              <KeyRound size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
              Clé secrète API (identique à <code>SECRET_API_KEY</code> dans ton script)
            </label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                id="gas-api-key-input"
                name="apiKey"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Clé secrète personnelle"
                value={apiKey}
                onChange={(e) => setApiKeyState(e.target.value)}
              />
              <button
                type="button"
                className="secondary-btn"
                aria-pressed={showKey}
                aria-label={showKey ? 'Masquer la clé secrète' : 'Afficher la clé secrète'}
                onClick={() => setShowKey((prev) => !prev)}
                style={{ flexShrink: 0, padding: '0 0.75rem' }}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {testResult && (
            <div
              role="status"
              style={{
                padding: '0.7rem 0.85rem',
                borderRadius: '10px',
                fontSize: '0.8rem',
                marginBottom: '0.75rem',
                background: testResult.ok ? 'rgba(16, 185, 129, 0.16)' : 'rgba(244, 63, 94, 0.16)',
                border: `1px solid ${testResult.ok ? '#10b981' : '#f43f5e'}`,
                color: testResult.ok ? '#6ee7b7' : '#fda4af',
              }}
            >
              {testResult.msg}
            </div>
          )}

          <div className="gas-form-footer" style={{ marginBottom: '0.9rem' }}>
            <button
              type="button"
              className="secondary-btn"
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              <RefreshCw size={14} className={isTesting ? 'spin' : ''} />
              <span>{isTesting ? 'Test...' : 'Tester la connexion'}</span>
            </button>

            <button type="submit" className="primary-btn-sm">
              {savedNotice ? (
                <>
                  <CheckCircle2 size={15} /> Enregistré !
                </>
              ) : (
                'Enregistrer'
              )}
            </button>
          </div>
        </form>

        {/* 4. Collapsible First-Time Setup Guide for Google Apps Script (Code.gs) */}
        <details className="settings-accordion" open={!hasCloudConfigured}>
          <summary>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <Wrench size={15} />
              <span>Installer la synchro sur un nouveau Google Sheet (Code.gs)</span>
            </span>
            <ChevronDown size={16} className="accordion-chevron" />
          </summary>

          <div className="settings-accordion-body">
            <p className="gas-help-text" style={{ marginTop: 0 }}>
              Si tu veux relier <strong>ton propre Google Sheet</strong> pour sauvegarder tes séances dans le cloud :
            </p>
            <ol className="setup-steps-list">
              <li>
                Dans ton Google Sheet, ouvre <strong>Extensions &gt; Apps Script</strong>, efface le code existant et
                colle le script serveur :
                <div style={{ marginTop: '0.45rem' }}>
                  <button type="button" className="secondary-btn" onClick={handleCopyScript}>
                    <Copy size={14} />
                    <span>{copiedScript ? 'Script Code.gs copié !' : 'Copier le script serveur (Code.gs)'}</span>
                  </button>
                </div>
              </li>
              <li>
                Enregistre (<strong>Ctrl + S</strong>), puis clique sur{' '}
                <strong>Déployer &gt; Nouveau déploiement &gt; Application Web</strong> (<em>Exécuter : Moi</em> ·{' '}
                <em>Qui a accès : Tout le monde</em>).
              </li>
              <li>
                Copie l&apos;URL <code>/exec</code> générée par Google, colle-la dans le champ ci-dessus avec ta clé
                secrète, puis clique sur <strong>Enregistrer</strong>.
              </li>
            </ol>
          </div>
        </details>

        <div className="settings-modal-bottom-link">
          {sheetMeta.sheetUrl ? (
            <a href={sheetMeta.sheetUrl} target="_blank" rel="noreferrer" className="open-sheet-link">
              <ExternalLink size={15} /> Ouvrir mon Google Sheet
            </a>
          ) : (
            <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
              Mode Local actif : tes données restent privées sur cet appareil.
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
