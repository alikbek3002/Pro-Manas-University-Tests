import { BookOpen, FlaskConical, Check, X, ChevronDown, ChevronUp, Clock3, History } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { useMemo, useState } from 'react';
import { type TestHistoryDetail, type TestHistoryEntry } from '../lib/api';
import { testHistoryDetailQueryOptions, testHistoryQueryOptions } from '../lib/studentQueries';
import StudentLayout from '../components/StudentLayout';

function localizeUi(language: 'ru' | 'kg' | undefined, ruText: string, kgText: string) {
  return language === 'kg' ? kgText : ruText;
}

function subjectLabel(subject: string | null, language: 'ru' | 'kg' | undefined): string {
  const kg = language === 'kg';
  switch (subject) {
    case 'physics': return kg ? 'Физика' : 'Физика';
    case 'chemistry': return kg ? 'Химия' : 'Химия';
    case 'biology': return kg ? 'Биология' : 'Биология';
    case 'geography': return kg ? 'География' : 'География';
    case 'history': return kg ? 'Тарых' : 'История';
    case 'english': return kg ? 'Англис тили' : 'Английский';
    case 'russian': return kg ? 'Орус тили' : 'Русский';
    case 'kyrgyz':
    case 'kyrgyz_language':
      return kg ? 'Кыргыз тили' : 'Кыргызский язык';
    case 'kyrgyz_literature':
      return kg ? 'Кыргыз адабияты' : 'Кыргыз адабият';
    case 'mathlogic': return kg ? 'Мат/Логика' : 'Мат/Логика';
    case 'math': return kg ? 'Математика' : 'Математика';
    case 'logic': return kg ? 'Логика' : 'Логика';
    default: return subject || '—';
  }
}

