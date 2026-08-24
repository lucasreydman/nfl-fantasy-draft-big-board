/** Types for the one function the vite config imports; the module itself is plain JS. */
export function buildLiveData(): Promise<{
  vegas: unknown
  adp: Record<string, number>
  fetchedAt: string
}>
