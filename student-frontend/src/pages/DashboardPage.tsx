import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FlaskConical,
  History,
  Loader2,
  Trophy,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { availableTestsQueryOptions, testHistoryQueryOptions } from '../lib/studentQueries';
import StudentLayout from '../components/StudentLayout';

function localizeUi(language: 'ru' | 'kg' | undefined, ruText: string, kgText: string) {
  return language === 'kg' ? kgText : ruText;
}

function accountTypeLabel(language: 'ru' | 'kg' | undefined, accountType?: string) {
  if (accountType === 'ort') return localizeUi(language, 'ОРТ', 'ОРТ');
  if (accountType === 'medical') return localizeUi(language, 'Медицинский', 'Медициналык');
  if (accountType === 'manas') return localizeUi(language, 'Манас', 'Манас');
  return localizeUi(language, 'Студент', 'Студент');
}

function formatDateTime(iso: string, language: 'ru' | 'kg' | undefined): string {
  const locale = language === 'kg' ? 'ky-KG' : 'ru-RU';
  const date = new Date(iso);
  return date.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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

  const historyQuery = useQuery(
    studentId
      ? testHistoryQueryOptions(studentId)
      : {
          queryKey: ['student', 'anonymous', 'history'] as const,
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
  const trialNode = availableData?.test_types?.find((n) => n.id === 'TRIAL' && 'rounds' in n);
  const availableError = availableQuery.error instanceof Error ? availableQuery.error.message : null;
  const availableLoading = availableQuery.isLoading;
  const historyError = historyQuery.error instanceof Error ? historyQuery.error.message : null;
  const history = historyQuery.data?.history ?? [];

  const stats = useMemo(() => {
    const totalTests = history.length;
    const mainTests = history.filter((entry) => entry.type === 'MAIN').length;
    const trialTests = history.filter((entry) => entry.type === 'TRIAL').length;

    const totalScore = history.reduce((sum, entry) => sum + entry.score_percent, 0);
    const averageScore = totalTests > 0 ? Math.round(totalScore / totalTests) : 0;

    const bestScore = totalTests > 0
      ? history.reduce((best, entry) => Math.max(best, entry.score_percent), 0)
      : 0;

    const totalQuestions = history.reduce((sum, entry) => sum + entry.total_questions, 0);
    const totalCorrect = history.reduce((sum, entry) => sum + entry.correct_count, 0);
    const accuracyPercent = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    const lastAttempt = totalTests > 0
      ? [...history].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())[0]
      : null;

    return {
      totalTests,
      mainTests,
      trialTests,
      averageScore,
      bestScore,
      totalQuestions,
      totalCorrect,
      accuracyPercent,
      lastAttempt,
    };
  }, [history]);

  return (
    <StudentLayout
      title={localizeUi(student?.language, 'Панель студента', 'Студент панели')}
      subtitle={localizeUi(
        student?.language,
        'Статистика обучения и быстрый доступ к тестам',
        'Окуу статистикасы жана тесттерге ыкчам кирүү',
      )}
    >
      {availableLoading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-5 text-stone-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{localizeUi(student?.language, 'Загрузка данных...', 'Маалымат жүктөлүүдө...')}</span>
        </div>
      ) : availableError ? (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{availableError}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {historyError ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">
                {localizeUi(student?.language, 'Историю тестов сейчас не удалось загрузить.', 'Тест тарыхын азыр жүктөө мүмкүн болбой калды.')}
                {' '}
                {historyError}
              </p>
            </div>
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-stone-400">
                <BarChart3 className="h-4 w-4" />
                <span>{localizeUi(student?.language, 'Всего тестов', 'Бардык тесттер')}</span>
              </div>
              <p className="mt-2 text-2xl font-black text-stone-900">{stats.totalTests}</p>
              <p className="mt-1 text-xs text-stone-500">
                {localizeUi(student?.language, 'Предметных', 'Предметтик')}: {stats.mainTests} · {localizeUi(student?.language, 'Пробных', 'Сынамык')}: {stats.trialTests}
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-stone-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>{localizeUi(student?.language, 'Средний результат', 'Орточо жыйынтык')}</span>
              </div>
              <p className="mt-2 text-2xl font-black text-stone-900">{stats.averageScore}%</p>
              <p className="mt-1 text-xs text-stone-500">
                {localizeUi(student?.language, 'Правильных ответов', 'Туура жооптор')}: {stats.totalCorrect}/{stats.totalQuestions}
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-stone-400">
                <Trophy className="h-4 w-4" />
                <span>{localizeUi(student?.language, 'Лучший результат', 'Эң мыкты жыйынтык')}</span>
              </div>
              <p className="mt-2 text-2xl font-black text-stone-900">{stats.bestScore}%</p>
              <p className="mt-1 text-xs text-stone-500">
                {localizeUi(student?.language, 'Точность ответов', 'Жооп тактыгы')}: {stats.accuracyPercent}%
              </p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-stone-400">
                <CalendarClock className="h-4 w-4" />
                <span>{localizeUi(student?.language, 'Последняя попытка', 'Акыркы аракет')}</span>
              </div>
              <p className="mt-2 text-base font-bold text-stone-900">
                {stats.lastAttempt
                  ? formatDateTime(stats.lastAttempt.submitted_at, student?.language)
                  : localizeUi(student?.language, 'Пока нет', 'Азырынча жок')}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {localizeUi(student?.language, 'Курс', 'Курс')}: {student?.grade || 1} · {accountTypeLabel(student?.language, student?.accountType)}
              </p>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-stone-400">
                {localizeUi(student?.language, 'Профиль', 'Профиль')}
              </p>
              <p className="mt-2 text-lg font-bold text-stone-900">{student?.fullName || '—'}</p>
              <p className="mt-1 text-sm text-stone-500">@{student?.username}</p>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-stone-400">
                {localizeUi(student?.language, 'Сынамык тест', 'Сынамык тест')}
              </p>
              <p className="mt-2 text-lg font-bold text-stone-900">
                {trialNode?.status === 'ready'
                  ? localizeUi(student?.language, 'Доступен', 'Жеткиликтүү')
                  : localizeUi(student?.language, 'Пока закрыт', 'Азырынча жабык')}
              </p>
              <p className="mt-1 text-sm text-stone-500">
                {localizeUi(student?.language, 'Полная проверка знаний', 'Толук билим текшерүү')}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5">
            <h2 className="text-base font-bold text-emerald-900 sm:text-lg">
              {localizeUi(student?.language, 'Предметы перенесены в левое меню', 'Предметтер сол менюга көчүрүлдү')}
            </h2>
            <p className="mt-1 text-sm text-emerald-800/90">
              {localizeUi(
                student?.language,
                'Чтобы открыть конкретный предмет, используйте раздел «Предметы» в зеленой левой панели.',
                'Так предметти ачуу үчүн жашыл сол панелдеги «Предметтер» бөлүгүн колдонуңуз.',
              )}
            </p>
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
                <FlaskConical className="h-5 w-5 text-stone-400" />
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
