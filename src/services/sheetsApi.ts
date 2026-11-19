import initialSeed from '../data/initialSheetData.json';
import {
  ActiveExerciseState,
  ActiveSetState,
  ActiveWorkoutSession,
  BatchOperation,
  BodyWeightEntry,
  ExportBackupPayload,
  Feeling,
  JournalRow,
  ProgramExercise,
  ProgramTemplate,
} from '../types/workout';

const STORAGE_KEY_SHEETS_CACHE = 'ironpulse_sheets_cache_v4';
const STORAGE_KEY_LOCAL_GUEST_SHEETS = 'ironpulse_local_guest_sheets_v1';
const STORAGE_KEY_CUSTOM_PROGRAM_OVERRIDE = 'ironpulse_custom_program_override_v1';
const STORAGE_KEY_BODY_WEIGHT = 'ironpulse_bodyweight_v1';
const STORAGE_KEY_SOUND_ENABLED = 'ironpulse_sound_enabled_v1';
const STORAGE_KEY_SESSION_DURATIONS = 'ironpulse_session_durations_v1';
const STORAGE_KEY_APPS_SCRIPT_URL = 'ironpulse_apps_script_url_v3';
const STORAGE_KEY_API_KEY = 'ironpulse_api_key_v1';
const STORAGE_KEY_PROFILE_NAME = 'ironpulse_profile_name_v1';
const STORAGE_KEY_SHEET_META = 'ironpulse_sheet_meta_v1';
const STORAGE_KEY_OFFLINE_QUEUE = 'ironpulse_offline_queue_v3';
const STORAGE_KEY_ACTIVE_SESSION = 'ironpulse_active_session_v3';

const LEGACY_KEYS_TO_PURGE = ['ironpulse_sheets_cache_v3', 'ironpulse_apps_script_url_v2'];
const TRUSTED_GAS_ORIGIN = 'https://script.google.com';

export interface ParsedSheetData {
  journalRows: JournalRow[];
  templates: ProgramTemplate[];
  preCreatedSessions: {
    date: string;
    sessionName: string;
    rows: JournalRow[];
  }[];
  source: 'gsheets-plugin' | 'apps-script' | 'local-guest' | 'local-cache';
  authError?: string;
}

export function isValidAppsScriptUrl(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  try {
    const OriginCtor = (globalThis as unknown as { Origin?: { from: (v: string) => { isSameOrigin: (o: unknown) => boolean } } }).Origin;
    if (OriginCtor && typeof OriginCtor.from === 'function') {
      const candidateOrigin = OriginCtor.from(trimmed);
      const trustedOrigin = OriginCtor.from(TRUSTED_GAS_ORIGIN);
      if (!candidateOrigin.isSameOrigin(trustedOrigin)) return false;
    } else {
      const parsed = new URL(trimmed);
      const trusted = new URL(TRUSTED_GAS_ORIGIN);
      if (parsed.origin === 'null' || parsed.origin !== trusted.origin) return false;
    }
    const parsedPath = new URL(trimmed).pathname;
    return parsedPath.startsWith('/macros/s/') && parsedPath.endsWith('/exec');
  } catch {
    return false;
  }
}

export function getAppsScriptUrl(): string {
  const saved = (localStorage.getItem(STORAGE_KEY_APPS_SCRIPT_URL) || '').trim();
  return isValidAppsScriptUrl(saved) ? saved : '';
}

export function setAppsScriptUrl(url: string): void {
  const trimmed = url.trim();
  if (!trimmed) {
    localStorage.removeItem(STORAGE_KEY_APPS_SCRIPT_URL);
    return;
  }
  if (isValidAppsScriptUrl(trimmed)) {
    localStorage.setItem(STORAGE_KEY_APPS_SCRIPT_URL, trimmed);
  }
}

export function getApiKey(): string {
  return (localStorage.getItem(STORAGE_KEY_API_KEY) || '').trim();
}

export function setApiKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) {
    localStorage.removeItem(STORAGE_KEY_API_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY_API_KEY, trimmed);
  }
}

export function getProfileName(): string {
  return (localStorage.getItem(STORAGE_KEY_PROFILE_NAME) || '').trim();
}

export function setProfileName(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) {
    localStorage.removeItem(STORAGE_KEY_PROFILE_NAME);
  } else {
    localStorage.setItem(STORAGE_KEY_PROFILE_NAME, trimmed);
  }
}

export function getSheetMeta(): { sheetName?: string; sheetUrl?: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SHEET_META);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSheetMeta(sheetName?: string, sheetUrl?: string): void {
  if (!sheetName && !sheetUrl) return;
  localStorage.setItem(STORAGE_KEY_SHEET_META, JSON.stringify({ sheetName, sheetUrl }));
}

function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function buildMagicPairingLink(
  gasUrl: string,
  apiKey: string,
  profileName?: string
): string | null {
  if (!isValidAppsScriptUrl(gasUrl)) return null;
  const payload: { u: string; k?: string; n?: string } = { u: gasUrl.trim() };
  if (apiKey.trim()) payload.k = apiKey.trim();
  if (profileName?.trim()) payload.n = profileName.trim();
  const encoded = toBase64Url(JSON.stringify(payload));
  return `${window.location.origin}${window.location.pathname}#pair=${encoded}`;
}

export function processMagicPairingLink(): { paired: boolean; profileName?: string; error?: string } {
  // Purge legacy unauthenticated cache/default keys on every startup
  for (const legacyKey of LEGACY_KEYS_TO_PURGE) {
    localStorage.removeItem(legacyKey);
  }

  const hash = window.location.hash || '';
  if (!hash.startsWith('#pair=')) {
    return { paired: false };
  }

  const encoded = hash.slice('#pair='.length).trim();
  // Immediately strip sensitive pairing payload from browser address bar & history
  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as { u?: string; k?: string; n?: string };
    if (!parsed.u || !isValidAppsScriptUrl(parsed.u)) {
      return { paired: false, error: 'Lien d’appairage invalide (URL Google Apps Script non reconnue).' };
    }
    setAppsScriptUrl(parsed.u);
    setApiKey(parsed.k || '');
    setProfileName(parsed.n || '');
    localStorage.removeItem(STORAGE_KEY_SHEETS_CACHE);
    localStorage.removeItem(STORAGE_KEY_SHEET_META);
    return { paired: true, profileName: parsed.n || 'Cloud' };
  } catch {
    return { paired: false, error: 'Lien d’appairage corrompu ou illisible.' };
  }
}

