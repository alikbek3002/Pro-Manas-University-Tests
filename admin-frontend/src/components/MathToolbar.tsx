import { Button } from '@/components/ui/button';
import { Calculator } from 'lucide-react';

interface MathToolbarProps {
  onInsert: (template: string) => void;
  onOpenVisualEditor?: () => void;
  compact?: boolean;
}

interface MathTool {
  symbol: string;
  label: string;
  template: string;
  hint?: string;
}

const TOOLS: MathTool[] = [
  { symbol: '½', label: 'Дробь', template: '$\\frac{1}{2}$', hint: 'Дробь 1/2' },
  { symbol: 'x²', label: 'Степень', template: '$x^{2}$', hint: 'Возведение в степень' },
  { symbol: 'xₙ', label: 'Индекс', template: '$x_{n}$', hint: 'Нижний индекс' },
  { symbol: '√', label: 'Корень', template: '$\\sqrt{x}$', hint: 'Квадратный корень' },
  { symbol: '∛', label: 'Куб. корень', template: '$\\sqrt[3]{x}$', hint: 'Корень степени n' },
  { symbol: '×', label: 'Умножение', template: '$\\times$' },
  { symbol: '÷', label: 'Деление', template: '$\\div$' },
  { symbol: '±', label: 'Плюс-минус', template: '$\\pm$' },
  { symbol: '°', label: 'Градус', template: '$^{\\circ}$' },
  { symbol: 'π', label: 'Пи', template: '$\\pi$' },
  { symbol: '∞', label: 'Бесконечность', template: '$\\infty$' },
  { symbol: '≤', label: 'Меньше или равно', template: '$\\leq$' },
  { symbol: '≥', label: 'Больше или равно', template: '$\\geq$' },
  { symbol: '≠', label: 'Не равно', template: '$\\neq$' },
  { symbol: '≈', label: 'Приблизительно', template: '$\\approx$' },
  { symbol: '∑', label: 'Сумма', template: '$\\sum_{i=1}^{n} x_{i}$' },
  { symbol: '∫', label: 'Интеграл', template: '$\\int_{a}^{b} f(x) \\, dx$' },
];

export function MathToolbar({ onInsert, onOpenVisualEditor, compact = false }: MathToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2">
      {onOpenVisualEditor && (
        <Button
          type="button"
          variant="default"
          size="sm"
          className="h-7 text-xs px-3 bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
          onClick={onOpenVisualEditor}
          title="Открыть визуальный редактор формул (mathlive)"
        >
          <Calculator className="w-3.5 h-3.5" />
          {compact ? 'Формула' : 'Визуальный редактор формул'}
        </Button>
      )}

      {onOpenVisualEditor && <div className="h-5 w-px bg-border mx-1 hidden sm:block" />}

      {TOOLS.map((tool) => (
        <Button
          key={tool.label}
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 py-0 text-xs font-medium gap-1"
          onClick={() => onInsert(tool.template)}
          title={tool.hint || tool.label}
        >
          <span className="text-sm font-semibold leading-none">{tool.symbol}</span>
          {!compact && <span className="hidden md:inline text-[10px] text-muted-foreground">{tool.label}</span>}
        </Button>
      ))}
    </div>
  );
}
