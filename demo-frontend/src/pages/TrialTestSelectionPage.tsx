import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { generateStudentTest, type AvailableTrialNode, type TrialTreeRound } from '../lib/api';
import { availableTestsQueryOptions } from '../lib/studentQueries';
import { ArrowLeft, Layers, Sparkles, AlertCircle, Loader2, ShieldAlert } from 'lucide-react';
import logo from '../assets/pro-manas-logo.png';

function localizeUi(language: 'ru' | 'kg' | undefined, ruText: string, kgText: string) {
    return language === 'kg' ? kgText : ruText;
}

export default function TrialTestSelectionPage() {
    const { student, token } = useAuthStore();
    const navigate = useNavigate();
    const studentId = student?.id ?? null;
    const [error, setError] = useState<string | null>(null);

    const [selectedRound, setSelectedRound] = useState<TrialTreeRound | null>(null);
    const [generating, setGenerating] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

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
        if (!token) {
            navigate('/login', { replace: true });
        }
    }, [token, navigate]);

    const trialNode = (availableQuery.data?.test_types.find((t) => t.id === 'TRIAL') as AvailableTrialNode | undefined) ?? null;
    const loading = availableQuery.isLoading;
    const queryError = availableQuery.error instanceof Error
        ? availableQuery.error.message
        : null;
    const visibleError =
        error ||
        queryError ||
        (!loading && !trialNode
            ? localizeUi(student?.language, 'Сынамык тесты не найдены.', 'Сынамык тесттер табылган жок.')
            : null);

    const handleStartTest = async () => {
        if (!token || !selectedRound) return;
        setShowConfirm(false);

        try {
            const el = document.documentElement;
            if (el.requestFullscreen) {
                await el.requestFullscreen();
            } else if ((el as any).webkitRequestFullscreen) {
                await (el as any).webkitRequestFullscreen();
            }
        } catch {
            // Fullscreen may not be available
        }

        try {
            setGenerating(true);
            setError(null);
            const testData = await generateStudentTest(token, {
                type: 'TRIAL',
                round: selectedRound.id,
            });

            navigate(`/test/${testData.test_session_id}`, {
                state: { testData },
            });
        } catch (err: any) {
            setError(err.message || localizeUi(student?.language, 'Не удалось сгенерировать тест', 'Тестти түзүүгө мүмкүн болгон жок'));
            setGenerating(false);
            try { document.exitFullscreen?.(); } catch { }
        }
    };

    const handleClickStart = () => {
        if (!selectedRound) return;
        setShowConfirm(true);
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
            {/* Top bar */}
            <div className="border-b-2 border-stone-100">
                <div className="mx-auto max-w-4xl px-4 sm:px-6 py-4 flex items-center justify-between">
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="flex items-center gap-2 text-sm font-medium text-stone-500 hover:text-black transition-colors"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">{localizeUi(student?.language, 'Назад', 'Артка')}</span>
                    </button>
                    <img src={logo} alt="ProManas" className="h-10 sm:h-14 w-auto" decoding="async" />
                </div>
            </div>

            <div className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-10">
                {/* Title */}
                <div className="mb-8 sm:mb-10">
                    <h1 className="text-2xl sm:text-4xl font-black text-black">
                        {localizeUi(student?.language, 'Сынамык тест', 'Сынамык тест')}
                    </h1>
                    <p className="mt-2 text-sm sm:text-base text-stone-500 font-medium">
                        {localizeUi(student?.language, 'Выберите тур, чтобы начать тестирование.', 'Сынамык тестти баштоо үчүн турду тандаңыз.')}
                    </p>
                </div>

                {visibleError && (
                    <div className="mb-6 flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-red-700 border-2 border-red-100">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <p className="text-sm font-medium">{visibleError}</p>
                    </div>
                )}

                {/* Rounds */}
                <div className="mb-8 sm:mb-10">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {trialNode?.rounds.map((round) => (
                            <button
                                key={round.id}
                                onClick={() => {
                                    setSelectedRound(round);
                                    setError(null);
                                }}
                                className={`flex flex-col items-start gap-4 rounded-2xl sm:rounded-3xl border-2 p-5 sm:p-6 transition-all active:scale-[0.98] ${selectedRound?.id === round.id
                                    ? 'border-black bg-black text-white'
                                    : 'border-stone-200 bg-white hover:border-stone-400 text-stone-700'
                                    }`}
                            >
                                <div className="flex items-center gap-3 sm:gap-4 w-full">
                                    <div className={`rounded-xl p-3 sm:p-4 border-2 ${selectedRound?.id === round.id ? 'border-stone-700 bg-stone-800 text-white' : 'border-stone-100 bg-stone-50 text-stone-400'}`}>
                                        <Layers className="h-5 w-5 sm:h-7 sm:w-7" />
                                    </div>
                                    <span className={`text-lg sm:text-xl font-bold ${selectedRound?.id === round.id ? 'text-white' : 'text-stone-900'}`}>
                                        {round.title}
                                    </span>
                                </div>

                                <div className="w-full grid grid-cols-2 gap-2">
                                    {round.subjects.map(subj => {
                                        if (subj.fetch_parts && subj.fetch_parts.length > 0) {
                                            return subj.fetch_parts.map((part: any, idx: number) => {
                                                const partName = localizeUi(
                                                    student?.language,
                                                    part.questionType === 'math' ? 'Математика' : 'Логика',
                                                    part.questionType === 'math' ? 'Математика' : 'Логика'
                                                );
                                                const required = part.required || (part.prev + part.curr);
                                                const available = part.available || part.required || (part.prev + part.curr);
                                                return (
                                                    <div key={`${subj.id}-${idx}`} className={`text-xs sm:text-sm font-medium text-left ${selectedRound?.id === round.id ? 'text-stone-400' : 'text-stone-500'}`}>
                                                        {partName} ({available}<span className="opacity-50">/{required}</span>)
                                                    </div>
                                                );
                                            });
                                        }

                                        return (
                                            <div key={subj.id} className={`text-xs sm:text-sm font-medium text-left ${selectedRound?.id === round.id ? 'text-stone-400' : 'text-stone-500'}`}>
                                                {subj.display_name} ({subj.available_total}<span className="opacity-50">/{subj.required_total}</span>)
                                            </div>
                                        );
                                    })}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Start */}
                {selectedRound && (
                    <div className="pb-8 sm:pb-12">
                        <button
                            onClick={handleClickStart}
                            disabled={generating}
                            className="w-full sm:max-w-sm sm:mx-auto flex h-14 sm:h-16 items-center justify-center gap-3 rounded-2xl bg-black px-8 text-base sm:text-lg font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                        >
                            {generating ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    {localizeUi(student?.language, 'Загрузка...', 'Жүктөлүүдө...')}
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-5 w-5 text-stone-400" />
                                    {localizeUi(student?.language, 'Начать сынамык тест', 'Сынамык тестти баштоо')}
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Warning Confirmation Modal */}
                {showConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                        <div className="w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500">
                                    <ShieldAlert className="h-6 w-6" />
                                </div>
                                <h2 className="text-xl font-bold text-stone-900">
                                    {localizeUi(student?.language, 'Внимание!', 'Көңүл буруңуз!')}
                                </h2>
                            </div>
                            <div className="space-y-3 mb-6">
                                <p className="text-sm text-stone-600 leading-relaxed">
                                    {localizeUi(
                                        student?.language,
                                        'После начала теста вы не сможете выйти из полноэкранного режима. Переключение вкладок, скриншоты и другие действия будут отслеживаться.',
                                        'Тест башталгандан кийин толук экран режиминен чыгууга болбойт. Табдарды алмаштыруу, скриншоттор жана башка аракеттер көзөмөлдөнөт.'
                                    )}
                                </p>
                                <p className="text-sm text-stone-600 leading-relaxed font-medium">
                                    {localizeUi(
                                        student?.language,
                                        'Убедитесь, что вы готовы пройти тест до конца.',
                                        'Тестти аягына чейин тапшырууга даяр экениңизди текшериңиз.'
                                    )}
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowConfirm(false)}
                                    className="flex-1 h-12 rounded-2xl border-2 border-stone-200 text-sm font-bold text-stone-600 hover:bg-stone-50 transition-colors"
                                >
                                    {localizeUi(student?.language, 'Назад', 'Артка')}
                                </button>
                                <button
                                    onClick={handleStartTest}
                                    className="flex-1 h-12 rounded-2xl bg-black text-sm font-bold text-white hover:opacity-90 transition-all"
                                >
                                    {localizeUi(student?.language, 'Продолжить', 'Улантуу')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
