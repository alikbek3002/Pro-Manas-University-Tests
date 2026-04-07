import { startTransition, useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ArrowLeft, CheckCircle2, XCircle, Maximize, Shield, LogOut, ShieldAlert, Ban } from 'lucide-react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { studentQueryKeys } from '../lib/studentQueries';
import logo from '../assets/pro-manas-logo.png';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import {
  answerStudentQuestion,
  submitStudentTest,
  reportScreenshotViolation,
  type AnswerQuestionResponse,
  type GeneratedTestResponse,
  type SubmitTestResponse,
} from '../lib/api';

function localizeUi(language: 'ru' | 'kg' | undefined, ruText: string, kgText: string) {
  return language === 'kg' ? kgText : ruText;
}

const SUBJECT_NAMES: Record<string, { ru: string; kg: string }> = {
  math: { ru: 'Математика', kg: 'Математика' },
  logic: { ru: 'Логика', kg: 'Логика' },
  history: { ru: 'История', kg: 'Тарых' },
  english: { ru: 'Английский язык', kg: 'Англис тили' },
  russian: { ru: 'Русский язык', kg: 'Орус тили' },
  kyrgyz: { ru: 'Кыргызский язык', kg: 'Кыргыз тили' },
  mathlogic: { ru: 'Математика и Логика', kg: 'Математика жана Логика' },
};

type RevealState = Record<string, AnswerQuestionResponse>;

