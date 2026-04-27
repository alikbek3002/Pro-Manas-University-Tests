import { useAdminAuthStore } from '@/store/authStore';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

interface ApiErrorPayload {
  error?: string;
}

export interface AdminIdentity {
  username: string;
}

export type AccountType = 'ort' | 'medical' | 'manas';
export type ManasTrack = 'all_subjects' | 'humanities' | 'exact_sciences' | null;

export interface Student {
  id: string;
  fullName: string;
  accountType: AccountType;
  accountTypeTitle: string;
  manasTrack: ManasTrack;
  manasTrackTitle: string;
  programCode: string | null;
  programName: string | null;
  username: string;
  password: string;
  createdAt: string;
  notes: string;
  expiresAt: string | null;
  phone: string;
  amount: number;
  isActive: boolean;
  class: string;
  language: string;
}

interface StudentsResponse {
  students: Student[];
}

export interface FetchStudentsParams {
  search?: string;
  accountType?: AccountType;
  programCode?: string;
}

interface StudentResponse {
  student: Student;
}

interface LoginResponse {
  token: string;
  admin: AdminIdentity;
}

export interface CreateStudentPayload {
  fullName: string;
  accountType: AccountType;
  manasTrack?: Exclude<ManasTrack, null>;
  programCode?: string;
  username?: string;
  password?: string;
  phone?: string;
  amount?: number;
}

export interface UpdateStudentPayload {
  fullName?: string;
  accountType?: AccountType;
  manasTrack?: Exclude<ManasTrack, null> | null;
  programCode?: string;
  username?: string;
  password?: string;
  notes?: string;
  phone?: string;
  amount?: number;
  isActive?: boolean;
}

export interface ProgramOption {
  code: string;
  name: string;
  account_type: AccountType;
  manas_track: ManasTrack;
  description?: string;
  is_active?: boolean;
}

export interface QuestionCatalogProgram {
  code: string;
  name: string;
  accountType: AccountType;
  manasTrack: ManasTrack;
  subjects: Array<{
    code: string;
    title: string;
  }>;
}

export interface VideoCatalogLesson {
  id: string;
  lessonNo: number | null;
  title: string;
  filename: string;
  sizeBytes: number;
  isPlayable: boolean;
  streamType: string;
}

export interface VideoCatalogSubject {
  subjectCode: string;
  subjectTitle: string;
  lessonCount: number;
  playableCount: number;
  totalSizeBytes: number;
  lessons: VideoCatalogLesson[];
}

export interface VideoCatalogProgram {
  programCode: string;
  programTitle: string;
  accountType: string;
  manasTrack: string | null;
  totalLessons: number;
  playableLessons: number;
  totalSizeBytes: number;
  subjects: VideoCatalogSubject[];
}

export interface Question {
  id: string;
  question_text: string;
  options: Array<{ text: string; is_correct: boolean }>;
  explanation: string;
  image_url: string;
  created_at: string;
  tags?: string[];
  subject_code?: string | null;
  subject_title?: string | null;
  template_code?: string | null;
  template_title?: string | null;
  program_code?: string;
  program_name?: string;
}

interface QuestionsResponse {
  questions: Question[];
  table: string;
  total: number;
}

export interface AddQuestionPayload {
  programCode: string;
  subjectCode: string;
  questionText: string;
  options: Array<{ text: string; is_correct: boolean }>;
  explanation?: string;
  imageUrl?: string;
  templateCode?: string;
  tags?: string[];
}

export interface FetchQuestionsParams {
  programCode: string;
  subjectCode?: string;
  search?: string;
}

type RequestMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

async function request<T>(
  path: string,
  method: RequestMethod,
  payload?: unknown,
  requireAuth = true,
  signal?: AbortSignal,
): Promise<T> {
  const token = useAdminAuthStore.getState().token;
  if (requireAuth && !token) {
    throw new Error('Не выполнен вход администратора');
  }

  const headers = new Headers();
  headers.set('Content-Type', 'application/json');
  if (requireAuth && token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal,
  });

  const text = await response.text();
  let data: ApiErrorPayload | null = null;
  if (text) {
    try {
      data = JSON.parse(text) as ApiErrorPayload;
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    const errorMessage =
      (data && typeof data === 'object' && 'error' in data && data.error) ||
      `Request failed with status ${response.status}`;
    throw new Error(errorMessage);
  }

  return data as T;
}

export function adminLogin(username: string, password: string) {
  return request<LoginResponse>(
    '/admin/login',
    'POST',
    { username, password },
    false,
  );
}

export async function fetchPrograms() {
  const response = await request<{ programs: ProgramOption[] }>('/admin/programs', 'GET');
  return response.programs;
}

