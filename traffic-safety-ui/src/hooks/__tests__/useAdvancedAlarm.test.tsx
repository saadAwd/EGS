import { renderHook, act, waitFor } from '@testing-library/react';
import { useAdvancedAlarm } from '../useAdvancedAlarm';

// Mock dependencies
jest.mock('../../utils/audioUnlock', () => ({
  unlockAudio: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/bufferAlarm', () => ({
  createBufferAlarm: jest.fn(() => ({
    isReady: jest.fn(() => true),
    start: jest.fn(),
    stop: jest.fn(),
    setGain: jest.fn(),
  })),
  preloadAlarmBuffer: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/crossTab', () => ({
  withAudioMaster: jest.fn((fn) => fn()),
  sendAlarm: jest.fn(),
  setupCrossTabListener: jest.fn(),
}));

jest.mock('../../utils/suppress', () => ({
  isSuppressed: jest.fn(() => false),
  suppressFor: jest.fn(),
}));

describe('useAdvancedAlarm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useAdvancedAlarm());
    
    expect(result.current.state.isActive).toBe(false);
    expect(result.current.state.isPlaying).toBe(false);
    expect(result.current.state.isReady).toBe(false);
    expect(result.current.state.volume).toBe(0.25);
    expect(result.current.state.suppressed).toBe(false);
  });

  it('should play alarm when play is called', async () => {
    const { result } = renderHook(() => useAdvancedAlarm());
    
    await act(async () => {
      await result.current.play();
    });

    expect(result.current.state.isPlaying).toBe(true);
    expect(result.current.state.isActive).toBe(true);
  });

  it('should stop alarm when stop is called', async () => {
    const { result } = renderHook(() => useAdvancedAlarm());
    
    await act(async () => {
      await result.current.play();
      await result.current.stop();
    });

    expect(result.current.state.isPlaying).toBe(false);
    expect(result.current.state.isActive).toBe(false);
  });

  it('should acknowledge and suppress alarm', async () => {
    const { result } = renderHook(() => useAdvancedAlarm());
    
    await act(async () => {
      await result.current.play();
      result.current.acknowledge(120000);
    });

    expect(result.current.state.suppressed).toBe(true);
    expect(result.current.state.isPlaying).toBe(false);
  });

  it('should reset suppression', () => {
    const { result } = renderHook(() => useAdvancedAlarm());
    
    act(() => {
      result.current.resetSuppression();
    });

    expect(result.current.state.suppressed).toBe(false);
  });

  it('should set volume', () => {
    const { result } = renderHook(() => useAdvancedAlarm());
    
    act(() => {
      result.current.setVolume(0.5);
    });

    expect(result.current.state.volume).toBe(0.5);
  });

  it('should not play if suppressed', async () => {
    const { isSuppressed } = require('../../utils/suppress');
    isSuppressed.mockReturnValue(true);

    const { result } = renderHook(() => useAdvancedAlarm());
    
    await act(async () => {
      await result.current.play();
    });

    expect(result.current.state.isPlaying).toBe(false);
  });
});

