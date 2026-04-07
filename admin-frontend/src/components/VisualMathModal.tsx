import { useEffect, useRef, useState, createElement } from 'react';
import { Button } from '@/components/ui/button';
import { X, Calculator } from 'lucide-react';
import 'mathlive';

interface VisualMathModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (latex: string) => void;
}

export function VisualMathModal({ isOpen, onClose, onInsert }: VisualMathModalProps) {
  const mfRef = useRef<any>(null);
  const [latex, setLatex] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLatex('');
      // Focus the math field after a short delay to ensure it's rendered
      setTimeout(() => {
        if (mfRef.current) {
          mfRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen]);

  useEffect(() => {
    const mf = mfRef.current;
    if (mf) {
      const handleInput = (ev: Event) => {
        setLatex((ev.target as any).value);
      };
      mf.addEventListener('input', handleInput);
      return () => mf.removeEventListener('input', handleInput);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2 text-lg font-bold">
            <Calculator className="w-5 h-5 text-primary" />
            Визуальный редактор формул
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 flex-1 flex flex-col gap-4">
          <p className="text-sm text-slate-500">
            Используйте виртуальную клавиатуру ниже или вводите с обычной клавиатуры (например, нажмите <code>/</code> для дроби).
          </p>
          
          <div className="border-2 border-primary/20 rounded-xl p-4 bg-slate-50 dark:bg-slate-800 text-2xl min-h-[100px] flex items-center justify-center">
            {createElement('math-field', {
              ref: mfRef,
              style: { width: '100%', fontSize: '24px', backgroundColor: 'transparent', border: 'none', outline: 'none' }
            }, latex)}
          </div>
        </div>

        <div className="px-6 py-4 border-t bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button 
            onClick={() => {
              onInsert(`$${latex}$`);
              onClose();
            }}
            disabled={!latex.trim()}
          >
            Вставить в текст
          </Button>
        </div>
      </div>
    </div>
  );
}
