import { BookOpen, Clock3, FlaskConical, User, GraduationCap, LogOut, ChevronRight, Languages, Target, BookMarked, Layers, MessageCircle, History } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useEffect } from 'react';
import { availableTestsQueryOptions, testHistoryQueryOptions } from '../lib/studentQueries';
import logo from '../assets/pro-manas-logo.png';

function localizeUi(language: 'ru' | 'kg' | undefined, ruText: string, kgText: string) {
  return language === 'kg' ? kgText : ruText;
}

export default function DashboardPage() {
  const { student, token, logout } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const studentId = student?.id ?? null;

  const availableQuery = useQuery(
    studentId && token
      ? availableTestsQueryOptions(studentId, token)
      : {
          queryKey: ['student', 'anonymous', 'available'] as const,
          queryFn: async () => null,
          enabled: false,
        },
  );

  useEffect(() => {
    if (!student || !token) {
      navigate('/login', { replace: true });
    }
  }, [navigate, student, token]);

  useEffect(() => {
    if (!studentId || !token || !availableQuery.data) {
      return;
    }

    const navigatorWithConnection = navigator as Navigator & {
      connection?: {
        saveData?: boolean;
        effectiveType?: string;
      };
    };
    const connection = navigatorWithConnection.connection;
    if (connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g') {
      return;
    }

    const warmupTimeout = window.setTimeout(() => {
      void import('./MainTestSelectionPage');
      void import('./TrialTestSelectionPage');
      void import('./TestHistoryPage');
      void queryClient.prefetchQuery(testHistoryQueryOptions(studentId, token));
    }, 400);

    return () => window.clearTimeout(warmupTimeout);
  }, [availableQuery.data, queryClient, studentId, token]);

  const availableData = availableQuery.data ?? null;
  const loading = availableQuery.isLoading;
  const error = availableQuery.error instanceof Error ? availableQuery.error.message : null;
  const mainNode = availableData?.test_types?.find((n) => n.id === 'MAIN' && 'items' in n);
  const trialNode = availableData?.test_types?.find((n) => n.id === 'TRIAL' && 'rounds' in n);
  const subjectCount = mainNode?.items.length ?? 0;
  const maxPartCount = mainNode?.items.reduce((max, item) => {
    const lineMax = item.lines.reduce((lineBest, line) => Math.max(lineBest, line.part_count ?? 0), 0);
    return Math.max(max, lineMax);
  }, 0) ?? 0;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (student?.language === 'kg') {
      if (hour < 12) return 'Кутман таң';
      if (hour < 18) return 'Кутман күн';
      return 'Кутман кеч';
    }
    if (hour < 12) return 'Доброе утро';
    if (hour < 18) return 'Добрый день';
    return 'Добрый вечер';
  };

  return (
    <div className="min-h-screen bg-white font-sans text-stone-900 selection:bg-stone-200">
      {/* Top bar */}
      <div className="border-b-2 border-stone-100">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <img src={logo} alt="ProManas" className="h-16 sm:h-20 w-auto" decoding="async" />
          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href="https://wa.me/996503464540"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white font-medium text-sm px-3 sm:px-4 py-2 rounded-full transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">{localizeUi(student?.language, 'Связаться', 'Байланышуу')}</span>
            </a>
            <button
              onClick={logout}
              className="flex items-center gap-2 text-stone-500 hover:text-red-600 transition-colors font-medium text-sm border-2 border-stone-200 hover:border-red-200 px-3 sm:px-4 py-2 rounded-full"
            >
              <span className="hidden sm:inline">{localizeUi(student?.language, 'Выйти', 'Чыгуу')}</span>
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10">

        {/* Profile card */}
        <div className="mb-6 sm:mb-12 rounded-2xl sm:rounded-3xl border-2 border-stone-200 p-4 sm:p-8">
          <p className="text-stone-400 font-medium uppercase tracking-widest text-[10px] sm:text-xs mb-1.5 sm:mb-2">
            {getGreeting()}
          </p>
          <h1 className="text-2xl sm:text-5xl font-black tracking-tight text-black leading-tight">
            {student?.fullName}
          </h1>
          <div className="flex flex-wrap gap-3 sm:gap-6 mt-3 sm:mt-6 text-xs sm:text-sm font-medium text-stone-500">
            <span className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" /> {student?.grade} {localizeUi(student?.language, 'класс', 'класс')}
            </span>
            <span className="flex items-center gap-2">
              <User className="h-4 w-4" /> {student?.username}
            </span>
          </div>

          {/* Quick Stats Grid */}
          <div className="mt-8 sm:mt-10 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-stone-50 rounded-2xl sm:rounded-3xl p-4 sm:p-6 border-2 border-transparent hover:border-stone-200 hover:bg-stone-100/50 transition-all">
              <Layers className="h-5 w-5 sm:h-7 sm:w-7 text-stone-400 mb-3 sm:mb-4" />
              <div className="text-xl sm:text-2xl font-black text-black mb-1">
                {localizeUi(student?.language, 'Университет', 'Университет')}
              </div>
              <div className="text-[10px] sm:text-xs font-medium text-stone-500">
                {localizeUi(student?.language, 'Подготовка к вступительным тестам', 'Кирүү тесттерине даярдык')}
              </div>
            </div>

            <div className="bg-stone-50 rounded-2xl sm:rounded-3xl p-4 sm:p-6 border-2 border-transparent hover:border-stone-200 hover:bg-stone-100/50 transition-all">
              <BookMarked className="h-5 w-5 sm:h-7 sm:w-7 text-stone-400 mb-3 sm:mb-4" />
              <div className="text-xl sm:text-2xl font-black text-black mb-1">
                {subjectCount} {localizeUi(student?.language, 'предметов', 'сабак')}
              </div>
              <div className="text-[10px] sm:text-xs font-medium text-stone-500">
                {localizeUi(student?.language, 'В вашей программе', 'Сиздин программада')}
              </div>
            </div>

            <div className="bg-stone-50 rounded-2xl sm:rounded-3xl p-4 sm:p-6 border-2 border-transparent hover:border-stone-200 hover:bg-stone-100/50 transition-all">
              <Target className="h-5 w-5 sm:h-7 sm:w-7 text-stone-400 mb-3 sm:mb-4" />
              <div className="text-xl sm:text-2xl font-black text-black mb-1">
                {maxPartCount || 20} {localizeUi(student?.language, 'вариантов', 'вариант')}
              </div>
              <div className="text-[10px] sm:text-xs font-medium text-stone-500">
                {localizeUi(student?.language, 'Тестов по каждому предмету', 'Ар бир предмет боюнча тесттер')}
              </div>
            </div>

            <div className="bg-stone-50 rounded-2xl sm:rounded-3xl p-4 sm:p-6 border-2 border-transparent hover:border-stone-200 hover:bg-stone-100/50 transition-all">
              <Languages className="h-5 w-5 sm:h-7 sm:w-7 text-stone-400 mb-3 sm:mb-4" />
              <div className="text-xl sm:text-2xl font-black text-black mb-1">
                {localizeUi(student?.language, 'RU / KG', 'RU / KG')}
              </div>
              <div className="text-[10px] sm:text-xs font-medium text-stone-500">
                {localizeUi(student?.language, 'Интерфейс и контент', 'Интерфейс жана контент')}
              </div>
            </div>
          </div>
        </div>

        {/* History button */}
        <button
          onClick={() => navigate('/history')}
          className="group flex items-center w-full text-left border-2 border-stone-200 hover:border-black rounded-2xl sm:rounded-3xl p-4 sm:p-6 transition-all active:scale-[0.99] gap-3 sm:gap-5 outline-none mb-4 sm:mb-6"
        >
          <div className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-black group-hover:bg-black group-hover:text-white transition-colors">
            <History className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-xl font-bold mb-0.5">
              {localizeUi(student?.language, 'История тестов', 'Тест тарыхы')}
            </h2>
            <p className="text-stone-500 text-xs sm:text-sm">
              {localizeUi(student?.language, 'Результаты и разбор ответов по пройденным тестам', 'Өтүлгөн тесттердин жыйынтыктары жана талдоо')}
            </p>
          </div>
          <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 text-stone-300 group-hover:text-black transition-colors" />
        </button>

        {/* Tests */}
        {error ? (
          <div className="p-5 border-2 border-red-200 text-red-600 font-medium bg-red-50 rounded-2xl text-sm">{error}</div>
        ) : loading ? (
          <div className="flex items-center gap-4 text-stone-400 font-medium p-6 border-2 border-stone-100 rounded-2xl">
            <Clock3 className="h-5 w-5 animate-spin" />
            {localizeUi(student?.language, 'Загрузка тестов...', 'Тесттер жүктөлүүдө...')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {mainNode && (
              <button
                onClick={() => navigate('/select/main')}
                className="group flex items-center w-full text-left border-2 border-stone-200 hover:border-black rounded-2xl sm:rounded-3xl p-4 sm:p-8 transition-all active:scale-[0.99] gap-3 sm:gap-6 outline-none"
              >
                <div className="flex h-12 w-12 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-black group-hover:bg-black group-hover:text-white transition-colors">
                  <BookOpen className="h-5 w-5 sm:h-7 sm:w-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base sm:text-2xl font-bold mb-0.5 sm:mb-1 truncate">
                    {localizeUi(student?.language, 'Предметный тест', 'Предметтик тест')}
                  </h2>
                  <p className="text-stone-500 text-xs sm:text-sm leading-relaxed line-clamp-2">
                    {localizeUi(student?.language, 'Тренируйтесь и проверяйте знания по университетским предметам.', 'Университеттик предметтер боюнча машыгып, билимиңизди текшериңиз.')}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 text-stone-300 group-hover:text-black transition-colors" />
              </button>
            )}

            {trialNode?.status === 'ready' && (
              <button
                onClick={() => navigate('/select/trial')}
                className="group flex items-center w-full text-left border-2 border-stone-200 hover:border-black rounded-2xl sm:rounded-3xl p-4 sm:p-8 transition-all active:scale-[0.99] gap-3 sm:gap-6 outline-none"
              >
                <div className="flex h-12 w-12 sm:h-16 sm:w-16 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-black group-hover:bg-black group-hover:text-white transition-colors">
                  <FlaskConical className="h-5 w-5 sm:h-7 sm:w-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base sm:text-2xl font-bold mb-0.5 sm:mb-1 truncate">
                    {localizeUi(student?.language, 'Сынамык тест', 'Сынамык тест')}
                  </h2>
                  <p className="text-stone-500 text-xs sm:text-sm leading-relaxed line-clamp-2">
                    {localizeUi(student?.language, 'Пройдите комплексную симуляцию реального экзамена по всем дисциплинам.', 'Бардык сабактар боюнча реалдуу экзамендин комплекстүү симуляциясынан өтүңүз.')}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 sm:h-6 sm:w-6 shrink-0 text-stone-300 group-hover:text-black transition-colors" />
              </button>
            )}

            {(!mainNode && !trialNode) && (
              <div className="p-8 text-center text-stone-500 border-2 border-stone-200 border-dashed rounded-2xl">
                {localizeUi(student?.language, 'Нет доступных тестов в данный момент.', 'Учурда жеткиликтүү тесттер жок.')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
