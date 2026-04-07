import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StudentAuthUser } from '../lib/api';

interface AuthState {
    token: string | null;
    student: StudentAuthUser | null;
    hasHydrated: boolean;
    setHasHydrated: (value: boolean) => void;
    setToken: (token: string | null) => void;
    setStudent: (payload: { token: string; student: StudentAuthUser } | null) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            token: null,
            student: null,
            hasHydrated: false,
            setHasHydrated: (value) => set({ hasHydrated: value }),
            setToken: (token) => set({ token }),
            setStudent: (payload) => set({
                token: payload?.token ?? null,
                student: payload?.student ?? null,
            }),
            logout: () => set({ token: null, student: null }),
        }),
        {
            name: 'auth-storage', // Данные сохранятся в localStorage 
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                token: state.token,
                student: state.student,
            }),
            merge: (persistedState, currentState) => {
                const state = persistedState as Partial<AuthState>;
                const token = state?.token ?? null;
                const student = state?.student ?? null;

                return {
                    ...currentState,
                    token,
                    student,
                };
            },
            onRehydrateStorage: () => (state) => {
                state?.setHasHydrated(true);
            },
        }
    )
);
