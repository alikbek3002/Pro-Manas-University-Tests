import { type ReactNode, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Atom,
  BookText,
  BookOpen,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Dna,
  FlaskConical,
  Globe2,
  History,
  Landmark,
  LayoutDashboard,
  Languages,
  LogOut,
  Menu,
  Sigma,
  ScrollText,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import logo from '../assets/pro-manas-logo.png';
import { useAuthStore } from '../store/authStore';
import { availableTestsQueryOptions } from '../lib/studentQueries';
import { cn } from '../lib/utils';
import { getFallbackMainItems } from '../lib/subjectCatalog';

function localizeUi(language: 'ru' | 'kg' | undefined, ruText: string, kgText: string) {
  return language === 'kg' ? kgText : ruText;
}

function accountTypeLabel(language: 'ru' | 'kg' | undefined, accountType?: string) {
  switch (accountType) {
    case 'ort':
      return localizeUi(language, 'ОРТ', 'ОРТ');
    case 'medical':
      return localizeUi(language, 'Медицинский', 'Медициналык');
    case 'manas':
      return localizeUi(language, 'Манас', 'Манас');
    default:
      return localizeUi(language, 'Студент', 'Студент');
  }
}

function manasTrackLabel(language: 'ru' | 'kg' | undefined, track?: string | null) {
  if (track === 'all_subjects') return localizeUi(language, 'Все предметы', 'Бардык предметтер');
  if (track === 'humanities') return localizeUi(language, 'Гуманитарий', 'Гуманитардык');
  if (track === 'exact_sciences') return localizeUi(language, 'Точные науки', 'Так илимдер');
  return '';
}

const SUBJECT_ICON_MAP = {
  math: Sigma,
  mathlogic: BrainCircuit,
  logic: BrainCircuit,
  physics: Atom,
  chemistry: FlaskConical,
  biology: Dna,
  geography: Globe2,
  history: Landmark,
  english: Languages,
  russian: BookText,
  kyrgyz: BookText,
  kyrgyz_language: BookText,
  kyrgyz_literature: ScrollText,
} as const;

const SUBJECT_COLOR_MAP: Record<string, { active: string; iconBg: string; iconText: string; hoverBg: string; hoverText: string }> = {
  math:              { active: 'bg-indigo-600',  iconBg: 'bg-indigo-100',  iconText: 'text-indigo-600',  hoverBg: 'hover:bg-indigo-50',  hoverText: 'hover:text-indigo-700' },
  mathlogic:         { active: 'bg-pink-600',    iconBg: 'bg-pink-100',    iconText: 'text-pink-600',    hoverBg: 'hover:bg-pink-50',    hoverText: 'hover:text-pink-700' },
  logic:             { active: 'bg-pink-600',    iconBg: 'bg-pink-100',    iconText: 'text-pink-600',    hoverBg: 'hover:bg-pink-50',    hoverText: 'hover:text-pink-700' },
  physics:           { active: 'bg-orange-600',  iconBg: 'bg-orange-100',  iconText: 'text-orange-600',  hoverBg: 'hover:bg-orange-50',  hoverText: 'hover:text-orange-700' },
  chemistry:         { active: 'bg-purple-600',  iconBg: 'bg-purple-100',  iconText: 'text-purple-600',  hoverBg: 'hover:bg-purple-50',  hoverText: 'hover:text-purple-700' },
  biology:           { active: 'bg-green-600',   iconBg: 'bg-green-100',   iconText: 'text-green-600',   hoverBg: 'hover:bg-green-50',   hoverText: 'hover:text-green-700' },
  geography:         { active: 'bg-sky-600',     iconBg: 'bg-sky-100',     iconText: 'text-sky-600',     hoverBg: 'hover:bg-sky-50',     hoverText: 'hover:text-sky-700' },
  history:           { active: 'bg-emerald-600', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', hoverBg: 'hover:bg-emerald-50', hoverText: 'hover:text-emerald-700' },
  english:           { active: 'bg-blue-600',    iconBg: 'bg-blue-100',    iconText: 'text-blue-600',    hoverBg: 'hover:bg-blue-50',    hoverText: 'hover:text-blue-700' },
  russian:           { active: 'bg-rose-600',    iconBg: 'bg-rose-100',    iconText: 'text-rose-600',    hoverBg: 'hover:bg-rose-50',    hoverText: 'hover:text-rose-700' },
  kyrgyz:            { active: 'bg-amber-600',   iconBg: 'bg-amber-100',   iconText: 'text-amber-600',   hoverBg: 'hover:bg-amber-50',   hoverText: 'hover:text-amber-700' },
  kyrgyz_language:   { active: 'bg-amber-600',   iconBg: 'bg-amber-100',   iconText: 'text-amber-600',   hoverBg: 'hover:bg-amber-50',   hoverText: 'hover:text-amber-700' },
  kyrgyz_literature: { active: 'bg-yellow-600',  iconBg: 'bg-yellow-100',  iconText: 'text-yellow-700',  hoverBg: 'hover:bg-yellow-50',  hoverText: 'hover:text-yellow-700' },
};

const DEFAULT_SUBJECT_COLORS = {
  active: 'bg-stone-700',
  iconBg: 'bg-stone-100',
  iconText: 'text-stone-600',
  hoverBg: 'hover:bg-stone-100',
  hoverText: 'hover:text-stone-900',
};

function resolveSubjectColors(subjectId: string) {
  const normalizedId = String(subjectId || '').trim().toLowerCase();
  return SUBJECT_COLOR_MAP[normalizedId] || DEFAULT_SUBJECT_COLORS;
}

function resolveSubjectIcon(subjectId: string, subjectTitle: string) {
  const normalizedId = String(subjectId || '').trim().toLowerCase();
  if (normalizedId && normalizedId in SUBJECT_ICON_MAP) {
    return SUBJECT_ICON_MAP[normalizedId as keyof typeof SUBJECT_ICON_MAP];
  }

  const title = String(subjectTitle || '').trim().toLowerCase();
  if (title.includes('матем') || title.includes('math')) return Sigma;
  if (title.includes('логик')) return BrainCircuit;
  if (title.includes('физ') || title.includes('physics')) return Atom;
  if (title.includes('хим') || title.includes('chem')) return FlaskConical;
  if (title.includes('биол') || title.includes('bio')) return Dna;
  if (title.includes('геог') || title.includes('geo')) return Globe2;
  if (title.includes('истор') || title.includes('тарых') || title.includes('history')) return Landmark;
  if (title.includes('англ') || title.includes('english')) return Languages;
  if (title.includes('рус') || title.includes('russian')) return BookText;
  if (title.includes('кыргыз') && title.includes('адаб')) return ScrollText;
  if (title.includes('кыргыз')) return BookText;

  return BookOpen;
}

interface StudentLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export default function StudentLayout({ title, subtitle, children }: StudentLayoutProps) {
  const { student, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const studentId = student?.id ?? null;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const availableQuery = useQuery(
    studentId
      ? availableTestsQueryOptions(studentId)
      : {
          queryKey: ['student', 'anonymous', 'available'] as const,
          queryFn: async () => null,
          enabled: false,
        },
  );

  const mainNode = availableQuery.data?.test_types?.find((node) => node.id === 'MAIN' && 'items' in node);
  const subjectItems = (mainNode?.items && mainNode.items.length > 0)
    ? mainNode.items
    : getFallbackMainItems(student?.accountType, student?.manasTrack);
  const currentSubject = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('subject') || '';
  }, [location.search]);

  const onLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900">
      <div className="flex min-h-screen">
        {mobileOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/30 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          />
        )}

        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-stone-200 bg-white text-stone-700 shadow-xl transition-all lg:static lg:shadow-none',
            mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
            collapsed && 'lg:w-20',
          )}
        >
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-4">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-3"
            >
              <img src={logo} alt="ProManas" className="h-9 w-auto" decoding="async" />
              {!collapsed && <span className="text-sm font-black tracking-wide text-stone-900">ProManas</span>}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCollapsed((prev) => !prev)}
                className="hidden h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:bg-emerald-50 hover:text-emerald-700 lg:flex"
                aria-label="Collapse sidebar"
              >
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:bg-emerald-50 hover:text-emerald-700 lg:hidden"
                aria-label="Close sidebar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="border-b border-stone-200 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <User className="h-4 w-4" />
              </div>
              {!collapsed && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-stone-900">{student?.fullName || '—'}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {localizeUi(student?.language, `Курс: ${student?.grade || 1}`, `Курс: ${student?.grade || 1}`)}
                  </p>
                  <p className="text-xs text-stone-500">
                    {accountTypeLabel(student?.language, student?.accountType)}
                    {student?.manasTrack ? ` · ${manasTrackLabel(student?.language, student?.manasTrack)}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-stone-400">@{student?.username}</p>
                </div>
              )}
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <div className="space-y-1">
              {!collapsed && (
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  {localizeUi(student?.language, 'Навигация', 'Навигация')}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  navigate('/dashboard');
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                  location.pathname === '/dashboard'
                    ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-600'
                    : 'text-stone-700 hover:bg-emerald-50 hover:text-emerald-700',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    location.pathname === '/dashboard'
                      ? 'bg-white/20 text-white'
                      : 'bg-emerald-100 text-emerald-600',
                  )}
                >
                  <LayoutDashboard className="h-4 w-4" />
                </span>
                {!collapsed && <span>{localizeUi(student?.language, 'Панель', 'Панель')}</span>}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  navigate('/history');
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                  location.pathname === '/history'
                    ? 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-600'
                    : 'text-stone-700 hover:bg-indigo-50 hover:text-indigo-700',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    location.pathname === '/history'
                      ? 'bg-white/20 text-white'
                      : 'bg-indigo-100 text-indigo-600',
                  )}
                >
                  <History className="h-4 w-4" />
                </span>
                {!collapsed && <span>{localizeUi(student?.language, 'История тестов', 'Тест тарыхы')}</span>}
              </button>
              {student?.accountType === 'manas' && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    navigate('/select/trial');
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                    location.pathname === '/select/trial'
                      ? 'bg-amber-500 text-white shadow-sm hover:bg-amber-500'
                      : 'text-stone-700 hover:bg-amber-50 hover:text-amber-700',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                      location.pathname === '/select/trial'
                        ? 'bg-white/20 text-white'
                        : 'bg-amber-100 text-amber-600',
                    )}
                  >
                    <Sparkles className="h-4 w-4" />
                  </span>
                  {!collapsed && <span>{localizeUi(student?.language, 'Сынамык тест', 'Сынамык тест')}</span>}
                </button>
              )}
            </div>

            <div className="mt-4 border-t border-stone-200 pt-4">
              {!collapsed && (
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  {localizeUi(student?.language, 'Предметы', 'Предметтер')}
                </p>
              )}
              <div className="space-y-1">
                {subjectItems.map((subject) => {
                  const SubjectIcon = resolveSubjectIcon(subject.id, subject.title);
                  const colors = resolveSubjectColors(subject.id);
                  const isActive = location.pathname === '/select/main' && currentSubject === subject.id;

                  return (
                    <button
                      key={subject.id}
                      type="button"
                      onClick={() => {
                        setMobileOpen(false);
                        navigate(`/select/main?subject=${encodeURIComponent(subject.id)}`);
                      }}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                        isActive
                          ? `${colors.active} text-white shadow-sm`
                          : `text-stone-700 ${colors.hoverBg} ${colors.hoverText}`,
                      )}
                      title={subject.title}
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                          isActive ? 'bg-white/20 text-white' : `${colors.iconBg} ${colors.iconText}`,
                        )}
                      >
                        <SubjectIcon className="h-4 w-4" />
                      </span>
                      {!collapsed && <span className="truncate">{subject.title}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>

          <div className="border-t border-stone-200 p-3">
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{localizeUi(student?.language, 'Выйти', 'Чыгуу')}</span>}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 text-stone-600 lg:hidden"
                aria-label="Open sidebar"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold text-stone-900 sm:text-xl">{title}</h1>
                {subtitle ? <p className="truncate text-sm text-stone-500">{subtitle}</p> : null}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto px-4 py-5 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
