import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Link2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  buildMagicPairingLink,
  disconnectCloudAccount,
  getApiKey,
  getAppsScriptUrl,
  getProfileName,
  getSheetMeta,
  isValidAppsScriptUrl,
  setApiKey,
  setAppsScriptUrl,
  setProfileName,
} from '../services/sheetsApi';

interface SettingsModalProps {
  isOpen: boolean;
  dataSource: 'gsheets-plugin' | 'apps-script' | 'local-guest' | 'local-cache';
  offlineQueueCount: number;
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
  const sheets = {};
  if (journalSheet) sheets[SHEET_JOURNAL] = journalSheet.getDataRange().getDisplayValues();
  if (progSheet) sheets[SHEET_PROGRAMME] = progSheet.getDataRange().getDisplayValues();
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
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setGasUrl(getAppsScriptUrl());
      setApiKeyState(getApiKey());
      setProfileNameState(getProfileName());
      setTestResult(null);
    }
  }, [isOpen]);

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
    const link = buildMagicPairingLink(gasUrl, apiKey, profileName);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
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
    setTestResult(null);
    onDisconnected();
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={onClose}
    >
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '90dvh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2 id="settings-title">Espace &amp; Connexion Google Sheets</h2>
          <button type="button" className="icon-ghost-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </div>

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
                  'Tes séances restent enregistrées uniquement sur ce téléphone.'
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
          </div>
        </div>

        <form onSubmit={handleSave} className="gas-form">
          <div className="field-group" style={{ marginBottom: '0.7rem' }}>
            <label htmlFor="profile-name-input">Prénom / Nom du profil (affiché uniquement sur cet appareil)</label>
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
              URL Web App Google Apps Script (optionnel — pour synchroniser avec ton propre Sheet)
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

          <div className="field-group" style={{ marginBottom: '0.7rem' }}>
            <label htmlFor="gas-api-key-input">
              <KeyRound size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} />
              Clé secrète API (doit correspondre à <code>SECRET_API_KEY</code> dans ton script)
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

          <div
            className="gas-actions-inline"
            style={{ margin: '0.65rem 0', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
          >
            <button type="button" className="secondary-btn" onClick={handleCopyScript}>
              <Copy size={14} />
              <span>{copiedScript ? 'Code.gs copié !' : '1. Copier Code.gs sécurisé'}</span>
            </button>
            <button
              type="button"
              className="primary-btn-sm"
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              <RefreshCw size={14} className={isTesting ? 'spin' : ''} />
              <span>{isTesting ? 'Test...' : '2. Tester la connexion'}</span>
            </button>
            {isValidAppsScriptUrl(gasUrl) && (
              <button type="button" className="secondary-btn" onClick={handleCopyMagicLink}>
                <Link2 size={14} />
                <span>{copiedMagicLink ? 'Lien magique copié !' : 'Copier mon lien magique'}</span>
              </button>
            )}
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

          <p className="gas-help-text">
            Sans URL configurée, IronPulse fonctionne en <strong>Mode Local 100 % privé</strong> sur ton appareil.
            Pour relier ton Google Sheet : colle le script sécurisé dans <strong>Extensions &gt; Apps Script</strong>,
            déploie en <em>Application Web</em> et colle ton URL + clé secrète ci-dessus.
          </p>

          <div className="gas-form-footer">
            {sheetMeta.sheetUrl ? (
              <a
                href={sheetMeta.sheetUrl}
                target="_blank"
                rel="noreferrer"
                className="open-sheet-link"
              >
                <ExternalLink size={15} /> Ouvrir mon Google Sheet
              </a>
            ) : (
              <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                Aucune donnée personnelle partagée
              </span>
            )}

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
      </div>
    </div>
  );
};
