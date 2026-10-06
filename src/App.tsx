import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { usePlayback } from "./audio/usePlayback";
import { formatLrcTimestamp } from "./lyrics/lrc";
import "./App.css";

function App() {
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status, load, play, pause, seek } = usePlayback();

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
      setAudioPath(path);
    });
    setLoading(false);
  }

  return (
    <main className="app">
      <header className="toolbar">
        <h1>Lyric Dive</h1>
        <button type="button" onClick={chooseAudioFile} disabled={loading}>
          Open MP3…
        </button>
        {loading && <span>Decoding…</span>}
      </header>

      {audioPath && status && (
        <section className="player">
          <p className="file-name">{fileName(audioPath)}</p>
          <div className="controls">
            <button
              type="button"
              onClick={() => run(status.playing ? pause : play)}
            >
              {status.playing ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              aria-label="Position"
              min={0}
              max={status.durationMs}
              value={status.positionMs}
              onChange={(event) => run(() => seek(Number(event.target.value)))}
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
      )}
      {error && <p className="error">{error}</p>}
    </main>
  );
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default App;
