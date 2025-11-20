import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000, // 5 seconds
      retry: 2,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchInterval: 60000, // 60 second polling as lazy fallback (WebSocket is primary)
    },
    mutations: {
      retry: 1,
    },
  },
});

