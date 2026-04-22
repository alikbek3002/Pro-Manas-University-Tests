import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Eye,
  EyeOff,
  Edit,
  Trash2,
  Search,
  UserPlus,
  X,
  Save,
  Loader2,
  Check,
  Pencil,
  CalendarPlus,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GenerateStudentModal, type GeneratedStudentPayload } from '@/components/modals/GenerateStudentModal';
import {
  createStudent,
  deleteStudent,
  extendStudent,
  fetchPrograms,
  fetchStudents,
  updateStudent,
  type AccountType,
  type FetchStudentsParams,
  type ProgramOption,
  type Student,
} from '@/lib/api';
import { toast } from 'sonner';

const ACCOUNT_TYPE_OPTIONS: Array<{ value: AccountType; label: string }> = [
  { value: 'manas', label: 'Манас' },
];

const MANAS_TRACK_OPTIONS = [
  { value: 'all_subjects', label: 'Все предметы' },
  { value: 'humanities', label: 'Гуманитарий' },
  { value: 'exact_sciences', label: 'Точные науки' },
] as const;

const PasswordCell = ({ password }: { password: string }) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm inline-block w-20">
        {isVisible ? password : '••••••••'}
      </span>
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label={isVisible ? 'Скрыть пароль' : 'Показать пароль'}
      >
        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
};

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatAmount(value: number): string {
  return `${Number(value || 0).toLocaleString('ru-RU')} сом`;
}

