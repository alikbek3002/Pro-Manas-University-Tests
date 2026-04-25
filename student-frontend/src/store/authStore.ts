import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StudentAuthUser } from '../lib/api';

export type LogoutReason = 'taken_over' | null;

interface AuthState {
    token: string | null;
    student: StudentAuthUser | null;
    hasHydrated: boolean;
    logoutReason: LogoutReason;
    setHasHydrated: (value: boolean) => void;
    setToken: (token: string | null) => void;
    setStudent: (payload: { token: string; student: StudentAuthUser } | null) => void;
    setLogoutReason: (reason: LogoutReason) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            token: null,
            student: null,
            hasHydrated: false,
            logoutReason: null,
            setHasHydrated: (value) => set({ hasHydrated: value }),
            setToken: (token) => set({ token }),
            setStudent: (payload) => set({
                token: payload?.token ?? null,
                student: payload?.student ?? null,
                // Clear any stale "kicked out" banner once a fresh login lands.
                logoutReason: null,
            }),
            setLogoutReason: (reason) => set({ logoutReason: reason }),
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
