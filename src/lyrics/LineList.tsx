import { useEffect, useEffectEvent, useRef, useState } from "react";
import { formatLrcTimestamp } from "./lrc";
import type { LineId, LyricLine } from "./model";

export type LineField = "text" | "time";

export interface LineEdit {
  id: LineId;
  field: LineField;
}

interface LineListProps {
  lines: LyricLine[];
  activeId: LineId | null;
  selectedId: LineId | null;
  editing: LineEdit | null;
  playing: boolean;
  /** Whether the list follows the active line while playing. */
  follow: boolean;
  onSelect: (line: LyricLine) => void;
  onEdit: (line: LyricLine, field: LineField) => void;
  /**
   * `text` is null when editing was cancelled. Returning false rejects the
   * text and keeps the editor open.
   */
  onFinishEditing: (
    line: LyricLine,
    field: LineField,
    text: string | null,
  ) => boolean;
}

export function LineList({
  lines,
  activeId,
  selectedId,
  editing,
  ...rowProps
}: LineListProps) {
  return (
    <ol className="lines">
      {lines.map((line) => (
        <LineRow
          key={line.id}
          line={line}
          active={line.id === activeId}
          selected={line.id === selectedId}
          editingField={line.id === editing?.id ? editing.field : null}
          {...rowProps}
        />
      ))}
    </ol>
  );
}

interface LineRowProps extends Omit<
  LineListProps,
  "lines" | "activeId" | "selectedId" | "editing"
> {
  line: LyricLine;
  active: boolean;
  selected: boolean;
  editingField: LineField | null;
}

function LineRow({
  line,
  active,
  selected,
  editingField,
  playing,
  follow,
  onSelect,
  onEdit,
  onFinishEditing,
}: LineRowProps) {
  const ref = useRef<HTMLLIElement>(null);
  const isPlaying = useEffectEvent(() => playing);
  const followsSong = useEffectEvent(() => playing && follow);

  // The list follows either the song or the selection, never both: following
  // both would start two competing scrolls whenever a stamp moves the active
  // and the selected line together. The selection is still kept visible when
  // not following the song, so the keyboard can move it and stamp lines.
  useEffect(() => {
    if (active && follow && isPlaying()) {
      ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [active, follow]);
  useEffect(() => {
    if (selected && !followsSong()) {
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selected]);

  const className = ["line", active && "active", selected && "selected"]
    .filter(Boolean)
    .join(" ");
  const timestamp =
    line.startMs === null ? "--:--.--" : formatLrcTimestamp(line.startMs);

  if (editingField) {
    const finish = (text: string | null) =>
      onFinishEditing(line, editingField, text);
    return (
      <li ref={ref} className={className}>
        <div className="line-content">
          {editingField === "time" ? (
            <InlineEdit
              className="time-editor"
              label="Line time"
              placeholder="mm:ss.xx"
              initialText={line.startMs === null ? "" : timestamp}
              onFinish={finish}
            />
          ) : (
            <span className="timestamp">{timestamp}</span>
          )}
          {editingField === "text" ? (
            <InlineEdit
              className="text-editor"
              label="Line text"
              initialText={line.text}
              onFinish={finish}
            />
          ) : (
            <span className="text">{line.text}</span>
          )}
        </div>
      </li>
    );
  }

  return (
    <li ref={ref} className={className}>
      <button
        type="button"
        className="line-content"
        aria-current={active ? "true" : undefined}
        aria-pressed={selected}
        onClick={() => onSelect(line)}
        onDoubleClick={() => onEdit(line, "text")}
      >
        <span
          className="timestamp"
          onDoubleClick={(event) => {
            event.stopPropagation();
            onEdit(line, "time");
          }}
        >
          {timestamp}
        </span>
        <span className="text">{line.text}</span>
      </button>
    </li>
  );
}

interface InlineEditProps {
  className: string;
  label: string;
  placeholder?: string;
  initialText: string;
  onFinish: (text: string | null) => boolean;
}

function InlineEdit({
  className,
  label,
  placeholder,
  initialText,
  onFinish,
}: InlineEditProps) {
  const [text, setText] = useState(initialText);
  const [invalid, setInvalid] = useState(false);
  // Enter and Escape remove the input, and some browsers fire blur on removal,
  // so without this guard an edit could finish twice.
  const finished = useRef(false);

  function finish(result: string | null): boolean {
    if (finished.current) return true;
    finished.current = onFinish(result);
    if (!finished.current) setInvalid(true);
    return finished.current;
  }

  return (
    <input
      className={className}
      aria-label={label}
      aria-invalid={invalid}
      placeholder={placeholder}
      autoFocus
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        setInvalid(false);
      }}
      onBlur={() => {
        // Focus has already gone elsewhere, so a rejected value cannot stay
        // open for correction and is discarded instead.
        if (!finish(text)) finish(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(text);
        if (event.key === "Escape") finish(null);
      }}
    />
  );
}
