import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AdminIdentity } from '@/lib/api';

interface AdminAuthState {
    token: string | null;
    admin: AdminIdentity | null;
    isAdmin: boolean;
    login: (payload: { token: string; admin: AdminIdentity }) => void;
    logout: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
    persist(
        (set) => ({
            token: null,
            admin: null,
            isAdmin: false,
            login: ({ token, admin }) => set({ isAdmin: true, token, admin }),
            logout: () => set({ isAdmin: false, token: null, admin: null }),
        }),
        {
            name: 'admin-auth-storage',
            storage: createJSONStorage(() => localStorage),
            merge: (persistedState, currentState) => {
                const state = persistedState as Partial<AdminAuthState>;
                const token = state?.token ?? null;
                const admin = state?.admin ?? null;

                return {
                    ...currentState,
                    ...state,
                    token,
                    admin,
                    isAdmin: Boolean(token),
                };
            },
        }
    )
);
