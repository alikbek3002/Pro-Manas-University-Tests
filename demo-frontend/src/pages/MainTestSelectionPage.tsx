import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { generateStudentTest, type AvailableMainNode, type MainTreeItem } from '../lib/api';
import { availableTestsQueryOptions } from '../lib/studentQueries';
import { ArrowLeft, BookOpen, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import logo from '../assets/pro-manas-logo.png';

function localizeUi(language: 'ru' | 'kg' | undefined, ruText: string, kgText: string) {
    return language === 'kg' ? kgText : ruText;
}

function formatMainLineMeta(
    line: MainTreeItem['lines'][number],
    language: 'ru' | 'kg' | undefined,
) {
    const usableTotal = line.usable_question_total ?? 0;
    const partCount = line.part_count ?? 20;
    const partQuestionCount = line.part_question_count ?? 0;

    return {
        availableLabel: localizeUi(
            language,
            `В базе: ${line.available} вопросов`,
            `Базада: ${line.available} суроо`,
        ),
        usableLabel: localizeUi(
            language,
            `В тест пойдёт: ${usableTotal} (${partCount} x ${partQuestionCount})`,
            `Тестке кирет: ${usableTotal} (${partCount} x ${partQuestionCount})`,
        ),
    };
}

export default function MainTestSelectionPage() {
    const { student, token } = useAuthStore();
    const navigate = useNavigate();
    const studentId = student?.id ?? null;
    const [error, setError] = useState<string | null>(null);

    const [selectedSubject, setSelectedSubject] = useState<MainTreeItem | null>(null);
    const [selectedGrade, setSelectedGrade] = useState<number | null>(null);
    const [selectedPart, setSelectedPart] = useState<number | null>(null);
    const [isPartModalOpen, setIsPartModalOpen] = useState(false);

    const [generating, setGenerating] = useState(false);

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

    const mainNode = (availableQuery.data?.test_types.find((t) => t.id === 'MAIN') as AvailableMainNode | undefined) ?? null;
    const loading = availableQuery.isLoading;
    const queryError = availableQuery.error instanceof Error
        ? availableQuery.error.message
        : null;
    const visibleError =
        error ||
        queryError ||
        (!loading && !mainNode
            ? localizeUi(student?.language, 'Предметные тесты не найдены.', 'Предметтик тесттер табылган жок.')
            : null);
    const selectedLine = selectedSubject?.lines.find((line) => line.grade === selectedGrade) ?? null;
    const partCount = selectedLine?.part_count ?? 20;
    const partQuestionCount = selectedLine?.part_question_count
        ?? Math.floor(Number(selectedLine?.available || 0) / Math.max(partCount, 1));
    const partNumbers = Array.from({ length: partCount }, (_, index) => index + 1);

    const handleStartTest = async (partOverride?: number) => {
        const partToUse = partOverride || selectedPart;
        if (!token || !selectedSubject || !selectedGrade || !partToUse) return;

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
                type: 'MAIN',
                subject: selectedSubject.id,
                grade: selectedGrade,
                part: partToUse,
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
                        {localizeUi(student?.language, 'Выбор предмета', 'Предметти тандоо')}
                    </h1>
                    <p className="mt-2 text-sm sm:text-base text-stone-500 font-medium">
                        {localizeUi(student?.language, 'Выберите предмет и вариант теста, чтобы начать подготовку.', 'Даярдыкты баштоо үчүн предметти жана тест вариантын тандаңыз.')}
                    </p>
                </div>

                {visibleError && (
                    <div className="mb-6 flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-red-700 border-2 border-red-100">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                        <p className="text-sm font-medium">{visibleError}</p>
                    </div>
                )}

                {/* Step 1: Subject */}
                <div className="mb-8 sm:mb-10">
                    <h2 className="mb-4 text-base sm:text-lg font-bold text-stone-800">
                        {localizeUi(student?.language, '1. Предмет', '1. Предмет')}
                    </h2>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                        {mainNode?.items.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setSelectedSubject(item);
                                    setSelectedGrade(null);
                                    setSelectedPart(null);
                                    setError(null);
                                }}
                                className={`flex flex-col items-center justify-center gap-2 sm:gap-3 rounded-2xl border-2 p-4 sm:p-6 text-center transition-all active:scale-[0.97] ${selectedSubject?.id === item.id
                                    ? 'border-black bg-black text-white'
                                    : 'border-stone-200 bg-white hover:border-stone-400 text-stone-700'
                                    }`}
                            >
                                <BookOpen className={`h-5 w-5 sm:h-6 sm:w-6 ${selectedSubject?.id === item.id ? 'text-stone-400' : 'text-stone-300'}`} />
                                <span className="font-bold text-sm sm:text-base leading-tight">{item.title}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Step 2: Grade */}
                {selectedSubject && (
                    <div className="mb-8 sm:mb-10">
                        <h2 className="mb-4 text-base sm:text-lg font-bold text-stone-800">
                            {localizeUi(student?.language, '2. Набор тестов', '2. Тесттер топтому')}
                        </h2>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {selectedSubject.lines.map((line) => (
                                (() => {
                                    const isSelected = selectedGrade === line.grade;
                                    const meta = formatMainLineMeta(line, student?.language);

                                    return (
                                        <button
                                            key={line.grade}
                                            onClick={() => {
                                                setSelectedGrade(line.grade);
                                                setSelectedPart(null);
                                            }}
                                            className={`flex items-center gap-4 rounded-2xl border-2 p-4 sm:p-5 transition-all active:scale-[0.98] ${isSelected
                                                ? 'border-black bg-black text-white'
                                                : 'border-stone-200 bg-white hover:border-stone-400'
                                                }`}
                                        >
                                            <div className={`flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-xl font-black text-lg sm:text-xl border-2 ${isSelected ? 'border-stone-700 bg-stone-800 text-white' : 'border-stone-200 bg-stone-50 text-stone-600'}`}>
                                                {line.grade}
                                            </div>
                                            <div className="text-left">
                                                <div className={`font-bold text-base ${isSelected ? 'text-white' : 'text-stone-900'}`}>
                                                    {line.label || localizeUi(student?.language, 'Предметный набор', 'Предметтик топтом')}
                                                </div>
                                                <div className={`mt-1 text-xs sm:text-sm font-medium ${isSelected ? 'text-stone-300' : 'text-stone-600'}`}>
                                                    {meta.availableLabel}
                                                </div>
                                                <div className={`text-[11px] sm:text-xs font-medium ${isSelected ? 'text-stone-400' : 'text-stone-500'}`}>
                                                    {meta.usableLabel}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })()
                            ))}
                        </div>
                    </div>
                )}

                {/* Start / Select button */}
                {selectedSubject && selectedGrade && (
                    <div className="pb-8 sm:pb-12 mt-4 text-center">
                        <button
                            onClick={() => setIsPartModalOpen(true)}
                            disabled={generating}
                            className="w-full sm:max-w-sm sm:mx-auto flex h-14 sm:h-16 items-center justify-center gap-3 rounded-2xl bg-black px-8 text-base sm:text-lg font-bold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                        >
                            <Sparkles className="h-5 w-5 text-stone-400" />
                            {localizeUi(student?.language, 'Выбрать часть теста', 'Тесттин бөлүгүн тандоо')}
                        </button>
                    </div>
                )}
            </div>

            {/* Part Selection Modal */}
            {isPartModalOpen && selectedSubject && selectedGrade && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                    onClick={() => setIsPartModalOpen(false)}
                >
                    <div
                        className="w-full max-w-xl bg-white rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="px-6 py-6 sm:px-8 border-b border-stone-100 flex items-center justify-between">
                            <div>
                                <h3 className="text-xl sm:text-2xl font-black text-black">
                                    {localizeUi(student?.language, 'Выберите часть теста', 'Тесттин бөлүгүн тандаңыз')}
                                </h3>
                                <p className="text-sm font-medium text-stone-500 mt-1">
                                    {selectedSubject.title} · {selectedLine?.label || localizeUi(student?.language, 'Предметный набор', 'Предметтик топтом')}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsPartModalOpen(false)}
                                className="h-10 w-10 flex items-center justify-center rounded-full bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-black transition-colors"
                            >
                                <ArrowLeft className="h-5 w-5 transform rotate-90" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 sm:p-8">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 max-h-[60vh] overflow-y-auto pr-1">
                                {partNumbers.map((part) => (
                                    <button
                                        key={part}
                                        onClick={async () => {
                                            setSelectedPart(part);
                                            setIsPartModalOpen(false);
                                            handleStartTest(part);
                                        }}
                                        className="group flex items-center gap-4 rounded-2xl border-2 border-stone-100 p-4 transition-all hover:border-black hover:bg-stone-50 active:scale-[0.98]"
                                    >
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-stone-100 font-black text-xl text-stone-400 group-hover:bg-black group-hover:text-white transition-colors">
                                            {part}
                                        </div>
                                        <div className="text-left">
                                            <div className="font-bold text-base text-stone-900 leading-tight">
                                                {localizeUi(student?.language, `Тест ${part}`, `Тест ${part}`)}
                                            </div>
                                            <div className="text-xs sm:text-sm font-medium text-stone-500">
                                                {partQuestionCount} {localizeUi(student?.language, 'вопросов', 'суроо')}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>

                            {generating && (
                                <div className="mt-6 flex items-center justify-center gap-3 text-stone-400 font-bold py-4">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    {localizeUi(student?.language, 'Подготовка...', 'Даярдалууда...')}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