export function disconnectCloudAccount(): void {
  localStorage.removeItem(STORAGE_KEY_APPS_SCRIPT_URL);
  localStorage.removeItem(STORAGE_KEY_API_KEY);
  localStorage.removeItem(STORAGE_KEY_PROFILE_NAME);
  localStorage.removeItem(STORAGE_KEY_SHEET_META);
  localStorage.removeItem(STORAGE_KEY_SHEETS_CACHE);
  localStorage.removeItem(STORAGE_KEY_CUSTOM_PROGRAM_OVERRIDE);
  localStorage.removeItem(STORAGE_KEY_OFFLINE_QUEUE);
  localStorage.removeItem(STORAGE_KEY_ACTIVE_SESSION);
}

export function getSoundEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY_SOUND_ENABLED) !== 'false';
}

export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_KEY_SOUND_ENABLED, enabled ? 'true' : 'false');
}

export function parseRestSeconds(restStr: string): number {
  if (!restStr || restStr === '-') return 90;
  const clean = restStr.trim();
  // ex: "2'30", "1'15", "3'00"
  const minSecMatch = clean.match(/^(\d+)'(\d+)?$/);
  if (minSecMatch) {
    const mins = parseInt(minSecMatch[1], 10);
    const secs = minSecMatch[2] ? parseInt(minSecMatch[2], 10) : 0;
    return mins * 60 + secs;
  }
  // ex: "45s", "60s"
  const secMatch = clean.match(/^(\d+)\s*s$/i);
  if (secMatch) {
    return parseInt(secMatch[1], 10);
  }
  return 90;
}

export function normalizeExerciseKey(name: string): string {
  const n = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^[0-9]+[ab]?\.\s*/i, '')
    .trim();

  if (n.includes('pec deck') || n.includes('ecartes poulie')) return 'pec_deck_ecartes';
  if (n.includes('presse a cuisses') || n.includes('hack squat')) return 'presse_a_cuisses';
  if (n.includes('machine a abdos') || n.includes('crunch poulie')) return 'abdos_crunch';
  if (n.includes('mollets debout')) return 'mollets';
  if (n.includes('chest-supported row')) return 'chest_supported_row';
  if (n.includes('developpe militaire')) return 'developpe_militaire';
  if (n.includes('face pull')) return 'face_pull';
  if (n.includes('extensions triceps')) return 'extensions_triceps';
  if (n.includes('curl marteau')) return 'curl_marteau';
  if (n.includes('finisher cardio') || n.includes('cardio tapis')) return 'cardio_tapis';
  return n.replace(/[^a-z0-9]+/g, '_');
}

export function applyOperationsToRawSheets(
  rawSheets: Record<string, string[][]>,
  ops: BatchOperation[]
): Record<string, string[][]> {
  if (ops.length === 0) return rawSheets;

  const cloned: Record<string, string[][]> = {
    ...rawSheets,
    "Journal d'entraînement": (rawSheets["Journal d'entraînement"] || []).map((r) => [...r]),
  };
  const journal = cloned["Journal d'entraînement"];

  for (const op of ops) {
    if (op.op === 'write' && Array.isArray(op.data) && op.data[0]) {
      // e.g. "'Journal d'entraînement'!B101:M101"
      const m = op.range.match(/!B(\d+):M(\d+)/i);
      if (m) {
        const rowNum = parseInt(m[1], 10);
        const idx = rowNum - 1;
        while (journal.length <= idx) {
          journal.push([]);
        }
        const rowVals = op.data[0].map((v) => {
          const s = String(v ?? '');
          // If formula like =F101*G101, compute tonnage for display
          if (s.startsWith('=F')) {
            const w = Number(op.data[0][4]) || 0;
            const r = Number(op.data[0][5]) || 0;
            return String(Math.round(w * r * 10) / 10);
          }
          return s.startsWith("'") ? s.slice(1) : s;
        });
        journal[idx] = ['', ...rowVals];
      }
    } else if (op.op === 'append' && Array.isArray(op.data)) {
      for (const row of op.data) {
        // If formula like =F101*G101, compute tonnage for display
        const rowVals = row.map((v) => {
          const s = String(v ?? '');
          if (s.startsWith('=F')) {
            const w = Number(row[4]) || 0;
            const r = Number(row[5]) || 0;
            return String(Math.round(w * r * 10) / 10);
          }
          return s.startsWith("'") ? s.slice(1) : s;
        });
        journal.push(['', ...rowVals]);
      }
    }
  }

  return cloned;
}

export function applyOfflineQueueToRawSheets(
  rawSheets: Record<string, string[][]>
): Record<string, string[][]> {
  return applyOperationsToRawSheets(rawSheets, getOfflineQueue());
}

function loadLocalGuestRawSheets(): Record<string, string[][]> {
  const saved = localStorage.getItem(STORAGE_KEY_LOCAL_GUEST_SHEETS);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // Ignore corrupt local guest data
    }
  }
  return initialSeed as Record<string, string[][]>;
}

