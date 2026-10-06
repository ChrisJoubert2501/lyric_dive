import { useReducer, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { PlayerControls } from "./audio/PlayerControls";
import { usePlayback } from "./audio/usePlayback";
import { LineList } from "./lyrics/LineList";
import { LyricsInput } from "./lyrics/LyricsInput";
import {
  createProject,
  findActiveLine,
  linesFromText,
  type LineId,
  type LyricLine,
} from "./lyrics/model";
import { lineAfter, projectReducer } from "./lyrics/project";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import "./App.css";

function App() {
  const [project, dispatch] = useReducer(projectReducer, null, () =>
    createProject(),
  );
  const [selectedId, setSelectedId] = useState<LineId | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status, load, play, pause, seek, refresh } = usePlayback();

  const activeLine = status
    ? findActiveLine(project.lines, status.positionMs)
    : null;

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (error) {
      setError(String(error));
    }
  }

  async function chooseAudioFile() {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Audio", extensions: ["mp3"] }],
    });
    if (!path) return;

    setLoading(true);
    await run(async () => {
      await load(path);
      dispatch({ type: "audioLinked", path });
    });
    setLoading(false);
  }

  function applyLyrics(text: string) {
    const lines = linesFromText(text);
    dispatch({ type: "linesReplaced", lines });
    setSelectedId(lines[0]?.id ?? null);
  }

  function togglePlayback() {
    if (!status) return;
    run(status.playing ? pause : play);
  }

  function selectLine(line: LyricLine) {
    setSelectedId(line.id);
    const { startMs } = line;
    if (status && startMs !== null) run(() => seek(startMs));
  }

  function stampSelectedLine() {
    if (!status || !selectedId) return;
    const id = selectedId;
    run(async () => {
      const { positionMs } = await refresh();
      dispatch({ type: "lineStamped", id, startMs: positionMs });
      setSelectedId(lineAfter(project.lines, id));
    });
  }

  useKeyboardShortcuts({
    " ": togglePlayback,
    Enter: stampSelectedLine,
  });

  return (
    <main className="app">
      <header className="toolbar">
        <h1>Lyric Dive</h1>
        <button type="button" onClick={chooseAudioFile} disabled={loading}>
          Open MP3…
        </button>
        {loading && <span>Decoding…</span>}
      </header>

      {project.audioPath && status && (
        <PlayerControls
          fileName={fileName(project.audioPath)}
          status={status}
          onTogglePlayback={togglePlayback}
          onSeek={(positionMs) => run(() => seek(positionMs))}
        />
      )}
      {error && <p className="error">{error}</p>}

      <section className="lyrics">
        {project.lines.length === 0 ? (
          <LyricsInput onSubmit={applyLyrics} />
        ) : (
          <>
            <p className="hint">
              <kbd>Space</kbd> play/pause · <kbd>Enter</kbd> stamp the selected
              line and move to the next · click a line to select it and jump to
              its time
            </p>
            <LineList
              lines={project.lines}
              activeId={activeLine?.id ?? null}
              selectedId={selectedId}
              onSelect={selectLine}
            />
          </>
        )}
      </section>
    </main>
  );
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default App;
