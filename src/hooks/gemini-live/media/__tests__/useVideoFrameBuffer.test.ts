import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVideoFrameBuffer } from '../useVideoFrameBuffer';

describe('useVideoFrameBuffer', () => {
  it('should start with zero frames', () => {
    const { result } = renderHook(() => useVideoFrameBuffer({ maxFrames: 5 }));
    expect(result.current.frameCount()).toBe(0);
    expect(result.current.getRecentFrames()).toEqual([]);
  });

  it('should store frames via addFrame', () => {
    const { result } = renderHook(() => useVideoFrameBuffer({ maxFrames: 5 }));

    act(() => {
      result.current.addFrame('frame1');
      result.current.addFrame('frame2');
      result.current.addFrame('frame3');
    });

    expect(result.current.frameCount()).toBe(3);
    expect(result.current.getRecentFrames(3)).toEqual(['frame1', 'frame2', 'frame3']);
  });

  it('should return only the most recent N frames', () => {
    const { result } = renderHook(() => useVideoFrameBuffer({ maxFrames: 10 }));

    act(() => {
      result.current.addFrame('a');
      result.current.addFrame('b');
      result.current.addFrame('c');
      result.current.addFrame('d');
    });

    expect(result.current.getRecentFrames(2)).toEqual(['c', 'd']);
  });

  it('should handle ring buffer overflow correctly', () => {
    const { result } = renderHook(() => useVideoFrameBuffer({ maxFrames: 3 }));

    act(() => {
      result.current.addFrame('a');
      result.current.addFrame('b');
      result.current.addFrame('c');
      // Buffer is now full: [a, b, c]
      result.current.addFrame('d');
      // Buffer should be: [d, b, c] with writeIndex=1 → most recent are b, c, d
    });

    expect(result.current.frameCount()).toBe(3);
    // getRecentFrames(3) should return the 3 most recent: b, c, d
    expect(result.current.getRecentFrames(3)).toEqual(['b', 'c', 'd']);
  });

  it('should handle multiple overflow cycles', () => {
    const { result } = renderHook(() => useVideoFrameBuffer({ maxFrames: 2 }));

    act(() => {
      result.current.addFrame('a');
      result.current.addFrame('b');
      result.current.addFrame('c');
      result.current.addFrame('d');
      result.current.addFrame('e');
    });

    expect(result.current.frameCount()).toBe(2);
    expect(result.current.getRecentFrames(2)).toEqual(['d', 'e']);
  });

  it('should reset on clear', () => {
    const { result } = renderHook(() => useVideoFrameBuffer({ maxFrames: 5 }));

    act(() => {
      result.current.addFrame('a');
      result.current.addFrame('b');
    });

    expect(result.current.frameCount()).toBe(2);

    act(() => {
      result.current.clear();
    });

    expect(result.current.frameCount()).toBe(0);
    expect(result.current.getRecentFrames()).toEqual([]);
  });

  it('should use default maxFrames of 10', () => {
    const { result } = renderHook(() => useVideoFrameBuffer());

    act(() => {
      for (let i = 0; i < 15; i++) {
        result.current.addFrame(`frame${i}`);
      }
    });

    expect(result.current.frameCount()).toBe(10);
    const frames = result.current.getRecentFrames(10);
    expect(frames).toEqual([
      'frame5', 'frame6', 'frame7', 'frame8', 'frame9',
      'frame10', 'frame11', 'frame12', 'frame13', 'frame14',
    ]);
  });

  it('should return fewer frames when requesting more than available', () => {
    const { result } = renderHook(() => useVideoFrameBuffer({ maxFrames: 10 }));

    act(() => {
      result.current.addFrame('only');
    });

    expect(result.current.getRecentFrames(5)).toEqual(['only']);
  });
});