export function parseSheetsPayload(rawSheets: Record<string, string[][]>, source: ParsedSheetData['source']): ParsedSheetData {
  const mergedSheets = applyOfflineQueueToRawSheets(rawSheets);
  const journalRaw = mergedSheets["Journal d'entraînement"] || [];
  const progRaw = mergedSheets['Référence Programme'] || [];

  // 1. Parse Référence Programme (starts at index 4 -> Row 5)
  const programExercises: ProgramExercise[] = [];
  for (let i = 4; i < progRaw.length; i++) {
    const row = progRaw[i];
    if (!row || !row[1] || !row[2]) continue;
    const rawSessionTitle = String(row[1]).trim();
    const rawExName = String(row[2]).trim();
    const setsRepsRaw = String(row[3] || '').trim().replace(/^'/, '');
    const rir = String(row[4] || '').trim().replace(/^'/, '');
    const restLabel = String(row[5] || '').trim();
    const instructions = String(row[6] || '').trim();

    const dashParts = rawSessionTitle.split(' - ');
    const shortSessionName =
      dashParts.length > 1 ? dashParts.slice(1).join(' - ').trim() : rawSessionTitle;

    const prefixMatch = rawExName.match(/^(\d+[A-Z]?)\.\s*(.+)$/i);
    const codePrefix = prefixMatch ? prefixMatch[1].toUpperCase() : String(programExercises.length + 1);
    const cleanName = prefixMatch ? prefixMatch[2].trim() : rawExName;

    const supersetMatch = codePrefix.match(/^(\d+)[A-Z]$/i);
    const supersetGroup = supersetMatch ? supersetMatch[1] : null;

    // Parse "3x6-8" or "4x10-15" or "25-30 min"
    const setsMatch = setsRepsRaw.match(/^(\d+)\s*x\s*(.+)$/i);
    const setsCount = setsMatch ? parseInt(setsMatch[1], 10) : 1;
    const targetReps = setsMatch ? setsMatch[2].trim() : setsRepsRaw;
    const isCardio =
      cleanName.toLowerCase().includes('cardio') ||
      targetReps.toLowerCase().includes('min');

    // Note: in Full Body, 6B in Référence Programme is "Superset Bras Curl Marteau + Barre front"
    // whereas in Journal d'entraînement it is split into "Curl Marteau" + "Extensions Triceps Poulie (ou Barre au front)".
    if (cleanName.toLowerCase().includes('superset bras curl marteau')) {
      programExercises.push({
        rawSessionTitle,
        shortSessionName,
        codePrefix: '6B',
        supersetGroup: '6',
        name: 'Curl Marteau',
        setsCount,
        targetReps,
        rir: '0-1',
        restSeconds: 45,
        restLabel: '45s',
        instructions: 'Superset Bras / Épaules',
        isCardio: false,
      });
      programExercises.push({
        rawSessionTitle,
        shortSessionName,
        codePrefix: '6C',
        supersetGroup: '6',
        name: 'Extensions Triceps Poulie (ou Barre au front)',
        setsCount,
        targetReps,
        rir: '0-1',
        restSeconds: parseRestSeconds(restLabel),
        restLabel: restLabel || "1'15",
        instructions: 'Superset Bras / Épaules',
        isCardio: false,
      });
    } else {
      programExercises.push({
        rawSessionTitle,
        shortSessionName,
        codePrefix,
        supersetGroup,
        name: cleanName,
        setsCount,
        targetReps,
        rir,
        restSeconds: parseRestSeconds(restLabel),
        restLabel: restLabel || '-',
        instructions,
        isCardio,
      });
    }
  }

  // Group into templates
  const templateMap = new Map<string, ProgramTemplate>();
  for (const ex of programExercises) {
    if (!templateMap.has(ex.shortSessionName)) {
      const parts = ex.rawSessionTitle.split(' - ');
      const dayBadge = parts.length > 1 ? parts[0].trim() : ex.shortSessionName;
      const lowerName = ex.shortSessionName.toLowerCase();
      const icon =
        lowerName.includes('lower') || lowerName.includes('jambe') || lowerName.includes('leg')
          ? 'lower'
          : lowerName.includes('full') || lowerName.includes('corps')
          ? 'full'
          : 'upper';
      templateMap.set(ex.shortSessionName, {
        id: ex.shortSessionName,
        fullTitle: ex.rawSessionTitle,
        dayBadge,
        icon,
        exercises: [],
      });
    }
    templateMap.get(ex.shortSessionName)!.exercises.push(ex);
  }

  // Fallback Finisher Cardio on legacy cloud Full Body sheet if no custom override exists
  const fullBodyTpl = templateMap.get('Full Body');
  if (
    fullBodyTpl &&
    source !== 'local-guest' &&
    !localStorage.getItem(STORAGE_KEY_CUSTOM_PROGRAM_OVERRIDE) &&
    !fullBodyTpl.exercises.some((e) => e.isCardio)
  ) {
    fullBodyTpl.exercises.push({
      rawSessionTitle: fullBodyTpl.fullTitle,
      shortSessionName: 'Full Body',
      codePrefix: '7',
      supersetGroup: null,
      name: 'Finisher Cardio Tapis (Course rythmée)',
      setsCount: 1,
      targetReps: '10-12 min',
      rir: '-',
      restSeconds: 60,
      restLabel: '-',
      instructions: 'Course rythmée sur tapis en fin de séance',
      isCardio: true,
    });
  }

  // 2. Parse Journal d'entraînement (starts at index 4 -> Row 5)
  const journalRows: JournalRow[] = [];
  for (let i = 4; i < journalRaw.length; i++) {
    const r = journalRaw[i];
    if (!r || (!r[1] && !r[2] && !r[3])) continue;
    const date = String(r[1] || '').trim();
    const sessionName = String(r[2] || '').trim();
    const exercise = String(r[3] || '').trim();
    if (!date || !exercise) continue;

    const setNumber = parseInt(String(r[4] || '1'), 10) || 1;
    const weightStr = String(r[5] ?? '').trim().replace(',', '.');
    const repsStr = String(r[6] ?? '').trim().replace(',', '.');
    const weightKg = weightStr !== '' && !isNaN(Number(weightStr)) ? Number(weightStr) : null;
    const reps = repsStr !== '' && !isNaN(Number(repsStr)) ? Number(repsStr) : null;

    const targetReps = String(r[7] || '').trim();
    const rir = String(r[8] || '').trim();
    const feelingRaw = String(r[9] || '').trim();
    const feeling: Feeling =
      feelingRaw === 'Facile' || feelingRaw === 'Modéré' || feelingRaw === 'Difficile'
        ? feelingRaw
        : '';
    const tonnageStr = String(r[10] || '0').trim().replace(',', '.');
    const tonnage = !isNaN(Number(tonnageStr))
      ? Number(tonnageStr)
      : (weightKg || 0) * (reps || 0);
    const levelValidated = String(r[11] || '').trim().toLowerCase() === 'oui';
    const notes = String(r[12] || '').trim();

    journalRows.push({
      sheetRowNumber: i + 1, // 1-based row index in Google Sheet
      date,
      sessionName,
      exercise,
      setNumber,
      weightKg,
      reps,
      targetReps,
      rir,
      feeling,
      tonnage,
      levelValidated,
      notes,
    });
  }

  // 3. Identify pre-created sessions (only sessions where NO exercise has been filled yet, or dated today/future)
  const sessionGroups = new Map<string, JournalRow[]>();
  for (const row of journalRows) {
    const key = `${row.date}__${row.sessionName}`;
    if (!sessionGroups.has(key)) sessionGroups.set(key, []);
    sessionGroups.get(key)!.push(row);
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const preCreatedSessions: ParsedSheetData['preCreatedSessions'] = [];
  for (const [, rows] of sessionGroups) {
    const sessionDate = rows[0]?.date || '';
    const hasAnyFilled = rows.some(
      (r) =>
        (r.weightKg !== null && r.weightKg > 0) ||
        (r.reps !== null && r.reps > 0) ||
        r.feeling !== '' ||
        r.notes !== ''
    );
    const hasUnfilledRows = rows.some(
      (r) =>
        !r.exercise.toLowerCase().includes('cardio') &&
        (r.weightKg === null || r.weightKg === 0) &&
        r.feeling === ''
    );

    // Propose only if completely untouched OR if it's today's/future session still in progress
    if (rows.length > 0 && (!hasAnyFilled || (sessionDate >= todayIso && hasUnfilledRows))) {
      preCreatedSessions.push({
        date: sessionDate,
        sessionName: rows[0].sessionName,
        rows,
      });
    }
  }

  return {
    journalRows,
    templates: Array.from(templateMap.values()),
    preCreatedSessions,
    source,
  };
}

function applyProgramOverrideIfPresent(rawSheets: Record<string, string[][]>): Record<string, string[][]> {
  const overrideRaw = localStorage.getItem(STORAGE_KEY_CUSTOM_PROGRAM_OVERRIDE);
  if (!overrideRaw) return rawSheets;
  try {
    const parsedOverride = JSON.parse(overrideRaw) as string[][];
    if (Array.isArray(parsedOverride) && parsedOverride.length > 4) {
      return { ...rawSheets, 'Référence Programme': parsedOverride };
    }
  } catch {
    // Ignore corrupt override
  }
  return rawSheets;
}

export async function fetchSheetData(): Promise<ParsedSheetData> {
  // 1. Try local Antigravity gsheets plugin bridge (/api/gsheets) in local dev only
  try {
    const res = await fetch('/api/gsheets', { method: 'GET' });
    if (res.ok) {
      const json = await res.json();
      if (json.ok && json.sheets) {
        localStorage.setItem(STORAGE_KEY_SHEETS_CACHE, JSON.stringify(json.sheets));
        return parseSheetsPayload(applyProgramOverrideIfPresent(json.sheets), 'gsheets-plugin');
      }
    }
  } catch {
    // Bridge not reachable (e.g. static mobile hosting), fallback to Apps Script or guest mode
  }

  // 2. Try Google Apps Script Web App URL if configured on this device
  const gasUrl = getAppsScriptUrl();
  const apiKey = getApiKey();
  let authError: string | undefined;

  if (gasUrl) {
    try {
      // Prefer POST so the secret API key is never placed in URL query strings
      let res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'read', key: apiKey }),
      });

      let json = res.ok ? await res.json() : null;

      // Backward compatibility if user's Apps Script doesn't yet handle action='read' in doPost
      if (json && !json.ok && String(json.error || '').includes('Action non reconnue')) {
        const getUrl = apiKey ? `${gasUrl}?key=${encodeURIComponent(apiKey)}` : gasUrl;
        res = await fetch(getUrl, { method: 'GET' });
        json = res.ok ? await res.json() : null;
      }

      if (json && json.ok && json.sheets) {
        localStorage.setItem(STORAGE_KEY_SHEETS_CACHE, JSON.stringify(json.sheets));
        saveSheetMeta(json.sheetName, json.sheetUrl);
        if (Array.isArray(json.sheets['Suivi Poids'])) {
          mergeAndSaveBodyWeightFromSheet(json.sheets['Suivi Poids']);
        }
        return parseSheetsPayload(applyProgramOverrideIfPresent(json.sheets), 'apps-script');
      } else if (json && !json.ok && String(json.error || '').toLowerCase().includes('unauthorized')) {
        authError = json.error || 'Clé secrète API invalide.';
      }
    } catch {
      // Offline or error: fall back to cached cloud sheet below
    }

    const cached = localStorage.getItem(STORAGE_KEY_SHEETS_CACHE);
    if (cached) {
      try {
        const parsed = parseSheetsPayload(
          applyProgramOverrideIfPresent(JSON.parse(cached)),
          'local-cache'
        );
        if (authError) parsed.authError = authError;
        return parsed;
      } catch {
        // Ignore corrupt cache
      }
    }

    const fallback = parseSheetsPayload(
      applyProgramOverrideIfPresent(initialSeed as Record<string, string[][]>),
      'local-cache'
    );
    if (authError) fallback.authError = authError;
    return fallback;
  }

  // 3. Neutral Local / Guest mode (no personal cloud sheet configured on this device)
  return parseSheetsPayload(loadLocalGuestRawSheets(), 'local-guest');
}

