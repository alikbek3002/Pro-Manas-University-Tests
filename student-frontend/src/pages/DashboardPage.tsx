import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  MoreHorizontal,
  Loader2,
  FileText,
  Target,
  Trophy,
  HelpCircle,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { testHistoryQueryOptions, availableTestsQueryOptions } from '../lib/studentQueries';
import StudentLayout from '../components/StudentLayout';

function localizeUi(language: 'ru' | 'kg' | undefined, ruText: string, kgText: string) {
  return language === 'kg' ? kgText : ruText;
}

function formatShortDate(iso: string, language: 'ru' | 'kg' | undefined): string {
  const locale = language === 'kg' ? 'ky-KG' : 'ru-RU';
  const date = new Date(iso);
  return date.toLocaleString(locale, { month: 'short', day: 'numeric' });
}

function formatRelativeTime(iso: string, language: 'ru' | 'kg' | undefined): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) return localizeUi(language, `${diffMins || 1} мин. назад`, `${diffMins || 1} мөн. мурун`);
  if (diffHours < 24) return localizeUi(language, `${diffHours} ч. назад`, `${diffHours} саат мурун`);
  if (diffDays < 7) return localizeUi(language, `${diffDays} дн. назад`, `${diffDays} күн мурун`);
  return formatShortDate(iso, language);
}

// Map subject IDs for the frontend table
const SUBJECT_MAP: Record<string, { label: string; color: string }> = {
  history: { label: 'История', color: 'bg-emerald-100 text-emerald-700' },
  geography: { label: 'География', color: 'bg-sky-100 text-sky-700' },
  math: { label: 'Математика', color: 'bg-indigo-100 text-indigo-700' },
  russian: { label: 'Русский', color: 'bg-rose-100 text-rose-700' },
  kyrgyz_language: { label: 'Кыргызский', color: 'bg-amber-100 text-amber-700' },
  biology: { label: 'Биология', color: 'bg-green-100 text-green-700' },
  chemistry: { label: 'Химия', color: 'bg-purple-100 text-purple-700' },
  physics: { label: 'Физика', color: 'bg-orange-100 text-orange-700' },
  english: { label: 'Английский', color: 'bg-blue-100 text-blue-700' },
  logic: { label: 'Логика', color: 'bg-pink-100 text-pink-700' }
};

