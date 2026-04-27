import { useAuthStore } from '../store/authStore';

function stripWrappingQuotes(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

function normalizeApiBaseUrl(value: unknown): string {
  const normalized = stripWrappingQuotes(value).replace(/\/+$/, '');
  return normalized;
}

const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL) || '/api';

export function resolveApiMediaUrl(value: string | null | undefined): string | null {
  const raw = stripWrappingQuotes(value);
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }

  if (!/^https?:\/\//i.test(API_BASE_URL)) {
    return raw;
  }

  try {
    return new URL(raw, `${API_BASE_URL}/`).toString();
  } catch {
    return raw;
  }
}

export type UnauthorizedReason = 'taken_over' | 'expired';

let onUnauthorized: ((failedToken: string, reason: UnauthorizedReason) => void) | null = null;
export function setOnUnauthorized(cb: (failedToken: string, reason: UnauthorizedReason) => void) {
  onUnauthorized = cb;
}

function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}

interface ApiErrorPayload {
  error?: string;
  code?: string;
}

export interface StudentAuthUser {
  id: string;
  fullName: string;
  grade: number;
  language: 'ru' | 'kg';
  username: string;
  accountType?: 'ort' | 'medical' | 'manas';
  manasTrack?: 'all_subjects' | 'humanities' | 'exact_sciences' | null;
  programCode?: string | null;
  programName?: string | null;
}

export interface StudentLoginResponse {
  token: string;
  student: StudentAuthUser;
}

export interface TreeLine {
  grade: number;
  required: number;
  available: number;
  label: string;
  part_count?: number;
  part_question_count?: number;
  usable_question_total?: number;
}

export interface MainTreeItem {
  id: string;
  title: string;
  required_total: number;
  available_total: number;
  video_lesson_count?: number;
  playable_video_lesson_count?: number;
  status: 'ready' | 'locked';
  lines: TreeLine[];
}

export interface TrialTreeSubject {
  id: string;
  title: string;
  display_name: string;
  required_total: number;
  available_total: number;
  status: 'ready' | 'locked';
  lines: TreeLine[];
  fetch_parts?: {
    subject: string;
    table: string;
    questionType: 'math' | 'logic';
    curr: number;
    prev: number;
    required?: number;
    available?: number;
  }[];
}

export interface TrialTreeRound {
  id: number;
  title: string;
  required_total: number;
  available_total: number;
  status: 'ready' | 'locked';
  subjects: TrialTreeSubject[];
}

export interface BranchInfo {
  grade: number;
  language: 'ru' | 'kg';
  title: string;
  class_title: string;
  language_title: string;
}

export interface AvailableMainNode {
  id: 'MAIN';
  title: string;
  status: 'ready' | 'locked';
  items: MainTreeItem[];
}

export interface AvailableTrialNode {
  id: 'TRIAL';
  title: string;
  status: 'ready' | 'locked';
  rounds: TrialTreeRound[];
}

export interface AvailableResponse {
  student: StudentAuthUser;
  branch: BranchInfo;
  test_types: [AvailableMainNode, AvailableTrialNode];
}

export interface VideoLesson {
  id: string;
  subjectCode: string;
  subjectTitle: string;
  lessonNo: number | null;
  sortOrder: number;
  lessonKey: string;
  title: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  streamType: 'pending' | 'mp4' | 'hls' | string;
  playbackUrl: string | null;
  hlsUrl: string | null;
  mp4Url: string | null;
  posterUrl: string | null;
  previewUrl: string | null;
  isPlayable: boolean;
  isPublished: boolean;
  storageProvider: string;
  relativePath: string;
  durationSeconds: number | null;
  meta: Record<string, unknown>;
}

export interface SubjectVideoResponse {
  program: {
    code: string;
    name: string;
    accountType: string;
    manasTrack: string | null;
  };
  subject: {
    code: string;
    title: string;
    lessonCount: number;
    playableCount: number;
  };
  lessons: VideoLesson[];
}

export interface GeneratedQuestion {
  id: string;
  text: string;
  options: Array<{ text: string }>;
  topic: string;
  imageUrl: string;
  question_type?: 'math' | 'logic';
}

export interface GeneratedTestResponse {
  test_session_id: string;
  test_info: {
    type: 'MAIN' | 'TRIAL';
    subject: string | null;
    round: number | null;
    part: number | null;
    language: 'ru' | 'kg';
    grade: number;
    grade_window: [number, number];
  };
  breakdown: Record<string, { total: number; by_grade: Record<string, number> }>;
  total_questions: number;
  questions: GeneratedQuestion[];
}

export interface AnswerQuestionResponse {
  is_correct: boolean;
  correct_index: number;
  explanation: string;
  can_continue: boolean;
  answered_count: number;
  total_questions: number;
}