export function getLastExerciseHistory(
  exerciseName: string,
  allJournalRows: JournalRow[],
  excludeDate?: string
): ActiveExerciseState['lastSessionSummary'] | undefined {
  const targetKey = normalizeExerciseKey(exerciseName);
  const matching = allJournalRows.filter((r) => {
    if (excludeDate && r.date === excludeDate) return false;
    const isFilled =
      (r.weightKg !== null && r.weightKg > 0) ||
      (r.reps !== null && r.reps > 0) ||
      r.notes !== '';
    return isFilled && normalizeExerciseKey(r.exercise) === targetKey;
  });

  if (matching.length === 0) return undefined;

  // Find latest date
  const dates = Array.from(new Set(matching.map((m) => m.date))).sort();
  const latestDate = dates[dates.length - 1];
  const latestRows = matching.filter((m) => m.date === latestDate);

  let bestWeight = 0;
  let repsAtBest = 0;
  let levelWasValidated = false;
  let lastNotes = '';

  for (const r of latestRows) {
    if ((r.weightKg || 0) >= bestWeight) {
      bestWeight = r.weightKg || 0;
      repsAtBest = r.reps || 0;
    }
    if (r.levelValidated) levelWasValidated = true;
    if (r.notes) lastNotes = r.notes;
  }

  const setsText = latestRows
    .map((r) => (r.weightKg !== null ? `${r.weightKg}kg×${r.reps ?? 0}` : r.notes || 'Fait'))
    .join(' · ');

  const perSetHistory = latestRows.map((r) => ({
    weightKg: r.weightKg ?? bestWeight,
    reps: r.reps ?? repsAtBest,
    feeling: r.feeling || ('Modéré' as Feeling),
  }));

  return {
    date: latestDate,
    bestWeight,
    repsAtBest,
    levelWasValidated,
    setsText,
    lastNotes,
    perSetHistory,
  };
}

