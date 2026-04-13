import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  Loader2,
  Sparkles,
  Target,
  Video,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { generateStudentTest, type AvailableMainNode, type MainTreeItem } from '../lib/api';
import {
  availableTestsQueryOptions,
  subjectVideosQueryOptions,
  testHistoryQueryOptions,
} from '../lib/studentQueries';
import { createActiveTestSnapshot, saveActiveTestSnapshot } from '../lib/activeTestStorage';
import StudentLayout from '../components/StudentLayout';
import VideoLessonPlayer from '../components/VideoLessonPlayer';
import { getFallbackMainItems } from '../lib/subjectCatalog';

interface FullscreenCapableElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

function localizeUi(language: 'ru' | 'kg' | undefined, ruText: string, kgText: string) {
  return language === 'kg' ? kgText : ruText;
}

function formatMainLineMeta(
  line: MainTreeItem['lines'][number],
  language: 'ru' | 'kg' | undefined,
) {
  const usableTotal = line.usable_question_total ?? 0;
  const partCount = line.part_count ?? 20;
  const partQuestionCount = line.part_question_count ?? 0;

  return {
    availableLabel: localizeUi(
      language,
      `В базе: ${line.available} вопросов`,
      `Базада: ${line.available} суроо`,
    ),
    usableLabel: localizeUi(
      language,
      `В тест пойдёт: ${usableTotal} (${partCount} x ${partQuestionCount})`,
      `Тестке кирет: ${usableTotal} (${partCount} x ${partQuestionCount})`,
    ),
  };
}

