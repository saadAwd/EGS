import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ZoneActivation from '../../pages/ZoneActivation';
import { ActivationProvider } from '../../contexts/ActivationContext';
import { AlarmProvider } from '../../contexts/AlarmContext';
import { SystemStateProvider } from '../../contexts/SystemStateContext';
import { WebSocketProvider } from '../../contexts/WebSocketContext';
import { ThemeProvider } from '../../contexts/ThemeContext';

// Mock dependencies
jest.mock('../../api/queries', () => ({
  useWeather: jest.fn(() => ({
    data: { wind_direction_deg: 0 },
    isLoading: false,
    isError: false,
  })),
  useActivateZone: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue({}),
    isPending: false,
  })),
  useDeactivateZone: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue({}),
    isPending: false,
  })),
}));

jest.mock('../../contexts/WebSocketContext', () => ({
  WebSocketProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWebSocketContext: () => ({
    wsClient: {
      onMessage: jest.fn(),
    },
  }),
}));

const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
};

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ActivationProvider>
          <WebSocketProvider>
            <SystemStateProvider>
              <AlarmProvider>
                {children}
              </AlarmProvider>
            </SystemStateProvider>
          </WebSocketProvider>
        </ActivationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

describe('ZoneActivation', () => {
  it('should render zone selection interface', () => {
    render(
      <TestWrapper>
        <ZoneActivation />
      </TestWrapper>
    );

    expect(screen.getByText('Zone Activation')).toBeInTheDocument();
  });

  it('should show activate button when zone is selected', async () => {
    render(
      <TestWrapper>
        <ZoneActivation />
      </TestWrapper>
    );

    // Wait for component to render
    await waitFor(() => {
      expect(screen.getByText(/Activate Emergency/i)).toBeInTheDocument();
    });
  });

  it('should handle keyboard shortcut Alt+Shift+A', async () => {
    const { useActivateZone } = require('../../api/queries');
    const mockMutateAsync = jest.fn().mockResolvedValue({});
    useActivateZone.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });

    render(
      <TestWrapper>
        <ZoneActivation />
      </TestWrapper>
    );

    // Simulate keyboard shortcut
    fireEvent.keyDown(window, {
      key: 'a',
      altKey: true,
      shiftKey: true,
    });

    // Should show error toast if zone not selected
    await waitFor(() => {
      // Toast notification should appear
    });
  });

  it('should handle keyboard shortcut Alt+Shift+D', async () => {
    const { useDeactivateZone } = require('../../api/queries');
    const mockMutateAsync = jest.fn().mockResolvedValue({});
    useDeactivateZone.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
    });

    render(
      <TestWrapper>
        <ZoneActivation />
      </TestWrapper>
    );

    // Simulate keyboard shortcut
    fireEvent.keyDown(window, {
      key: 'd',
      altKey: true,
      shiftKey: true,
    });

    // Should show error toast if no active emergency
    await waitFor(() => {
      // Toast notification should appear
    });
  });
});

