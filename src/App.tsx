import { useReducer, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { PlayerControls } from "./audio/PlayerControls";
import { usePlayback } from "./audio/usePlayback";
import { LyricsEditor } from "./lyrics/LyricsEditor";
import { createProject } from "./lyrics/model";
import { projectReducer } from "./lyrics/project";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import "./App.css";

function App() {
  const [project, dispatch] = useReducer(projectReducer, null, () =>
    createProject(),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status, load, play, pause, seek, refresh } = usePlayback();

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

  function togglePlayback() {
    if (!status) return;
    run(status.playing ? pause : play);
  }

  useKeyboardShortcuts({ " ": { run: togglePlayback } });

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

      <LyricsEditor
        lines={project.lines}
        dispatch={dispatch}
        status={status}
        seek={seek}
        refresh={refresh}
        run={run}
      />
    </main>
  );
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default App;