function formatDateTime(iso: string, language: 'ru' | 'kg' | undefined): string {
  const locale = language === 'kg' ? 'ky-KG' : 'ru-RU';
  return new Date(iso).toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(seconds: number | null, language: 'ru' | 'kg' | undefined): string {
  if (!seconds || seconds <= 0) {
    return localizeUi(language, 'без длительности', 'узактыгы жок');
  }

  const mins = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${mins}:${String(sec).padStart(2, '0')}`;
}

export default function MainTestSelectionPage() {
  const { student } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const studentId = student?.id ?? null;
  const [error, setError] = useState<string | null>(null);

  const [selectedSubject, setSelectedSubject] = useState<MainTreeItem | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [selectedPart, setSelectedPart] = useState<number | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [videoAutoplayRequestKey, setVideoAutoplayRequestKey] = useState(0);
  const [isPartModalOpen, setIsPartModalOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

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

  const fallbackMainItems = getFallbackMainItems(student?.accountType, student?.manasTrack);
  const fetchedMainNode = (availableQuery.data?.test_types.find((t) => t.id === 'MAIN') as AvailableMainNode | undefined) ?? null;
  const mainNode: AvailableMainNode | null = fetchedMainNode || {
    id: 'MAIN',
    title: localizeUi(student?.language, 'Предметтик тест', 'Предметтик тест'),
    status: 'locked',
    items: fallbackMainItems,
  };
  const loading = availableQuery.isLoading;
  const queryError = availableQuery.error instanceof Error ? availableQuery.error.message : null;
  const visibleError =
    error ||
    queryError ||
    (!loading && !mainNode?.items?.length
      ? localizeUi(student?.language, 'Предметные тесты не найдены.', 'Предметтик тесттер табылган жок.')
      : null);

  const selectedLine = selectedSubject?.lines.find((line) => line.grade === selectedGrade) ?? null;
  const partCount = selectedLine?.part_count ?? 0;
  const partQuestionCount = selectedLine?.part_question_count ?? 30;
  const partNumbers = Array.from({ length: partCount }, (_, index) => index + 1);
  const requestedSubject = searchParams.get('subject');
  const selectedSubjectCode = selectedSubject?.id || '';

  const videosQuery = useQuery(
    studentId && selectedSubjectCode
      ? subjectVideosQueryOptions(studentId, selectedSubjectCode)
      : {
          queryKey: ['student', 'anonymous', 'videos', selectedSubjectCode] as const,
          queryFn: async () => null,
          enabled: false,
        },
  );

  const videoLessons = videosQuery.data?.lessons || [];
  const selectedVideoLesson = videoLessons.find((lesson) => lesson.id === selectedLessonId) || videoLessons[0] || null;

  const handleSelectVideoLesson = useCallback((lessonId: string) => {
    setSelectedLessonId(lessonId);
    setVideoAutoplayRequestKey((current) => current + 1);
  }, []);

  const handleVideoPlaybackIssue = useCallback(async () => {
    if (!selectedSubjectCode || videosQuery.isFetching) return;

    try {
      await videosQuery.refetch();
    } catch {
      // Keep the current UI state; the query error banner will surface the backend response.
    }
  }, [selectedSubjectCode, videosQuery]);

  const subjectHistory = useMemo(() => {
    if (!selectedSubject) return [];
    const history = historyQuery.data?.history || [];
    return history.filter((entry) => entry.type === 'MAIN' && entry.subject === selectedSubject.id);
  }, [historyQuery.data, selectedSubject]);

  const subjectStats = useMemo(() => {
    const total = subjectHistory.length;
    const passed = subjectHistory.filter((entry) => entry.score_percent >= 70).length;
    const average = total > 0
      ? Math.round(subjectHistory.reduce((sum, entry) => sum + entry.score_percent, 0) / total)
      : 0;
    const best = total > 0
      ? subjectHistory.reduce((max, entry) => Math.max(max, entry.score_percent), 0)
      : 0;

    const totalQuestions = subjectHistory.reduce((sum, entry) => sum + entry.total_questions, 0);
    const totalCorrect = subjectHistory.reduce((sum, entry) => sum + entry.correct_count, 0);
    const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    const lastAttempt = total > 0
      ? [...subjectHistory].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime())[0]
      : null;

    return {
      total,
      passed,
      average,
      best,
      totalQuestions,
      totalCorrect,
      accuracy,
      lastAttempt,
    };
  }, [subjectHistory]);

  useEffect(() => {
    const items = mainNode?.items || [];
    if (!items.length) return;

    const fromQuery = requestedSubject
      ? items.find((item) => item.id === requestedSubject) || null
      : null;

    const fallback = fromQuery || selectedSubject || items[0];

    if (!selectedSubject || selectedSubject.id !== fallback.id) {
      setSelectedSubject(fallback);
      setSelectedGrade(fallback.lines[0]?.grade ?? null);
      setSelectedPart(null);
      setSelectedLessonId(null);
    }

    if (requestedSubject !== fallback.id) {
      const next = new URLSearchParams();
      next.set('subject', fallback.id);
      setSearchParams(next, { replace: true });
    }
  }, [mainNode, requestedSubject, selectedSubject, setSearchParams]);

  useEffect(() => {
    if (!selectedSubject) return;
    const hasSelectedLine = selectedSubject.lines.some((line) => line.grade === selectedGrade);
    if (!hasSelectedLine) {
      setSelectedGrade(selectedSubject.lines[0]?.grade ?? null);
      setSelectedPart(null);
    }
  }, [selectedGrade, selectedSubject]);

  useEffect(() => {
    if (videoLessons.length === 0) {
      setSelectedLessonId(null);
      return;
    }

    const existing = videoLessons.find((lesson) => lesson.id === selectedLessonId);
    if (existing) return;

    const firstPlayable = videoLessons.find((lesson) => lesson.isPlayable);
    setSelectedLessonId((firstPlayable || videoLessons[0]).id);
  }, [selectedLessonId, videoLessons]);

  const handleStartTest = async (partOverride?: number) => {
    const partToUse = partOverride || selectedPart;
    if (!student || !selectedSubject || !selectedGrade || !partToUse) return;

    try {
      const el = document.documentElement as FullscreenCapableElement;
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      }
    } catch {
      // Fullscreen may not be available on some browsers.
    }

    try {
      setGenerating(true);
      setError(null);
      const testData = await generateStudentTest({
        type: 'MAIN',
        subject: selectedSubject.id,
        grade: selectedGrade,
        part: partToUse,
      });
      saveActiveTestSnapshot(createActiveTestSnapshot(student.id, testData));

      navigate(`/test/${testData.test_session_id}`, {
        state: { testData },
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : localizeUi(student?.language, 'Не удалось сгенерировать тест', 'Тестти түзүүгө мүмкүн болгон жок');
      setError(message);
      setGenerating(false);
      try {
        document.exitFullscreen?.();
      } catch {
        // Ignore fullscreen cleanup issues on unsupported browsers.
      }
    }
  };

  return (
    <StudentLayout
      title={localizeUi(student?.language, 'Предметные тесты', 'Предметтик тесттер')}
      subtitle={localizeUi(
        student?.language,
        'Предмет выбирается в левой панели, здесь — статистика, тесты и видео',
        'Предмет сол панелде тандалат, бул жерде статистика, тесттер жана видео',
      )}
    >
      {loading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-5 text-stone-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{localizeUi(student?.language, 'Загрузка предметов...', 'Предметтер жүктөлүүдө...')}</span>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleError && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">{visibleError}</p>
            </div>
          )}

          {selectedSubject && (
            <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-stone-900 sm:text-lg">
                    {localizeUi(student?.language, '1. Статистика по предмету', '1. Предмет боюнча статистика')}
                  </h2>
                  <p className="text-sm text-stone-500">
                    {selectedSubject.title}
                  </p>
                </div>
                <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {localizeUi(student?.language, 'Предмет выбирается слева', 'Предмет сол жактан тандалат')}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-stone-500">
                    <BarChart3 className="h-4 w-4" />
                    <span>{localizeUi(student?.language, 'Пройдено тестов', 'Өтүлгөн тесттер')}</span>
                  </div>
                  <p className="mt-2 text-2xl font-black text-stone-900">{subjectStats.total}</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {localizeUi(student?.language, 'Успешно (70%+)', 'Ийгиликтүү (70%+)')}: {subjectStats.passed}
                  </p>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-stone-500">
                    <Target className="h-4 w-4" />
                    <span>{localizeUi(student?.language, 'Средний результат', 'Орточо жыйынтык')}</span>
                  </div>
                  <p className="mt-2 text-2xl font-black text-stone-900">{subjectStats.average}%</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {localizeUi(student?.language, 'Точность ответов', 'Жооп тактыгы')}: {subjectStats.accuracy}%
                  </p>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-stone-500">
                    <Sparkles className="h-4 w-4" />
                    <span>{localizeUi(student?.language, 'Лучший результат', 'Эң мыкты жыйынтык')}</span>
                  </div>
                  <p className="mt-2 text-2xl font-black text-stone-900">{subjectStats.best}%</p>
                  <p className="mt-1 text-xs text-stone-500">
                    {localizeUi(student?.language, 'Верных ответов', 'Туура жооптор')}: {subjectStats.totalCorrect}/{subjectStats.totalQuestions}
                  </p>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-stone-500">
                    <CalendarClock className="h-4 w-4" />
                    <span>{localizeUi(student?.language, 'Последняя попытка', 'Акыркы аракет')}</span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-stone-900">
                    {historyQuery.isLoading
                      ? localizeUi(student?.language, 'Обновляем...', 'Жаңыланууда...')
                      : subjectStats.lastAttempt
                        ? formatDateTime(subjectStats.lastAttempt.submitted_at, student?.language)
                        : localizeUi(student?.language, 'Пока нет попыток', 'Азырынча аракеттер жок')}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {localizeUi(student?.language, 'Видеоуроков', 'Видео сабактар')}: {selectedSubject.playable_video_lesson_count || 0}/{selectedSubject.video_lesson_count || 0}
                  </p>
                </div>
              </div>
            </section>
          )}

          {selectedSubject && (
            <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
              <h2 className="mb-4 text-base font-bold text-stone-800 sm:text-lg">
                {localizeUi(student?.language, '2. Набор тестов', '2. Тесттер топтому')}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {selectedSubject.lines.map((line) => {
                  const isSelected = selectedGrade === line.grade;
                  const meta = formatMainLineMeta(line, student?.language);

                  return (
                    <button
                      key={line.grade}
                      onClick={() => {
                        setSelectedGrade(line.grade);
                        setSelectedPart(null);
                      }}
                      className={`flex items-center gap-4 rounded-2xl border-2 p-4 transition-all active:scale-[0.98] ${
                        isSelected
                          ? 'border-black bg-black text-white'
                          : 'border-stone-200 bg-white hover:border-stone-400'
                      }`}
                    >
                      <div
                        className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 text-lg font-black ${
                          isSelected
                            ? 'border-stone-700 bg-stone-800 text-white'
                            : 'border-stone-200 bg-stone-50 text-stone-600'
                        }`}
                      >
                        {line.grade}
                      </div>
                      <div className="text-left">
                        <div className={`text-base font-bold ${isSelected ? 'text-white' : 'text-stone-900'}`}>
                          {line.label || localizeUi(student?.language, 'Предметный набор', 'Предметтик топтом')}
                        </div>
                        <div className={`mt-1 text-xs font-medium ${isSelected ? 'text-stone-300' : 'text-stone-600'}`}>
                          {meta.availableLabel}
                        </div>
                        <div className={`text-xs font-medium ${isSelected ? 'text-stone-400' : 'text-stone-500'}`}>
                          {meta.usableLabel}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {selectedSubject && selectedGrade && (
            <div className="text-center">
              <button
                onClick={() => setIsPartModalOpen(true)}
                disabled={generating}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-black px-6 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4 text-stone-300" />
                {localizeUi(student?.language, 'Выбрать часть теста', 'Тесттин бөлүгүн тандоо')}
              </button>
            </div>
          )}

          {selectedSubject && (
            <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-stone-800 sm:text-lg">
                    {localizeUi(student?.language, '3. Видеоуроки', '3. Видео сабактар')}
                  </h2>
                  <p className="text-sm text-stone-500">
                    {localizeUi(
                      student?.language,
                      'Сначала статистика предмета, ниже удобный список уроков и просмотр в плеере.',
                      'Алгач предмет статистикасы, төмөндө ыңгайлуу тизме жана плеер.',
                    )}
                  </p>
                </div>
                <div className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                  {videoLessons.length}
                </div>
              </div>

              {videosQuery.isLoading ? (
                <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{localizeUi(student?.language, 'Загрузка видеоуроков...', 'Видео сабактар жүктөлүүдө...')}</span>
                </div>
              ) : videosQuery.error instanceof Error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                  {videosQuery.error.message}
                </div>
              ) : videoLessons.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 p-5 text-sm text-stone-500">
                  {localizeUi(
                    student?.language,
                    'Для этого предмета видеоуроки еще не добавлены.',
                    'Бул предмет үчүн видео сабактар азырынча кошула элек.',
                  )}
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.95fr)]">
                  <div className="space-y-3">
                    <VideoLessonPlayer
                      lesson={selectedVideoLesson}
                      autoplayLessonId={selectedLessonId}
                      autoplayRequestKey={videoAutoplayRequestKey}
                      isRefreshingSource={videosQuery.isFetching && !videosQuery.isLoading}
                      onPlaybackIssue={handleVideoPlaybackIssue}
                      watermarkText={`@${student?.username || 'student'} · ${new Date().toLocaleDateString('ru-RU')}`}
                    />
                    {videosQuery.isFetching && !videosQuery.isLoading ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
                        {localizeUi(
                          student?.language,
                          'Обновляем ссылку на видео, чтобы урок загрузился без зависания.',
                          'Сабак токтобой ачылышы үчүн видео шилтемесин жаңыртып жатабыз.',
                        )}
                      </div>
                    ) : null}
                    {selectedVideoLesson && (
                      <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                          <Video className="h-4 w-4 text-stone-500" />
                          <span>{selectedVideoLesson.title}</span>
                        </div>
                        <p className="mt-2 text-xs text-stone-500">
                          {localizeUi(
                            student?.language,
                            `Файл: ${selectedVideoLesson.filename} • ${formatDuration(selectedVideoLesson.durationSeconds, student?.language)}`,
                            `Файл: ${selectedVideoLesson.filename} • ${formatDuration(selectedVideoLesson.durationSeconds, student?.language)}`,
                          )}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="max-h-[38rem] space-y-2 overflow-y-auto pr-1">
                    {videoLessons.map((lesson) => {
                      const isSelected = lesson.id === selectedVideoLesson?.id;
                      return (
                        <button
                          key={lesson.id}
                          type="button"
                          onClick={() => handleSelectVideoLesson(lesson.id)}
                          className={`w-full rounded-2xl border p-3 text-left transition-colors ${
                            isSelected
                              ? 'border-black bg-black text-white'
                              : 'border-stone-200 bg-white hover:border-stone-400'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-stone-900'}`}>
                                {lesson.lessonNo ? `${lesson.lessonNo}. ` : ''}{lesson.title}
                              </p>
                              <p className={`mt-1 text-xs ${isSelected ? 'text-stone-300' : 'text-stone-500'}`}>
                                {formatDuration(lesson.durationSeconds, student?.language)}
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                lesson.isPlayable
                                  ? isSelected
                                    ? 'bg-stone-800 text-stone-200'
                                    : 'bg-emerald-50 text-emerald-700'
                                  : isSelected
                                    ? 'bg-stone-800 text-stone-300'
                                    : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {lesson.isPlayable
                                ? localizeUi(student?.language, 'готов', 'даяр')
                                : localizeUi(student?.language, 'ожидает CDN', 'CDN күтөт')}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {isPartModalOpen && selectedSubject && selectedGrade && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setIsPartModalOpen(false)}
        >
          <div
            className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-100 px-6 py-6 sm:px-8">
              <div>
                <h3 className="text-xl font-black text-black sm:text-2xl">
                  {localizeUi(student?.language, 'Выберите часть теста', 'Тесттин бөлүгүн тандаңыз')}
                </h3>
                <p className="mt-1 text-sm font-medium text-stone-500">
                  {selectedSubject.title} ·{' '}
                  {selectedLine?.label || localizeUi(student?.language, 'Предметный набор', 'Предметтик топтом')}
                </p>
              </div>
              <button
                onClick={() => setIsPartModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition-colors hover:bg-stone-200 hover:text-black"
              >
                <ArrowLeft className="h-5 w-5 rotate-90 transform" />
              </button>
            </div>

            <div className="p-6 sm:p-8">
              <div className="grid max-h-[60vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 sm:gap-4">
                {partNumbers.map((part) => (
                  <button
                    key={part}
                    onClick={async () => {
                      setSelectedPart(part);
                      setIsPartModalOpen(false);
                      handleStartTest(part);
                    }}
                    className="group flex items-center gap-4 rounded-2xl border-2 border-stone-100 p-4 transition-all hover:border-black hover:bg-stone-50 active:scale-[0.98]"
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-xl font-black text-stone-400 transition-colors group-hover:bg-black group-hover:text-white">
                      {part}
                    </div>
                    <div className="text-left">
                      <div className="text-base font-bold leading-tight text-stone-900">
                        {localizeUi(student?.language, `Тест ${part}`, `Тест ${part}`)}
                      </div>
                      <div className="text-xs font-medium text-stone-500 sm:text-sm">
                        {partQuestionCount} {localizeUi(student?.language, 'вопросов', 'суроо')}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {generating && (
                <div className="mt-6 flex items-center justify-center gap-3 py-4 font-bold text-stone-400">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {localizeUi(student?.language, 'Подготовка...', 'Даярдалууда...')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </StudentLayout>
  );
}