function testTitle(entry: TestHistoryEntry, language: 'ru' | 'kg' | undefined): string {
  if (entry.type === 'MAIN') {
    const base = `${localizeUi(language, 'Предметный', 'Предметтик')}: ${subjectLabel(entry.subject, language)}`;
    if (entry.part) {
      return `${base} (${localizeUi(language, `Тест ${entry.part}`, `Тест ${entry.part}`)})`;
    }
    return base;
  }
  return `${localizeUi(language, 'Пробный', 'Сынамык')}: ${localizeUi(language, `Тур ${entry.round}`, `Тур ${entry.round}`)}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  );
}

export default function TestHistoryPage() {
  const { student } = useAuthStore();
  const studentId = student?.id ?? null;

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const historyQuery = useQuery(
    studentId
      ? testHistoryQueryOptions(studentId)
      : {
        queryKey: ['student', 'anonymous', 'history'] as const,
        queryFn: async () => null as { history: TestHistoryEntry[] } | null,
        enabled: false,
      },
  );

  const history = useMemo(
    () => historyQuery.data?.history ?? [],
    [historyQuery.data],
  );
  const loading = historyQuery.isLoading;
  const error = historyQuery.error instanceof Error ? historyQuery.error.message : null;
  const expandedEntry = useMemo(
    () => history.find((entry) => entry.id === expandedId) ?? null,
    [expandedId, history],
  );

  const detailQuery = useQuery(
    studentId && expandedEntry
      ? testHistoryDetailQueryOptions(studentId, expandedEntry.id, expandedEntry.type)
      : {
        queryKey: ['student', 'anonymous', 'history', 'disabled', 'disabled'] as const,
        queryFn: async () => null as TestHistoryDetail | null,
        enabled: false,
      },
  );

  const handleToggle = (entry: TestHistoryEntry) => {
    if (expandedId === entry.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(entry.id);
  };

  return (
    <StudentLayout
      title={localizeUi(student?.language, 'История тестов', 'Тест тарыхы')}
      subtitle={localizeUi(
        student?.language,
        'Результаты и разбор всех пройденных тестов',
        'Өтүлгөн тесттердин жыйынтыктары жана талдоосу',
      )}
    >
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl sm:text-4xl font-black text-black mb-1">
          {localizeUi(student?.language, 'История тестов', 'Тест тарыхы')}
        </h1>
        <p className="text-stone-400 text-sm mb-8">
          {localizeUi(student?.language, 'Все пройденные тесты с разбором ответов', 'Бардык өтүлгөн тесттер жана жооптордун талдоосу')}
        </p>

        {loading ? (
          <div className="flex items-center gap-4 text-stone-400 font-medium p-6 border-2 border-stone-100 rounded-2xl">
            <Clock3 className="h-5 w-5 animate-spin" />
            {localizeUi(student?.language, 'Загрузка...', 'Жүктөлүүдө...')}
          </div>
        ) : error ? (
          <div className="p-5 border-2 border-red-200 text-red-600 font-medium bg-red-50 rounded-2xl text-sm">{error}</div>
        ) : history.length === 0 ? (
          <div className="p-12 text-center text-stone-400 border-2 border-stone-200 border-dashed rounded-2xl">
            <History className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="font-semibold text-base">
              {localizeUi(student?.language, 'Пройденных тестов пока нет', 'Өтүлгөн тесттер азырынча жок')}
            </p>
            <p className="text-sm mt-1">
              {localizeUi(student?.language, 'После прохождения теста результаты появятся здесь', 'Тест өткөндөн кийин жыйынтыктар бул жерде чыгат')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => {
              const isExpanded = expandedId === entry.id;
              const entryDetail = isExpanded ? detailQuery.data : undefined;
              const isLoadingDetail = isExpanded && detailQuery.isLoading;
              const detailError = isExpanded && detailQuery.error instanceof Error
                ? detailQuery.error.message
                : null;
              const scoreColor =
                entry.score_percent >= 70
                  ? 'bg-green-500'
                  : entry.score_percent >= 40
                    ? 'bg-orange-400'
                    : 'bg-red-400';
              const scoreTextColor =
                entry.score_percent >= 70
                  ? 'text-green-700'
                  : entry.score_percent >= 40
                    ? 'text-orange-600'
                    : 'text-red-600';

              return (
                <div key={entry.id} className="border-2 border-stone-200 rounded-2xl overflow-hidden transition-all">
                  {/* Card header */}
                  <button
                    onClick={() => handleToggle(entry)}
                    className="w-full flex items-center gap-4 p-4 sm:p-5 hover:bg-stone-50 transition-colors text-left"
                  >
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${entry.type === 'MAIN' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                        }`}
                    >
                      {entry.type === 'MAIN' ? (
                        <BookOpen className="h-5 w-5" />
                      ) : (
                        <FlaskConical className="h-5 w-5" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm sm:text-base text-black truncate">
                        {testTitle(entry, student?.language)}
                      </div>
                      <div className="text-xs text-stone-400 mt-0.5">{formatDateTime(entry.submitted_at)}</div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex-1 bg-stone-100 rounded-full h-1.5 max-w-[100px]">
                          <div
                            className={`h-1.5 rounded-full ${scoreColor}`}
                            style={{ width: `${Math.min(100, entry.score_percent)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${scoreTextColor}`}>
                          {entry.correct_count}/{entry.total_questions} ({entry.score_percent}%)
                        </span>
                      </div>
                    </div>

                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-stone-400 shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-stone-400 shrink-0" />
                    )}
                  </button>

                  {/* Detail section */}
                  {isExpanded && (
                    <div className="border-t-2 border-stone-100 px-4 sm:px-5 py-4">
                      {isLoadingDetail ? (
                        <div className="flex items-center gap-3 text-stone-400 py-4">
                          <Clock3 className="h-4 w-4 animate-spin" />
                          <span className="text-sm">
                            {localizeUi(student?.language, 'Загрузка вопросов...', 'Суроолор жүктөлүүдө...')}
                          </span>
                        </div>
                      ) : detailError && !entryDetail ? (
                        <p className="text-sm text-red-500 py-3">{detailError}</p>
                      ) : entryDetail ? (
                        <div className="space-y-3">
                          {entryDetail.questions.map((q) => {
                            const isCorrect = q.is_correct;
                            const notAnswered = !q.answered;
                            return (
                              <div
                                key={q.id}
                                className={`rounded-xl border p-4 ${notAnswered
                                  ? 'border-stone-200 bg-stone-50'
                                  : isCorrect
                                    ? 'border-green-200 bg-green-50/40'
                                    : 'border-red-200 bg-red-50/40'
                                  }`}
                              >
                                {/* Question header */}
                                <div className="flex items-start gap-3 mb-3">
                                  <span
                                    className={`shrink-0 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${notAnswered
                                      ? 'bg-stone-200 text-stone-500'
                                      : isCorrect
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-red-100 text-red-700'
                                      }`}
                                  >
                                    {notAnswered ? '–' : isCorrect ? '✓' : '✗'}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-1">
                                      {subjectLabel(q.subject, student?.language)} · {q.grade}{' '}
                                      {localizeUi(student?.language, 'кл.', 'кл.')}
                                      {q.topic ? ` · ${q.topic}` : ''}
                                    </p>
                                    <p className="text-sm font-medium text-stone-900 leading-relaxed">
                                      {q.text ||
                                        localizeUi(
                                          student?.language,
                                          '(вопрос удалён)',
                                          '(суроо өчүрүлгөн)',
                                        )}
                                    </p>
                                    {q.image_url && (
                                      <img
                                        src={q.image_url}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                        className="mt-2 rounded-lg max-h-48 object-contain"
                                      />
                                    )}
                                  </div>
                                </div>

                                {/* Options */}
                                {q.options.length > 0 && (
                                  <div className="space-y-1.5 ml-9">
                                    {q.options.map((opt, i) => {
                                      const isSelected = q.selected_index === i;
                                      const isCorrectOpt = q.correct_index === i;
                                      let cls =
                                        'border border-stone-200 bg-white text-stone-600';
                                      if (isCorrectOpt)
                                        cls =
                                          'border border-green-400 bg-green-50 text-green-800 font-medium';
                                      if (isSelected && !isCorrectOpt)
                                        cls =
                                          'border border-red-400 bg-red-50 text-red-800';
                                      return (
                                        <div
                                          key={i}
                                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${cls}`}
                                        >
                                          <span className="shrink-0 text-xs font-bold opacity-40 w-4">
                                            {String.fromCharCode(65 + i)}
                                          </span>
                                          <span className="flex-1">{opt.text}</span>
                                          {isCorrectOpt && (
                                            <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                                          )}
                                          {isSelected && !isCorrectOpt && (
                                            <X className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </StudentLayout>
  );
}
