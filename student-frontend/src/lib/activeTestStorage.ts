import type { AnswerQuestionResponse, GeneratedTestResponse } from './api';

const ACTIVE_TEST_STORAGE_KEY = 'student-active-test';

export interface ActiveTestProgressSnapshot {
  currentQuestionIndex: number;
  selectedAnswers: Record<string, number>;
  revealedAnswers: Record<string, AnswerQuestionResponse>;
  tabSwitchCount: number;
  bypassedFullscreen: boolean;
}

export interface PersistedActiveTestSnapshot {
  studentId: string;
  sessionId: string;
  testData: GeneratedTestResponse;
  progress: ActiveTestProgressSnapshot;
  savedAt: string;
}

function getStorage() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

function getDefaultProgress(): ActiveTestProgressSnapshot {
  return {
    currentQuestionIndex: 0,
    selectedAnswers: {},
    revealedAnswers: {},
    tabSwitchCount: 0,
    bypassedFullscreen: false,
  };
}

function normalizeProgress(
  progress?: Partial<ActiveTestProgressSnapshot> | null,
): ActiveTestProgressSnapshot {
  return {
    currentQuestionIndex:
      typeof progress?.currentQuestionIndex === 'number' && Number.isFinite(progress.currentQuestionIndex)
        ? progress.currentQuestionIndex
        : 0,
    selectedAnswers: progress?.selectedAnswers ?? {},
    revealedAnswers: progress?.revealedAnswers ?? {},
    tabSwitchCount:
      typeof progress?.tabSwitchCount === 'number' && Number.isFinite(progress.tabSwitchCount)
        ? progress.tabSwitchCount
        : 0,
    bypassedFullscreen: Boolean(progress?.bypassedFullscreen),
  };
}

function parseSnapshot(rawValue: string | null): PersistedActiveTestSnapshot | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedActiveTestSnapshot>;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (typeof parsed.studentId !== 'string' || typeof parsed.sessionId !== 'string') {
      return null;
    }

    const testData = parsed.testData as GeneratedTestResponse | undefined;
    if (!testData || typeof testData !== 'object' || testData.test_session_id !== parsed.sessionId) {
      return null;
    }

    return {
      studentId: parsed.studentId,
      sessionId: parsed.sessionId,
      testData,
      progress: normalizeProgress(parsed.progress),
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function createActiveTestSnapshot(
  studentId: string,
  testData: GeneratedTestResponse,
  progress?: Partial<ActiveTestProgressSnapshot> | null,
): PersistedActiveTestSnapshot {
  return {
    studentId,
    sessionId: testData.test_session_id,
    testData,
    progress: normalizeProgress(progress),
    savedAt: new Date().toISOString(),
  };
}

export function loadActiveTestSnapshot(expectedSessionId?: string | null, expectedStudentId?: string | null) {
  const snapshot = parseSnapshot(getStorage()?.getItem(ACTIVE_TEST_STORAGE_KEY) ?? null);
  if (!snapshot) {
    return null;
  }

  if (expectedSessionId && snapshot.sessionId !== expectedSessionId) {
    return null;
  }

  if (expectedStudentId && snapshot.studentId !== expectedStudentId) {
    return null;
  }

  return snapshot;
}

export function saveActiveTestSnapshot(snapshot: PersistedActiveTestSnapshot) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(ACTIVE_TEST_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota / browser restrictions.
  }
}

export function clearActiveTestSnapshot(expectedSessionId?: string | null, expectedStudentId?: string | null) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  if (!expectedSessionId && !expectedStudentId) {
    storage.removeItem(ACTIVE_TEST_STORAGE_KEY);
    return;
  }

  const currentSnapshot = parseSnapshot(storage.getItem(ACTIVE_TEST_STORAGE_KEY));
  if (!currentSnapshot) {
    storage.removeItem(ACTIVE_TEST_STORAGE_KEY);
    return;
  }

  if (expectedSessionId && currentSnapshot.sessionId !== expectedSessionId) {
    return;
  }

  if (expectedStudentId && currentSnapshot.studentId !== expectedStudentId) {
    return;
  }

  storage.removeItem(ACTIVE_TEST_STORAGE_KEY);
}

export function getDefaultActiveTestProgress() {
  return getDefaultProgress();
}
