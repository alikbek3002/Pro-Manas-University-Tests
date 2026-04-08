import { fetchAvailableTests, fetchSubjectVideos, fetchTestHistory, fetchTestHistoryDetail } from './api';

export const studentQueryKeys = {
  available: (studentId: string) => ['student', studentId, 'available'] as const,
  videos: (studentId: string, subjectCode: string) => ['student', studentId, 'videos', subjectCode] as const,
  history: (studentId: string) => ['student', studentId, 'history'] as const,
  historyDetail: (studentId: string, id: string, type: string) =>
    ['student', studentId, 'history', type, id] as const,
};

export function availableTestsQueryOptions(studentId: string) {
  return {
    queryKey: studentQueryKeys.available(studentId),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchAvailableTests(signal),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  };
}

export function testHistoryQueryOptions(studentId: string) {
  return {
    queryKey: studentQueryKeys.history(studentId),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchTestHistory(signal),
    staleTime: 2 * 60_000,
    gcTime: 20 * 60_000,
  };
}

export function subjectVideosQueryOptions(studentId: string, subjectCode: string) {
  return {
    queryKey: studentQueryKeys.videos(studentId, subjectCode),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchSubjectVideos(subjectCode, signal),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    refetchOnMount: 'always' as const,
  };
}

export function testHistoryDetailQueryOptions(studentId: string, id: string, type: string) {
  return {
    queryKey: studentQueryKeys.historyDetail(studentId, id, type),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchTestHistoryDetail(id, type, signal),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  };
}