export function buildWorkoutSession(
  data: ParsedSheetData,
  sessionName: string,
  dateStr: string,
  preCreatedRows?: JournalRow[]
): ActiveWorkoutSession {
  const template =
    data.templates.find((t) => t.id === sessionName) || data.templates[0];

  if (preCreatedRows && preCreatedRows.length > 0) {
    // Group rows by exercise while preserving order
    const exGroups: { name: string; rows: JournalRow[] }[] = [];
    for (const r of preCreatedRows) {
      const last = exGroups[exGroups.length - 1];
      if (!last || last.name !== r.exercise) {
        exGroups.push({ name: r.exercise, rows: [r] });
      } else {
        last.rows.push(r);
      }
    }

    const exercises: ActiveExerciseState[] = exGroups.map((g, idx) => {
      const normKey = normalizeExerciseKey(g.name);
      const matchedProg = template?.exercises.find(
        (pe) => normalizeExerciseKey(pe.name) === normKey
      );
      const lastSummary = getLastExerciseHistory(g.name, data.journalRows, dateStr);
      const isCardio =
        matchedProg?.isCardio ||
        g.name.toLowerCase().includes('cardio') ||
        (g.rows[0]?.targetReps || '').toLowerCase().includes('min');

      const defaultTargetReps = g.rows[0]?.targetReps || matchedProg?.targetReps || '8-10';
      const minTargetRep = parseInt(defaultTargetReps.split('-')[0], 10) || 10;

      const sets: ActiveSetState[] = g.rows.map((r, sIdx) => {
        const histSet =
          lastSummary?.perSetHistory[sIdx] ||
          lastSummary?.perSetHistory[lastSummary.perSetHistory.length - 1];
        const baseWeight = histSet ? histSet.weightKg : lastSummary?.bestWeight || 20;
        const suggestedSetWeight = lastSummary?.levelWasValidated ? baseWeight + 2.5 : baseWeight;
        const suggestedSetReps = histSet ? histSet.reps : lastSummary?.repsAtBest || minTargetRep;
        const isAlreadyDone =
          (r.weightKg !== null && r.weightKg > 0) ||
          (r.reps !== null && r.reps > 0) ||
          r.feeling !== '' ||
          r.notes !== '';

        return {
          setNumber: r.setNumber,
          sheetRowNumber: r.sheetRowNumber,
          wasInitiallyCompleted: isAlreadyDone,
          weightKg:
            r.weightKg !== null && r.weightKg > 0
              ? r.weightKg
              : isCardio
              ? 0
              : suggestedSetWeight,
          reps:
            r.reps !== null && r.reps > 0
              ? r.reps
              : isCardio
              ? 1
              : suggestedSetReps,
          targetReps: r.targetReps || defaultTargetReps,
          rir: r.rir || matchedProg?.rir || '1-2',
          feeling: r.feeling || 'Modéré',
          completed: isAlreadyDone,
          notes: r.notes || '',
        };
      });

      // Pad up to template setsCount if partial session had fewer sets than program
      const targetSetsCount = matchedProg?.setsCount || sets.length;
      while (sets.length < targetSetsCount) {
        const sIdx = sets.length;
        const histSet =
          lastSummary?.perSetHistory[sIdx] ||
          lastSummary?.perSetHistory[lastSummary.perSetHistory.length - 1];
        const baseWeight = histSet
          ? histSet.weightKg
          : sets[sets.length - 1]?.weightKg || lastSummary?.bestWeight || 20;
        const suggestedSetWeight = lastSummary?.levelWasValidated ? baseWeight + 2.5 : baseWeight;
        const suggestedSetReps = histSet
          ? histSet.reps
          : sets[sets.length - 1]?.reps || lastSummary?.repsAtBest || minTargetRep;

        sets.push({
          setNumber: sIdx + 1,
          weightKg: isCardio ? 0 : suggestedSetWeight,
          reps: isCardio ? 1 : suggestedSetReps,
          targetReps: defaultTargetReps,
          rir: matchedProg?.rir || '1-2',
          feeling: 'Modéré',
          completed: false,
          notes: '',
        });
      }

      return {
        exerciseName: g.name,
        codePrefix: matchedProg?.codePrefix || String(idx + 1),
        supersetGroup: matchedProg?.supersetGroup || null,
        targetReps: defaultTargetReps,
        rir: g.rows[0]?.rir || matchedProg?.rir || '1-2',
        restSeconds: matchedProg?.restSeconds || 90,
        restLabel: matchedProg?.restLabel || "1'30",
        instructions: matchedProg?.instructions || '',
        isCardio,
        levelValidated: g.rows.some((r) => r.levelValidated),
        exerciseNotes: g.rows.find((r) => r.notes)?.notes || lastSummary?.lastNotes || '',
        sets,
        lastSessionSummary: lastSummary,
      };
    });

    // Also append any missing exercises from the Program Template so the user can complete/modify all machines!
    const existingKeys = new Set(exercises.map((e) => normalizeExerciseKey(e.exerciseName)));
    for (const pe of template?.exercises || []) {
      if (existingKeys.has(normalizeExerciseKey(pe.name))) continue;

      const lastSummary = getLastExerciseHistory(pe.name, data.journalRows, dateStr);
      const minTargetRep = parseInt(pe.targetReps.split('-')[0], 10) || 10;

      const sets: ActiveSetState[] = Array.from({ length: pe.setsCount }, (_, idx) => {
        const histSet =
          lastSummary?.perSetHistory[idx] ||
          lastSummary?.perSetHistory[lastSummary.perSetHistory.length - 1];
        const baseWeight = histSet ? histSet.weightKg : lastSummary?.bestWeight || 20;
        const suggestedSetWeight = lastSummary?.levelWasValidated ? baseWeight + 2.5 : baseWeight;
        const suggestedSetReps = histSet ? histSet.reps : lastSummary?.repsAtBest || minTargetRep;

        return {
          setNumber: idx + 1,
          weightKg: pe.isCardio ? 0 : suggestedSetWeight,
          reps: pe.isCardio ? 1 : suggestedSetReps,
          targetReps: pe.targetReps,
          rir: pe.rir,
          feeling: 'Modéré',
          completed: false,
          notes: '',
        };
      });

      exercises.push({
        exerciseName: pe.name,
        codePrefix: pe.codePrefix,
        supersetGroup: pe.supersetGroup,
        targetReps: pe.targetReps,
        rir: pe.rir,
        restSeconds: pe.restSeconds,
        restLabel: pe.restLabel,
        instructions: pe.instructions,
        isCardio: pe.isCardio,
        levelValidated: false,
        exerciseNotes: lastSummary?.lastNotes || '',
        sets,
        lastSessionSummary: lastSummary,
      });
    }

    return {
      date: dateStr,
      sessionName,
      fullTitle: template?.fullTitle || sessionName,
      isPreCreatedInSheet: true,
      startedAt: Date.now(),
      exercises,
    };
  }

  // Otherwise build from Program Template
  const exercises: ActiveExerciseState[] = (template?.exercises || []).map((pe) => {
    const lastSummary = getLastExerciseHistory(pe.name, data.journalRows, dateStr);
    const minTargetRep = parseInt(pe.targetReps.split('-')[0], 10) || 10;
    const suggestedWeight = lastSummary
      ? lastSummary.levelWasValidated
        ? lastSummary.bestWeight + 2.5
        : lastSummary.bestWeight
      : 20;

    const sets: ActiveSetState[] = Array.from({ length: pe.setsCount }, (_, idx) => {
      const histSet =
        lastSummary?.perSetHistory[idx] ||
        lastSummary?.perSetHistory[lastSummary.perSetHistory.length - 1];
      const baseWeight = histSet ? histSet.weightKg : lastSummary?.bestWeight || 20;
      const suggestedSetWeight = lastSummary?.levelWasValidated ? baseWeight + 2.5 : baseWeight;
      const suggestedSetReps = histSet ? histSet.reps : lastSummary?.repsAtBest || minTargetRep;

      return {
        setNumber: idx + 1,
        weightKg: pe.isCardio ? 0 : suggestedSetWeight,
        reps: pe.isCardio ? 1 : suggestedSetReps,
        targetReps: pe.targetReps,
        rir: pe.rir,
        feeling: 'Modéré',
        completed: false,
        notes: '',
      };
    });

    return {
      exerciseName: pe.name,
      codePrefix: pe.codePrefix,
      supersetGroup: pe.supersetGroup,
      targetReps: pe.targetReps,
      rir: pe.rir,
      restSeconds: pe.restSeconds,
      restLabel: pe.restLabel,
      instructions: pe.instructions,
      isCardio: pe.isCardio,
      levelValidated: false,
      exerciseNotes: lastSummary?.lastNotes || '',
      sets,
      lastSessionSummary: lastSummary,
    };
  });

  return {
    date: dateStr,
    sessionName,
    fullTitle: template?.fullTitle || sessionName,
    isPreCreatedInSheet: false,
    startedAt: Date.now(),
    exercises,
  };
}