export default function TestPage() {
  const { student, token, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const preloadedImagesRef = useRef(new Set<string>());
  const queryClient = useQueryClient();

  const testData = location.state?.testData as GeneratedTestResponse | undefined;

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<RevealState>({});
  const [submitResult, setSubmitResult] = useState<SubmitTestResponse | null>(null);

  const [isAnswering, setIsAnswering] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bypassedFullscreen, setBypassedFullscreen] = useState(false);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const [screenshotModal, setScreenshotModal] = useState<{
    type: 'warning' | 'blocked_48h' | 'blocked_permanent';
    strikes: number;
  } | null>(null);
  const screenshotProcessingRef = useRef(false);

  const enterFullscreen = useCallback(async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if ((el as any).webkitRequestFullscreen) {
        await (el as any).webkitRequestFullscreen();
      } else if ((el as any).msRequestFullscreen) {
        await (el as any).msRequestFullscreen();
      }
    } catch { /* may not be available */ }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      }
    } catch { /* ignore */ }
  }, []);

  const handleScreenshotViolation = useCallback(async () => {
    if (screenshotProcessingRef.current || !token) return;
    screenshotProcessingRef.current = true;
    setTabSwitchCount((prev) => prev + 1);

    try {
      const result = await reportScreenshotViolation(token);
      setScreenshotModal({ type: result.action, strikes: result.strikes });
    } catch {
      setScreenshotModal({ type: 'warning', strikes: 1 });
    }
  }, [token]);

  if (!testData) {
    return <Navigate to="/dashboard" replace />;
  }

  const testType = testData.test_info.type;
  const isTrial = testType === 'TRIAL';

  // ——— Anti-cheat for ALL tests (desktop + mobile) ———
  useEffect(() => {
    const preventEvent = (e: Event) => { e.preventDefault(); };

    const preventShortcuts = (e: KeyboardEvent) => {
      const normalizedKey = e.key.toLowerCase();
      const isPrimaryModifierPressed = e.ctrlKey || e.metaKey;

      if (e.key === 'PrintScreen' || e.code === 'PrintScreen' || e.key === 'Snapshot' || e.code === 'Snapshot') {
        e.preventDefault();
        navigator.clipboard?.writeText('').catch(() => { });
        handleScreenshotViolation();
        return;
      }

      // Mac: Cmd+Shift зажаты вместе — сразу страйк, не ждём третью клавишу (3/4/5)
      if (e.metaKey && e.shiftKey) {
        e.preventDefault();
        handleScreenshotViolation();
        return;
      }

      // Windows: Ctrl+Shift — тоже блокируем (Snipping Tool и т.п.)
      if (e.ctrlKey && e.shiftKey && normalizedKey === 's') {
        e.preventDefault();
        handleScreenshotViolation();
        return;
      }

      if (isPrimaryModifierPressed && ['c', 'v', 'x', 'p', 'a', 'u'].includes(normalizedKey)) {
        e.preventDefault();
      }

      if (e.key === 'F12') e.preventDefault();
      if (e.altKey && e.key === 'Tab') e.preventDefault();
      if (isTrial && e.key === 'Escape') e.preventDefault();
    };

    const handleVisibilityChange = () => { };
    const handleBlur = () => { };
    const handlePageHide = () => { };

    // Mobile: block long-press context menu via touch
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    const handleTouchStart = (e: TouchEvent) => {
      longPressTimer = setTimeout(() => {
        e.preventDefault();
      }, 300);
    };
    const handleTouchEnd = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    };
    const handleTouchMove = () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    };

    document.addEventListener('copy', preventEvent, true);
    document.addEventListener('cut', preventEvent, true);
    document.addEventListener('paste', preventEvent, true);
    document.addEventListener('contextmenu', preventEvent, true);
    document.addEventListener('selectstart', preventEvent, true);
    document.addEventListener('dragstart', preventEvent, true);
    document.addEventListener('keydown', preventShortcuts, true);
    document.addEventListener('keyup', preventShortcuts, true);
    document.addEventListener('visibilitychange', handleVisibilityChange, true);
    window.addEventListener('blur', handleBlur, true);
    window.addEventListener('pagehide', handlePageHide, true);
    document.addEventListener('freeze', handlePageHide as EventListener, true);
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchmove', handleTouchMove);

    // TRIAL only: block back navigation + page close
    let cleanupTrial: (() => void) | null = null;
    if (isTrial) {
      enterFullscreen();

      const handlePopState = () => {
        window.history.pushState({ guard: true }, document.title, window.location.href);
      };
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = '';
      };

      window.history.pushState({ guard: true }, document.title, window.location.href);
      window.addEventListener('popstate', handlePopState);
      window.addEventListener('beforeunload', handleBeforeUnload);

      cleanupTrial = () => {
        window.removeEventListener('popstate', handlePopState);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }

    return () => {
      document.removeEventListener('copy', preventEvent, true);
      document.removeEventListener('cut', preventEvent, true);
      document.removeEventListener('paste', preventEvent, true);
      document.removeEventListener('contextmenu', preventEvent, true);
      document.removeEventListener('selectstart', preventEvent, true);
      document.removeEventListener('dragstart', preventEvent, true);
      document.removeEventListener('keydown', preventShortcuts, true);
      document.removeEventListener('keyup', preventShortcuts, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange, true);
      window.removeEventListener('blur', handleBlur, true);
      window.removeEventListener('pagehide', handlePageHide, true);
      document.removeEventListener('freeze', handlePageHide as EventListener, true);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      cleanupTrial?.();
    };
  }, [isTrial, enterFullscreen, handleScreenshotViolation]);

  // Fullscreen state tracking (TRIAL only)
  useEffect(() => {
    if (!isTrial) return;

    const handleFullscreenChange = () => {
      const isFull = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFull);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      exitFullscreen();
    };
  }, [isTrial, exitFullscreen]);

  // Reset bypass if we somehow get into fullscreen later
  useEffect(() => {
    if (isFullscreen) setBypassedFullscreen(false);
  }, [isFullscreen]);

  if (!student || !token) {
    return <Navigate to="/login" replace />;
  }

  const currentQuestion = testData.questions[currentQuestionIndex] || null;
  const currentReveal = currentQuestion ? revealedAnswers[currentQuestion.id] : undefined;
  const currentSelectedIndex = currentQuestion ? selectedAnswers[currentQuestion.id] : undefined;
  const answeredCount = Object.keys(revealedAnswers).length;
  const totalQuestions = testData.total_questions;
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;
  const isFirstQuestion = currentQuestionIndex === 0;

  useEffect(() => {
    const nextQuestions = testData.questions.slice(currentQuestionIndex, currentQuestionIndex + 2);

    for (const question of nextQuestions) {
      const imageUrl = question?.imageUrl;
      if (!imageUrl || preloadedImagesRef.current.has(imageUrl)) {
        continue;
      }

      const image = new Image();
      image.decoding = 'async';
      image.src = imageUrl;
      preloadedImagesRef.current.add(imageUrl);
    }
  }, [currentQuestionIndex, testData.questions]);

  const handleAnswerSelect = async (selectedIndex: number) => {
    if (isAnswering || currentReveal || !currentQuestion) return;

    // Optimistic: show selection immediately before API call
    setSelectedAnswers((prev) => ({ ...prev, [currentQuestion.id]: selectedIndex }));
    setIsAnswering(true);
    setApiError(null);

    try {
      const reveal = await answerStudentQuestion(token, {
        test_session_id: testData.test_session_id,
        type: testType,
        question_id: currentQuestion.id,
        selected_index: selectedIndex,
      });

      setRevealedAnswers((prev) => ({ ...prev, [currentQuestion.id]: reveal }));
    } catch (error) {
      // Rollback optimistic selection on error
      setSelectedAnswers((prev) => {
        const next = { ...prev };
        delete next[currentQuestion.id];
        return next;
      });
      setApiError(error instanceof Error ? error.message : 'Ошибка проверки ответа');
    } finally {
      setIsAnswering(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setApiError(null);

    try {
      const result = await submitStudentTest(token, {
        test_session_id: testData.test_session_id,
        type: testType,
      });
      queryClient.invalidateQueries({
        queryKey: student ? studentQueryKeys.history(student.id) : ['student'],
      }).catch(() => undefined);
      setSubmitResult(result);
      if (isTrial) exitFullscreen();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Ошибка отправки результата');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExitTest = () => {
    setShowExitConfirm(false);
    exitFullscreen();
    navigate('/dashboard');
  };

  const handleGoPrev = () => {
    if (!isFirstQuestion) {
      startTransition(() => {
        setCurrentQuestionIndex((prev) => prev - 1);
      });
    }
  };

  const handleGoNext = () => {
    if (!isLastQuestion) {
      startTransition(() => {
        setCurrentQuestionIndex((prev) => prev + 1);
      });
    }
  };



  // ——— Result screen ———
  if (submitResult) {
    const scoreColor = submitResult.score >= 70
      ? 'text-emerald-600' : submitResult.score >= 40
        ? 'text-amber-600' : 'text-rose-600';

    const scoreBg = submitResult.score >= 70
      ? 'bg-emerald-50 border-emerald-200' : submitResult.score >= 40
        ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200';

    const scoreIconBg = submitResult.score >= 70
      ? 'bg-emerald-100 text-emerald-600' : submitResult.score >= 40
        ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600';

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50 px-4">
        <div className="mx-auto max-w-md w-full rounded-2xl sm:rounded-[32px] border bg-white p-6 sm:p-8 text-center shadow-[0_22px_65px_-38px_rgba(15,23,42,0.4)]">
          <div className={`mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full ${scoreIconBg}`}>
            {submitResult.score >= 70
              ? <CheckCircle2 className="h-8 w-8" />
              : <XCircle className="h-8 w-8" />}
          </div>

          <h2 className="mt-5 text-2xl sm:text-3xl font-bold text-slate-950">
            {localizeUi(student?.language, 'Тест завершён', 'Тест аяктады')}
          </h2>

          <div className={`mt-4 mx-auto max-w-[200px] rounded-2xl border p-4 ${scoreBg}`}>
            <p className={`text-4xl font-black ${scoreColor}`}>{submitResult.score}%</p>
            <p className="mt-1 text-xs text-slate-500">
              {localizeUi(student?.language, 'результат', 'жыйынтык')}
            </p>
          </div>

          <div className="mt-4 space-y-1.5 text-sm text-slate-600">
            <p>
              {localizeUi(student?.language, 'Правильных', 'Туура жооптор')}: <span className="font-bold text-emerald-600">{submitResult.correct}</span> / {submitResult.total}
            </p>
            <p>
              {localizeUi(student?.language, 'Отвечено', 'Жооп берилди')}: <span className="font-bold text-slate-900">{submitResult.answered}</span> / {submitResult.total}
            </p>
            {tabSwitchCount > 0 && (
              <p className="text-amber-600 font-medium">
                {localizeUi(student?.language, `Переключений вкладки: ${tabSwitchCount}`, `Башка вкладкага өтүү: ${tabSwitchCount}`)}
              </p>
            )}
          </div>

          <button
            onClick={handleExitTest}
            className="mt-6 w-full sm:w-auto inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-8 text-sm font-bold text-white transition-colors hover:bg-slate-800"
          >
            {localizeUi(student?.language, 'На главную', 'Башкы бетке')}
          </button>
        </div>
      </div>
    );
  }

  // ——— Trial Fullscreen Prompt ———
  if (isTrial && !isFullscreen && !screenshotModal && !bypassedFullscreen) {
    return (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="mx-4 max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <Maximize className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-xl font-bold text-slate-900">
            {localizeUi(student?.language, 'Полноэкранный режим', 'Толук экран режими')}
          </h3>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {localizeUi(
              student?.language,
              'Для прохождения теста необходимо включить полноэкранный режим.',
              'Тесттен өтүү үчүн толук экран режимин иштетүү зарыл.',
            )}
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={enterFullscreen}
              className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-sky-600 px-6 text-sm font-medium text-white hover:bg-sky-700 transition-colors"
            >
              <Maximize className="h-4 w-4" />
              {localizeUi(student?.language, 'Войти в полноэкранный режим', 'Толук экран режимине кирүү')}
            </button>
            <button
              onClick={() => setBypassedFullscreen(true)}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors underline"
            >
              {localizeUi(student?.language, 'Продолжить без полного экрана', 'Толук экрансыз улантуу')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ——— Test UI ———
  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[9999] overflow-auto bg-white font-sans text-stone-900 ${isTrial ? 'bg-slate-50' : ''}`}
      style={{
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        touchAction: 'manipulation',
      } as React.CSSProperties}
    >
      {/* Exit confirmation for MAIN test */}
      {showExitConfirm && !isTrial && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 max-w-sm rounded-3xl bg-white p-6 sm:p-8 text-center shadow-2xl relative z-[20001]">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <LogOut className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">
              {localizeUi(student?.language, 'Выйти из теста?', 'Тесттен чыгасызбы?')}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {localizeUi(student?.language, 'Прогресс не будет сохранён.', 'Жүрүш сакталбайт.')}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="flex-1 h-11 rounded-xl border-2 border-stone-200 text-sm font-bold text-stone-700 hover:bg-stone-50 transition-colors"
              >
                {localizeUi(student?.language, 'Остаться', 'Калуу')}
              </button>
              <button
                onClick={handleExitTest}
                className="flex-1 h-11 rounded-xl bg-rose-600 text-sm font-bold text-white hover:bg-rose-700 transition-colors"
              >
                {localizeUi(student?.language, 'Выйти', 'Чыгуу')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot violation modal */}
      {screenshotModal && (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-black/90 backdrop-blur-md">
          <div className="mx-4 max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
            {screenshotModal.type === 'warning' && (
              <>
                <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  <ShieldAlert className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-xl font-bold text-slate-900">
                  {localizeUi(student?.language, 'Предупреждение!', 'Эскертүү!')}
                </h3>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  {localizeUi(
                    student?.language,
                    'Обнаружена попытка сделать скриншот! Это строго запрещено. При повторном нарушении ваш аккаунт будет заблокирован на 48 часов.',
                    'Скриншот жасоо аракети аныкталды! Бул катуу тыюу салынган. Кайра бузууда сиздин аккаунтуңуз 48 саатка бөгөттөлөт.',
                  )}
                </p>
                <button
                  onClick={() => {
                    screenshotProcessingRef.current = false;
                    setScreenshotModal(null);
                  }}
                  className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-slate-900 px-8 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
                >
                  {localizeUi(student?.language, 'Продолжить тест', 'Тестти улантуу')}
                </button>
              </>
            )}
            {screenshotModal.type === 'blocked_48h' && (
              <>
                <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <Ban className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-xl font-bold text-red-600">
                  {localizeUi(student?.language, 'Аккаунт заблокирован!', 'Аккаунт бөгөттөлдү!')}
                </h3>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  {localizeUi(
                    student?.language,
                    'Ваша учётная запись заблокирована на 48 часов за повторную попытку сделать скриншот. При следующем нарушении аккаунт будет заблокирован навсегда.',
                    'Сиздин аккаунтуңуз скриншот жасоого кайра аракеттенгениңиз үчүн 48 саатка бөгөттөлдү. Кийинки бузууда аккаунт биротоло бөгөттөлөт.',
                  )}
                </p>
                <button
                  onClick={() => {
                    screenshotProcessingRef.current = false;
                    setScreenshotModal(null);
                    logout();
                    navigate('/login', { replace: true });
                  }}
                  className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-red-600 px-8 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                >
                  {localizeUi(student?.language, 'Понятно', 'Түшүндүм')}
                </button>
              </>
            )}
            {screenshotModal.type === 'blocked_permanent' && (
              <>
                <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <Ban className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-xl font-bold text-red-600">
                  {localizeUi(student?.language, 'Аккаунт заблокирован навсегда', 'Аккаунт биротоло бөгөттөлдү')}
                </h3>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  {localizeUi(
                    student?.language,
                    'Ваша учётная запись заблокирована навсегда за многократные попытки сделать скриншот. Обратитесь к администратору.',
                    'Сиздин аккаунтуңуз скриншот жасоого көп жолку аракеттер үчүн биротоло бөгөттөлдү. Администраторго кайрылыңыз.',
                  )}
                </p>
                <button
                  onClick={() => {
                    screenshotProcessingRef.current = false;
                    setScreenshotModal(null);
                    logout();
                    navigate('/login', { replace: true });
                  }}
                  className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-red-600 px-8 text-sm font-medium text-white hover:bg-red-700 transition-colors"
                >
                  {localizeUi(student?.language, 'Понятно', 'Түшүндүм')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Watermark overlay */}
      <div
        className="pointer-events-none fixed -inset-1/2 z-[9998]"
        style={{
          backgroundImage: `url(${logo})`,
          backgroundPosition: '0 0',
          backgroundRepeat: 'repeat',
          backgroundSize: '220px auto',
          opacity: 0.05,
          transform: 'rotate(-25deg)',
        }}
        aria-hidden="true"
      />

      <div className="mx-auto max-w-3xl px-3 sm:px-4 py-3 sm:py-8">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          {isTrial ? (
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-rose-400">
              <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {localizeUi(student?.language, 'Сынамык режим', 'Сынамык режими')}
            </div>
          ) : (
            <button
              onClick={() => setShowExitConfirm(true)}
              className="flex items-center gap-1.5 text-xs sm:text-sm font-medium text-stone-400 hover:text-stone-900 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {localizeUi(student?.language, 'Выйти', 'Чыгуу')}
            </button>
          )}

          <div className="flex items-center gap-2 sm:gap-3">
            {tabSwitchCount > 0 && (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[10px] sm:text-xs font-bold text-amber-700">
                {tabSwitchCount}
              </span>
            )}
            <span className="text-xs sm:text-sm font-bold text-stone-500">
              {answeredCount}/{totalQuestions}
            </span>
          </div>
        </div>

        {/* Question counter + subject */}
        <div className="flex items-center justify-between mb-2 sm:mb-4">
          <h1 className="text-lg sm:text-3xl font-black text-black">
            {currentQuestionIndex + 1}<span className="text-stone-300">/{totalQuestions}</span>
          </h1>
          {(() => {
            const subjId = isTrial ? currentQuestion?.question_type : (testData.test_info.subject || '');
            const meta = subjId ? SUBJECT_NAMES[subjId] : null;
            if (!meta) return null;
            return (
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-stone-500">
                {localizeUi(student?.language, meta.ru, meta.kg)}
              </span>
            );
          })()}
        </div>

        {/* Progress bar */}
        <div className="mb-4 sm:mb-6 overflow-hidden rounded-full bg-stone-100 h-1.5 sm:h-2">
          <div
            className="h-full rounded-full bg-black transition-all duration-300"
            style={{ width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%` }}
          />
        </div>

        {apiError && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
            {apiError}
          </div>
        )}

        {/* Question card */}
        <main className="overflow-hidden rounded-2xl sm:rounded-3xl border-2 border-stone-200 bg-white">
          {currentQuestion?.imageUrl && (
            <div className="border-b border-stone-100 px-4 pt-4 sm:px-6 sm:pt-5">
              <img
                src={currentQuestion.imageUrl}
                alt={localizeUi(student?.language, 'Иллюстрация к вопросу', 'Суроого сүрөт')}
                className="max-h-40 sm:max-h-72 w-auto max-w-full rounded-xl border border-stone-200 object-contain pointer-events-none"
                decoding="async"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          )}

          <div className="border-b border-stone-100 px-3.5 py-3 sm:px-6 sm:py-6">
            <h2 className="text-base sm:text-xl font-medium leading-relaxed text-black">
              <MarkdownRenderer content={currentQuestion?.text || ''} />
            </h2>
          </div>

          <div className="px-3.5 py-3.5 sm:px-6 sm:py-6">
            <div className="grid gap-2 sm:gap-3">
              {currentQuestion?.options.map((option, index) => {
                const isSelected = currentSelectedIndex === index;
                const isCorrect = currentReveal?.correct_index === index;
                const isAnswered = Boolean(currentReveal);
                const isPending = isAnswering && isSelected;

                let optionClassName = 'border-stone-200 bg-white hover:border-black active:scale-[0.98]';
                let badgeClassName = 'border-stone-300 bg-white text-stone-500';

                if (isPending) {
                  optionClassName = 'border-black bg-stone-50 text-black animate-pulse';
                  badgeClassName = 'border-black bg-black text-white';
                } else if (isAnswered) {
                  if (isCorrect) {
                    optionClassName = 'border-emerald-500 bg-emerald-50 text-emerald-950';
                    badgeClassName = 'border-emerald-600 bg-emerald-500 text-white';
                  } else if (isSelected) {
                    optionClassName = 'border-rose-500 bg-rose-50 text-rose-950';
                    badgeClassName = 'border-rose-600 bg-rose-500 text-white';
                  } else {
                    optionClassName = 'border-stone-200 bg-stone-50 text-stone-400 opacity-60';
                    badgeClassName = 'border-stone-200 bg-stone-100 text-stone-400';
                  }
                } else if (isSelected) {
                  optionClassName = 'border-black bg-stone-50 text-black';
                  badgeClassName = 'border-black bg-black text-white';
                }

                return (
                  <button
                    key={`${currentQuestion.id}-${index}`}
                    onClick={() => handleAnswerSelect(index)}
                    disabled={isAnswering || isAnswered}
                    className={`flex w-full items-start gap-2.5 sm:gap-4 rounded-xl sm:rounded-2xl border-2 p-2.5 sm:p-4 text-left transition-all ${optionClassName}`}
                  >
                    <span className={`inline-flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg sm:rounded-xl border-2 text-xs sm:text-sm font-bold ${badgeClassName}`}>
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="pt-0.5 sm:pt-1 text-sm sm:text-base font-medium leading-snug">
                      <MarkdownRenderer content={option.text} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {currentReveal && (
            <div className={`border-t px-4 py-4 sm:px-6 sm:py-5 ${currentReveal.is_correct
              ? 'border-emerald-200 bg-emerald-50/50'
              : 'border-rose-200 bg-rose-50/50'
              }`}>
              <div className="flex items-center gap-2.5">
                {currentReveal.is_correct ? (
                  <div className="bg-emerald-100 p-1.5 rounded-lg text-emerald-600">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                ) : (
                  <div className="bg-rose-100 p-1.5 rounded-lg text-rose-600">
                    <XCircle className="h-5 w-5" />
                  </div>
                )}
                <span className={`text-sm font-bold ${currentReveal.is_correct ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {student?.language === 'kg'
                    ? (currentReveal.is_correct ? 'Азаматсың, туура жообу - ' : 'Жаңылышасың, туура жообу - ') + String.fromCharCode(65 + currentReveal.correct_index)
                    : (currentReveal.is_correct ? 'Правильно' : 'Неправильно') + ' — ' + String.fromCharCode(65 + currentReveal.correct_index)}
                </span>
              </div>

              {currentReveal.explanation && (
                <div className="mt-2.5 text-xs sm:text-sm leading-relaxed text-slate-600">
                  <MarkdownRenderer content={currentReveal.explanation} />
                </div>
              )}
            </div>
          )}
        </main>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4 sm:mt-6 gap-2 pb-6">
          <button
            onClick={handleGoPrev}
            disabled={isFirstQuestion}
            className={`inline-flex h-10 sm:h-12 items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-3 sm:px-5 text-xs sm:text-sm font-bold transition-all border-2 ${isFirstQuestion
              ? 'border-stone-100 text-stone-300 cursor-not-allowed'
              : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400 active:scale-[0.97]'
              }`}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{localizeUi(student?.language, 'Назад', 'Артка')}</span>
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            {isLastQuestion ? (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || isAnswering || (isTrial && !currentReveal)}
                className={`inline-flex h-10 sm:h-12 items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-3.5 sm:px-6 text-xs sm:text-sm font-bold transition-colors ${!(isSubmitting || isAnswering || (isTrial && !currentReveal))
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.97]'
                  : 'cursor-not-allowed bg-stone-100 text-stone-400'
                  }`}
              >
                {isSubmitting
                  ? localizeUi(student?.language, 'Отправляем...', 'Жөнөтүүдө...')
                  : localizeUi(student?.language, 'Завершить', 'Аяктоо')}
              </button>
            ) : (
              <button
                onClick={handleGoNext}
                disabled={isAnswering || (isTrial && !currentReveal)}
                className={`inline-flex h-10 sm:h-12 items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-3.5 sm:px-5 text-xs sm:text-sm font-bold transition-all ${!(isAnswering || (isTrial && !currentReveal))
                  ? 'bg-black text-white hover:opacity-80 active:scale-[0.97]'
                  : 'cursor-not-allowed bg-stone-100 text-stone-400'
                  }`}
              >
                <span className="hidden sm:inline">{localizeUi(student?.language, 'Далее', 'Кийинки')}</span>
                <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
