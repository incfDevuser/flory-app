import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // En móvil la red se cae a menudo; reintentar tres veces solo alarga el spinner.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  plants: (userId: string) => ['plants', userId] as const,
  plantDetail: (plantId: string) => ['plant-detail', plantId] as const,
  plantWaterings: (plantId: string) => ['plant-waterings', plantId] as const,
  plantDiagnoses: (plantId: string) => ['plant-diagnoses', plantId] as const,
  plantDiagnosesAll: (plantId: string) => ['plant-diagnoses-all', plantId] as const,
  diagnosis: (diagnosisId: string) => ['diagnosis', diagnosisId] as const,
  chatMessages: (plantId: string) => ['chat-messages', plantId] as const,
  plantSummary: (plantId: string) => ['plant-summary', plantId] as const,
  /** Catálogo de planes: 4 filas que solo cambian con un deploy. */
  plans: () => ['plans'] as const,
  plantCount: (userId: string) => ['plant-count', userId] as const,
};