/**
 * Formats a range like "6-8" or "1-2" with a leading apostrophe if needed
 * so Google Sheets never converts it into a Date (e.g. Aug 6 or Feb 1).
 */
function safeSheetString(val: string): string {
  if (!val) return '';
  if (/^\d{1,2}-\d{1,2}$/.test(val.trim())) {
    return `'${val.trim()}`;
  }
  return val;
}

export function buildDeleteSessionOperations(rows: JournalRow[]): BatchOperation[] {
  const ops: BatchOperation[] = [];
  for (const r of rows) {
    if (!r.sheetRowNumber) continue;
    ops.push({
      op: 'write',
      range: `'Journal d'entraînement'!B${r.sheetRowNumber}:M${r.sheetRowNumber}`,
      data: [['', '', '', '', '', '', '', '', '', '', '', '']],
    });
  }
  return ops;
}

export function buildBatchOperationsForSession(
  session: ActiveWorkoutSession,
  lastSheetRowNumber = 125,
  includeAppends = true
): BatchOperation[] {
  const ops: BatchOperation[] = [];
  const appendRows: (string | number)[][] = [];
  let nextAppendRowNum = Math.max(5, lastSheetRowNumber + 1);

  for (const ex of session.exercises) {
    ex.sets.forEach((s, idx) => {
      // If a set was previously completed in the Sheet (editing history) and user unchecked it, clear its values
      if (!s.completed && s.sheetRowNumber && s.wasInitiallyCompleted) {
        const formulaOrZero = ex.isCardio ? '' : `=F${s.sheetRowNumber}*G${s.sheetRowNumber}`;
        ops.push({
          op: 'write',
          range: `'Journal d'entraînement'!B${s.sheetRowNumber}:M${s.sheetRowNumber}`,
          data: [
            [
              session.date,
              session.sessionName,
              ex.exerciseName,
              s.setNumber,
              '',
              '',
              safeSheetString(s.targetReps || ex.targetReps),
              safeSheetString(s.rir || ex.rir),
              '',
              formulaOrZero,
              '',
              '',
            ],
          ],
        });
        return;
      }

      // NEVER emit a write operation for an unvalidated set!
      // Otherwise opening a session and syncing one set would overwrite other rows with blanks.
      if (!s.completed) {
        return;
      }

      const isFirstSet = idx === 0;
      const isLastSet = idx === ex.sets.length - 1;
      const palierStr = (isFirstSet || isLastSet) && ex.levelValidated ? 'Oui' : '';
      const noteStr = s.notes || (isFirstSet ? ex.exerciseNotes : '');

      if (s.sheetRowNumber) {
        const formulaOrZero = ex.isCardio
          ? ''
          : `=F${s.sheetRowNumber}*G${s.sheetRowNumber}`;

        const rowValues: (string | number)[] = [
          session.date,                                // Col B: Date
          session.sessionName,                         // Col C: Séance
          ex.exerciseName,                             // Col D: Exercice
          s.setNumber,                                 // Col E: Série N°
          ex.isCardio ? '' : s.weightKg,               // Col F: Charge (kg)
          ex.isCardio ? '' : s.reps,                   // Col G: Répétitions
          safeSheetString(s.targetReps || ex.targetReps), // Col H: Cible Reps
          safeSheetString(s.rir || ex.rir),            // Col I: RIR
          s.feeling || 'Modéré',                       // Col J: Ressenti
          formulaOrZero,                               // Col K: Tonnage formula preserved
          palierStr,                                   // Col L: Validation Palier
          noteStr,                                     // Col M: Remarques
        ];

        ops.push({
          op: 'write',
          range: `'Journal d'entraînement'!B${s.sheetRowNumber}:M${s.sheetRowNumber}`,
          data: [rowValues],
        });
      } else if (includeAppends) {
        const currentRowNum = nextAppendRowNum++;
        const formulaOrEmpty = ex.isCardio ? '' : `=F${currentRowNum}*G${currentRowNum}`;
        const rowValues: (string | number)[] = [
          session.date,
          session.sessionName,
          ex.exerciseName,
          s.setNumber,
          ex.isCardio ? '' : s.weightKg,
          ex.isCardio ? '' : s.reps,
          safeSheetString(s.targetReps || ex.targetReps),
          safeSheetString(s.rir || ex.rir),
          s.feeling || 'Modéré',
          formulaOrEmpty,
          palierStr,
          noteStr,
        ];
        appendRows.push(rowValues);
      }
    });
  }

  if (includeAppends && appendRows.length > 0) {
    ops.push({
      op: 'append',
      range: `'Journal d'entraînement'!B4:M4`,
      data: appendRows,
    });
  }

  return ops;
}

