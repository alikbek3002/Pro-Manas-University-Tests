import { type ReactNode, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
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
            'fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r border-stone-200 bg-white shadow-xl transition-all lg:static lg:shadow-none',
            mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
            collapsed && 'lg:w-20',
          )}
        >
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-4">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-3"
            >
              <img src={logo} alt="ProManas" className="h-9 w-auto" decoding="async" />
              {!collapsed && <span className="text-sm font-black tracking-wide">ProManas</span>}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCollapsed((prev) => !prev)}
                className="hidden h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:text-stone-900 lg:flex"
                aria-label="Collapse sidebar"
              >
                {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-500 hover:text-stone-900 lg:hidden"
                aria-label="Close sidebar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="border-b border-stone-100 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-500">
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

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                navigate('/dashboard');
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors',
                location.pathname === '/dashboard'
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
              )}
            >
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{localizeUi(student?.language, 'Панель', 'Панель')}</span>}
            </button>

            <div className="pt-3">
              {!collapsed && (
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  {localizeUi(student?.language, 'Предметы', 'Предметтер')}
                </p>
              )}
              <div className="space-y-1">
                {subjectItems.map((subject) => (
                  <button
                    key={subject.id}
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      navigate(`/select/main?subject=${encodeURIComponent(subject.id)}`);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                      location.pathname === '/select/main' && currentSubject === subject.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
                    )}
                    title={subject.title}
                  >
                    <BookOpen className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{subject.title}</span>}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                navigate('/history');
              }}
              className={cn(
                'mt-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
                location.pathname === '/history'
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
              )}
            >
              <History className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{localizeUi(student?.language, 'История тестов', 'Тест тарыхы')}</span>}
            </button>
          </nav>

          <div className="border-t border-stone-100 p-3">
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
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
