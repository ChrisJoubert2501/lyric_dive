import { useReducer, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { PlayerControls } from "./audio/PlayerControls";
import { usePlayback } from "./audio/usePlayback";
import { LyricsEditor } from "./lyrics/LyricsEditor";
import { SongDetails } from "./lyrics/SongDetails";
import { createProject, type LyricProject } from "./lyrics/model";
import { projectReducer } from "./lyrics/project";
import {
  parseProject,
  serializeProject,
  suggestedFileName,
} from "./lyrics/projectFile";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import "./App.css";

const PROJECT_FILTERS = [{ name: "Lyric Dive project", extensions: ["json"] }];

interface ProjectFile {
  path: string | null;
  /** The project as last opened or saved, to detect unsaved changes. */
  saved: LyricProject;
}

function App() {
  const [initialProject] = useState(createProject);
  const [project, dispatch] = useReducer(projectReducer, initialProject);
  const [file, setFile] = useState<ProjectFile>({
    path: null,
    saved: initialProject,
  });
  // Changing the key remounts the lyrics editor, so a new or opened project
  // does not inherit the previous one's selection or half-finished edit.
  const [editorKey, setEditorKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { status, load, unload, play, pause, seek, refresh } = usePlayback();

  const dirty = project !== file.saved;

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadAudio(path: string): Promise<boolean> {
    setLoading(true);
    try {
      await load(path);
      setAudioError(null);
      return true;
    } catch (error) {
      setAudioError(String(error));
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function chooseAudioFile() {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Audio", extensions: ["mp3"] }],
    });
    if (path && (await loadAudio(path))) {
      dispatch({ type: "audioLinked", path });
    }
  }

  function togglePlayback() {
    if (!status) return;
    run(status.playing ? pause : play);
  }

  async function confirmDiscard(): Promise<boolean> {
    return (
      !dirty ||
      confirm("Your unsaved changes will be lost.", {
        title: "Discard unsaved changes?",
        kind: "warning",
        okLabel: "Discard",
      })
    );
  }

  async function startProject(next: LyricProject, path: string | null) {
    await unload();
    dispatch({ type: "projectReplaced", project: next });
    setFile({ path, saved: next });
    setEditorKey((key) => key + 1);
    setAudioError(null);
    if (next.audioPath) await loadAudio(next.audioPath);
  }

  async function newProject() {
    if (await confirmDiscard()) await startProject(createProject(), null);
  }

  async function openProject() {
    if (!(await confirmDiscard())) return;
    const path = await open({
      multiple: false,
      directory: false,
      filters: PROJECT_FILTERS,
    });
    if (!path) return;
    const next = parseProject(await invoke<string>("read_project", { path }));
    await startProject(next, path);
  }

  async function saveProject(saveAs: boolean) {
    const path =
      saveAs || !file.path
        ? await save({
            filters: PROJECT_FILTERS,
            defaultPath: file.path ?? suggestedFileName(project.metadata),
          })
        : file.path;
    if (!path) return;
    await invoke("write_project", {
      path,
      contents: serializeProject(project),
    });
    setFile({ path, saved: project });
  }

  useKeyboardShortcuts({
    " ": { run: togglePlayback },
    "Ctrl+n": { run: () => run(newProject) },
    "Ctrl+o": { run: () => run(openProject) },
    "Ctrl+s": { run: () => run(() => saveProject(false)) },
    "Ctrl+Shift+s": { run: () => run(() => saveProject(true)) },
  });

  return (
    <main className="app">
      <header className="toolbar">
        <h1>Lyric Dive</h1>
        <div className="actions">
          <button type="button" onClick={() => run(newProject)}>
            New project
          </button>
          <button type="button" onClick={() => run(openProject)}>
            Open project…
          </button>
          <button type="button" onClick={() => run(() => saveProject(false))}>
            Save
          </button>
          <button type="button" onClick={() => run(() => saveProject(true))}>
            Save as…
          </button>
        </div>
        <span className="project-name">
          {file.path ? fileName(file.path) : "Untitled"}
          {dirty && <span title="Unsaved changes"> •</span>}
        </span>
      </header>

      <div className="audio-file">
        <button
          type="button"
          onClick={() => run(chooseAudioFile)}
          disabled={loading}
        >
          {project.audioPath ? "Change MP3…" : "Open MP3…"}
        </button>
        {loading && <span>Decoding…</span>}
      </div>
      {audioError && (
        <p className="error">
          The MP3 could not be opened: {audioError}{" "}
          <button type="button" onClick={() => run(chooseAudioFile)}>
            Locate MP3…
          </button>
        </p>
      )}
      {project.audioPath && status && (
        <PlayerControls
          fileName={fileName(project.audioPath)}
          status={status}
          onTogglePlayback={togglePlayback}
          onSeek={(positionMs) => run(() => seek(positionMs))}
        />
      )}
      {error && <p className="error">{error}</p>}

      <SongDetails
        metadata={project.metadata}
        onChange={(field, value) =>
          dispatch({ type: "metadataChanged", field, value })
        }
      />
      <LyricsEditor
        key={editorKey}
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
