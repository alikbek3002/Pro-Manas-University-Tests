import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BookOpen,
  Clock3,
  FileText,
  History,
  Loader2,
  PlayCircle,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { availableTestsQueryOptions, testHistoryQueryOptions } from '../lib/studentQueries';
import StudentLayout from '../components/StudentLayout';
import { getFallbackMainItems } from '../lib/subjectCatalog';

function localizeUi(language: 'ru' | 'kg' | undefined, ruText: string, kgText: string) {
  return language === 'kg' ? kgText : ruText;
}

function accountTypeLabel(language: 'ru' | 'kg' | undefined, accountType?: string) {
  if (accountType === 'ort') return localizeUi(language, 'ОРТ', 'ОРТ');
  if (accountType === 'medical') return localizeUi(language, 'Медицинский', 'Медициналык');
  if (accountType === 'manas') return localizeUi(language, 'Манас', 'Манас');
  return localizeUi(language, 'Студент', 'Студент');
}

export default function DashboardPage() {
  const { student, token } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const studentId = student?.id ?? null;

  const availableQuery = useQuery(
    studentId
      ? availableTestsQueryOptions(studentId)
      : {
          queryKey: ['student', 'anonymous', 'available'] as const,
          queryFn: async () => null,
          enabled: false,
        },
  );

  useEffect(() => {
    if (!studentId || !token || !availableQuery.data) return;
    const warmupTimeout = window.setTimeout(() => {
      void import('./MainTestSelectionPage');
      void import('./TestHistoryPage');
      void queryClient.prefetchQuery(testHistoryQueryOptions(studentId));
    }, 900);

    return () => window.clearTimeout(warmupTimeout);
  }, [availableQuery.data, queryClient, studentId, token]);

  const availableData = availableQuery.data ?? null;
  const mainNode = availableData?.test_types?.find((n) => n.id === 'MAIN' && 'items' in n);
  const trialNode = availableData?.test_types?.find((n) => n.id === 'TRIAL' && 'rounds' in n);
  const error = availableQuery.error instanceof Error ? availableQuery.error.message : null;
  const loading = availableQuery.isLoading;

  const subjects = (mainNode?.items && mainNode.items.length > 0)
    ? mainNode.items
    : getFallbackMainItems(student?.accountType, student?.manasTrack);
  const subjectCount = subjects.length;
  const readySubjects = subjects.filter((item) => item.status === 'ready').length;
  const maxPartCount = subjects.reduce((max, item) => {
    const lineMax = item.lines.reduce((lineBest, line) => Math.max(lineBest, line.part_count ?? 0), 0);
    return Math.max(max, lineMax);
  }, 0);

  return (
    <StudentLayout
      title={localizeUi(student?.language, 'Панель студента', 'Студент панели')}
      subtitle={localizeUi(
        student?.language,
        'Ваши предметы, видеоуроки и тесты',
        'Сиздин предметтер, видео сабактар жана тесттер',
      )}
    >
      {loading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-5 text-stone-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{localizeUi(student?.language, 'Загрузка данных...', 'Маалымат жүктөлүүдө...')}</span>
        </div>
      ) : error ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-stone-400">
                {localizeUi(student?.language, 'Студент', 'Студент')}
              </p>
              <p className="mt-2 text-lg font-bold text-stone-900">{student?.fullName || '—'}</p>
              <p className="mt-1 text-sm text-stone-500">@{student?.username}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-stone-400">
                {localizeUi(student?.language, 'Курс / Тип', 'Курс / Тип')}
              </p>
              <p className="mt-2 text-lg font-bold text-stone-900">
                {student?.grade || 1} {localizeUi(student?.language, 'курс', 'курс')}
              </p>
              <p className="mt-1 text-sm text-stone-500">{accountTypeLabel(student?.language, student?.accountType)}</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-stone-400">
                {localizeUi(student?.language, 'Предметы', 'Предметтер')}
              </p>
              <p className="mt-2 text-lg font-bold text-stone-900">{subjectCount}</p>
              <p className="mt-1 text-sm text-stone-500">
                {localizeUi(student?.language, 'Готово к тестам', 'Тестке даяр')}: {readySubjects}
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-stone-400">
                {localizeUi(student?.language, 'Варианты тестов', 'Тест варианттары')}
              </p>
              <p className="mt-2 text-lg font-bold text-stone-900">{maxPartCount || 20}</p>
              <p className="mt-1 text-sm text-stone-500">
                {localizeUi(student?.language, 'По каждому предмету', 'Ар бир предмет боюнча')}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
            <div className="mb-4">
              <h2 className="text-lg font-bold text-stone-900">
                {localizeUi(student?.language, 'Предметы по вашему аккаунту', 'Сиздин аккаунттагы предметтер')}
              </h2>
              <p className="text-sm text-stone-500">
                {localizeUi(
                  student?.language,
                  'Выберите предмет: внутри доступны видеоуроки и предметные тесты.',
                  'Предметти тандаңыз: ичинде видео сабактар жана предметтик тесттер бар.',
                )}
              </p>
            </div>

            {subjects.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-300 p-6 text-sm text-stone-500">
                {localizeUi(student?.language, 'Для вашего аккаунта пока нет предметов.', 'Сиздин аккаунт үчүн азырынча предметтер жок.')}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {subjects.map((subject) => (
                  <div key={subject.id} className="rounded-xl border border-stone-200 p-4">
                    <p className="text-base font-bold text-stone-900">{subject.title}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {localizeUi(student?.language, 'Вопросов в базе', 'Базадагы суроолор')}: {subject.available_total}
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-xs text-stone-500">
                      <PlayCircle className="h-4 w-4" />
                      <span>{localizeUi(student?.language, 'Видеоуроки', 'Видео сабактар')}</span>
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px]">
                        {(subject.video_lesson_count || 0) > 0
                          ? `${subject.playable_video_lesson_count || 0}/${subject.video_lesson_count || 0}`
                          : localizeUi(student?.language, 'пусто', 'бош')}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/select/main?subject=${encodeURIComponent(subject.id)}`)}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black"
                    >
                      <FileText className="h-4 w-4" />
                      {localizeUi(student?.language, 'Открыть тесты', 'Тесттерди ачуу')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => navigate('/history')}
              className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left hover:border-stone-400"
            >
              <History className="h-5 w-5 text-stone-500" />
              <div>
                <p className="font-semibold text-stone-900">{localizeUi(student?.language, 'История тестов', 'Тест тарыхы')}</p>
                <p className="text-xs text-stone-500">
                  {localizeUi(student?.language, 'Результаты и разбор ответов', 'Жыйынтык жана жооптор талдоосу')}
                </p>
              </div>
            </button>

            {trialNode?.status === 'ready' ? (
              <button
                type="button"
                onClick={() => navigate('/select/trial')}
                className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-left hover:border-stone-400"
              >
                <Clock3 className="h-5 w-5 text-stone-500" />
                <div>
                  <p className="font-semibold text-stone-900">{localizeUi(student?.language, 'Сынамык тест', 'Сынамык тест')}</p>
                  <p className="text-xs text-stone-500">
                    {localizeUi(student?.language, 'Полная проверка знаний', 'Толук билим текшерүү')}
                  </p>
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white p-4 text-left">
                <BookOpen className="h-5 w-5 text-stone-400" />
                <div>
                  <p className="font-semibold text-stone-700">{localizeUi(student?.language, 'Сынамык тест', 'Сынамык тест')}</p>
                  <p className="text-xs text-stone-500">
                    {localizeUi(student?.language, 'Будет доступен позже', 'Кийин жеткиликтүү болот')}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </StudentLayout>
  );
}
