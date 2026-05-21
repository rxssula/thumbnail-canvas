"use client";

import { useState, useCallback } from "react";

export interface HistoryState<T> {
  present: T;
  past: T[];
  future: T[];
}

export function useHistory<T>(initial: T, limit = 50) {
  const [state, setState] = useState<HistoryState<T>>({
    present: initial,
    past: [],
    future: [],
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setState((prev) => ({
        ...prev,
        present:
          typeof next === "function"
            ? (next as (p: T) => T)(prev.present)
            : next,
      }));
    },
    []
  );

  const commit = useCallback(() => {
    setState((prev) => {
      const last = prev.past[prev.past.length - 1];
      if (last && JSON.stringify(last) === JSON.stringify(prev.present)) {
        return { ...prev, future: [] };
      }
      return {
        ...prev,
        past: [...prev.past, prev.present].slice(-limit),
        future: [],
      };
    });
  }, [limit]);

  const undo = useCallback(() => {
    setState((prev) => {
      if (prev.past.length === 0) return prev;
      const newPast = prev.past.slice(0, -1);
      const previous = prev.past[prev.past.length - 1];
      return {
        present: previous,
        past: newPast,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (prev.future.length === 0) return prev;
      const [next, ...newFuture] = prev.future;
      return {
        present: next,
        past: [...prev.past, prev.present],
        future: newFuture,
      };
    });
  }, []);

  return {
    present: state.present,
    set,
    commit,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
