import { useEffect, useState } from 'react';
import { Film, FolderTree, Loader2, PlayCircle } from 'lucide-react';
import { fetchVideoCatalog, type VideoCatalogProgram } from '@/lib/api';

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

export default function VideosPage() {
  const [programs, setPrograms] = useState<VideoCatalogProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const nextPrograms = await fetchVideoCatalog();
        if (!active) return;
        setPrograms(nextPrograms);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Ошибка загрузки видеокаталога');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Видеоуроки Манаса</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Каталог из Railway Postgres: здесь видно, какие уроки уже синхронизированы и какие из них готовы к проигрыванию.
        </p>
      </div>

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
        <div className="rounded-xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
          Видеокаталог пока пуст.
        </div>
      ) : (
        <div className="space-y-5">
          {programs.map((program) => (
            <section key={program.programCode} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 pb-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{program.programTitle}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {program.totalLessons} уроков, {program.playableLessons} готовы к показу, {formatBytes(program.totalSizeBytes)}
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
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <FolderTree className="h-4 w-4 text-muted-foreground" />
                          <p className="font-semibold text-foreground">{subject.subjectTitle}</p>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {subject.lessonCount} уроков • {subject.playableCount} playable • {formatBytes(subject.totalSizeBytes)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {subject.lessons.slice(0, 6).map((lesson) => (
                        <div
                          key={lesson.id}
                          className="flex items-start justify-between gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {lesson.lessonNo ? `${lesson.lessonNo}. ` : ''}{lesson.title}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{lesson.filename}</p>
                          </div>
                          <div className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                            lesson.isPlayable
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}>
                            {lesson.isPlayable ? (
                              <span className="inline-flex items-center gap-1">
                                <PlayCircle className="h-3 w-3" />
                                Ready
                              </span>
                            ) : (
                              'Pending CDN'
                            )}
                          </div>
                        </div>
                      ))}

                      {subject.lessons.length > 6 ? (
                        <p className="pt-1 text-xs text-muted-foreground">
                          Еще {subject.lessons.length - 6} уроков скрыто в компактном режиме.
                        </p>
                      ) : null}
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
