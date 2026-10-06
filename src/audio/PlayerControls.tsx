import { formatLrcTimestamp } from "../lyrics/lrc";
import type { PlaybackStatus } from "./usePlayback";

interface PlayerControlsProps {
  fileName: string;
  status: PlaybackStatus;
  onTogglePlayback: () => void;
  onSeek: (positionMs: number) => void;
}

export function PlayerControls({
  fileName,
  status,
  onTogglePlayback,
  onSeek,
}: PlayerControlsProps) {
  return (
    <section className="player">
      <p className="file-name">{fileName}</p>
      <div className="controls">
        <button type="button" onClick={onTogglePlayback}>
          {status.playing ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          aria-label="Position"
          min={0}
          max={status.durationMs}
          value={status.positionMs}
          onChange={(event) => onSeek(Number(event.target.value))}
        />
      </div>
      <p className="position">
        {formatLrcTimestamp(status.positionMs)}
        <span className="duration">
          {" / "}
          {formatLrcTimestamp(status.durationMs)}
        </span>
      </p>
    </section>
  );
}