export async function syncBatchOperations(
  operations: BatchOperation[]
): Promise<{ ok: boolean; via: string; error?: string }> {
  if (operations.length === 0) return { ok: true, via: 'none' };

  // 1. Try local gsheets plugin bridge first
  try {
    const res = await fetch('/api/gsheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'batchWrite', operations }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.ok) {
        return { ok: true, via: 'Plugin Google Sheets direct' };
      }
    }
  } catch {
    // Fallback to Apps Script
  }

  // 2. Try Google Apps Script Web App URL if configured
  const gasUrl = getAppsScriptUrl();
  const apiKey = getApiKey();
  if (gasUrl) {
    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'batchWrite', key: apiKey, operations }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ok) {
          return { ok: true, via: 'Google Apps Script' };
        }
        if (String(json.error || '').toLowerCase().includes('unauthorized')) {
          enqueueOfflineOperations(operations);
          return {
            ok: false,
            via: 'Accès refusé',
            error: json.error || 'Clé secrète API invalide. Vérifie tes paramètres.',
          };
        }
      }
    } catch (err: any) {
      // Save to offline queue
      enqueueOfflineOperations(operations);
      return {
        ok: false,
        via: 'File hors-ligne',
        error: err?.message || 'Réseau indisponible, sauvegardé en local',
      };
    }

    // Cloud configured but failed: queue offline so nothing is lost
    enqueueOfflineOperations(operations);
    return {
      ok: false,
      via: 'Cache Local (en attente de synchro)',
      error: 'Sauvegardé sur le téléphone (prêt à synchroniser)',
    };
  }

  // 3. Guest / Local-only mode: save directly in device localStorage without cloud sync nag
  const currentLocal = loadLocalGuestRawSheets();
  const updatedLocal = applyOperationsToRawSheets(currentLocal, operations);
  localStorage.setItem(STORAGE_KEY_LOCAL_GUEST_SHEETS, JSON.stringify(updatedLocal));
  return {
    ok: true,
    via: 'Mémoire locale du téléphone',
  };
}

export function getOfflineQueue(): BatchOperation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OFFLINE_QUEUE);
    const parsed: BatchOperation[] = raw ? JSON.parse(raw) : [];
    return parsed.filter((item) => {
      if (item.op !== 'write') return true;
      const row = item.data?.[0];
      return Boolean(
        row &&
          ((row[4] !== '' && row[4] !== null && row[4] !== undefined) ||
            (row[5] !== '' && row[5] !== null && row[5] !== undefined) ||
            (row[11] !== '' && row[11] !== null && row[11] !== undefined))
      );
    });
  } catch {
    return [];
  }
}

export function enqueueOfflineOperations(ops: BatchOperation[]): void {
  const current = getOfflineQueue();
  const map = new Map<string, BatchOperation>();
  const appends: BatchOperation[] = [];

  for (const item of [...current, ...ops]) {
    if (item.op === 'write') {
      const row = item.data?.[0];
      const hasData =
        row &&
        ((row[4] !== '' && row[4] !== null && row[4] !== undefined) ||
          (row[5] !== '' && row[5] !== null && row[5] !== undefined) ||
          (row[11] !== '' && row[11] !== null && row[11] !== undefined));
      // Never overwrite an existing non-empty queued write with a blank write
      if (!hasData && map.has(item.range)) {
        continue;
      }
      if (hasData) {
        map.set(item.range, item);
      }
    } else {
      appends.push(item);
    }
  }

  const merged = [...Array.from(map.values()), ...appends];
  localStorage.setItem(STORAGE_KEY_OFFLINE_QUEUE, JSON.stringify(merged));
}

export function clearOfflineQueue(): void {
  localStorage.removeItem(STORAGE_KEY_OFFLINE_QUEUE);
}

export function saveActiveSessionDraft(session: ActiveWorkoutSession | null): void {
  if (!session) {
    localStorage.removeItem(STORAGE_KEY_ACTIVE_SESSION);
  } else {
    localStorage.setItem(STORAGE_KEY_ACTIVE_SESSION, JSON.stringify(session));
  }
}

export function loadActiveSessionDraft(): ActiveWorkoutSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ACTIVE_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function buildFreeWorkoutSession(
  dateStr: string,
  sessionName = 'Séance Libre'
): ActiveWorkoutSession {
  return {
    date: dateStr,
    sessionName: sessionName.trim() || 'Séance Libre',
    fullTitle: sessionName.trim() || 'Séance Libre',
    isPreCreatedInSheet: false,
    startedAt: Date.now(),
    exercises: [],
  };
}

function buildProgramMatrix(templates: ProgramTemplate[], forSheet: boolean): string[][] {
  const rows: string[][] = [];
  for (const tpl of templates) {
    const title = tpl.fullTitle || (tpl.dayBadge && tpl.dayBadge !== tpl.id ? `${tpl.dayBadge} - ${tpl.id}` : tpl.id);
    tpl.exercises.forEach((ex, idx) => {
      const prefix = (ex.codePrefix || String(idx + 1)).trim();
      const hasPrefixAlready = /^\d+[AB]?\.\s*/i.test(ex.name);
      const exDisplay = hasPrefixAlready ? ex.name : `${prefix}. ${ex.name}`;
      const setsReps =
        ex.isCardio && ex.setsCount <= 1
          ? ex.targetReps || '20-25 min'
          : `${Math.max(1, ex.setsCount || 1)}x${ex.targetReps || '8-12'}`;
      const rirVal = forSheet ? safeSheetString(ex.rir || '') : ex.rir || '';
      rows.push([
        title,
        exDisplay,
        setsReps,
        rirVal,
        ex.restLabel || "1'30",
        ex.instructions || '',
      ]);
    });
  }
  return rows;
}

export async function saveProgramTemplates(templates: ProgramTemplate[]): Promise<{
  ok: boolean;
  syncedToSheet: boolean;
  needsScriptUpdate?: boolean;
  error?: string;
}> {
  const localRows = buildProgramMatrix(templates, false);
  const matrixWithHeaders: string[][] = [
    [],
    ['', 'RÉFÉRENCE PROGRAMME'],
    [],
    ['', 'Séance', 'Exercice', 'Séries x Reps', 'RIR', 'Repos', 'Consignes / Notes'],
    ...localRows.map((r) => ['', ...r]),
  ];

  const gasUrl = getAppsScriptUrl();
  if (!gasUrl) {
    const current = loadLocalGuestRawSheets();
    const updated = { ...current, 'Référence Programme': matrixWithHeaders };
    localStorage.setItem(STORAGE_KEY_LOCAL_GUEST_SHEETS, JSON.stringify(updated));
    return { ok: true, syncedToSheet: false };
  }

  // Always save override locally first so UI works immediately even offline or before script redeploy
  localStorage.setItem(STORAGE_KEY_CUSTOM_PROGRAM_OVERRIDE, JSON.stringify(matrixWithHeaders));
  const cached = localStorage.getItem(STORAGE_KEY_SHEETS_CACHE);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      parsed['Référence Programme'] = matrixWithHeaders;
      localStorage.setItem(STORAGE_KEY_SHEETS_CACHE, JSON.stringify(parsed));
    } catch {
      // Ignore
    }
  }

  const sheetRows = buildProgramMatrix(templates, true);
  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveProgram',
        key: getApiKey(),
        rows: sheetRows,
      }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.ok) {
        localStorage.removeItem(STORAGE_KEY_CUSTOM_PROGRAM_OVERRIDE);
        return { ok: true, syncedToSheet: true };
      }
      if (String(json.error || '').includes('Action non reconnue')) {
        return { ok: true, syncedToSheet: false, needsScriptUpdate: true };
      }
      return { ok: true, syncedToSheet: false, error: json.error };
    }
  } catch {
    return { ok: true, syncedToSheet: false };
  }
  return { ok: true, syncedToSheet: false };
}