function calcDaysRemaining(createdAt: string, expiresAt: string | null): number {
  if (!createdAt) return 0;
  const expiry = expiresAt
    ? new Date(expiresAt)
    : new Date(new Date(createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
  return Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function DaysCell({ days }: { days: number }) {
  if (days <= 0) {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        истёк
      </span>
    );
  }

  const color = days <= 5
    ? 'bg-red-100 text-red-700'
    : days <= 10
      ? 'bg-orange-100 text-orange-700'
      : 'bg-green-100 text-green-700';

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${color}`}>
      {days} д.
    </span>
  );
}

function filterPrograms(
  programs: ProgramOption[],
  accountType: AccountType,
  manasTrack: Student['manasTrack'],
) {
  return programs.filter((program) => {
    if (program.account_type !== accountType) return false;
    if (accountType !== 'manas') return true;
    return program.manas_track === manasTrack;
  });
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [accountTypeFilter, setAccountTypeFilter] = useState<'all' | AccountType>('all');
  const [programFilter, setProgramFilter] = useState<'all' | string>('all');

  const [loading, setLoading] = useState(true);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [extendInputId, setExtendInputId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState<number>(15);
  const [extendSign, setExtendSign] = useState<1 | -1>(1);

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: '',
    accountType: 'manas' as AccountType,
    manasTrack: 'all_subjects' as Exclude<Student['manasTrack'], null>,
    programCode: '',
    username: '',
    password: '',
    phone: '',
    amount: 0,
    isActive: true,
  });
  const [editLoading, setEditLoading] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);

  const deferredSearchQuery = useDeferredValue(searchQuery.trim());

  const activeFilters = useMemo<FetchStudentsParams>(() => {
    const filters: FetchStudentsParams = {};
    if (deferredSearchQuery) {
      filters.search = deferredSearchQuery;
    }
    if (accountTypeFilter !== 'all') {
      filters.accountType = accountTypeFilter;
    }
    if (programFilter !== 'all') {
      filters.programCode = programFilter;
    }
    return filters;
  }, [accountTypeFilter, deferredSearchQuery, programFilter]);

  const activeFiltersRef = useRef<FetchStudentsParams>(activeFilters);

  useEffect(() => {
    activeFiltersRef.current = activeFilters;
  }, [activeFilters]);

  const loadPrograms = useCallback(async () => {
    setProgramsLoading(true);
    try {
      const data = await fetchPrograms();
      setPrograms(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить программы';
      toast.error(message);
    } finally {
      setProgramsLoading(false);
    }
  }, []);

  const loadStudents = useCallback(async (filters: FetchStudentsParams) => {
    setLoading(true);
    try {
      const data = await fetchStudents(filters);
      setStudents(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить студентов';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadStudents(activeFilters);
    }, deferredSearchQuery ? 250 : 0);

    return () => window.clearTimeout(timeoutId);
  }, [activeFilters, deferredSearchQuery, loadStudents]);

  const programOptionsByFilter = useMemo(() => {
    if (accountTypeFilter === 'all') return programs;
    return programs.filter((program) => program.account_type === accountTypeFilter);
  }, [accountTypeFilter, programs]);

  const editPrograms = useMemo(() => {
    return filterPrograms(programs, editForm.accountType, editForm.accountType === 'manas' ? editForm.manasTrack : null);
  }, [editForm.accountType, editForm.manasTrack, programs]);

  const handleGenerateStudent = async (newStudent: GeneratedStudentPayload) => {
    setIsSubmitting(true);
    try {
      await createStudent({
        fullName: newStudent.fullName,
        accountType: newStudent.accountType,
        manasTrack: newStudent.accountType === 'manas' ? newStudent.manasTrack : undefined,
        programCode: newStudent.programCode,
        username: newStudent.username,
        password: newStudent.password,
        phone: newStudent.phone,
        amount: Number(newStudent.amount) || 0,
      });
      await loadStudents(activeFiltersRef.current);
      toast.success('Студент успешно добавлен');
      setIsModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось добавить студента';
      toast.error(message);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExtend = async (id: string, days: number, sign: 1 | -1) => {
    const finalDays = Math.abs(days) * sign;
    if (!finalDays) return;

    setExtendingId(id);
    try {
      await extendStudent(id, finalDays);
      await loadStudents(activeFiltersRef.current);
      toast.success(`${finalDays > 0 ? '+' : ''}${finalDays} дней применено`);
      setExtendInputId(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка';
      toast.error(message);
    } finally {
      setExtendingId(null);
    }
  };

  const handleNoteStart = (student: Student) => {
    setEditingNoteId(student.id);
    setNoteValue(student.notes ?? '');
    setTimeout(() => noteInputRef.current?.focus(), 0);
  };

  const handleNoteSave = async (studentId: string) => {
    setNoteSaving(true);
    try {
      await updateStudent(studentId, { notes: noteValue });
      await loadStudents(activeFiltersRef.current);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка сохранения';
      toast.error(message);
    } finally {
      setNoteSaving(false);
      setEditingNoteId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Вы уверены что хотите удалить студента?')) return;

    try {
      await deleteStudent(id);
      await loadStudents(activeFiltersRef.current);
      toast.success('Студент удалён');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось удалить студента';
      toast.error(message);
    }
  };

  const handleOpenEdit = (student: Student) => {
    setEditingStudent(student);
    setEditForm({
      fullName: student.fullName,
      accountType: student.accountType,
      manasTrack: (student.manasTrack || 'all_subjects') as Exclude<Student['manasTrack'], null>,
      programCode: student.programCode || '',
      username: student.username,
      password: '',
      phone: student.phone || '',
      amount: Number(student.amount || 0),
      isActive: student.isActive,
    });
    setShowEditPassword(false);
  };

  const handleCloseEdit = () => {
    setEditingStudent(null);
  };

  const handleSaveEdit = async () => {
    if (!editingStudent) return;

    setEditLoading(true);
    try {
      const payload: {
        fullName?: string;
        accountType?: AccountType;
        manasTrack?: Exclude<Student['manasTrack'], null> | null;
        programCode?: string;
        username?: string;
        password?: string;
        phone?: string;
        amount?: number;
        isActive?: boolean;
      } = {};

      if (editForm.fullName.trim() !== editingStudent.fullName.trim()) {
        payload.fullName = editForm.fullName.trim();
      }

      if (editForm.accountType !== editingStudent.accountType) {
        payload.accountType = editForm.accountType;
      }

      const currentManasTrack = editingStudent.manasTrack || null;
      const nextManasTrack = editForm.accountType === 'manas' ? editForm.manasTrack : null;
      if (nextManasTrack !== currentManasTrack) {
        payload.manasTrack = nextManasTrack;
      }

      const selectedProgramCode = editForm.programCode || undefined;
      if (selectedProgramCode && selectedProgramCode !== editingStudent.programCode) {
        payload.programCode = selectedProgramCode;
      }

      if (editForm.username.trim() !== editingStudent.username.trim()) {
        payload.username = editForm.username.trim();
      }

      if (editForm.password.trim()) {
        payload.password = editForm.password.trim();
      }

      if (editForm.phone.trim() !== (editingStudent.phone || '').trim()) {
        payload.phone = editForm.phone.trim();
      }

      if (Number(editForm.amount) !== Number(editingStudent.amount || 0)) {
        payload.amount = Number(editForm.amount);
      }

      if (editForm.isActive !== editingStudent.isActive) {
        payload.isActive = editForm.isActive;
      }

      if (Object.keys(payload).length === 0) {
        toast.info('Нет изменений для сохранения');
        handleCloseEdit();
        return;
      }

      await updateStudent(editingStudent.id, payload);
      await loadStudents(activeFiltersRef.current);
      toast.success('Данные студента обновлены');
      handleCloseEdit();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось обновить студента';
      toast.error(message);
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Студенты</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Управление аккаунтами студентов Манас.
          </p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-primary text-primary-foreground font-medium"
          disabled={programsLoading}
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Сгенерировать доступ
        </Button>
      </div>

      <GenerateStudentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onGenerate={handleGenerateStudent}
        programs={programs}
        isSubmitting={isSubmitting}
      />

      <div className="w-full bg-card rounded-xl border border-border shadow-sm">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Поиск по ФИО или логину..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-full bg-background"
            />
          </div>

          <div className="flex gap-4 sm:w-auto w-full">
            <select
              value={accountTypeFilter}
              onChange={(e) => {
                const value = e.target.value as 'all' | AccountType;
                setAccountTypeFilter(value);
                setProgramFilter('all');
              }}
              className="px-3 py-2 border border-input rounded-md bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">Все аккаунты</option>
              {ACCOUNT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>

            <select
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              className="px-3 py-2 border border-input rounded-md bg-background text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">Все программы</option>
              {programOptionsByFilter.map((program) => (
                <option key={program.code} value={program.code}>{program.name}</option>
              ))}
            </select>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent bg-muted/30">
              <TableHead>ФИО</TableHead>
              <TableHead>Аккаунт</TableHead>
              <TableHead>Программа</TableHead>
              <TableHead>Логин</TableHead>
              <TableHead>Пароль</TableHead>
              <TableHead>Телефон</TableHead>
              <TableHead>Сумма</TableHead>
              <TableHead>Дата регистр.</TableHead>
              <TableHead>Осталось</TableHead>
              <TableHead>Примечание</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  Загрузка студентов...
                </TableCell>
              </TableRow>
            ) : students.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  Студенты не найдены
                </TableCell>
              </TableRow>
            ) : (
              students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium text-foreground">{student.fullName}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                      {student.accountTypeTitle}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    <div className="text-sm text-foreground truncate" title={student.programName || '—'}>
                      {student.programName || '—'}
                    </div>
                    <div className="text-xs text-muted-foreground">{student.programCode || '—'}</div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{student.username}</TableCell>
                  <TableCell>
                    <PasswordCell password={student.password} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {student.phone || '—'}
                  </TableCell>
                  <TableCell className="text-sm font-medium whitespace-nowrap">
                    {formatAmount(student.amount)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(student.createdAt)}
                  </TableCell>
                  <TableCell>
                    <DaysCell days={calcDaysRemaining(student.createdAt, student.expiresAt)} />
                  </TableCell>
                  <TableCell className="min-w-[160px]">
                    {editingNoteId === student.id ? (
                      <div className="flex items-start gap-1">
                        <textarea
                          ref={noteInputRef}
                          value={noteValue}
                          rows={2}
                          onChange={(e) => {
                            setNoteValue(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void handleNoteSave(student.id);
                            }
                            if (e.key === 'Escape') setEditingNoteId(null);
                          }}
                          className="flex-1 min-w-[160px] text-sm border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring resize-none overflow-hidden"
                          placeholder="Добавить примечание..."
                        />
                        <button
                          onClick={() => void handleNoteSave(student.id)}
                          disabled={noteSaving}
                          className="text-green-600 hover:text-green-700 transition-colors p-1"
                        >
                          {noteSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => setEditingNoteId(null)}
                          className="text-muted-foreground hover:text-foreground transition-colors p-1"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div
                        className="flex items-start gap-1 group cursor-pointer"
                        onClick={() => handleNoteStart(student)}
                      >
                        <span className="text-sm text-foreground whitespace-pre-wrap break-words min-w-0">
                          {student.notes || <span className="text-muted-foreground italic">нет</span>}
                        </span>
                        <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {extendInputId === student.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setExtendSign(extendSign === 1 ? -1 : 1)}
                            className={`w-7 h-7 rounded-md text-sm font-bold border transition-colors ${
                              extendSign === 1
                                ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                                : 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
                            }`}
                          >
                            {extendSign === 1 ? '+' : '−'}
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={365}
                            value={extendDays}
                            onChange={(e) => setExtendDays(Math.abs(Number(e.target.value)) || 1)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void handleExtend(student.id, extendDays, extendSign);
                              if (e.key === 'Escape') setExtendInputId(null);
                            }}
                            className="w-14 text-sm border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring text-center"
                            autoFocus
                          />
                          <span className="text-xs text-muted-foreground">дн.</span>
                          <button
                            onClick={() => void handleExtend(student.id, extendDays, extendSign)}
                            disabled={extendingId === student.id || extendDays === 0}
                            className="text-green-600 hover:text-green-700 transition-colors p-1 disabled:opacity-50"
                          >
                            {extendingId === student.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => setExtendInputId(null)}
                            className="text-muted-foreground hover:text-foreground transition-colors p-1"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setExtendInputId(student.id);
                            setExtendDays(15);
                            setExtendSign(1);
                          }}
                          title="Изменить дни"
                          className="text-muted-foreground hover:text-green-600 hover:bg-green-50 transition-colors h-8 w-8"
                        >
                          <CalendarPlus className="h-4 w-4" />
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(student)}
                        className="text-muted-foreground hover:text-primary transition-colors h-8 w-8"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(student.id)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="p-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Показано {students.length} {students.length === 1 ? 'студент' : 'студентов'}
          </p>
        </div>
      </div>

      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h3 className="text-lg font-bold">Редактирование студента</h3>
              <button
                onClick={handleCloseEdit}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-2">
                <Label>ФИО</Label>
                <Input
                  value={editForm.fullName}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  placeholder="Полное имя студента"
                />
              </div>

              <div className="space-y-2">
                <Label>Тип аккаунта</Label>
                <div className="grid grid-cols-3 gap-2">
                  {ACCOUNT_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setEditForm((prev) => ({
                          ...prev,
                          accountType: option.value,
                          manasTrack: prev.accountType === 'manas' ? prev.manasTrack : 'all_subjects',
                          programCode: '',
                        }));
                      }}
                      className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                        editForm.accountType === option.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card hover:border-primary/50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {editForm.accountType === 'manas' && (
                <div className="space-y-2">
                  <Label>Трек Манаса</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {MANAS_TRACK_OPTIONS.map((track) => (
                      <button
                        key={track.value}
                        type="button"
                        onClick={() => {
                          setEditForm((prev) => ({
                            ...prev,
                            manasTrack: track.value,
                            programCode: '',
                          }));
                        }}
                        className={`rounded-xl border-2 px-3 py-2.5 text-xs sm:text-sm font-medium transition-all ${
                          editForm.manasTrack === track.value
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-card hover:border-primary/50'
                        }`}
                      >
                        {track.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Программа</Label>
                <select
                  value={editForm.programCode}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, programCode: e.target.value }))}
                  className="w-full h-10 px-3 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Авто (по типу аккаунта)</option>
                  {editPrograms.map((program) => (
                    <option key={program.code} value={program.code}>{program.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Логин</Label>
                <Input
                  value={editForm.username}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, username: e.target.value }))}
                  placeholder="Логин студента"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Телефон</Label>
                  <Input
                    value={editForm.phone}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="996XXXXXXXXX"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Сумма (сом)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.amount}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, amount: Number(e.target.value) || 0 }))}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Статус</Label>
                <div className="flex gap-2">
                  {([
                    { value: true, label: 'Активен' },
                    { value: false, label: 'Отключен' },
                  ] as const).map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setEditForm((prev) => ({ ...prev, isActive: option.value }))}
                      className={`flex-1 rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all ${
                        editForm.isActive === option.value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card hover:border-primary/50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Новый пароль</Label>
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showEditPassword ? 'Скрыть' : 'Показать'}
                  </button>
                </div>
                <Input
                  type={showEditPassword ? 'text' : 'password'}
                  value={editForm.password}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Оставьте пустым, чтобы не менять"
                />
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-border">
              <Button variant="secondary" onClick={handleCloseEdit} className="flex-1">
                Отмена
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={editLoading || !editForm.fullName.trim() || !editForm.username.trim()}
                className="flex-1"
              >
                {editLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Сохранить
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
