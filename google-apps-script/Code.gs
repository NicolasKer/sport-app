/**
 * Script Google Apps Script pour IronPulse (Suivi Entraînement & Recomposition - Nicolas)
 * À coller dans votre Google Sheet : Extensions > Apps Script
 * Puis : Déployer > Nouveau déploiement > Application Web
 *   - Exécuter en tant que : Moi (kervarec.nicolas@gmail.com)
 *   - Qui a accès : Tout le monde (pour permettre l'appel direct depuis le navigateur mobile sans popup OAuth bloquante)
 */

const SHEET_JOURNAL = "Journal d'entraînement";
const SHEET_PROGRAMME = "Référence Programme";

function doGet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const journalSheet = ss.getSheetByName(SHEET_JOURNAL);
  const progSheet = ss.getSheetByName(SHEET_PROGRAMME);

  const sheets = {};
  if (journalSheet) {
    sheets[SHEET_JOURNAL] = journalSheet.getDataRange().getDisplayValues();
  }
  if (progSheet) {
    sheets[SHEET_PROGRAMME] = progSheet.getDataRange().getDisplayValues();
  }

  return ContentService.createTextOutput(
    JSON.stringify({ ok: true, source: 'apps-script', sheets })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const journalSheet = ss.getSheetByName(SHEET_JOURNAL);

    if (!journalSheet) {
      throw new Error("Onglet Journal d'entraînement introuvable");
    }

    if (payload.action === 'batchWrite' && Array.isArray(payload.operations)) {
      payload.operations.forEach((op) => {
        // Parse range e.g. "'Journal d'entraînement'!B101:M101"
        const bangIdx = op.range.indexOf('!');
        const a1 = bangIdx >= 0 ? op.range.slice(bangIdx + 1) : op.range;

        if (op.op === 'write' && Array.isArray(op.data) && op.data.length > 0) {
          const targetRange = journalSheet.getRange(a1);
          targetRange.setValues(op.data);
        } else if (op.op === 'append' && Array.isArray(op.data) && op.data.length > 0) {
          const lastRow = journalSheet.getLastRow();
          const startRow = Math.max(5, lastRow + 1);
          const numRows = op.data.length;
          const numCols = op.data[0].length;
          // Colonne B = col 2
          journalSheet.getRange(startRow, 2, numRows, numCols).setValues(op.data);
        }
      });

      return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
        ContentService.MimeType.JSON
      );
    }

    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: 'Action non reconnue' })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
