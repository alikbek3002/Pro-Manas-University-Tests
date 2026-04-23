import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Film, FolderTree, Loader2, PlayCircle, Plus, Trash2, Upload, X, CheckCircle2, AlertCircle,
} from 'lucide-react';
import {
  fetchVideoCatalog, uploadVideo, deleteVideo,
  type VideoCatalogProgram, type UploadVideoPayload,
} from '@/lib/api';

const PROGRAM_OPTIONS = [
  { code: 'manas_all_subjects', label: 'Манас: Все предметы' },
  { code: 'manas_humanities', label: 'Манас: Гуманитарий' },
  { code: 'manas_exact_sciences', label: 'Манас: Точные науки' },
];

const SUBJECT_OPTIONS = [
  { code: 'math', label: 'Математика' },
  { code: 'russian', label: 'Русский язык' },
  { code: 'physics', label: 'Физика' },
  { code: 'chemistry', label: 'Химия' },
  { code: 'biology', label: 'Биология' },
  { code: 'kyrgyz_language', label: 'Кыргызский язык' },
  { code: 'kyrgyz_literature', label: 'Кыргыз адабият' },
  { code: 'history', label: 'История' },
  { code: 'geography', label: 'География' },
  { code: 'english', label: 'Английский язык' },
];

function formatBytes(size: number) {
  if (!size) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/* ── Upload Modal ── */
function UploadModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [programCode, setProgramCode] = useState(PROGRAM_OPTIONS[0].code);
  const [subjectCode, setSubjectCode] = useState(SUBJECT_OPTIONS[0].code);
  const [lessonTitle, setLessonTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'uploading' | 'saving'>('uploading');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null;
    setFile(selected);
    if (selected && !lessonTitle) {
      setLessonTitle(selected.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !lessonTitle.trim()) return;

    setUploading(true);
    setError(null);
    setProgress(0);
    setPhase('uploading');

    try {
      const payload: UploadVideoPayload = {
        programCode,
        subjectCode,
        lessonTitle: lessonTitle.trim(),
      };
      await uploadVideo(file, payload, (pct) => {
        setProgress(pct);
        if (pct === 100) setPhase('saving');
      });
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-500">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Загрузить видеоурок</h3>
            <p className="text-xs text-muted-foreground">Видео будет загружено в Cloudflare R2</p>
          </div>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-8 text-emerald-500">
            <CheckCircle2 className="h-12 w-12" />
            <p className="font-semibold">Видео успешно загружено!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* File picker */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Видеофайл</label>
              <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-border bg-background px-4 py-6 text-center text-sm text-muted-foreground transition-colors hover:border-emerald-400 hover:bg-emerald-500/5"
              >
                {file ? (
                  <span className="flex items-center justify-center gap-2 font-medium text-foreground">
                    <Film className="h-4 w-4 text-emerald-500" />
                    {file.name} ({formatBytes(file.size)})
                  </span>
                ) : (
                  <span className="flex flex-col items-center gap-1">
                    <Plus className="h-6 w-6" />
                    Нажмите для выбора видео
                  </span>
                )}
              </button>
            </div>

            {/* Program */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Программа</label>
              <select
                value={programCode}
                onChange={(e) => setProgramCode(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {PROGRAM_OPTIONS.map((p) => (
                  <option key={p.code} value={p.code}>{p.label}</option>
                ))}
              </select>
            </div>

            {/* Subject */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Предмет</label>
              <select
                value={subjectCode}
                onChange={(e) => setSubjectCode(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {SUBJECT_OPTIONS.map((s) => (
                  <option key={s.code} value={s.code}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Название урока</label>
              <input
                type="text"
                value={lessonTitle}
                onChange={(e) => setLessonTitle(e.target.value)}
                placeholder="Введите название видеоурока"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-emerald-500/40"
                required
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {uploading && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  {phase === 'saving' ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Отправка в Cloudflare R2...
                    </span>
                  ) : (
                    <span>Загрузка на сервер...</span>
                  )}
                  <span>{phase === 'saving' ? '100%' : `${progress}%`}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${phase === 'saving' ? 'animate-pulse bg-blue-500' : 'bg-emerald-500'}`}
                    style={{ width: phase === 'saving' ? '100%' : `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={!file || !lessonTitle.trim() || uploading}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {phase === 'saving' ? 'Отправка в Cloudflare...' : 'Загружаем...'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2"><Upload className="h-4 w-4" /> Загрузить видео</span>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function VideosPage() {
  const [programs, setPrograms] = useState<VideoCatalogProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [programFilter, setProgramFilter] = useState<string>('all');

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPrograms(await fetchVideoCatalog());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки видеокаталога');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const filteredPrograms = useMemo(() => {
    let result = programs;
    if (programFilter !== 'all') {
      result = result.filter((program) => program.programCode === programFilter);
    }
    if (subjectFilter !== 'all') {
      result = result
        .map((program) => ({
          ...program,
          subjects: program.subjects.filter((subject) => subject.subjectCode === subjectFilter),
        }))
        .filter((program) => program.subjects.length > 0);
    }
    return result;
  }, [programs, programFilter, subjectFilter]);

  const filtersActive = subjectFilter !== 'all' || programFilter !== 'all';

  const handleDelete = async (lessonId: string) => {
    if (!confirm('Удалить этот видеоурок? Файл будет удалён из R2.')) return;
    setDeletingId(lessonId);
    try {
      await deleteVideo(lessonId);
      await loadCatalog();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Видеоуроки Манаса</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Каталог видеоуроков в Cloudflare R2. Загружайте новые видео через кнопку ниже.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowUpload(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          Загрузить видео
        </button>
      </div>

      {showUpload && (
        <UploadModal onClose={() => setShowUpload(false)} onSuccess={loadCatalog} />
      )}

      {!loading && !error && programs.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Предмет</label>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="min-w-[180px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="all">Все предметы</option>
              {SUBJECT_OPTIONS.map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Программа</label>
            <select
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              className="min-w-[220px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              <option value="all">Все программы</option>
              {PROGRAM_OPTIONS.map((p) => (
                <option key={p.code} value={p.code}>{p.label}</option>
              ))}
            </select>
          </div>

          {filtersActive && (
            <button
              type="button"
              onClick={() => { setSubjectFilter('all'); setProgramFilter('all'); }}
              className="h-[38px] rounded-lg border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Сбросить
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Загрузка видеокаталога...</span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : programs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <Film className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Видеокаталог пока пуст. Загрузите первый видеоурок.</p>
        </div>
      ) : filteredPrograms.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <Film className="h-10 w-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Нет видео под выбранный фильтр.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredPrograms.map((program) => (
            <section key={program.programCode} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 pb-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{program.programTitle}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {program.totalLessons} уроков, {program.playableLessons} готовы, {formatBytes(program.totalSizeBytes)}
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                  <Film className="h-4 w-4" />
                  {program.manasTrack || 'manas'}
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {program.subjects.map((subject) => (
                  <div key={subject.subjectCode} className="rounded-xl border border-border/80 bg-background p-4">
                    <div className="flex items-center gap-2">
                      <FolderTree className="h-4 w-4 text-muted-foreground" />
                      <p className="font-semibold text-foreground">{subject.subjectTitle}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {subject.lessonCount} уроков • {subject.playableCount} playable • {formatBytes(subject.totalSizeBytes)}
                    </p>

                    <div className="mt-3 space-y-2">
                      {subject.lessons.map((lesson) => (
                        <div
                          key={lesson.id}
                          className="flex items-start justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {lesson.lessonNo ? `${lesson.lessonNo}. ` : ''}{lesson.title}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{lesson.filename} • {formatBytes(lesson.sizeBytes)}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                              lesson.isPlayable ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}>
                              {lesson.isPlayable ? (
                                <span className="inline-flex items-center gap-1"><PlayCircle className="h-3 w-3" /> Ready</span>
                              ) : 'Pending'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDelete(lesson.id)}
                              disabled={deletingId === lesson.id}
                              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              title="Удалить видео"
                            >
                              {deletingId === lesson.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
