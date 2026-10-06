export interface History<S> {
  past: S[];
  present: S;
  future: S[];
  /** The `mergeKey` of the last recorded action, while it can still merge. */
  mergeKey: string | null;
}

export type HistoryAction = { type: "undo" } | { type: "redo" };

export interface UndoableOptions<A> {
  /** Actions that start a new history, e.g. opening another document. */
  resets?: (action: A) => boolean;
  /**
   * Actions that are not undoable and are applied to every state in the
   * history instead, so undo and redo cannot bring back what they changed.
   */
  appliesToAll?: (action: A) => boolean;
  /**
   * Consecutive actions with the same non-null key are merged into one undo
   * step, e.g. the keystrokes of one text field.
   */
  mergeKey?: (action: A) => string | null;
  /** The maximum number of undo steps kept. */
  limit?: number;
}

export function createHistory<S>(present: S): History<S> {
  return { past: [], present, future: [], mergeKey: null };
}

export function canUndo(history: History<unknown>): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History<unknown>): boolean {
  return history.future.length > 0;
}

/**
 * Wraps a reducer so its states can be undone and redone. This relies on the
 * reducer never mutating state: every past state stays valid, and unchanged
 * parts are shared between states rather than copied.
 */
export function undoable<S, A extends { type: string }>(
  reducer: (state: S, action: A) => S,
  {
    resets = () => false,
    appliesToAll = () => false,
    mergeKey = () => null,
    limit = 200,
  }: UndoableOptions<A> = {},
) {
  return (history: History<S>, action: A | HistoryAction): History<S> => {
    if (isHistoryAction(action)) {
      return action.type === "undo" ? undo(history) : redo(history);
    }

    const present = reducer(history.present, action);
    if (resets(action)) return createHistory(present);
    if (appliesToAll(action)) {
      const apply = (state: S) => reducer(state, action);
      return {
        ...history,
        past: history.past.map(apply),
        present,
        future: history.future.map(apply),
      };
    }
    if (present === history.present) return history;

    const key = mergeKey(action);
    if (key !== null && key === history.mergeKey) {
      return { ...history, present, future: [] };
    }
    return {
      past: [...history.past, history.present].slice(-limit),
      present,
      future: [],
      mergeKey: key,
    };
  };
}

function undo<S>(history: History<S>): History<S> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    mergeKey: null,
  };
}

function redo<S>(history: History<S>): History<S> {
  const [next, ...future] = history.future;
  if (next === undefined) return history;
  return {
    past: [...history.past, history.present],
    present: next,
    future,
    mergeKey: null,
  };
}

function isHistoryAction(action: { type: string }): action is HistoryAction {
  return action.type === "undo" || action.type === "redo";
}
