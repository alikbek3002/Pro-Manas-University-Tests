import React, { useMemo, useState } from 'react';
import { UserPlus, X, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { AccountType, ProgramOption } from '@/lib/api';

interface GenerateStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (student: GeneratedStudentPayload) => void | Promise<void>;
  programs: ProgramOption[];
  isSubmitting?: boolean;
}

export interface GeneratedStudentPayload {
  fullName: string;
  accountType: AccountType;
  manasTrack?: 'all_subjects' | 'humanities' | 'exact_sciences';
  programCode?: string;
  username: string;
  password: string;
  phone: string;
  amount: number;
}

const ACCOUNT_OPTIONS: Array<{ id: AccountType; label: string }> = [
  { id: 'ort', label: 'ОРТ' },
  { id: 'medical', label: 'МЕД' },
  { id: 'manas', label: 'Манас' },
];

const MANAS_TRACK_OPTIONS = [
  { id: 'all_subjects', label: 'Все предметы' },
  { id: 'humanities', label: 'Гуманитарий' },
  { id: 'exact_sciences', label: 'Точные науки' },
] as const;

export function GenerateStudentModal({
  isOpen,
  onClose,
  onGenerate,
  programs,
  isSubmitting = false,
}: GenerateStudentModalProps) {
  const [fullName, setFullName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('ort');
  const [manasTrack, setManasTrack] = useState<'all_subjects' | 'humanities' | 'exact_sciences'>('all_subjects');
  const [selectedProgramCode, setSelectedProgramCode] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState<number>(0);

  const [previewUsername, setPreviewUsername] = useState('');
  const [previewPassword, setPreviewPassword] = useState('');

  const filteredPrograms = useMemo(() => {
    return programs.filter((program) => {
      if (program.account_type !== accountType) return false;
      if (accountType !== 'manas') return true;
      return program.manas_track === manasTrack;
    });
  }, [accountType, manasTrack, programs]);

  const transliterate = (text: string) => {
    const ru = 'А-а-Б-б-В-в-Г-г-Д-д-Е-е-Ё-ё-Ж-ж-З-з-И-и-Й-й-К-к-Л-л-М-м-Н-н-О-о-П-п-Р-р-С-с-Т-т-У-у-Ф-ф-Х-х-Ц-ц-Ч-ч-Ш-ш-Щ-щ-Ъ-ъ-Ы-ы-Ь-ь-Э-э-Ю-ю-Я-я'.split('-');
    const en = 'A-a-B-b-V-v-G-g-D-d-E-e-E-e-ZH-zh-Z-z-I-i-Y-y-K-k-L-l-M-m-N-n-O-o-P-p-R-r-S-s-T-t-U-u-F-f-H-h-TS-ts-CH-ch-SH-sh-SCH-sch-\'-\'-Y-y-\'-\'-E-e-YU-yu-YA-ya'.split('-');
    let res = '';
    for (let i = 0, l = text.length; i < l; i += 1) {
      const s = text.charAt(i);
      const n = ru.indexOf(s);
      if (n >= 0) {
        res += en[n];
      } else {
        res += s;
      }
    }
    return res.toLowerCase().replace(/[^a-z0-9]/g, '');
  };

  const handlePreviewGeneration = () => {
    if (!fullName.trim()) return;

    const parts = fullName.split(' ').filter(Boolean);
    const firstName = parts[1] ? transliterate(parts[1]) : '';
    const lastName = parts[0] ? transliterate(parts[0]) : '';

    const generatedUsername = `${firstName}.${lastName}`.toLowerCase();
    const randomNum = Math.floor(Math.random() * 900) + 100;
    const generatedPassword = `uni${randomNum}`;

    setPreviewUsername(generatedUsername || 'user.name');
    setPreviewPassword(generatedPassword);
  };

  const resetForm = () => {
    setFullName('');
    setAccountType('ort');
    setManasTrack('all_subjects');
    setSelectedProgramCode('');
    setPhone('');
    setAmount(0);
    setPreviewUsername('');
    setPreviewPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !previewUsername || !previewPassword) return;

    const fallbackProgram = filteredPrograms[0]?.code;

    try {
      await onGenerate({
        fullName: fullName.trim(),
        accountType,
        manasTrack: accountType === 'manas' ? manasTrack : undefined,
        programCode: selectedProgramCode || fallbackProgram,
        username: previewUsername,
        password: previewPassword,
        phone: phone.trim(),
        amount: Number(amount) || 0,
      });
      resetForm();
    } catch {
      // Error toast is shown by parent handler.
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card w-full max-w-lg rounded-xl shadow-lg border border-border overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">Новый студент</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Тип аккаунта</Label>
              <div className="grid grid-cols-3 gap-2">
                {ACCOUNT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      setAccountType(option.id);
                      setSelectedProgramCode('');
                    }}
                    className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all ${accountType === option.id
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card hover:border-primary/50'
                      }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {accountType === 'manas' && (
              <div className="space-y-2">
                <Label>Трек Манаса</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {MANAS_TRACK_OPTIONS.map((track) => (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => {
                        setManasTrack(track.id);
                        setSelectedProgramCode('');
                      }}
                      className={`rounded-xl border-2 px-3 py-2.5 text-xs sm:text-sm font-medium transition-all ${manasTrack === track.id
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
              <Label htmlFor="program">Программа</Label>
              <select
                id="program"
                value={selectedProgramCode}
                onChange={(e) => setSelectedProgramCode(e.target.value)}
                className="w-full h-10 px-3 bg-background border border-input rounded-md text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Авто (по типу аккаунта)</option>
                {filteredPrograms.map((program) => (
                  <option key={program.code} value={program.code}>
                    {program.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">Фамилия Имя Отчество</Label>
              <div className="flex gap-2">
                <Input
                  id="fullName"
                  placeholder="Иванов Иван Иванович"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handlePreviewGeneration}
                  disabled={!fullName.trim() || isSubmitting}
                  className="shrink-0"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Сгенерировать
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Номер телефона</Label>
                <Input
                  id="phone"
                  placeholder="996XXXXXXXXX"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Сумма (сом)</Label>
                <Input
                  id="amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>

          <div className={cn(
            'p-4 rounded-lg border border-border bg-muted/30 space-y-3 transition-all',
            !previewUsername && 'opacity-50 pointer-events-none',
          )}
          >
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wand2 className="w-4 h-4" />
              Сгенерированные доступы
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Логин</Label>
                <div className="font-mono text-sm font-medium p-2 bg-background border border-border rounded-md">
                  {previewUsername || '-'}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Пароль</Label>
                <div className="font-mono text-sm font-medium p-2 bg-background border border-border rounded-md text-primary">
                  {previewPassword || '-'}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Отмена
            </Button>
            <Button type="submit" disabled={!previewUsername || isSubmitting}>
              {isSubmitting ? 'Создание...' : 'Создать студента'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
