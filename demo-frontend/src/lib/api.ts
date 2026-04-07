const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(cb: () => void) {
  onUnauthorized = cb;
}

interface ApiErrorPayload {
  error?: string;
}

export interface StudentAuthUser {
  id: string;
  fullName: string;
  grade: number;
  language: 'ru' | 'kg';
  username: string;
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
    if (response.status === 401 || (typeof errorMessage === 'string' && /invalid|expired|token/i.test(errorMessage))) {
      onUnauthorized?.();
    }
    throw new Error(errorMessage);
  }

  return data as T;
}

export function loginStudent(username: string, password: string) {
  return request<StudentLoginResponse>('/tests/login', 'POST', { username, password });
}

export function fetchAvailableTests(token: string, signal?: AbortSignal) {
  return request<AvailableResponse>('/tests/available', 'GET', undefined, token, signal);
}

export function generateStudentTest(
  token: string,
  payload: {
    type: 'MAIN' | 'TRIAL';
    subject?: string;
    round?: number;
    grade?: number;
    part?: number;
  },
) {
  return request<GeneratedTestResponse>('/tests/generate', 'POST', payload, token);
}

export function answerStudentQuestion(
  token: string,
  payload: {
    test_session_id: string;
    type: 'MAIN' | 'TRIAL';
    question_id: string;
    selected_index: number;
  },
) {
  return request<AnswerQuestionResponse>('/tests/answer', 'POST', payload, token);
}

export function submitStudentTest(
  token: string,
  payload: {
    test_session_id: string;
    type: 'MAIN' | 'TRIAL';
  },
) {
  return request<SubmitTestResponse>('/tests/submit', 'POST', payload, token);
}

export interface ScreenshotViolationResponse {
  action: 'warning' | 'blocked_48h' | 'blocked_permanent';
  strikes: number;
}

export function reportScreenshotViolation(token: string) {
  return request<ScreenshotViolationResponse>('/tests/screenshot-violation', 'POST', {}, token);
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
  selected_index: number;
  correct_index: number;
  is_correct: boolean;
  answered: boolean;
}

export interface TestHistoryDetail extends TestHistoryEntry {
  questions: TestHistoryQuestion[];
}

export async function fetchTestHistory(token: string, signal?: AbortSignal) {
  return request<{ history: TestHistoryEntry[] }>('/tests/history', 'GET', undefined, token, signal);
}

export async function fetchTestHistoryDetail(token: string, id: string, type: string, signal?: AbortSignal) {
  return request<TestHistoryDetail>(`/tests/history/${id}?type=${type}`, 'GET', undefined, token, signal);
}

export interface DemoTreeLine {
  grade: number;
  required: number;
  available: number;
  label: string;
  status: 'ready' | 'locked';
  demo_question_count: number;
}

export interface DemoMainTreeItem {
  id: string;
  title: string;
  required_total: number;
  available_total: number;
  status: 'ready' | 'locked';
  lines: DemoTreeLine[];
}

export interface DemoAvailableMainNode {
  id: 'MAIN';
  title: string;
  status: 'ready' | 'locked';
  items: DemoMainTreeItem[];
}

export interface DemoAvailableResponse {
  branch: {
    language: 'ru' | 'kg';
    title: string;
    class_title: string;
    language_title: string;
  };
  test_types: [DemoAvailableMainNode];
}

export function fetchDemoAvailableTests(language: 'ru' | 'kg', signal?: AbortSignal) {
  return request<DemoAvailableResponse>(`/demo-tests/available?language=${language}`, 'GET', undefined, undefined, signal);
}

export function generateDemoTest(payload: { subject: string; grade: number; language: 'ru' | 'kg' }) {
  return request<GeneratedTestResponse>('/demo-tests/generate', 'POST', payload);
}

export function answerDemoQuestion(
  payload: {
    test_session_id: string;
    question_id: string;
    selected_index: number;
  },
) {
  return request<AnswerQuestionResponse>('/demo-tests/answer', 'POST', payload);
}

export function submitDemoTest(payload: { test_session_id: string }) {
  return request<SubmitTestResponse>('/demo-tests/submit', 'POST', payload);
}
