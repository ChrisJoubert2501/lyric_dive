import { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { usePlaybackPositionMs } from "./audio/usePlaybackPositionMs";
import { formatLrcTimestamp } from "./lyrics/lrc";
import "./App.css";

function App() {
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const positionMs = usePlaybackPositionMs(audio);

  async function chooseAudioFile() {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Audio", extensions: ["mp3"] }],
    });
    if (path) {
      setPlaybackError(null);
      setAudioPath(path);
    }
  }

  return (
    <main className="app">
      <header className="toolbar">
        <h1>Lyric Dive</h1>
        <button type="button" onClick={chooseAudioFile}>
          Open MP3…
        </button>
      </header>

      {audioPath && (
        <section className="player">
          <p className="file-name">{fileName(audioPath)}</p>
          <audio
            ref={setAudio}
            src={convertFileSrc(audioPath)}
            controls
            onError={(event) =>
              setPlaybackError(
                event.currentTarget.error?.message ||
                  "Unable to play this file.",
              )
            }
          />
          <p className="position">{formatLrcTimestamp(positionMs)}</p>
          {playbackError && <p className="error">{playbackError}</p>}
        </section>
      )}
    </main>
  );
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default App;