export function getBodyWeightEntries(): BodyWeightEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BODY_WEIGHT);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BodyWeightEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.date === 'string' && typeof e.weightKg === 'number' && e.weightKg > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export function saveBodyWeightEntriesLocal(entries: BodyWeightEntry[]): BodyWeightEntry[] {
  const byDate = new Map<string, BodyWeightEntry>();
  for (const e of entries) {
    if (!e.date || !e.weightKg || e.weightKg <= 0) continue;
    byDate.set(e.date, { date: e.date, weightKg: Math.round(e.weightKg * 10) / 10, note: e.note || '' });
  }
  const sorted = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  localStorage.setItem(STORAGE_KEY_BODY_WEIGHT, JSON.stringify(sorted));
  return sorted;
}

function mergeAndSaveBodyWeightFromSheet(rawRows: string[][]): BodyWeightEntry[] {
  const remoteEntries: BodyWeightEntry[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r || !r[0]) continue;
    const date = String(r[0]).trim();
    const w = parseFloat(String(r[1] || '').replace(',', '.'));
    if (date && !isNaN(w) && w > 0) {
      remoteEntries.push({ date, weightKg: Math.round(w * 10) / 10, note: String(r[2] || '').trim() });
    }
  }
  if (remoteEntries.length === 0) return getBodyWeightEntries();
  const merged = [...getBodyWeightEntries(), ...remoteEntries];
  return saveBodyWeightEntriesLocal(merged);
}

async function syncBodyWeightToCloud(entries: BodyWeightEntry[]): Promise<boolean> {
  const gasUrl = getAppsScriptUrl();
  if (!gasUrl) return false;
  try {
    const rows = entries.map((e) => [e.date, e.weightKg, e.note || '']);
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'saveBodyWeight', key: getApiKey(), rows }),
    });
    if (res.ok) {
      const json = await res.json();
      return Boolean(json.ok);
    }
  } catch {
    // Best-effort sync
  }
  return false;
}

export async function addBodyWeightEntry(entry: BodyWeightEntry): Promise<{
  entries: BodyWeightEntry[];
  syncedToSheet: boolean;
}> {
  const next = saveBodyWeightEntriesLocal([...getBodyWeightEntries(), entry]);
  const syncedToSheet = await syncBodyWeightToCloud(next);
  return { entries: next, syncedToSheet };
}

export async function deleteBodyWeightEntry(date: string): Promise<{
  entries: BodyWeightEntry[];
  syncedToSheet: boolean;
}> {
  const next = saveBodyWeightEntriesLocal(getBodyWeightEntries().filter((e) => e.date !== date));
  const syncedToSheet = await syncBodyWeightToCloud(next);
  return { entries: next, syncedToSheet };
}

function triggerFileDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportBackupJson(): void {
  const localGuestRaw = localStorage.getItem(STORAGE_KEY_LOCAL_GUEST_SHEETS);
  const overrideRaw = localStorage.getItem(STORAGE_KEY_CUSTOM_PROGRAM_OVERRIDE);

  const payload: ExportBackupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    profileName: getProfileName() || undefined,
    localGuestSheets: localGuestRaw ? JSON.parse(localGuestRaw) : null,
    customProgramOverride: overrideRaw ? JSON.parse(overrideRaw) : null,
    bodyWeightEntries: getBodyWeightEntries(),
  };

  const dateTag = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  triggerFileDownload(blob, `ironpulse-sauvegarde-${dateTag}.json`);
}

export function importBackupJson(rawText: string): { ok: boolean; msg: string } {
  try {
    const parsed = JSON.parse(rawText) as ExportBackupPayload;
    if (!parsed || parsed.version !== 1) {
      return { ok: false, msg: 'Fichier de sauvegarde non reconnu (version invalide).' };
    }
    if (parsed.localGuestSheets && typeof parsed.localGuestSheets === 'object') {
      localStorage.setItem(STORAGE_KEY_LOCAL_GUEST_SHEETS, JSON.stringify(parsed.localGuestSheets));
    }
    if (Array.isArray(parsed.customProgramOverride)) {
      localStorage.setItem(
        STORAGE_KEY_CUSTOM_PROGRAM_OVERRIDE,
        JSON.stringify(parsed.customProgramOverride)
      );
    }
    if (Array.isArray(parsed.bodyWeightEntries)) {
      saveBodyWeightEntriesLocal(parsed.bodyWeightEntries);
    }
    if (typeof parsed.profileName === 'string' && parsed.profileName.trim()) {
      setProfileName(parsed.profileName.trim());
    }
    return { ok: true, msg: 'Sauvegarde restaurée avec succès !' };
  } catch {
    return { ok: false, msg: 'Impossible de lire ce fichier JSON.' };
  }
}

export function exportJournalCsv(journalRows: JournalRow[]): void {
  const escapeCsv = (val: string | number | boolean | null | undefined): string => {
    const str = String(val ?? '');
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    'Date',
    'Séance',
    'Exercice',
    'Série',
    'Charge (kg)',
    'Répétitions',
    'Cible Reps',
    'RIR',
    'Ressenti',
    'Tonnage',
    'Validation Palier',
    'Remarques',
  ];

  const lines = [
    headers.join(';'),
    ...journalRows.map((r) =>
      [
        r.date,
        r.sessionName,
        r.exercise,
        r.setNumber,
        r.weightKg ?? '',
        r.reps ?? '',
        r.targetReps,
        r.rir,
        r.feeling,
        r.tonnage,
        r.levelValidated ? 'Oui' : '',
        r.notes,
      ]
        .map(escapeCsv)
        .join(';')
    ),
  ];

  const dateTag = new Date().toISOString().slice(0, 10);
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  triggerFileDownload(blob, `ironpulse-journal-${dateTag}.csv`);
}

export function saveSessionDuration(date: string, sessionName: string, durationMinutes: number): void {
  if (!date || !sessionName || durationMinutes <= 0) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION_DURATIONS);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    map[`${date}__${sessionName}`] = Math.max(1, Math.round(durationMinutes));
    localStorage.setItem(STORAGE_KEY_SESSION_DURATIONS, JSON.stringify(map));
  } catch {
    // Ignore storage quota issues
  }
}

export function getSessionDuration(date: string, sessionName: string): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION_DURATIONS);
    if (!raw) return null;
    const map: Record<string, number> = JSON.parse(raw);
    const val = map[`${date}__${sessionName}`];
    return typeof val === 'number' && val > 0 ? val : null;
  } catch {
    return null;
  }
}

