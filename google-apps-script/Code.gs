/**
 * Script Google Apps Script sécurisé pour IronPulse
 * À coller dans votre Google Sheet : Extensions > Apps Script
 * 1. Remplacez SECRET_API_KEY par votre clé secrète personnelle
 * 2. Enregistrez (Ctrl+S)
 * 3. Déployer > Gérer les déploiements (ou Nouveau déploiement) > Application Web
 *    - Exécuter en tant que : Moi
 *    - Qui a accès : Tout le monde (sécurisé par SECRET_API_KEY ci-dessous)
 */

const SECRET_API_KEY = "CHANGE_MOI_PAR_TA_CLE_SECRETE";
const SHEET_JOURNAL = "Journal d'entraînement";
const SHEET_PROGRAMME = "Référence Programme";

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function isAuthorized(providedKey) {
  if (!SECRET_API_KEY || SECRET_API_KEY === "CHANGE_MOI_PAR_TA_CLE_SECRETE") {
    return true;
  }
  return String(providedKey || "").trim() === SECRET_API_KEY;
}

function buildReadResponse() {
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

  return jsonResponse({
    ok: true,
    source: "apps-script",
    sheetName: ss.getName(),
    sheetUrl: ss.getUrl(),
    sheets: sheets,
  });
}

function doGet(e) {
  const providedKey = e && e.parameter ? e.parameter.key : "";
  if (!isAuthorized(providedKey)) {
    return jsonResponse({
      ok: false,
      error: "Unauthorized: Clé secrète API invalide ou manquante.",
    });
  }
  return buildReadResponse();
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (!isAuthorized(payload.key)) {
      return jsonResponse({
        ok: false,
        error: "Unauthorized: Clé secrète API invalide ou manquante.",
      });
    }

    if (payload.action === "read") {
      return buildReadResponse();
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const journalSheet = ss.getSheetByName(SHEET_JOURNAL);

    if (!journalSheet) {
      throw new Error("Onglet Journal d'entraînement introuvable");
    }

    if (payload.action === "batchWrite" && Array.isArray(payload.operations)) {
      payload.operations.forEach(function (op) {
        const bangIdx = op.range.indexOf("!");
        const a1 = bangIdx >= 0 ? op.range.slice(bangIdx + 1) : op.range;

        if (op.op === "write" && Array.isArray(op.data) && op.data.length > 0) {
          const targetRange = journalSheet.getRange(a1);
          targetRange.setValues(op.data);
        } else if (op.op === "append" && Array.isArray(op.data) && op.data.length > 0) {
          const lastRow = journalSheet.getLastRow();
          const startRow = Math.max(5, lastRow + 1);
          const numRows = op.data.length;
          const numCols = op.data[0].length;
          journalSheet.getRange(startRow, 2, numRows, numCols).setValues(op.data);
        }
      });

      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: "Action non reconnue" });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}