export async function fetchStudents(params: FetchStudentsParams = {}) {
  const query = new URLSearchParams();

  if (params.search?.trim()) {
    query.set('search', params.search.trim());
  }

  if (params.accountType) {
    query.set('accountType', params.accountType);
  }

  if (params.programCode?.trim()) {
    query.set('programCode', params.programCode.trim());
  }

  const suffix = query.toString() ? `?${query.toString()}` : '';
  const response = await request<StudentsResponse>(`/admin/students${suffix}`, 'GET');
  return response.students;
}

export async function createStudent(payload: CreateStudentPayload) {
  const response = await request<StudentResponse>('/admin/students', 'POST', payload);
  return response.student;
}

export function deleteStudent(studentId: string) {
  return request<null>(`/admin/students/${studentId}`, 'DELETE');
}

export async function extendStudent(studentId: string, days: number) {
  const response = await request<StudentResponse>(`/admin/students/${studentId}/extend`, 'PATCH', { days });
  return response.student;
}

export async function updateStudent(studentId: string, payload: UpdateStudentPayload) {
  const response = await request<StudentResponse>(`/admin/students/${studentId}`, 'PATCH', payload);
  return response.student;
}

export interface BlockedStudent extends Student {
  screenshotStrikes: number;
  blockedUntil: string | null;
  blockedPermanently: boolean;
}

export async function fetchBlockedStudents() {
  const response = await request<{ students: BlockedStudent[] }>('/admin/blocked-students', 'GET');
  return response.students;
}

export function unblockStudent(studentId: string) {
  return request<{ message: string }>(`/admin/unblock-student/${studentId}`, 'POST');
}

export async function fetchQuestionCatalog() {
  const response = await request<{ programs: QuestionCatalogProgram[] }>('/admin/questions/catalog', 'GET');
  return response.programs;
}

export async function fetchVideoCatalog() {
  const response = await request<{ programs: VideoCatalogProgram[] }>('/admin/videos/catalog', 'GET');
  return response.programs;
}

export function addQuestion(payload: AddQuestionPayload) {
  return request('/admin/questions', 'POST', payload);
}

export async function fetchQuestions(params: FetchQuestionsParams, signal?: AbortSignal) {
  const query = new URLSearchParams();
  query.set('programCode', params.programCode);
  if (params.subjectCode) query.set('subjectCode', params.subjectCode);
  if (params.search?.trim()) query.set('search', params.search.trim());
  return request<QuestionsResponse>(`/admin/questions?${query.toString()}`, 'GET', undefined, true, signal);
}

export async function updateQuestion(
  questionId: string,
  payload: {
    programCode?: string;
    subjectCode?: string;
    questionText?: string;
    options?: Array<{ text: string; is_correct: boolean }>;
    explanation?: string;
    imageUrl?: string;
    templateCode?: string;
    tags?: string[];
  },
) {
  return request<{ question: Question }>(`/admin/questions/${questionId}`, 'PATCH', payload);
}

export async function deleteQuestion(questionId: string) {
  return request<null>(`/admin/questions/${questionId}`, 'DELETE');
}

export async function uploadImage(file: File): Promise<{ imageUrl: string }> {
  const token = useAdminAuthStore.getState().token;
  if (!token) {
    throw new Error('Не выполнен вход администратора');
  }

  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${API_BASE_URL}/admin/upload-image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || `Upload failed with status ${response.status}`);
  }

  return data;
}

export interface UploadVideoPayload {
  programCode: string;
  subjectCode: string;
  lessonTitle: string;
  lessonNo?: number;
}

export async function uploadVideo(
  file: File,
  payload: UploadVideoPayload,
  onProgress?: (percent: number) => void,
): Promise<{ lesson: VideoCatalogLesson }> {
  const token = useAdminAuthStore.getState().token;
  if (!token) {
    throw new Error('Не выполнен вход администратора');
  }

  const formData = new FormData();
  formData.append('video', file);
  formData.append('programCode', payload.programCode);
  formData.append('subjectCode', payload.subjectCode);
  formData.append('lessonTitle', payload.lessonTitle);
  if (payload.lessonNo !== undefined) {
    formData.append('lessonNo', String(payload.lessonNo));
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/admin/videos/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data?.error || `Upload failed with status ${xhr.status}`));
        }
      } catch {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Сетевая ошибка при загрузке видео'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Загрузка отменена'));
    });

    xhr.send(formData);
  });
}

export async function deleteVideo(lessonId: string) {
  return request<null>(`/admin/videos/${lessonId}`, 'DELETE');
}
