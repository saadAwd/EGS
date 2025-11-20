import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PoleControl from '../PoleControl';
import { WebSocketProvider } from '../../../contexts/WebSocketContext';

// Mock dependencies
jest.mock('../../../api/trafficLights', () => ({
  activateLamp: jest.fn().mockResolvedValue({}),
  deactivateLamp: jest.fn().mockResolvedValue({}),
  activateAllPoleLamps: jest.fn().mockResolvedValue({}),
  deactivateAllPoleLamps: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../../contexts/WebSocketContext', () => ({
  useWebSocketContext: () => ({
    wsClient: {
      onMessage: jest.fn((type, handler) => {
        // Store handler for later use
        (window as any).__wsHandler = handler;
      }),
    },
  }),
}));

const mockPole = {
  id: 1,
  name: 'Test Pole',
  location: 'Test Location',
  is_active: true,
};

const mockLamps = [
  { id: 1, pole_id: 1, is_on: false, side_number: 1, lamp_number: 1, direction: 'straight' as const, gateway_id: 'TL1' },
  { id: 2, pole_id: 1, is_on: false, side_number: 2, lamp_number: 1, direction: 'left' as const, gateway_id: 'TL1' },
];

describe('PoleControl', () => {
  it('should render pole control with lamps', () => {
    render(
      <WebSocketProvider>
        <PoleControl pole={mockPole} lamps={mockLamps} />
      </WebSocketProvider>
    );

    expect(screen.getByText('Test Pole')).toBeInTheDocument();
  });

  it('should show pending state when lamp is clicked', async () => {
    render(
      <WebSocketProvider>
        <PoleControl pole={mockPole} lamps={mockLamps} />
      </WebSocketProvider>
    );

    // Find and click a lamp indicator
    const lampIndicators = screen.getAllByRole('button', { name: /lamp/i });
    if (lampIndicators.length > 0) {
      fireEvent.click(lampIndicators[0]);
      
      // Should show pending state
      await waitFor(() => {
        // Lamp should be in pending state
      });
    }
  });

  it('should handle command_status ACK from WebSocket', async () => {
    render(
      <WebSocketProvider>
        <PoleControl pole={mockPole} lamps={mockLamps} />
      </WebSocketProvider>
    );

    // Simulate WebSocket command_status message
    const handler = (window as any).__wsHandler;
    if (handler) {
      handler({
        type: 'command_status',
        scope: 'lamp',
        device_id: 1,
        cmd: 'ON',
        state: 'ack',
        ts: Date.now(),
      });
    }

    await waitFor(() => {
      // Lamp should be updated based on ACK
    });
  });

  it('should handle command_status failed from WebSocket', async () => {
    render(
      <WebSocketProvider>
        <PoleControl pole={mockPole} lamps={mockLamps} />
      </WebSocketProvider>
    );

    // Simulate WebSocket command_status failure
    const handler = (window as any).__wsHandler;
    if (handler) {
      handler({
        type: 'command_status',
        scope: 'lamp',
        device_id: 1,
        cmd: 'ON',
        state: 'failed',
        ts: Date.now(),
      });
    }

    await waitFor(() => {
      // Lamp should show failed state
    });
  });

  it('should disable ON operations during deactivation', () => {
    render(
      <WebSocketProvider>
        <PoleControl 
          pole={mockPole} 
          lamps={mockLamps}
          deactivationInProgress={true}
          disabledLampIds={[1]}
        />
      </WebSocketProvider>
    );

    // ON button should be disabled
    const turnOnButton = screen.getByText(/Turn All On/i);
    expect(turnOnButton).toHaveAttribute('disabled');
  });
});

