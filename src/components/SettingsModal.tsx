import React, { useState } from 'react';
import { CheckCircle2, Cloud, Copy, ExternalLink, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { getAppsScriptUrl, setAppsScriptUrl } from '../services/sheetsApi';

interface SettingsModalProps {
  isOpen: boolean;
  dataSource: 'gsheets-plugin' | 'apps-script' | 'local-cache';
  offlineQueueCount: number;
  onClose: () => void;
  onRefreshSheet: () => void;
  onFlushOfflineQueue: () => void;
}

const APPS_SCRIPT_SNIPPET = `const SHEET_JOURNAL = "Journal d'entraînement";
const SHEET_PROGRAMME = "Référence Programme";

function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const journalSheet = ss.getSheetByName(SHEET_JOURNAL);
  const progSheet = ss.getSheetByName(SHEET_PROGRAMME);
  const sheets = {};
  if (journalSheet) sheets[SHEET_JOURNAL] = journalSheet.getDataRange().getDisplayValues();
  if (progSheet) sheets[SHEET_PROGRAMME] = progSheet.getDataRange().getDisplayValues();
  return ContentService.createTextOutput(JSON.stringify({ ok: true, source: 'apps-script', sheets }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const journalSheet = ss.getSheetByName(SHEET_JOURNAL);
    if (payload.action === 'batchWrite' && Array.isArray(payload.operations)) {
      payload.operations.forEach((op) => {
        const bangIdx = op.range.indexOf('!');
        const a1 = bangIdx >= 0 ? op.range.slice(bangIdx + 1) : op.range;
        if (op.op === 'write' && Array.isArray(op.data) && op.data.length > 0) {
          journalSheet.getRange(a1).setValues(op.data);
        } else if (op.op === 'append' && Array.isArray(op.data) && op.data.length > 0) {
          const startRow = Math.max(5, journalSheet.getLastRow() + 1);
          journalSheet.getRange(startRow, 2, op.data.length, op.data[0].length).setValues(op.data);
        }
      });
      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: false })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  dataSource,
  offlineQueueCount,
  onClose,
  onRefreshSheet,
  onFlushOfflineQueue,
}) => {
  const [gasUrl, setGasUrl] = useState<string>(getAppsScriptUrl());
  const [savedNotice, setSavedNotice] = useState<boolean>(false);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setAppsScriptUrl(gasUrl);
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_SNIPPET);
      setCopiedScript(true);
      window.setTimeout(() => setCopiedScript(false), 2500);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="modal-sheet">
        <div className="modal-header">
          <h2 id="settings-title">Connexion Google Sheets (4G/5G &amp; Local)</h2>
          <button type="button" className="icon-ghost-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </div>

        <div className="connection-status-card">
          <div className="conn-row">
            <ShieldCheck size={20} className="conn-icon-ok" />
            <div>
              <div className="conn-title">
                Source active :{' '}
                <strong>
                  {dataSource === 'gsheets-plugin'
                    ? 'Plugin Google Sheets Direct (Connecté)'
                    : dataSource === 'apps-script'
                    ? 'Google Apps Script (Cloud 4G/5G)'
                    : 'Cache Local Hors-Ligne'}
                </strong>
              </div>
              <div className="conn-sub">
                Tableur : <code>Suivi Entraînement &amp; Recomposition - Nicolas</code>
              </div>
            </div>
          </div>

          <div className="conn-actions-row">
            <button type="button" className="secondary-btn" onClick={onRefreshSheet}>
              <RefreshCw size={15} /> Recharger depuis le Sheet
            </button>
            {offlineQueueCount > 0 && (
              <button type="button" className="primary-btn-sm" onClick={onFlushOfflineQueue}>
                <Cloud size={15} /> Envoyer {offlineQueueCount} modif(s) en attente
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="gas-form">
          <div className="field-group">
            <label htmlFor="gas-url-input">
              URL Web App Google Apps Script (pour écrire en direct en 4G/5G à la salle)
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

          <div className="gas-actions-inline" style={{ margin: '0.65rem 0' }}>
            <button type="button" className="secondary-btn" onClick={handleCopyScript}>
              <Copy size={14} />
              <span>{copiedScript ? 'Code Apps Script copié !' : 'Copier le script Code.gs'}</span>
            </button>
          </div>

          <p className="gas-help-text">
            1. Dans ton Google Sheet : <strong>Extensions &gt; Apps Script</strong>, colle le script copié ci-dessus.
            <br />
            2. Clique sur <strong>Déployer &gt; Nouveau déploiement &gt; Application Web</strong> (Accès : <em>Tout le monde</em>).
            <br />
            3. Colle l'URL obtenue ci-dessus et clique sur <strong>Enregistrer</strong>.
          </p>

          <div className="gas-form-footer">
            <a
              href="https://docs.google.com/spreadsheets/d/1WM517we-EmWXST9vEWghjgElri4ig4CNgOs1ANyC4Ak/edit"
              target="_blank"
              rel="noreferrer"
              className="open-sheet-link"
            >
              <ExternalLink size={15} /> Ouvrir mon Google Sheet
            </a>

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
