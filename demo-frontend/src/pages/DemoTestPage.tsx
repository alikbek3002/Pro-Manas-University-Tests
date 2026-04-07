import { startTransition, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, LogOut, XCircle } from 'lucide-react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import {
  answerDemoQuestion,
  submitDemoTest,
  type AnswerQuestionResponse,
  type GeneratedTestResponse,
  type SubmitTestResponse,
} from '../lib/api';
import { localizeUi, type DemoLanguage } from '../lib/demoLanguage';
import logo from '../assets/pro-manas-logo.png';

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

export default function DemoTestPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const preloadedImagesRef = useRef(new Set<string>());
  const testData = location.state?.testData as GeneratedTestResponse | undefined;

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<RevealState>({});
  const [submitResult, setSubmitResult] = useState<SubmitTestResponse | null>(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  if (!testData) {
    return <Navigate to="/" replace />;
  }

  const language = (testData.test_info.language || 'ru') as DemoLanguage;
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

    setSelectedAnswers((prev) => ({ ...prev, [currentQuestion.id]: selectedIndex }));
    setIsAnswering(true);
    setApiError(null);

    try {
      const reveal = await answerDemoQuestion({
        test_session_id: testData.test_session_id,
        question_id: currentQuestion.id,
        selected_index: selectedIndex,
      });

      setRevealedAnswers((prev) => ({ ...prev, [currentQuestion.id]: reveal }));
    } catch (error) {
      setSelectedAnswers((prev) => {
        const next = { ...prev };
        delete next[currentQuestion.id];
        return next;
      });
      setApiError(error instanceof Error ? error.message : localizeUi(language, 'Ошибка проверки ответа', 'Жоопту текшерүү катасы'));
    } finally {
      setIsAnswering(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setApiError(null);

    try {
      const result = await submitDemoTest({
        test_session_id: testData.test_session_id,
      });
      setSubmitResult(result);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : localizeUi(language, 'Ошибка отправки результата', 'Жыйынтыкты жөнөтүү катасы'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExitTest = () => {
    setShowExitConfirm(false);
    navigate('/select');
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

  if (submitResult) {
    const scoreColor = submitResult.score >= 70
      ? 'text-emerald-600'
      : submitResult.score >= 40
        ? 'text-amber-600'
        : 'text-rose-600';

    const scoreBg = submitResult.score >= 70
      ? 'bg-emerald-50 border-emerald-200'
      : submitResult.score >= 40
        ? 'bg-amber-50 border-amber-200'
        : 'bg-rose-50 border-rose-200';

    const scoreIconBg = submitResult.score >= 70
      ? 'bg-emerald-100 text-emerald-600'
      : submitResult.score >= 40
        ? 'bg-amber-100 text-amber-600'
        : 'bg-rose-100 text-rose-600';

    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50 px-4">
        <div className="mx-auto w-full max-w-md rounded-2xl border bg-white p-6 text-center shadow-[0_22px_65px_-38px_rgba(15,23,42,0.4)] sm:rounded-[32px] sm:p-8">
          <div className={`mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full ${scoreIconBg}`}>
            {submitResult.score >= 70
              ? <CheckCircle2 className="h-8 w-8" />
              : <XCircle className="h-8 w-8" />}
          </div>

          <h2 className="mt-5 text-2xl font-bold text-slate-950 sm:text-3xl">
            {localizeUi(language, 'Демо-тест завершён', 'Демо-тест аяктады')}
          </h2>

          <div className={`mx-auto mt-4 max-w-[200px] rounded-2xl border p-4 ${scoreBg}`}>
            <p className={`text-4xl font-black ${scoreColor}`}>{submitResult.score}%</p>
            <p className="mt-1 text-xs text-slate-500">
              {localizeUi(language, 'результат', 'жыйынтык')}
            </p>
          </div>

          <div className="mt-4 space-y-1.5 text-sm text-slate-600">
            <p>
              {localizeUi(language, 'Правильных', 'Туура жооптор')}: <span className="font-bold text-emerald-600">{submitResult.correct}</span> / {submitResult.total}
            </p>
            <p>
              {localizeUi(language, 'Отвечено', 'Жооп берилди')}: <span className="font-bold text-slate-900">{submitResult.answered}</span> / {submitResult.total}
            </p>
          </div>

          <button
            onClick={handleExitTest}
            className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 px-8 text-sm font-bold text-white transition-colors hover:bg-slate-800 sm:w-auto"
          >
            {localizeUi(language, 'К выбору теста', 'Тест тандаган бетке')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[9999] overflow-auto bg-white font-sans text-stone-900"
      style={{
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        touchAction: 'manipulation',
      } as CSSProperties}
    >
      {showExitConfirm && (
        <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative z-[20001] mx-4 max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl sm:p-8">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <LogOut className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-slate-900">
              {localizeUi(language, 'Выйти из теста?', 'Тесттен чыгасызбы?')}
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              {localizeUi(language, 'Прогресс не будет сохранён.', 'Жүрүш сакталбайт.')}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="h-11 flex-1 rounded-xl border-2 border-stone-200 text-sm font-bold text-stone-700 transition-colors hover:bg-stone-50"
              >
                {localizeUi(language, 'Остаться', 'Калуу')}
              </button>
              <button
                onClick={handleExitTest}
                className="h-11 flex-1 rounded-xl bg-rose-600 text-sm font-bold text-white transition-colors hover:bg-rose-700"
              >
                {localizeUi(language, 'Выйти', 'Чыгуу')}
              </button>
            </div>
          </div>
        </div>
      )}

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

      <div className="mx-auto max-w-3xl px-3 py-3 sm:px-4 sm:py-8">
        <div className="mb-4 flex items-center justify-between sm:mb-6">
          <button
            onClick={() => setShowExitConfirm(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-stone-400 transition-colors hover:text-stone-900 sm:text-sm"
          >
            <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            {localizeUi(language, 'Выйти', 'Чыгуу')}
          </button>

          <span className="text-xs font-bold text-stone-500 sm:text-sm">
            {answeredCount}/{totalQuestions}
          </span>
        </div>

        <div className="mb-2 flex items-center justify-between sm:mb-4">
          <h1 className="text-lg font-black text-black sm:text-3xl">
            {currentQuestionIndex + 1}<span className="text-stone-300">/{totalQuestions}</span>
          </h1>
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 sm:text-xs">
            {(() => {
              const meta = SUBJECT_NAMES[testData.test_info.subject || ''];
              if (!meta) {
                return localizeUi(language, 'Демо-тест', 'Демо-тест');
              }
              return localizeUi(language, meta.ru, meta.kg);
            })()}
          </span>
        </div>

        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-stone-100 sm:mb-6 sm:h-2">
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

        <main className="overflow-hidden rounded-2xl border-2 border-stone-200 bg-white sm:rounded-3xl">
          {currentQuestion?.imageUrl && (
            <div className="border-b border-stone-100 px-4 pt-4 sm:px-6 sm:pt-5">
              <img
                src={currentQuestion.imageUrl}
                alt={localizeUi(language, 'Иллюстрация к вопросу', 'Суроого сүрөт')}
                className="pointer-events-none max-h-40 max-w-full rounded-xl border border-stone-200 object-contain sm:max-h-72"
                decoding="async"
                draggable={false}
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          )}

          <div className="border-b border-stone-100 px-3.5 py-3 sm:px-6 sm:py-6">
            <h2 className="text-base font-medium leading-relaxed text-black sm:text-xl">
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
                  optionClassName = 'animate-pulse border-black bg-stone-50 text-black';
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
                    className={`flex w-full items-start gap-2.5 rounded-xl border-2 p-2.5 text-left transition-all sm:gap-4 sm:rounded-2xl sm:p-4 ${optionClassName}`}
                  >
                    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 text-xs font-bold sm:h-9 sm:w-9 sm:rounded-xl sm:text-sm ${badgeClassName}`}>
                      {String.fromCharCode(65 + index)}
                    </span>
                    <span className="pt-0.5 text-sm font-medium leading-snug sm:pt-1 sm:text-base">
                      <MarkdownRenderer content={option.text} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {currentReveal && (
            <div
              className={`border-t px-4 py-4 sm:px-6 sm:py-5 ${
                currentReveal.is_correct
                  ? 'border-emerald-200 bg-emerald-50/50'
                  : 'border-rose-200 bg-rose-50/50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {currentReveal.is_correct ? (
                  <div className="rounded-lg bg-emerald-100 p-1.5 text-emerald-600">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                ) : (
                  <div className="rounded-lg bg-rose-100 p-1.5 text-rose-600">
                    <XCircle className="h-5 w-5" />
                  </div>
                )}
                <span className={`text-sm font-bold ${currentReveal.is_correct ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {currentReveal.is_correct
                    ? localizeUi(language, 'Правильно', 'Туура')
                    : localizeUi(language, 'Неправильно', 'Туура эмес')}
                  {' — '}
                  {String.fromCharCode(65 + currentReveal.correct_index)}
                </span>
              </div>

              {currentReveal.explanation && (
                <div className="mt-2.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
                  <MarkdownRenderer content={currentReveal.explanation} />
                </div>
              )}
            </div>
          )}
        </main>

        <div className="mt-4 flex items-center justify-between gap-2 pb-6 sm:mt-6">
          <button
            onClick={handleGoPrev}
            disabled={isFirstQuestion}
            className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border-2 px-3 text-xs font-bold transition-all sm:h-12 sm:gap-2 sm:px-5 sm:text-sm ${
              isFirstQuestion
                ? 'cursor-not-allowed border-stone-100 text-stone-300'
                : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400 active:scale-[0.97]'
            }`}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{localizeUi(language, 'Назад', 'Артка')}</span>
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            {isLastQuestion ? (
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || isAnswering}
                className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition-colors sm:h-12 sm:gap-2 sm:px-6 sm:text-sm ${
                  !(isSubmitting || isAnswering)
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.97]'
                    : 'cursor-not-allowed bg-stone-100 text-stone-400'
                }`}
              >
                {isSubmitting
                  ? localizeUi(language, 'Отправляем...', 'Жөнөтүп жатабыз...')
                  : localizeUi(language, 'Завершить', 'Аяктоо')}
              </button>
            ) : (
              <button
                onClick={handleGoNext}
                disabled={isAnswering}
                className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition-all sm:h-12 sm:gap-2 sm:px-5 sm:text-sm ${
                  !isAnswering
                    ? 'bg-black text-white hover:opacity-80 active:scale-[0.97]'
                    : 'cursor-not-allowed bg-stone-100 text-stone-400'
                }`}
              >
                <span className="hidden sm:inline">{localizeUi(language, 'Далее', 'Кийинки')}</span>
                <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
