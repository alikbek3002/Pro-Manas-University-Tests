import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Layers, Loader2, ShieldAlert, Sparkles } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { generateStudentTest, type AvailableTrialNode, type TrialTreeRound } from '../lib/api';
import { availableTestsQueryOptions } from '../lib/studentQueries';
import { createActiveTestSnapshot, saveActiveTestSnapshot } from '../lib/activeTestStorage';
import StudentLayout from '../components/StudentLayout';

interface FullscreenCapableElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

function localizeUi(language: 'ru' | 'kg' | undefined, ruText: string, kgText: string) {
  return language === 'kg' ? kgText : ruText;
}

export default function TrialTestSelectionPage() {
  const { student } = useAuthStore();
  const navigate = useNavigate();
  const studentId = student?.id ?? null;
  const [error, setError] = useState<string | null>(null);

  const [selectedRound, setSelectedRound] = useState<TrialTreeRound | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const availableQuery = useQuery(
    studentId
      ? availableTestsQueryOptions(studentId)
      : {
          queryKey: ['student', 'anonymous', 'available'] as const,
          queryFn: async () => null,
          enabled: false,
        },
  );

  const trialNode = (availableQuery.data?.test_types.find((t) => t.id === 'TRIAL') as AvailableTrialNode | undefined) ?? null;
  const loading = availableQuery.isLoading;
  const queryError = availableQuery.error instanceof Error ? availableQuery.error.message : null;
  const visibleError =
    error ||
    queryError ||
    (!loading && !trialNode
      ? localizeUi(student?.language, 'Сынамык тесты не найдены.', 'Сынамык тесттер табылган жок.')
      : null);

  const handleStartTest = async () => {
    if (!student || !selectedRound) return;
    setShowConfirm(false);

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
        type: 'TRIAL',
        round: selectedRound.id,
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
        // Ignore cleanup issues.
      }
    }
  };

  const handleClickStart = () => {
    if (!selectedRound) return;
    setShowConfirm(true);
  };

  return (
    <StudentLayout
      title={localizeUi(student?.language, 'Сынамык тест', 'Сынамык тест')}
      subtitle={localizeUi(student?.language, 'Выберите тур тестирования', 'Тест туруну тандаңыз')}
    >
      {loading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-5 text-stone-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>{localizeUi(student?.language, 'Загрузка...', 'Жүктөлүүдө...')}</span>
        </div>
      ) : (
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
            <h1 className="text-2xl font-black text-black sm:text-4xl">
              {localizeUi(student?.language, 'Сынамык тест', 'Сынамык тест')}
            </h1>
            <p className="mt-2 text-sm font-medium text-stone-500 sm:text-base">
              {localizeUi(student?.language, 'Выберите тур, чтобы начать тестирование.', 'Сынамык тестти баштоо үчүн турду тандаңыз.')}
            </p>
          </div>

          {visibleError && (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm font-medium">{visibleError}</p>
            </div>
          )}

          <div className="mb-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {trialNode?.rounds.map((round) => (
                <button
                  key={round.id}
                  onClick={() => {
                    setSelectedRound(round);
                    setError(null);
                  }}
                  className={`flex flex-col items-start gap-4 rounded-2xl border-2 p-5 transition-all active:scale-[0.98] ${
                    selectedRound?.id === round.id
                      ? 'border-black bg-black text-white'
                      : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400'
                  }`}
                >
                  <div className="flex w-full items-center gap-3">
                    <div
                      className={`rounded-xl border-2 p-3 ${
                        selectedRound?.id === round.id
                          ? 'border-stone-700 bg-stone-800 text-white'
                          : 'border-stone-100 bg-stone-50 text-stone-400'
                      }`}
                    >
                      <Layers className="h-5 w-5 sm:h-7 sm:w-7" />
                    </div>
                    <span className={`text-lg font-bold ${selectedRound?.id === round.id ? 'text-white' : 'text-stone-900'}`}>
                      {round.title}
                    </span>
                  </div>

                  <div className="grid w-full grid-cols-2 gap-2">
                    {round.subjects.map((subj) => (
                      <div
                        key={subj.id}
                        className={`text-left text-xs font-medium sm:text-sm ${
                          selectedRound?.id === round.id ? 'text-stone-300' : 'text-stone-500'
                        }`}
                      >
                        {subj.display_name} ({subj.available_total}
                        <span className="opacity-50">/{subj.required_total}</span>)
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedRound && (
            <div className="pb-8">
              <button
                onClick={handleClickStart}
                disabled={generating}
                className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-black px-8 text-base font-bold text-white transition-all hover:opacity-90 disabled:opacity-50 sm:mx-auto sm:max-w-sm sm:h-16 sm:text-lg"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {localizeUi(student?.language, 'Загрузка...', 'Жүктөлүүдө...')}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 text-stone-300" />
                    {localizeUi(student?.language, 'Начать сынамык тест', 'Сынамык тестти баштоо')}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold text-stone-900">
                {localizeUi(student?.language, 'Внимание!', 'Көңүл буруңуз!')}
              </h2>
            </div>
            <div className="mb-6 space-y-3">
              <p className="text-sm leading-relaxed text-stone-600">
                {localizeUi(
                  student?.language,
                  'После начала теста вы не сможете выйти из полноэкранного режима. Переключение вкладок и скриншоты отслеживаются.',
                  'Тест башталгандан кийин толук экрандан чыгууга болбойт. Таб алмаштыруу жана скриншоттор көзөмөлдөнөт.',
                )}
              </p>
              <p className="text-sm font-medium leading-relaxed text-stone-600">
                {localizeUi(
                  student?.language,
                  'Убедитесь, что готовы пройти тест до конца.',
                  'Тестти аягына чейин тапшырууга даяр экениңизди текшериңиз.',
                )}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="h-12 flex-1 rounded-2xl border-2 border-stone-200 text-sm font-bold text-stone-600 transition-colors hover:bg-stone-50"
              >
                {localizeUi(student?.language, 'Назад', 'Артка')}
              </button>
              <button
                onClick={handleStartTest}
                className="h-12 flex-1 rounded-2xl bg-black text-sm font-bold text-white transition-all hover:opacity-90"
              >
                {localizeUi(student?.language, 'Продолжить', 'Улантуу')}
              </button>
            </div>
          </div>
        </div>
      )}
    </StudentLayout>
  );
}
