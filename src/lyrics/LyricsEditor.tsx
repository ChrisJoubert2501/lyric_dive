import { useState, type Dispatch } from "react";
import { confirm } from "@tauri-apps/plugin-dialog";
import type { PlaybackStatus } from "../audio/usePlayback";
import { useKeyboardShortcuts } from "../useKeyboardShortcuts";
import { LineList, type LineEdit, type LineField } from "./LineList";
import { formatLrcTimestamp, parseLrcTimestamp } from "./lrc";
import { LyricsInput } from "./LyricsInput";
import {
  createLine,
  findActiveLine,
  linesFromText,
  type LineId,
  type LyricLine,
} from "./model";
import { lineAfter, type ProjectAction } from "./project";

const NUDGE_MS = 50;

interface LyricsEditorProps {
  lines: LyricLine[];
  dispatch: Dispatch<ProjectAction>;
  status: PlaybackStatus | null;
  seek: (positionMs: number) => Promise<void>;
  refresh: () => Promise<PlaybackStatus>;
  run: (action: () => Promise<void>) => void;
}

export function LyricsEditor({
  lines,
  dispatch,
  status,
  seek,
  refresh,
  run,
}: LyricsEditorProps) {
  const [selectedId, setSelectedId] = useState<LineId | null>(null);
  const [editing, setEditing] = useState<LineEdit | null>(null);
  const [replacing, setReplacing] = useState(false);

  const showInput = lines.length === 0 || replacing;
  const selectedIndex = lines.findIndex((line) => line.id === selectedId);
  const selected = lines[selectedIndex] ?? null;
  const activeLine = status ? findActiveLine(lines, status.positionMs) : null;

  function applyLyrics(text: string) {
    run(async () => {
      const losesTiming = lines.some((line) => line.startMs !== null);
      if (
        losesTiming &&
        !(await confirm("All timestamps will be removed.", {
          title: "Replace the lyrics?",
          kind: "warning",
          okLabel: "Replace",
        }))
      ) {
        return;
      }
      const next = linesFromText(text);
      dispatch({ type: "linesReplaced", lines: next });
      setSelectedId(next[0]?.id ?? null);
      setEditing(null);
      setReplacing(false);
    });
  }

  function selectLine(line: LyricLine) {
    setSelectedId(line.id);
    const { startMs } = line;
    if (status && startMs !== null) run(() => seek(startMs));
  }

  function moveSelection(offset: -1 | 1) {
    if (lines.length === 0) return;
    const index =
      selectedIndex === -1
        ? offset === 1
          ? 0
          : lines.length - 1
        : Math.min(Math.max(selectedIndex + offset, 0), lines.length - 1);
    setSelectedId(lines[index].id);
  }

  function stampSelectedLine() {
    if (!status || !selected) return;
    const { id } = selected;
    run(async () => {
      const { positionMs } = await refresh();
      dispatch({ type: "lineTimeSet", id, startMs: positionMs });
      setSelectedId(lineAfter(lines, id));
    });
  }

  function nudgeSelectedLine(deltaMs: number) {
    if (selected) dispatch({ type: "lineNudged", id: selected.id, deltaMs });
  }

  function clearSelectedTime() {
    if (selected) dispatch({ type: "lineTimeCleared", id: selected.id });
  }

  function insertLine() {
    const line = createLine("");
    const index = selected ? selectedIndex + 1 : lines.length;
    dispatch({ type: "lineInserted", line, index });
    setSelectedId(line.id);
    setEditing({ id: line.id, field: "text" });
  }

  function deleteLine(line: LyricLine) {
    const index = lines.indexOf(line);
    const neighbour = lines[index + 1] ?? lines[index - 1] ?? null;
    dispatch({ type: "lineDeleted", id: line.id });
    if (line.id === selectedId) setSelectedId(neighbour?.id ?? null);
  }

  function editLine(line: LyricLine, field: LineField) {
    setSelectedId(line.id);
    setEditing({ id: line.id, field });
  }

  function finishEditing(
    line: LyricLine,
    field: LineField,
    text: string | null,
  ): boolean {
    if (field === "time") {
      return finishTimeEdit(line, text);
    }
    setEditing(null);
    const trimmed = text?.trim() ?? "";
    if (trimmed) {
      dispatch({ type: "lineTextChanged", id: line.id, text: trimmed });
    } else if (line.text === "") {
      // A newly inserted line that never got any text.
      deleteLine(line);
    }
    return true;
  }

  function finishTimeEdit(line: LyricLine, text: string | null): boolean {
    const trimmed = text?.trim() ?? null;
    const shown = line.startMs === null ? "" : formatLrcTimestamp(line.startMs);
    // The editor shows hundredths, but stamps are stored to the millisecond,
    // so re-parsing unchanged text would silently round the time.
    if (trimmed === "" && shown !== "") {
      dispatch({ type: "lineTimeCleared", id: line.id });
    } else if (trimmed !== null && trimmed !== shown) {
      const startMs = parseLrcTimestamp(trimmed);
      if (startMs === null) return false;
      dispatch({ type: "lineTimeSet", id: line.id, startMs });
    }
    setEditing(null);
    return true;
  }

  useKeyboardShortcuts(
    showInput
      ? {}
      : {
          Enter: { run: stampSelectedLine },
          ArrowUp: { run: () => moveSelection(-1), repeat: true },
          ArrowDown: { run: () => moveSelection(1), repeat: true },
          ArrowLeft: { run: () => nudgeSelectedLine(-NUDGE_MS), repeat: true },
          ArrowRight: { run: () => nudgeSelectedLine(NUDGE_MS), repeat: true },
          Backspace: { run: clearSelectedTime },
        },
  );

  if (showInput) {
    return (
      <section className="lyrics">
        <LyricsInput
          initialText={lines.map((line) => line.text).join("\n")}
          onSubmit={applyLyrics}
          onCancel={lines.length > 0 ? () => setReplacing(false) : undefined}
        />
      </section>
    );
  }

  const timed = selected?.startMs != null;

  return (
    <section className="lyrics">
      <p className="hint">
        <kbd>Space</kbd> play/pause · <kbd>Enter</kbd> stamp and move on ·{" "}
        <kbd>↑</kbd>
        <kbd>↓</kbd> select · <kbd>←</kbd>
        <kbd>→</kbd> nudge {NUDGE_MS} ms · <kbd>Backspace</kbd> clear time ·
        double-click a time or text to edit it
      </p>
      <div className="line-actions" role="toolbar" aria-label="Selected line">
        <button
          type="button"
          disabled={!timed}
          onClick={() => nudgeSelectedLine(-NUDGE_MS)}
        >
          −{NUDGE_MS} ms
        </button>
        <button
          type="button"
          disabled={!timed}
          onClick={() => nudgeSelectedLine(NUDGE_MS)}
        >
          +{NUDGE_MS} ms
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && editLine(selected, "time")}
        >
          Edit time
        </button>
        <button type="button" disabled={!timed} onClick={clearSelectedTime}>
          Clear time
        </button>
        <span className="separator" />
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && editLine(selected, "text")}
        >
          Edit text
        </button>
        <button type="button" onClick={insertLine}>
          Insert below
        </button>
        <button
          type="button"
          disabled={selectedIndex <= 0}
          onClick={() =>
            selected &&
            dispatch({ type: "lineMoved", id: selected.id, offset: -1 })
          }
        >
          Move up
        </button>
        <button
          type="button"
          disabled={selectedIndex === -1 || selectedIndex === lines.length - 1}
          onClick={() =>
            selected &&
            dispatch({ type: "lineMoved", id: selected.id, offset: 1 })
          }
        >
          Move down
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && deleteLine(selected)}
        >
          Delete
        </button>
        <span className="separator" />
        <button type="button" onClick={() => setReplacing(true)}>
          Replace lyrics…
        </button>
      </div>
      <LineList
        lines={lines}
        activeId={activeLine?.id ?? null}
        selectedId={selectedId}
        editing={editing}
        playing={status?.playing ?? false}
        onSelect={selectLine}
        onEdit={editLine}
        onFinishEditing={finishEditing}
      />
    </section>
  );
}
