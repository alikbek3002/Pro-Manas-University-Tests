import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Loader2, Search, ImagePlus, X, Save } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  addQuestion,
  deleteQuestion,
  fetchQuestionCatalog,
  fetchQuestions,
  updateQuestion,
  uploadImage,
  type Question,
  type QuestionCatalogProgram,
} from '@/lib/api';
import { toast } from 'sonner';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { MathInput } from '@/components/MathInput';

type QuestionFormState = {
  questionText: string;
  optionA: string;
  optionB: string;
  optionC: string;
  optionD: string;
  correctOption: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  imageUrl: string;
  templateCode: string;
  tags: string;
};

const DEFAULT_FORM: QuestionFormState = {
  questionText: '',
  optionA: '',
  optionB: '',
  optionC: '',
  optionD: '',
  correctOption: 'A',
  explanation: '',
  imageUrl: '',
  templateCode: '',
  tags: '',
};

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function parseTags(input: string) {
  return input
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function optionLetterByIndex(index: number): 'A' | 'B' | 'C' | 'D' {
  return (['A', 'B', 'C', 'D'][index] || 'A') as 'A' | 'B' | 'C' | 'D';
}

function extractOption(question: Question, index: number): string {
  return question.options[index]?.text || '';
}

export default function TestsPage() {
  const [catalog, setCatalog] = useState<QuestionCatalogProgram[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [programCode, setProgramCode] = useState('');
  const [subjectCode, setSubjectCode] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery.trim());

  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [listLoading, setListLoading] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formData, setFormData] = useState<QuestionFormState>(DEFAULT_FORM);
  const [formLoading, setFormLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  const selectedProgram = useMemo(
    () => catalog.find((program) => program.code === programCode) || null,
    [catalog, programCode],
  );

  const subjectOptions = selectedProgram?.subjects || [];

  const selectedSubject = useMemo(
    () => subjectOptions.find((subject) => subject.code === subjectCode) || null,
    [subjectCode, subjectOptions],
  );

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const programs = await fetchQuestionCatalog();
      setCatalog(programs);

      if (programs.length > 0) {
        const firstProgram = programs[0];
        setProgramCode((prev) => prev || firstProgram.code);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка загрузки каталога');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadQuestions = useCallback(async () => {
    if (!programCode || !subjectCode) {
      setQuestions([]);
      setTotalCount(0);
      return;
    }

    setListLoading(true);
    try {
      const response = await fetchQuestions({
        programCode,
        subjectCode: subjectCode || undefined,
        search: deferredSearch || undefined,
      });
      setQuestions(response.questions);
      setTotalCount(response.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка загрузки вопросов');
    } finally {
      setListLoading(false);
    }
  }, [deferredSearch, programCode, subjectCode]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (!selectedProgram) return;

    const subjectExists = selectedProgram.subjects.some((subject) => subject.code === subjectCode);
    if (!subjectExists) {
      setSubjectCode(selectedProgram.subjects[0]?.code || '');
    }
  }, [selectedProgram, subjectCode]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const resetForm = () => {
    setFormData(DEFAULT_FORM);
    setEditingQuestion(null);
  };

  const openAddForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEditForm = (question: Question) => {
    const correctIndex = question.options.findIndex((option) => option.is_correct);
    setEditingQuestion(question);
    setFormData({
      questionText: question.question_text,
      optionA: extractOption(question, 0),
      optionB: extractOption(question, 1),
      optionC: extractOption(question, 2),
      optionD: extractOption(question, 3),
      correctOption: optionLetterByIndex(correctIndex),
      explanation: question.explanation || '',
      imageUrl: question.image_url || '',
      templateCode: question.template_code || '',
      tags: Array.isArray(question.tags) ? question.tags.join(', ') : '',
    });
    setFormOpen(true);
  };

  const handleCloseForm = () => {
    setFormOpen(false);
    resetForm();
  };

  const validateForm = () => {
    if (!programCode) {
      toast.error('Выберите программу');
      return false;
    }

    if (!subjectCode) {
      toast.error('Выберите предмет');
      return false;
    }

    if (!formData.questionText.trim()) {
      toast.error('Введите текст вопроса');
      return false;
    }

    const options = [formData.optionA, formData.optionB, formData.optionC, formData.optionD];
    if (options.some((option) => !option.trim())) {
      toast.error('Заполните все 4 варианта ответа');
      return false;
    }

    return true;
  };

  const buildOptionsPayload = () => {
    const options = [formData.optionA, formData.optionB, formData.optionC, formData.optionD];

    return options.map((text, index) => ({
      text: text.trim(),
      is_correct: formData.correctOption === optionLetterByIndex(index),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!validateForm()) return;

    setFormLoading(true);
    try {
      const payload = {
        programCode,
        subjectCode,
        questionText: formData.questionText.trim(),
        options: buildOptionsPayload(),
        explanation: formData.explanation.trim(),
        imageUrl: formData.imageUrl.trim(),
        templateCode: formData.templateCode.trim() || undefined,
        tags: parseTags(formData.tags),
      };

      if (editingQuestion) {
        await updateQuestion(editingQuestion.id, payload);
        toast.success('Вопрос обновлён');
      } else {
        await addQuestion(payload);
        toast.success('Вопрос добавлен');
      }

      handleCloseForm();
      await loadQuestions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка сохранения вопроса');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async (question: Question) => {
    if (!confirm(`Удалить вопрос?\n\n"${question.question_text.slice(0, 120)}"`)) return;

    try {
      await deleteQuestion(question.id);
      toast.success('Вопрос удалён');
      await loadQuestions();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка удаления');
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageUploading(true);
    try {
      const response = await uploadImage(file);
      setFormData((prev) => ({ ...prev, imageUrl: response.imageUrl }));
      toast.success('Изображение загружено');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка загрузки изображения');
    } finally {
      setImageUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Банк вопросов</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Управление вопросами по программам и предметам университета.
          </p>
        </div>

        <Button onClick={openAddForm} disabled={!programCode || !subjectCode || catalogLoading}>
          <Plus className="w-4 h-4 mr-2" />
          Добавить вопрос
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Программа</Label>
              <select
                value={programCode}
                onChange={(event) => setProgramCode(event.target.value)}
                className="w-full h-10 px-3 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={catalogLoading}
              >
                {!catalog.length && <option value="">Нет программ</option>}
                {catalog.map((program) => (
                  <option key={program.code} value={program.code}>
                    {program.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Предмет</Label>
              <select
                value={subjectCode}
                onChange={(event) => setSubjectCode(event.target.value)}
                className="w-full h-10 px-3 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={!programCode}
              >
                {!subjectOptions.length && <option value="">Нет предметов</option>}
                {subjectOptions.map((subject) => (
                  <option key={subject.code} value={subject.code}>{subject.title}</option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Поиск</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Текст вопроса, вариант ответа или ID"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            {selectedProgram ? selectedProgram.name : 'Программа не выбрана'}
            {selectedSubject ? ` • ${selectedSubject.title}` : ''}
            {` • ${totalCount} вопросов`}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {listLoading ? (
            <div className="py-10 text-center text-muted-foreground">Загрузка вопросов...</div>
          ) : questions.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">Вопросы не найдены</div>
          ) : (
            <div className="space-y-4">
              {questions.map((question) => (
                <div key={question.id} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">
                        {question.subject_title || question.subject_code || '—'}
                        {question.template_code ? ` • ${question.template_code}` : ''}
                        {` • ${formatDate(question.created_at)}`}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(question.id);
                          toast.success('ID скопирован');
                        }}
                        className="font-mono text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        title="Скопировать ID для поиска"
                      >
                        ID: {question.id}
                      </button>
                      <div className="text-sm text-foreground">
                        <MarkdownRenderer content={question.question_text} />
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openEditForm(question)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(question)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    {question.options.map((option, index) => (
                      <div
                        key={`${question.id}-${index}`}
                        className={`rounded-md border px-3 py-2 text-sm ${
                          option.is_correct
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                            : 'border-border bg-muted/30'
                        }`}
                      >
                        <span className="font-semibold mr-2">{optionLetterByIndex(index)}.</span>
                        <MarkdownRenderer content={option.text} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm p-4 overflow-auto">
          <div className="min-h-full flex items-center justify-center">
            <div className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-xl overflow-hidden">
              <div className="p-5 border-b border-border flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {editingQuestion ? 'Редактирование вопроса' : 'Новый вопрос'}
                </h2>
                <Button variant="ghost" size="icon" onClick={handleCloseForm}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <div className="space-y-2">
                  <Label>Текст вопроса</Label>
                  <MathInput
                    value={formData.questionText}
                    onChange={(next) => setFormData((prev) => ({ ...prev, questionText: next }))}
                    multiline
                    rows={4}
                    placeholder="Введите текст вопроса. Для формул используйте кнопки выше или $\\frac{1}{2}$."
                  />
                  <p className="text-xs text-muted-foreground">
                    Формулы пишутся в долларах: <code>$\frac&#123;1&#125;&#123;2&#125;$</code>. Используйте кнопки выше — они вставляют шаблон в позицию курсора.
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {[0, 1, 2, 3].map((index) => {
                    const letter = optionLetterByIndex(index);
                    const key = `option${letter}` as 'optionA' | 'optionB' | 'optionC' | 'optionD';
                    return (
                      <div key={letter} className="space-y-2">
                        <Label>Вариант {letter}</Label>
                        <MathInput
                          compact
                          value={formData[key]}
                          onChange={(next) => setFormData((prev) => ({ ...prev, [key]: next }))}
                          placeholder={`Ответ ${letter}`}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <Label>Правильный вариант</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['A', 'B', 'C', 'D'] as const).map((letter) => (
                      <button
                        key={letter}
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, correctOption: letter }))}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                          formData.correctOption === letter
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background hover:bg-muted'
                        }`}
                      >
                        {letter}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Template code (необязательно)</Label>
                    <Input
                      value={formData.templateCode}
                      onChange={(event) => setFormData((prev) => ({ ...prev, templateCode: event.target.value }))}
                      placeholder="Например: ort_trial_1"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Теги (через запятую)</Label>
                    <Input
                      value={formData.tags}
                      onChange={(event) => setFormData((prev) => ({ ...prev, tags: event.target.value }))}
                      placeholder="алгебра, базовый"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Пояснение</Label>
                  <MathInput
                    compact
                    value={formData.explanation}
                    onChange={(next) => setFormData((prev) => ({ ...prev, explanation: next }))}
                    multiline
                    rows={3}
                    placeholder="Пояснение к ответу"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Изображение (URL)</Label>
                  <div className="flex gap-2">
                    <Input
                      value={formData.imageUrl}
                      onChange={(event) => setFormData((prev) => ({ ...prev, imageUrl: event.target.value }))}
                      placeholder="https://..."
                    />
                    <label className="inline-flex">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={imageUploading}
                      />
                      <Button type="button" variant="outline" disabled={imageUploading} asChild>
                        <span>
                          {imageUploading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <ImagePlus className="h-4 w-4" />
                          )}
                        </span>
                      </Button>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2 border-t border-border">
                  <Button type="button" variant="secondary" onClick={handleCloseForm}>
                    Отмена
                  </Button>
                  <Button type="submit" disabled={formLoading || imageUploading}>
                    {formLoading ? (
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
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
