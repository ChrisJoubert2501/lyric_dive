import { useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { confirm, open, save } from "@tauri-apps/plugin-dialog";
import { PlayerControls } from "./audio/PlayerControls";
import { usePlayback } from "./audio/usePlayback";
import { LyricsEditor } from "./lyrics/LyricsEditor";
import { SongDetails } from "./lyrics/SongDetails";
import { linesOmittedFromLrc, parseLrc, serializeLrc } from "./lyrics/lrc";
import { createProject, type LyricProject } from "./lyrics/model";
import { projectHistoryReducer } from "./lyrics/project";
import {
  parseProject,
  serializeProject,
  suggestedFileName,
} from "./lyrics/projectFile";
import { canRedo, canUndo, createHistory } from "./history";
import { fileName, withExtension } from "./paths";
import { useAutosave, type Recovery } from "./useAutosave";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import "./App.css";

const PROJECT_FILTERS = [{ name: "Lyric Dive project", extensions: ["json"] }];
const LRC_FILTERS = [{ name: "LRC lyrics", extensions: ["lrc"] }];

interface ProjectFile {
  path: string | null;
  /**
   * The project as last opened or saved, to detect unsaved changes. Null when
   * unknown, e.g. after restoring unsaved changes, so the project counts as
   * changed.
   */
  saved: LyricProject | null;
}

function App() {
  const [initialProject] = useState(createProject);
  const [history, dispatch] = useReducer(
    projectHistoryReducer,
    initialProject,
    createHistory,
  );
  const project = history.present;
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
  const [notice, setNotice] = useState<string | null>(null);
  const [recoveryOffered, setRecoveryOffered] = useState(false);
  // React runs effects twice in development, which would otherwise ask twice.
  const recoveryRequested = useRef(false);
  const { status, load, unload, play, pause, seek, refresh } = usePlayback();

  const dirty = project !== file.saved;

  useAutosave({
    project,
    projectPath: file.path,
    dirty,
    enabled: recoveryOffered,
    onError: (error) => setError(`Autosave failed: ${String(error)}`),
  });

  const offerRecoveryOnStart = useEffectEvent(() => {
    run(offerRecovery).then(() => setRecoveryOffered(true));
  });
  useEffect(() => {
    if (recoveryRequested.current) return;
    recoveryRequested.current = true;
    offerRecoveryOnStart();
  }, []);

  async function run(action: () => Promise<void>) {
    setError(null);
    setNotice(null);
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

  async function startProject(
    next: LyricProject,
    path: string | null,
    saved: LyricProject | null = next,
  ) {
    await unload();
    dispatch({ type: "projectReplaced", project: next });
    setFile({ path, saved });
    setEditorKey((key) => key + 1);
    setAudioError(null);
    if (next.audioPath) await loadAudio(next.audioPath);
  }

  async function offerRecovery() {
    const recovery = await invoke<Recovery | null>("read_recovery");
    if (!recovery) return;
    const name = recovery.projectPath
      ? fileName(recovery.projectPath)
      : "an untitled project";
    if (
      await confirm(
        `Lyric Dive closed before your changes to ${name} were saved.`,
        {
          title: "Restore unsaved changes?",
          kind: "warning",
          okLabel: "Restore",
          cancelLabel: "Discard",
        },
      )
    ) {
      await startProject(
        parseProject(recovery.project),
        recovery.projectPath,
        null,
      );
    }
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
            defaultPath:
              file.path ??
              suggestedFileName(project.metadata, ".lyricdive.json"),
          })
        : file.path;
    if (!path) return;
    await invoke("write_text_file", {
      path,
      contents: serializeProject(project),
    });
    setFile({ path, saved: project });
  }

  async function importLrc() {
    const path = await open({
      multiple: false,
      directory: false,
      filters: LRC_FILTERS,
    });
    if (!path) return;
    const { metadata, lines } = parseLrc(
      await invoke<string>("read_text_file", { path }),
    );
    if (lines.length === 0) {
      throw new Error("This file contains no timed lyrics.");
    }
    if (
      project.lines.length > 0 &&
      !(await confirm("The current lyrics and their timestamps will be lost.", {
        title: "Replace the lyrics?",
        kind: "warning",
        okLabel: "Replace",
      }))
    ) {
      return;
    }
    dispatch({ type: "lyricsImported", lines, metadata });
    setEditorKey((key) => key + 1);
  }

  async function exportLrc() {
    const omitted = linesOmittedFromLrc(project.lines).length;
    if (omitted === project.lines.length) {
      throw new Error("No line has both a timestamp and text yet.");
    }
    if (
      omitted > 0 &&
      !(await confirm(
        `${omitted} ${omitted === 1 ? "line has" : "lines have"} no timestamp or no text and will be left out.`,
        { title: "Export anyway?", kind: "warning", okLabel: "Export" },
      ))
    ) {
      return;
    }
    const path = await save({
      filters: LRC_FILTERS,
      // Players look for lyrics in a file named like the audio file, next to it.
      defaultPath: project.audioPath
        ? withExtension(project.audioPath, ".lrc")
        : suggestedFileName(project.metadata, ".lrc"),
    });
    if (!path) return;
    await invoke("write_text_file", { path, contents: serializeLrc(project) });
    setNotice(`Exported ${fileName(path)}.`);
  }

  const undo = () => dispatch({ type: "undo" });
  const redo = () => dispatch({ type: "redo" });

  useKeyboardShortcuts({
    " ": { run: togglePlayback },
    "Ctrl+z": { run: undo, repeat: true },
    "Ctrl+Shift+z": { run: redo, repeat: true },
    "Ctrl+y": { run: redo, repeat: true },
    "Ctrl+n": { run: () => run(newProject), inTextFields: true },
    "Ctrl+o": { run: () => run(openProject), inTextFields: true },
    "Ctrl+s": { run: () => run(() => saveProject(false)), inTextFields: true },
    "Ctrl+Shift+s": {
      run: () => run(() => saveProject(true)),
      inTextFields: true,
    },
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
          <button type="button" onClick={() => run(importLrc)}>
            Import LRC…
          </button>
          <button type="button" onClick={() => run(exportLrc)}>
            Export LRC…
          </button>
        </div>
        <div className="actions">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo(history)}
            title="Ctrl+Z"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo(history)}
            title="Ctrl+Shift+Z or Ctrl+Y"
          >
            Redo
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
      {notice && <p className="notice">{notice}</p>}

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

export default App;
