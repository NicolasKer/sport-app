import initialSeed from '../data/initialSheetData.json';
import {
  ActiveExerciseState,
  ActiveSetState,
  ActiveWorkoutSession,
  BatchOperation,
  Feeling,
  JournalRow,
  ProgramExercise,
  ProgramTemplate,
} from '../types/workout';

const STORAGE_KEY_SHEETS_CACHE = 'ironpulse_sheets_cache_v3';
const STORAGE_KEY_APPS_SCRIPT_URL = 'ironpulse_apps_script_url_v2';
const DEFAULT_APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyOc8ZcDyqD613HnssoCJBN6T0QgR2i6Div1AVqV-XxUwvT-H-MEwwXajZejCbadsPQfg/exec';
const STORAGE_KEY_OFFLINE_QUEUE = 'ironpulse_offline_queue_v3';
const STORAGE_KEY_ACTIVE_SESSION = 'ironpulse_active_session_v3';

export interface ParsedSheetData {
  journalRows: JournalRow[];
  templates: ProgramTemplate[];
  preCreatedSessions: {
    date: string;
    sessionName: string;
    rows: JournalRow[];
  }[];
  source: 'gsheets-plugin' | 'apps-script' | 'local-cache';
}

export function getAppsScriptUrl(): string {
  return localStorage.getItem(STORAGE_KEY_APPS_SCRIPT_URL) || DEFAULT_APPS_SCRIPT_URL;
}

export function setAppsScriptUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY_APPS_SCRIPT_URL, url.trim());
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

export function applyOfflineQueueToRawSheets(
  rawSheets: Record<string, string[][]>
): Record<string, string[][]> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return rawSheets;

  const cloned: Record<string, string[][]> = {
    ...rawSheets,
    "Journal d'entraînement": (rawSheets["Journal d'entraînement"] || []).map((r) => [...r]),
  };
  const journal = cloned["Journal d'entraînement"];

  for (const op of queue) {
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
    const setsRepsRaw = String(row[3] || '').trim();
    const rir = String(row[4] || '').trim();
    const restLabel = String(row[5] || '').trim();
    const instructions = String(row[6] || '').trim();

    let shortSessionName = rawSessionTitle;
    if (rawSessionTitle.toLowerCase().includes('upper')) shortSessionName = 'Upper';
    else if (rawSessionTitle.toLowerCase().includes('lower')) shortSessionName = 'Lower + Cardio';
    else if (rawSessionTitle.toLowerCase().includes('full body')) shortSessionName = 'Full Body';

    const prefixMatch = rawExName.match(/^(\d+[AB]?)\.\s*(.+)$/i);
    const codePrefix = prefixMatch ? prefixMatch[1].toUpperCase() : String(programExercises.length + 1);
    const cleanName = prefixMatch ? prefixMatch[2].trim() : rawExName;

    const supersetMatch = codePrefix.match(/^(\d+)[AB]$/i);
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
      const icon =
        ex.shortSessionName === 'Upper'
          ? 'upper'
          : ex.shortSessionName.includes('Lower')
          ? 'lower'
          : 'full';
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

  // Ensure Full Body also has its Finisher Cardio if present in Journal
  const fullBodyTpl = templateMap.get('Full Body');
  if (fullBodyTpl && !fullBodyTpl.exercises.some((e) => e.isCardio)) {
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

export async function fetchSheetData(): Promise<ParsedSheetData> {
  // 1. Try local Antigravity gsheets plugin bridge (/api/gsheets)
  try {
    const res = await fetch('/api/gsheets', { method: 'GET' });
    if (res.ok) {
      const json = await res.json();
      if (json.ok && json.sheets) {
        localStorage.setItem(STORAGE_KEY_SHEETS_CACHE, JSON.stringify(json.sheets));
        return parseSheetsPayload(json.sheets, 'gsheets-plugin');
      }
    }
  } catch {
    // Bridge not reachable (e.g. static mobile hosting), fallback to Apps Script or cache
  }

  // 2. Try Google Apps Script Web App URL if configured
  const gasUrl = getAppsScriptUrl();
  if (gasUrl) {
    try {
      const res = await fetch(gasUrl, { method: 'GET' });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.sheets) {
          localStorage.setItem(STORAGE_KEY_SHEETS_CACHE, JSON.stringify(json.sheets));
          return parseSheetsPayload(json.sheets, 'apps-script');
        }
      }
    } catch {
      // Offline or error
    }
  }

  // 3. Fallback to LocalStorage cache or bundled seed from Google Sheet
  const cached = localStorage.getItem(STORAGE_KEY_SHEETS_CACHE);
  if (cached) {
    try {
      return parseSheetsPayload(JSON.parse(cached), 'local-cache');
    } catch {
      // Ignore corrupt cache
    }
  }

  return parseSheetsPayload(initialSeed as Record<string, string[][]>, 'local-cache');
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

  return {
    date: latestDate,
    bestWeight,
    repsAtBest,
    levelWasValidated,
    setsText,
    lastNotes,
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
      const suggestedWeight = lastSummary
        ? lastSummary.levelWasValidated
          ? lastSummary.bestWeight + 2.5
          : lastSummary.bestWeight
        : 20;

      const sets: ActiveSetState[] = g.rows.map((r) => ({
        setNumber: r.setNumber,
        sheetRowNumber: r.sheetRowNumber,
        weightKg: r.weightKg !== null && r.weightKg > 0 ? r.weightKg : isCardio ? 0 : suggestedWeight,
        reps: r.reps !== null && r.reps > 0 ? r.reps : isCardio ? 1 : lastSummary?.repsAtBest || minTargetRep,
        targetReps: r.targetReps || defaultTargetReps,
        rir: r.rir || matchedProg?.rir || '1-2',
        feeling: r.feeling || 'Modéré',
        completed:
          (r.weightKg !== null && r.weightKg > 0) ||
          (r.reps !== null && r.reps > 0) ||
          r.feeling !== '',
        notes: r.notes || '',
      }));

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

    const sets: ActiveSetState[] = Array.from({ length: pe.setsCount }, (_, idx) => ({
      setNumber: idx + 1,
      weightKg: pe.isCardio ? 0 : suggestedWeight,
      reps: pe.isCardio ? 1 : lastSummary?.repsAtBest || minTargetRep,
      targetReps: pe.targetReps,
      rir: pe.rir,
      feeling: 'Modéré',
      completed: false,
      notes: '',
    }));

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

export function buildBatchOperationsForSession(
  session: ActiveWorkoutSession,
  lastSheetRowNumber = 125
): BatchOperation[] {
  const ops: BatchOperation[] = [];
  const appendRows: (string | number)[][] = [];
  let nextAppendRowNum = Math.max(5, lastSheetRowNumber + 1);

  for (const ex of session.exercises) {
    ex.sets.forEach((s, idx) => {
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
      } else {
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

  if (appendRows.length > 0) {
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

  // 2. Try Google Apps Script Web App URL
  const gasUrl = getAppsScriptUrl();
  if (gasUrl) {
    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'batchWrite', operations }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ok) {
          return { ok: true, via: 'Google Apps Script' };
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
  }

  // 3. Save in offline queue so nothing is lost
  enqueueOfflineOperations(operations);
  return {
    ok: false,
    via: 'Cache Local (en attente de synchro)',
    error: 'Sauvegardé sur le téléphone (prêt à synchroniser)',
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
