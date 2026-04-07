import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, BookOpen, Loader2, Play, Sparkles } from 'lucide-react';
import {
  fetchDemoAvailableTests,
  generateDemoTest,
  type DemoAvailableMainNode,
  type DemoMainTreeItem,
} from '../lib/api';
import { getStoredDemoLanguage, localizeUi, type DemoLanguage } from '../lib/demoLanguage';
import logo from '../assets/pro-manas-logo.png';

function formatMeta(line: DemoMainTreeItem['lines'][number], language: DemoLanguage) {
  return {
    availableLabel: localizeUi(
      language,
      `В базе: ${line.available} вопросов`,
      `Базада: ${line.available} суроо`,
    ),
    demoLabel: line.status === 'ready'
      ? localizeUi(
        language,
        `В демо: первые ${line.demo_question_count} вопросов`,
        `Демодо: алгачкы ${line.demo_question_count} суроо`,
      )
      : localizeUi(language, 'Недостаточно вопросов для демо', 'Демо үчүн суроолор жетишсиз'),
  };
}

export default function DemoTestSelectionPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<DemoMainTreeItem | null>(null);
  const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [language, setLanguage] = useState<DemoLanguage | null>(null);

  useEffect(() => {
    const savedLanguage = getStoredDemoLanguage();
    if (!savedLanguage) {
      navigate('/', { replace: true });
      return;
    }

    setLanguage(savedLanguage);

    const warmup = window.setTimeout(() => {
      void import('./DemoTestPage');
    }, 250);

    return () => window.clearTimeout(warmup);
  }, [navigate]);

  const availableQuery = useQuery({
    queryKey: ['demo', 'available', language],
    queryFn: ({ signal }) => fetchDemoAvailableTests(language || 'ru', signal),
    enabled: Boolean(language),
    staleTime: 15 * 60_000,
    gcTime: 60 * 60_000,
  });

  const mainNode = (availableQuery.data?.test_types[0] as DemoAvailableMainNode | undefined) ?? null;
  const loading = !language || availableQuery.isLoading;
  const queryError = availableQuery.error instanceof Error ? availableQuery.error.message : null;
  const selectedLine = selectedSubject?.lines.find((line) => line.grade === selectedGrade) ?? null;
  const canStart = Boolean(language && selectedSubject && selectedLine?.status === 'ready' && !generating);
  const visibleError = error || queryError || (!loading && !mainNode ? localizeUi(language || 'ru', 'Демо-тесты не найдены.', 'Демо-тесттер табылган жок.') : null);

  const handleStartTest = async () => {
    if (!language || !selectedSubject || !selectedGrade || !selectedLine || selectedLine.status !== 'ready') {
      return;
    }

    try {
      setGenerating(true);
      setError(null);

      const testData = await generateDemoTest({
        subject: selectedSubject.id,
        grade: selectedGrade,
        language,
      });

      navigate(`/test/${testData.test_session_id}`, {
        state: { testData },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : localizeUi(language, 'Не удалось запустить демо-тест', 'Демо-тестти баштоо мүмкүн болгон жок'));
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans text-stone-900">
      <div className="border-b-2 border-stone-100">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-sm font-medium text-stone-500 transition-colors hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{localizeUi(language || 'ru', 'Сменить язык', 'Тилди алмаштыруу')}</span>
          </button>
          <img src={logo} alt="ProManas" className="h-10 w-auto sm:h-14" decoding="async" />
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-8 sm:mb-10">
          <h1 className="text-2xl font-black text-black sm:text-4xl">
            {localizeUi(language || 'ru', 'Демо-тесты', 'Демо-тесттер')}
          </h1>
          <p className="mt-2 text-sm font-medium text-stone-500 sm:text-base">
            {localizeUi(
              language || 'ru',
              'Выберите предмет и класс. В каждом демо открываются первые 3 вопроса.',
              'Предметти жана классты тандаңыз. Ар бир демодо алгачкы 3 суроо ачылат.',
            )}
          </p>
        </div>

        {visibleError && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border-2 border-red-100 bg-red-50 p-4 text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">{visibleError}</p>
          </div>
        )}

        <div className="mb-8 sm:mb-10">
          <h2 className="mb-4 text-base font-bold text-stone-800 sm:text-lg">
            {localizeUi(language || 'ru', '1. Предмет', '1. Предмет')}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
            {mainNode?.items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedSubject(item);
                  setSelectedGrade(null);
                  setError(null);
                }}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 p-4 text-center transition-all active:scale-[0.97] sm:gap-3 sm:p-6 ${
                  selectedSubject?.id === item.id
                    ? 'border-black bg-black text-white'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400'
                }`}
              >
                <BookOpen className={`h-5 w-5 sm:h-6 sm:w-6 ${selectedSubject?.id === item.id ? 'text-stone-400' : 'text-stone-300'}`} />
                <span className="text-sm font-bold leading-tight sm:text-base">{item.title}</span>
              </button>
            ))}
          </div>
        </div>

        {selectedSubject && (
          <div className="mb-8 sm:mb-10">
            <h2 className="mb-4 text-base font-bold text-stone-800 sm:text-lg">
              {localizeUi(language || 'ru', '2. Класс', '2. Класс')}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {selectedSubject.lines.map((line) => {
                const isSelected = selectedGrade === line.grade;
                const isLocked = line.status !== 'ready';
                const meta = formatMeta(line, language || 'ru');

                return (
                  <button
                    key={line.grade}
                    onClick={() => {
                      if (isLocked) {
                        return;
                      }

                      setSelectedGrade(line.grade);
                      setError(null);
                    }}
                    className={`flex items-center gap-4 rounded-2xl border-2 p-4 transition-all sm:p-5 ${
                      isLocked
                        ? 'cursor-not-allowed border-stone-100 bg-stone-50 text-stone-400'
                        : isSelected
                          ? 'border-black bg-black text-white'
                          : 'border-stone-200 bg-white hover:border-stone-400'
                    }`}
                  >
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl border-2 text-lg font-black sm:h-12 sm:w-12 sm:text-xl ${
                        isLocked
                          ? 'border-stone-200 bg-white text-stone-400'
                          : isSelected
                            ? 'border-stone-700 bg-stone-800 text-white'
                            : 'border-stone-200 bg-stone-50 text-stone-600'
                      }`}
                    >
                      {line.grade}
                    </div>
                    <div className="text-left">
                      <div className={`text-base font-bold ${isSelected && !isLocked ? 'text-white' : isLocked ? 'text-stone-500' : 'text-stone-900'}`}>
                        {line.grade} {localizeUi(language || 'ru', 'класс', 'класс')}
                      </div>
                      <div className={`mt-1 text-xs font-medium sm:text-sm ${isSelected && !isLocked ? 'text-stone-300' : 'text-stone-600'}`}>
                        {meta.availableLabel}
                      </div>
                      <div className={`text-[11px] font-medium sm:text-xs ${isSelected && !isLocked ? 'text-stone-400' : isLocked ? 'text-rose-500' : 'text-stone-500'}`}>
                        {meta.demoLabel}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {selectedSubject && selectedGrade && (
          <div className="mt-4 pb-8 text-center sm:pb-12">
            <button
              onClick={handleStartTest}
              disabled={!canStart}
              className="mx-auto flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-black px-8 text-base font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400 sm:h-16 sm:max-w-sm sm:text-lg"
            >
              {generating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Sparkles className="h-5 w-5 text-stone-400" />
              )}
              {generating
                ? localizeUi(language || 'ru', 'Запускаем демо...', 'Демону иштетип жатабыз...')
                : localizeUi(language || 'ru', 'Начать демо-тест', 'Демо-тестти баштоо')}
            </button>

            <p className="mt-3 text-xs font-medium text-stone-400 sm:text-sm">
              {localizeUi(
                language || 'ru',
                'После старта откроются первые 3 вопроса выбранного предмета.',
                'Башталгандан кийин тандалган предметтин алгачкы 3 суроосу ачылат.',
              )}
            </p>
          </div>
        )}

        <div className="rounded-3xl border-2 border-stone-100 bg-stone-50 p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-black shadow-sm">
              <Play className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-black sm:text-lg">
                {localizeUi(language || 'ru', 'Как работает демо', 'Демо кантип иштейт')}
              </h3>
              <p className="mt-1 text-sm font-medium leading-relaxed text-stone-500">
                {localizeUi(
                  language || 'ru',
                  'Это отдельная публичная витрина. Интерфейс и тесты открываются на выбранном языке.',
                  'Бул өзүнчө ачык демо-баракча. Интерфейс жана тесттер тандалган тилде ачылат.',
                )}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
