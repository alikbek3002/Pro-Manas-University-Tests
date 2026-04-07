import { fetchAvailableTests, fetchTestHistory, fetchTestHistoryDetail } from './api';

export const studentQueryKeys = {
  available: (studentId: string) => ['student', studentId, 'available'] as const,
  history: (studentId: string) => ['student', studentId, 'history'] as const,
  historyDetail: (studentId: string, id: string, type: string) =>
    ['student', studentId, 'history', type, id] as const,
};

export function availableTestsQueryOptions(studentId: string, token: string) {
  return {
    queryKey: studentQueryKeys.available(studentId),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchAvailableTests(token, signal),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  };
}

export function testHistoryQueryOptions(studentId: string, token: string) {
  return {
    queryKey: studentQueryKeys.history(studentId),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchTestHistory(token, signal),
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
  };
}

export function testHistoryDetailQueryOptions(studentId: string, token: string, id: string, type: string) {
  return {
    queryKey: studentQueryKeys.historyDetail(studentId, id, type),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchTestHistoryDetail(token, id, type, signal),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  };
}
