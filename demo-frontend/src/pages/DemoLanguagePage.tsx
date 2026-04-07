import { Languages } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import logo from '../assets/pro-manas-logo.png';
import { setStoredDemoLanguage, type DemoLanguage } from '../lib/demoLanguage';

const LANGUAGE_OPTIONS: Array<{
  id: DemoLanguage;
  title: string;
  subtitle: string;
  description: string;
}> = [
  {
    id: 'ru',
    title: 'Русский',
    subtitle: 'Русский интерфейс',
    description: 'Предметы и вопросы будут открываться на русском языке.',
  },
  {
    id: 'kg',
    title: 'Кыргызча',
    subtitle: 'Кыргызча интерфейс',
    description: 'Интерфейс ачылат кыргызча, суроолор кыргызча таблицалардан алынат.',
  },
];

export default function DemoLanguagePage() {
  const navigate = useNavigate();

  const handleSelectLanguage = (language: DemoLanguage) => {
    setStoredDemoLanguage(language);
    navigate('/select');
  };

  return (
    <div className="min-h-screen bg-white font-sans text-stone-900">
      <div className="border-b-2 border-stone-100">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-stone-400">
              ProManas
            </p>
            <p className="mt-1 text-sm font-medium text-stone-500">
              Demo Tests
            </p>
          </div>
          <img src={logo} alt="ProManas" className="h-10 w-auto sm:h-14" decoding="async" />
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-14">
        <div className="mb-8 sm:mb-10">
          <h1 className="text-3xl font-black text-black sm:text-5xl">
            Тилди тандаңыз / Выберите язык
          </h1>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-stone-500 sm:text-base">
            Сначала выберите язык интерфейса и тестов. После этого откроется демо-страница с предметами.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {LANGUAGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => handleSelectLanguage(option.id)}
              className="group rounded-3xl border-2 border-stone-200 bg-white p-6 text-left transition-all hover:border-black hover:bg-stone-50 active:scale-[0.99] sm:p-8"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-black transition-colors group-hover:bg-black group-hover:text-white">
                <Languages className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-2xl font-black text-black">
                {option.title}
              </h2>
              <p className="mt-2 text-sm font-bold uppercase tracking-[0.18em] text-stone-400">
                {option.subtitle}
              </p>
              <p className="mt-4 text-sm font-medium leading-relaxed text-stone-500 sm:text-base">
                {option.description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