export interface SubmitTestResponse {
  message: string;
  score: number;
  correct: number;
  answered: number;
  total: number;
}

type RequestMethod = 'GET' | 'POST';

async function request<T>(
  path: string,
  method: RequestMethod,
  payload?: unknown,
  token?: string,
  signal?: AbortSignal,
): Promise<T> {
  const headers = new Headers();
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal,
  });

  const refreshedToken = response.headers.get('X-Student-Token');
  if (refreshedToken) {
    useAuthStore.getState().setToken(refreshedToken);
  }

  const raw = await response.text();
  let data: ApiErrorPayload | null = null;
  if (raw) {
    try {
      data = JSON.parse(raw) as ApiErrorPayload;
    } catch {
      data = { error: raw };
    }
  }

  if (!response.ok) {
    const errorMessage =
      (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : null) ||
      `Request failed with status ${response.status}`;
    const errorCode = data && typeof data === 'object' && typeof data.code === 'string' ? data.code : null;
    // SESSION_TAKEN_OVER (logged in from another device) always triggers logout,
    // even on POST — the user must be told. Otherwise, only GET 401 auto-logs-out
    // (POST 401 during a test surfaces as a UI error and preserves test state).
    const isTakenOver = response.status === 401 && errorCode === 'SESSION_TAKEN_OVER';
    if (isTakenOver || (response.status === 401 && method === 'GET')) {
      // Only trigger logout if the token that failed is still the active token.
      // A concurrent request may have already refreshed it.
      const currentToken = useAuthStore.getState().token;
      if (!currentToken || currentToken === token) {
        onUnauthorized?.(token || '', isTakenOver ? 'taken_over' : 'expired');
      }
    }
    throw new Error(errorMessage);
  }

  return data as T;
}

export function loginStudent(username: string, password: string) {
  return request<StudentLoginResponse>('/tests/login', 'POST', { username, password });
}

export function fetchAvailableTests(signal?: AbortSignal) {
  return request<AvailableResponse>('/tests/available', 'GET', undefined, getAuthToken() ?? undefined, signal);
}

export function fetchSubjectVideos(subjectCode: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ subject: subjectCode });
  return request<SubjectVideoResponse>(`/tests/videos?${query.toString()}`, 'GET', undefined, getAuthToken() ?? undefined, signal);
}

export function generateStudentTest(
  payload: {
    type: 'MAIN' | 'TRIAL';
    subject?: string;
    round?: number;
    grade?: number;
    part?: number;
  },
) {
  return request<GeneratedTestResponse>('/tests/generate', 'POST', payload, getAuthToken() ?? undefined);
}

export function answerStudentQuestion(
  payload: {
    test_session_id: string;
    type: 'MAIN' | 'TRIAL';
    question_id: string;
    selected_index: number;
  },
) {
  return request<AnswerQuestionResponse>('/tests/answer', 'POST', payload, getAuthToken() ?? undefined);
}

export function submitStudentTest(
  payload: {
    test_session_id: string;
    type: 'MAIN' | 'TRIAL';
  },
) {
  return request<SubmitTestResponse>('/tests/submit', 'POST', payload, getAuthToken() ?? undefined);
}

export interface ScreenshotViolationResponse {
  action: 'warning' | 'blocked_48h' | 'blocked_permanent';
  strikes: number;
}

export function reportScreenshotViolation() {
  return request<ScreenshotViolationResponse>('/tests/screenshot-violation', 'POST', {}, getAuthToken() ?? undefined);
}

export interface TestHistoryEntry {
  id: string;
  type: 'MAIN' | 'TRIAL';
  subject: string | null;
  round: number | null;
  part: number | null;
  total_questions: number;
  correct_count: number;
  score_percent: number;
  submitted_at: string;
  created_at: string;
}

export interface TestHistoryQuestion {
  index: number;
  id: string;
  subject: string;
  grade: number;
  text: string;
  options: Array<{ text: string }>;
  topic: string;
  image_url: string;
  explanation: string;
  selected_index: number;
  correct_index: number;
  is_correct: boolean;
  answered: boolean;
}

export interface TestHistoryDetail extends TestHistoryEntry {
  questions: TestHistoryQuestion[];
}

export async function fetchTestHistory(signal?: AbortSignal) {
  return request<{ history: TestHistoryEntry[] }>('/tests/history', 'GET', undefined, getAuthToken() ?? undefined, signal);
}

export async function fetchTestHistoryDetail(id: string, type: string, signal?: AbortSignal) {
  return request<TestHistoryDetail>(`/tests/history/${id}?type=${type}`, 'GET', undefined, getAuthToken() ?? undefined, signal);
}

export function pingSession(signal?: AbortSignal) {
  return request<{ ok: true; studentId: string }>('/tests/session/heartbeat', 'GET', undefined, getAuthToken() ?? undefined, signal);
}
