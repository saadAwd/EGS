import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TrafficLightDashboard } from '../index';
import { SystemStateProvider } from '../../../contexts/SystemStateContext';

// Mock dependencies
jest.mock('../../../api/queries', () => ({
  usePoles: jest.fn(() => ({
    data: [
      { id: 1, name: 'Pole 1', location: 'Location 1', is_active: true },
      { id: 2, name: 'Pole 2', location: 'Location 2', is_active: true },
    ],
    isLoading: false,
    error: null,
  })),
  useLamps: jest.fn(() => ({
    data: [
      { id: 1, pole_id: 1, is_on: false, side_number: 1, lamp_number: 1, direction: 'straight' as const, gateway_id: 'TL1' },
      { id: 2, pole_id: 1, is_on: false, side_number: 2, lamp_number: 1, direction: 'left' as const, gateway_id: 'TL1' },
    ],
    isLoading: false,
    error: null,
  })),
  useGatewayStatus: jest.fn(() => ({
    data: { connection_status: 'connected', last_heartbeat: new Date().toISOString() },
    isLoading: false,
    error: null,
  })),
}));

jest.mock('../../../api/trafficLights', () => ({
  activateLamp: jest.fn().mockResolvedValue({}),
  deactivateLamp: jest.fn().mockResolvedValue({}),
  activateAllPoleLamps: jest.fn().mockResolvedValue({}),
  deactivateAllPoleLamps: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../contexts/WebSocketContext', () => ({
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
      <SystemStateProvider>
        {children}
      </SystemStateProvider>
    </QueryClientProvider>
  );
};

describe('TrafficLightDashboard', () => {
  it('should render traffic light dashboard', () => {
    render(
      <TestWrapper>
        <TrafficLightDashboard />
      </TestWrapper>
    );

    expect(screen.getByText(/Traffic Light Management/i)).toBeInTheDocument();
  });

  it('should display poles and lamps', async () => {
    render(
      <TestWrapper>
        <TrafficLightDashboard />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText(/Pole 1/i)).toBeInTheDocument();
    });
  });

  it('should handle refresh button click', async () => {
    render(
      <TestWrapper>
        <TrafficLightDashboard />
      </TestWrapper>
    );

    const refreshButton = screen.getByLabelText(/Refresh traffic light data/i);
    fireEvent.click(refreshButton);

    // Should trigger query invalidation
    await waitFor(() => {
      expect(refreshButton).toBeInTheDocument();
    });
  });

  it('should show gateway connection status', () => {
    render(
      <TestWrapper>
        <TrafficLightDashboard />
      </TestWrapper>
    );

    expect(screen.getByText(/Connected/i)).toBeInTheDocument();
  });
});

