import { useEffect, useRef } from "react";
import { formatLrcTimestamp } from "./lrc";
import type { LineId, LyricLine } from "./model";

interface LineListProps {
  lines: LyricLine[];
  activeId: LineId | null;
  selectedId: LineId | null;
  onSelect: (line: LyricLine) => void;
}

export function LineList({
  lines,
  activeId,
  selectedId,
  onSelect,
}: LineListProps) {
  return (
    <ol className="lines">
      {lines.map((line) => (
        <LineRow
          key={line.id}
          line={line}
          active={line.id === activeId}
          selected={line.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </ol>
  );
}

interface LineRowProps {
  line: LyricLine;
  active: boolean;
  selected: boolean;
  onSelect: (line: LyricLine) => void;
}

function LineRow({ line, active, selected, onSelect }: LineRowProps) {
  const ref = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (active) {
      ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [active]);

  const className = ["line", active && "active", selected && "selected"]
    .filter(Boolean)
    .join(" ");

  return (
    <li ref={ref} className={className}>
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        aria-pressed={selected}
        onClick={() => onSelect(line)}
      >
        <span className="timestamp">
          {line.startMs === null
            ? "--:--.--"
            : formatLrcTimestamp(line.startMs)}
        </span>
        <span className="text">{line.text}</span>
      </button>
    </li>
  );
}
