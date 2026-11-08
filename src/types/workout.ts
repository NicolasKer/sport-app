export type Feeling = 'Facile' | 'Modéré' | 'Difficile' | '';

export interface JournalRow {
  /** 1-based row number in Google Sheet 'Journal d'entraînement' (e.g., 5..125) */
  sheetRowNumber?: number;
  date: string;         // Col B (ex: '2026-11-04')
  sessionName: string;  // Col C (ex: 'Lower + Cardio', 'Full Body', 'Upper')
  exercise: string;     // Col D (ex: 'Hack Squat')
  setNumber: number;    // Col E (ex: 1, 2, 3, 4)
  weightKg: number | null; // Col F (ex: 120)
  reps: number | null;     // Col G (ex: 8)
  targetReps: string;   // Col H (ex: '6-8', '10-12', '25-30 min')
  rir: string;          // Col I (ex: '1-2', '0-1', '0')
  feeling: Feeling;     // Col J ('Facile' | 'Modéré' | 'Difficile')
  tonnage: number;      // Col K (weight * reps)
  levelValidated: boolean; // Col L ('Oui' or '')
  notes: string;        // Col M (Remarques)
}

export interface ProgramExercise {
  rawSessionTitle: string; // ex: 'Lundi midi - Upper'
  shortSessionName: string; // ex: 'Upper', 'Lower + Cardio', 'Full Body'
  codePrefix: string;      // ex: '1', '5A', '5B', '6A', '6B', '7'
  supersetGroup: string | null; // ex: '5' for 5A/5B, '6' for 6A/6B
  name: string;            // ex: 'Développé Couché Haltères'
  setsCount: number;       // ex: 3, 4, 1
  targetReps: string;      // ex: '6-8', '10-12', '25-30 min'
  rir: string;             // ex: '1-2'
  restSeconds: number;     // ex: 150 for 2'30, 45 for 45s
  restLabel: string;       // ex: "2'30"
  instructions: string;    // Col G (Consignes / Notes)
  isCardio: boolean;
}

export interface ProgramTemplate {
  id: string;              // 'Upper' | 'Lower + Cardio' | 'Full Body'
  fullTitle: string;       // 'Lundi midi - Upper'
  dayBadge: string;        // 'Lundi midi'
  icon: 'upper' | 'lower' | 'full';
  exercises: ProgramExercise[];
}

export interface ActiveSetState {
  setNumber: number;
  sheetRowNumber?: number;
  wasInitiallyCompleted?: boolean;
  weightKg: number;
  reps: number;
  targetReps: string;
  rir: string;
  feeling: Feeling;
  completed: boolean;
  notes: string;
}

export interface ActiveExerciseState {
  exerciseName: string;
  codePrefix: string;
  supersetGroup: string | null;
  targetReps: string;
  rir: string;
  restSeconds: number;
  restLabel: string;
  instructions: string;
  isCardio: boolean;
  levelValidated: boolean;
  exerciseNotes: string;
  sets: ActiveSetState[];
  lastSessionSummary?: {
    date: string;
    bestWeight: number;
    repsAtBest: number;
    levelWasValidated: boolean;
    setsText: string;
    lastNotes: string;
    perSetHistory: { weightKg: number; reps: number; feeling: Feeling }[];
  };
}

export interface ActiveWorkoutSession {
  date: string;
  sessionName: string; // 'Upper' | 'Lower + Cardio' | 'Full Body'
  fullTitle: string;
  isPreCreatedInSheet: boolean;
  startedAt: number;
  exercises: ActiveExerciseState[];
}

export interface BatchOperation {
  op: 'write' | 'append';
  range: string;
  data: (string | number)[][];
}
