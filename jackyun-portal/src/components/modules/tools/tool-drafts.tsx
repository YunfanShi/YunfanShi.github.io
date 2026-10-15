'use client';

import { createContext, useCallback, useContext, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

interface DraftContext {
  values: Record<string, unknown>;
  update: <T>(key: string, initial: T, action: SetStateAction<T>) => void;
}
const Context = createContext<DraftContext | null>(null);

/** Page-session drafts only. Unmount panels to stop effects; no storage or sync writers. */
export function ToolDraftProvider({ children }: { children: ReactNode }) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const update = useCallback(<T,>(key: string, initial: T, action: SetStateAction<T>) => {
    setValues(previous => {
      const current = Object.hasOwn(previous, key) ? previous[key] as T : initial;
      const next = typeof action === 'function' ? (action as (value: T) => T)(current) : action;
      return Object.is(current, next) ? previous : { ...previous, [key]: next };
    });
  }, []);
  return <Context.Provider value={{ values, update }}>{children}</Context.Provider>;
}

export function useToolDraft<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const context = useContext(Context);
  const initialValue = useRef(initial);
  const [local, setLocal] = useState(initial);
  const update = context?.update;
  const setDraft = useCallback<Dispatch<SetStateAction<T>>>(action => {
    if (update) update(key, initialValue.current, action);
    else setLocal(action);
  }, [key, update]);
  return [context && Object.hasOwn(context.values, key) ? context.values[key] as T : local, setDraft];
}
