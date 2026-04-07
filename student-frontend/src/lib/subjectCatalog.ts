import type { MainTreeItem } from './api';

const MANAS_ALL_SUBJECTS: Array<{ id: string; title: string }> = [
  { id: 'math', title: 'Математика' },
  { id: 'russian', title: 'Русский язык' },
  { id: 'physics', title: 'Физика' },
  { id: 'chemistry', title: 'Химия' },
  { id: 'biology', title: 'Биология' },
  { id: 'kyrgyz_language', title: 'Кыргызский язык' },
  { id: 'kyrgyz_literature', title: 'Кыргыз Адабият' },
  { id: 'history', title: 'История' },
  { id: 'geography', title: 'География' },
  { id: 'english', title: 'Английский язык' },
];

const MANAS_HUMANITIES_SUBJECTS = MANAS_ALL_SUBJECTS.filter((item) =>
  ['russian', 'kyrgyz_language', 'kyrgyz_literature', 'history', 'geography', 'english'].includes(item.id),
);

const MANAS_EXACT_SUBJECTS = MANAS_ALL_SUBJECTS.filter((item) =>
  ['math', 'physics', 'chemistry', 'biology', 'english', 'geography'].includes(item.id),
);

const ORT_SUBJECTS = MANAS_ALL_SUBJECTS.filter((item) =>
  ['math', 'russian', 'history', 'geography', 'english'].includes(item.id),
);

const MEDICAL_SUBJECTS = MANAS_ALL_SUBJECTS.filter((item) =>
  ['chemistry', 'biology', 'physics', 'math'].includes(item.id),
);

function buildFallbackLine() {
  return {
    grade: 1,
    required: 20,
    available: 0,
    label: 'Тесты 1-20 (по 20 вопросов)',
    part_count: 20,
    part_question_count: 20,
    usable_question_total: 0,
  };
}

export function getFallbackMainItems(
  accountType?: 'ort' | 'medical' | 'manas',
  manasTrack?: 'all_subjects' | 'humanities' | 'exact_sciences' | null,
): MainTreeItem[] {
  let source = MANAS_ALL_SUBJECTS;

  if (accountType === 'ort') source = ORT_SUBJECTS;
  if (accountType === 'medical') source = MEDICAL_SUBJECTS;
  if (accountType === 'manas' && manasTrack === 'humanities') source = MANAS_HUMANITIES_SUBJECTS;
  if (accountType === 'manas' && manasTrack === 'exact_sciences') source = MANAS_EXACT_SUBJECTS;

  return source.map((item) => ({
    id: item.id,
    title: item.title,
    required_total: 20,
    available_total: 0,
    status: 'locked' as const,
    lines: [buildFallbackLine()],
  }));
}