export default function DashboardPage() {
  const { student, token } = useAuthStore();
  const navigate = useNavigate();

  const studentId = student?.id ?? null;

  const historyQuery = useQuery(
    studentId
      ? testHistoryQueryOptions(studentId)
      : { queryKey: ['student', 'anonymous', 'history'] as const, queryFn: async () => null, enabled: false }
  );
  
  // Warmup available tests in background
  useQuery(
    studentId
      ? availableTestsQueryOptions(studentId)
      : { queryKey: ['student', 'anonymous', 'available'] as const, queryFn: async () => null, enabled: false }
  );

  useEffect(() => {
    if (!studentId || !token) return;
    const warmupTimeout = window.setTimeout(() => {
      void import('./MainTestSelectionPage');
      void import('./TestHistoryPage');
    }, 900);
    return () => window.clearTimeout(warmupTimeout);
  }, [studentId, token]);

  const historyError = historyQuery.error instanceof Error ? historyQuery.error.message : null;
  const history = historyQuery.data?.history ?? [];

  const stats = useMemo(() => {
    const totalTests = history.length;
    const totalScore = history.reduce((sum, entry) => sum + entry.score_percent, 0);
    const averageScore = totalTests > 0 ? Math.round(totalScore / totalTests) : 0;
    const bestScore = totalTests > 0 ? history.reduce((best, entry) => Math.max(best, entry.score_percent), 0) : 0;
    const totalQuestions = history.reduce((sum, entry) => sum + entry.total_questions, 0);
    const totalCorrect = history.reduce((sum, entry) => sum + entry.correct_count, 0);
    const accuracyPercent = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
    
    // Find trend across last 2 periods roughly (comparing last 5 vs previous 5 if we have that many, or just arbitrary trend logic)
    const recentAvg = totalTests > 0 ? Math.round((history.slice(0, Math.min(5, totalTests)).reduce((sum, h) => sum + h.score_percent, 0)) / Math.min(5, totalTests)) : 0;
    const trend: 'up' | 'down' | 'neutral' = recentAvg >= averageScore ? 'up' : 'down';
    const trendDiff = Math.abs(recentAvg - averageScore);

    // Barchart data (last 6 tests)
    const lastSix = [...history].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()).slice(0, 6).reverse();
    const chartData = lastSix.map(h => ({
      label: formatShortDate(h.submitted_at, student?.language),
      score: h.score_percent
    }));

    // Pad chart data if fewer than 6
    while (chartData.length > 0 && chartData.length < 6) {
      chartData.unshift({ label: '...', score: 0 });
    }

    return {
      totalTests,
      averageScore,
      bestScore,
      totalQuestions,
      totalCorrect,
      accuracyPercent,
      trend,
      trendDiff,
      chartData
    };
  }, [history, student?.language]);

  const recentActivity = [...history].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()).slice(0, 5);

  if (historyQuery.isLoading) {
    return (
      <StudentLayout title={localizeUi(student?.language, 'Панель студента', 'Студент панели')}>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-stone-300" />
        </div>
      </StudentLayout>
    );
  }

  return (
    <StudentLayout
      title={localizeUi(student?.language, 'Панель студента', 'Студент панели')}
      subtitle={localizeUi(student?.language, 'Статистика обучения и последние результаты', 'Окуу статистикасы жана акыркы жыйынтыктар')}
    >
      {historyError && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">{historyError}</p>
        </div>
      )}

      <div className="space-y-6">
        {/* Top 4 Metric Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title={localizeUi(student?.language, 'Всего тестов', 'Бардык тесттер')}
            value={stats.totalTests.toString()}
            icon={<FileText className="h-5 w-5" />}
            trend={stats.totalTests > 0 ? 'up' : 'neutral'}
            trendText={localizeUi(student?.language, 'с начала года', 'жыл башынан бери')}
            onView={() => navigate('/history')}
            language={student?.language}
          />
          <Card
            title={localizeUi(student?.language, 'Средний результат', 'Орточо жыйынтык')}
            value={`${stats.averageScore}%`}
            icon={<Target className="h-5 w-5" />}
            trend={stats.trend}
            trendText={localizeUi(student?.language, `${stats.trendDiff}% по сравнению со средним`, `орточодон ${stats.trendDiff}%`)}
            onView={() => navigate('/history')}
            language={student?.language}
          />
          <Card
            title={localizeUi(student?.language, 'Лучший результат', 'Эң мыкты жыйынтык')}
            value={`${stats.bestScore}%`}
            icon={<Trophy className="h-5 w-5" />}
            trend="up"
            trendText={localizeUi(student?.language, 'лучший тест', 'мыкты тест')}
            onView={() => navigate('/history')}
            language={student?.language}
          />
          <Card
            title={localizeUi(student?.language, 'Вопросов отвечено', 'Жооп берилген суроолор')}
            value={stats.totalQuestions.toString()}
            icon={<HelpCircle className="h-5 w-5" />}
            trend="up"
            trendText={localizeUi(student?.language, `${stats.totalCorrect} верных ответов`, `${stats.totalCorrect} туура жооп`)}
            onView={() => navigate('/history')}
            language={student?.language}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Main Bar Chart */}
          <div className="col-span-1 lg:col-span-2 flex flex-col rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-base font-bold text-stone-900">{localizeUi(student?.language, 'Динамика результатов', 'Жыйынтыктардын динамикасы')}</h3>
                <p className="mt-1 text-sm text-stone-500">{localizeUi(student?.language, 'Последние 6 тестов', 'Акыркы 6 тест')}</p>
              </div>
            </div>
            
            <div className="mt-auto h-48 sm:h-64 flex items-end gap-2 sm:gap-6 pt-4">
              {stats.chartData.length > 0 ? stats.chartData.map((data, i) => (
                <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
                  {/* Tooltip on hover */}
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100 z-10 rounded bg-stone-900 px-2 py-1 text-xs text-white whitespace-nowrap pointer-events-none">
                    {data.score}%
                  </div>
                  <div 
                    className={`w-full rounded-t-md transition-all duration-500 hover:opacity-80 ${i === stats.chartData.length - 1 ? 'bg-emerald-500' : 'bg-emerald-200/60'}`}
                    style={{ height: `${Math.max(4, data.score)}%` }} // Minimum height so it's visible even at 0
                  />
                  <div className="mt-3 text-center text-xs font-medium text-stone-500">
                    {data.label}
                  </div>
                </div>
              )) : (
                <div className="w-full h-full flex items-center justify-center text-stone-400 text-sm">
                  {localizeUi(student?.language, 'Нет данных для графика', 'График үчүн маалымат жок')}
                </div>
              )}
            </div>
          </div>

          {/* Donut Chart */}
          <div className="col-span-1 flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm relative">
            <h3 className="w-full text-center text-base font-bold text-stone-900 mb-1">{localizeUi(student?.language, 'Точность ответов', 'Жооптордун тактыгы')}</h3>
            <p className="w-full text-center text-sm text-stone-500 mb-8">{localizeUi(student?.language, 'За всё время', 'Бардык убакытта')}</p>
            
            <div className="relative flex h-48 w-48 items-center justify-center">
              {stats.totalQuestions > 0 ? (
                <>
                  <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90 drop-shadow-md">
                    {/* Background Circle */}
                    <path
                      className="text-stone-100"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    {/* Foreground Circle */}
                    <path
                      className="text-emerald-500"
                      strokeDasharray={`${stats.accuracyPercent}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black text-stone-900">{stats.accuracyPercent}%</span>
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-400 mt-1">
                      {localizeUi(student?.language, 'Правильно', 'Туура')}
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-sm text-stone-400">{localizeUi(student?.language, 'Нет данных', 'Маалымат жок')}</div>
              )}
            </div>

            <div className="mt-8 text-center">
              <p className="text-sm font-semibold text-stone-900">
                {localizeUi(student?.language, 'Продолжайте в том же духе!', 'Ушундай уланта бериңиз!')}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {localizeUi(student?.language, `Изучено ${stats.totalQuestions} вопросов`, `${stats.totalQuestions} суроо изилденди`)}
              </p>
            </div>
          </div>
        </div>

        {/* Recent Activity Table */}
        <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-100 p-5 sm:px-6">
            <h3 className="text-base font-bold text-stone-900">{localizeUi(student?.language, 'Последняя активность', 'Акыркы аракеттер')}</h3>
            <button
              onClick={() => navigate('/history')}
              className="text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors"
            >
              {localizeUi(student?.language, 'Смотреть всё', 'Баарын көрүү')} →
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-stone-600">
              <thead className="bg-stone-50/50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-5 py-4 sm:px-6 font-semibold">{localizeUi(student?.language, 'Тест / Направление', 'Тест / Багыт')}</th>
                  <th className="px-5 py-4 sm:px-6 font-semibold">{localizeUi(student?.language, 'Статус', 'Статус')}</th>
                  <th className="px-5 py-4 sm:px-6 font-semibold">{localizeUi(student?.language, 'ID Попытки', 'Аракет ID')}</th>
                  <th className="px-5 py-4 sm:px-6 font-semibold">{localizeUi(student?.language, 'Дата', 'Дата')}</th>
                  <th className="px-5 py-4 sm:px-6 font-semibold text-right">{localizeUi(student?.language, 'Результат', 'Жыйынтык')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {recentActivity.length > 0 ? recentActivity.map((entry) => {
                  const subjectMeta = SUBJECT_MAP[entry.subject || ''] || { label: entry.subject || '', color: 'bg-stone-100 text-stone-700' };
                  const isPassed = entry.score_percent >= 70;
                  
                  return (
                    <tr key={entry.id} className="transition-colors hover:bg-stone-50/50">
                      <td className="px-5 py-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 font-bold text-stone-500">
                            {entry.type === 'MAIN' ? 'M' : 'T'}
                          </div>
                          <div>
                            <p className="font-semibold text-stone-900">{entry.type === 'MAIN' ? localizeUi(student?.language, 'Предметный тест', 'Предметтик тест') : localizeUi(student?.language, 'Сынамык тест', 'Сынамык тест')}</p>
                            <p className="text-xs text-stone-500">{subjectMeta.label}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 sm:px-6">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${isPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                          {isPassed ? localizeUi(student?.language, 'Успешно', 'Ийгиликтүү') : localizeUi(student?.language, 'Не сдан', 'Өткөн жок')}
                        </span>
                      </td>
                      <td className="px-5 py-4 sm:px-6 font-mono text-xs text-stone-400">
                        #{entry.id.substring(0, 6)}
                      </td>
                      <td className="px-5 py-4 sm:px-6">
                        {formatRelativeTime(entry.submitted_at, student?.language)}
                      </td>
                      <td className="px-5 py-4 sm:px-6 text-right font-bold text-stone-900">
                        {entry.score_percent}%
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-stone-400">
                      {localizeUi(student?.language, 'История тестов пуста. Пройдите первый тест, чтобы увидеть результаты.', 'Тест тарыхы бош. Натыйжаларды көрүү үчүн биринчи тесттен өтүңүз.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </StudentLayout>
  );
}

// Sub-components

function Card({ 
  title, 
  value, 
  icon, 
  trend, 
  trendText, 
  onView, 
  language 
}: { 
  title: string; 
  value: string; 
  icon: React.ReactNode; 
  trend: 'up' | 'down' | 'neutral'; 
  trendText: string; 
  onView: () => void;
  language?: 'ru' | 'kg';
}) {
  return (
    <div className="relative flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-center justify-between text-stone-400">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100/80 text-stone-600">
          {icon}
        </div>
        <button onClick={onView} className="rounded-full p-1 hover:bg-stone-100 transition-colors">
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-medium text-stone-500">{title}</h3>
        <p className="mt-1 text-3xl font-black text-stone-900">{value}</p>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-4">
        <div className="flex items-center gap-1.5 text-xs">
          {trend === 'up' && <span className="flex items-center font-bold text-emerald-600"><TrendingUp className="mr-1 h-3.5 w-3.5" /> +</span>}
          {trend === 'down' && <span className="flex items-center font-bold text-red-600"><TrendingDown className="mr-1 h-3.5 w-3.5" /> -</span>}
          <span className="text-stone-400">{trendText}</span>
        </div>
        <button 
          onClick={onView}
          className="flex items-center text-sm font-semibold text-stone-900 hover:text-emerald-600 transition-colors"
        >
          {localizeUi(language, 'Подробнее', 'Кененирээк')} <ArrowRight className="ml-1 h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
