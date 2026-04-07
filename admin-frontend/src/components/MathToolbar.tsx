import { Button } from '@/components/ui/button';
import { Calculator } from 'lucide-react';

interface MathToolbarProps {
  onInsert: (template: string) => void;
  onOpenVisualEditor?: () => void;
}

export function MathToolbar({ onInsert, onOpenVisualEditor }: MathToolbarProps) {
  const tools = [
    { label: 'Дробь', template: '$\\frac{числитель}{знаменатель}$' },
    { label: 'Степень', template: '$x^{2}$' },
    { label: 'Корень', template: '$\\sqrt{x}$' },
    { label: 'Умножение', template: '$\\times$' },
    { label: 'Деление', template: '$\\div$' },
    { label: 'Градус', template: '$^{\\circ}$' },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      {onOpenVisualEditor && (
        <Button
          type="button"
          variant="default"
          size="sm"
          className="h-7 text-xs px-3 bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
          onClick={onOpenVisualEditor}
        >
          <Calculator className="w-3.5 h-3.5" />
          Визуальный редактор формул
        </Button>
      )}
      
      <div className="h-4 w-px bg-border mx-1 hidden sm:block"></div>

      {tools.map((tool) => (
        <Button
          key={tool.label}
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[10px] px-2 py-0"
          onClick={() => onInsert(tool.template)}
        >
          {tool.label}
        </Button>
      ))}
    </div>
  );
}
