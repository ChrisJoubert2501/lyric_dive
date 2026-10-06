import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  createHistory,
  undoable,
  type History,
  type HistoryAction,
  type UndoableOptions,
} from "./history";

type CounterAction =
  | { type: "add"; amount: number }
  | { type: "type"; amount: number }
  | { type: "reset" }
  | { type: "double" };

function counter(state: number, action: CounterAction): number {
  switch (action.type) {
    case "add":
    case "type":
      return state + action.amount;
    case "reset":
      return 0;
    case "double":
      return state * 2;
  }
}

function run(
  actions: (CounterAction | HistoryAction)[],
  options: UndoableOptions<CounterAction> = {},
  start = 0,
): History<number> {
  const reducer = undoable(counter, options);
  return actions.reduce(reducer, createHistory(start));
}

const add = (amount: number): CounterAction => ({ type: "add", amount });
const undo: HistoryAction = { type: "undo" };
const redo: HistoryAction = { type: "redo" };

describe("undoable", () => {
  it("undoes and redoes steps in order", () => {
    expect(run([add(1), add(2)]).present).toBe(3);
    expect(run([add(1), add(2), undo]).present).toBe(1);
    expect(run([add(1), add(2), undo, undo]).present).toBe(0);
    expect(run([add(1), add(2), undo, undo, redo]).present).toBe(1);
  });

  it("ignores undo and redo when there is nothing to undo or redo", () => {
    const history = run([add(1)]);
    const reducer = undoable(counter);

    expect(reducer(history, redo)).toBe(history);
    expect(reducer(createHistory(0), undo)).toEqual(createHistory(0));
  });

  it("discards the redo steps when a new change is made", () => {
    const history = run([add(1), add(2), undo, add(5)]);

    expect(history.present).toBe(6);
    expect(canRedo(history)).toBe(false);
  });

  it("does not record actions that change nothing", () => {
    const history = run([add(1), add(0)]);

    expect(history.past).toEqual([0]);
  });

  it("merges consecutive actions with the same key into one step", () => {
    const options: UndoableOptions<CounterAction> = {
      mergeKey: (action) => (action.type === "type" ? "typing" : null),
    };
    const typing = { type: "type", amount: 1 } as const;

    const history = run([add(10), typing, typing, typing], options);
    expect(history.present).toBe(13);
    expect(run([add(10), typing, typing, typing, undo], options).present).toBe(
      10,
    );
  });

  it("starts a new step after an undo, even with the same key", () => {
    const options: UndoableOptions<CounterAction> = {
      mergeKey: (action) => (action.type === "type" ? "typing" : null),
    };
    const typing = { type: "type", amount: 1 } as const;

    const history = run([typing, typing, undo, typing, typing, undo], options);

    expect(history.present).toBe(0);
  });

  it("starts a new history on a resetting action", () => {
    const history = run([add(1), add(2), { type: "reset" }], {
      resets: (action) => action.type === "reset",
    });

    expect(history.present).toBe(0);
    expect(canUndo(history)).toBe(false);
  });

  it("applies non-undoable actions to every state in the history", () => {
    const history = run([add(1), add(2), undo, { type: "double" }], {
      appliesToAll: (action) => action.type === "double",
    });

    expect(history).toMatchObject({ past: [0], present: 2, future: [6] });
  });

  it("keeps at most `limit` undo steps", () => {
    const history = run([add(1), add(1), add(1), add(1)], { limit: 2 });

    expect(history.past).toEqual([2, 3]);
  });
});
