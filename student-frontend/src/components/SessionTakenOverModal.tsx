import { useAuthStore } from '../store/authStore';

export function SessionTakenOverModal() {
  const logoutReason = useAuthStore((state) => state.logoutReason);
  const setLogoutReason = useAuthStore((state) => state.setLogoutReason);

  if (logoutReason !== 'taken_over') {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="px-6 pt-7 pb-3 sm:px-8">
          <h3 className="text-xl font-black text-black sm:text-2xl">
            Сессия завершена
          </h3>
          <p className="mt-3 text-sm font-medium leading-relaxed text-stone-600">
            На ваш аккаунт зашли с другого устройства. Одновременно работать с одного аккаунта на нескольких устройствах нельзя.
          </p>
        </div>
        <div className="flex justify-end border-t border-stone-100 px-6 py-4 sm:px-8">
          <button
            type="button"
            onClick={() => setLogoutReason(null)}
            className="rounded-2xl bg-black px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-stone-800 active:scale-[0.98]"
          >
            ОК
          </button>
        </div>
      </div>
    </div>
  );
}
