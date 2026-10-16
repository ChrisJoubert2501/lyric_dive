import { useEffect, useEffectEvent, useReducer, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  getCurrentWindow,
  type CloseRequestedEvent,
} from "@tauri-apps/api/window";
import { confirm, message, open, save } from "@tauri-apps/plugin-dialog";
import { PlayerControls } from "./audio/PlayerControls";
import { usePlayback } from "./audio/usePlayback";
import { LyricsEditor } from "./lyrics/LyricsEditor";
import { SongDetails } from "./lyrics/SongDetails";
import {
  linesOmittedFromLrc,
  linesShortenedInLrc,
  parseLrc,
  serializeLrc,
} from "./lyrics/lrc";
import { createProject, type LyricProject } from "./lyrics/model";
import { projectHistoryReducer } from "./lyrics/project";
import {
  parseProject,
  serializeProject,
  suggestedFileName,
} from "./lyrics/projectFile";
import { canRedo, canUndo, createHistory } from "./history";
import { fileName, withExtension } from "./paths";
import { shortcutLabel, SKIP_MS } from "./shortcuts";
import { ShortcutHelp } from "./ShortcutHelp";
import { useAutosave, type Recovery } from "./useAutosave";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import "./App.css";

const PROJECT_FILTERS = [{ name: "Lyric Dive project", extensions: ["json"] }];
const LRC_FILTERS = [{ name: "LRC lyrics", extensions: ["lrc"] }];
const SAVE_LABEL = "Save";
const DISCARD_LABEL = "Don't save";

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
  const [started, setStarted] = useState(false);
  const [showingShortcuts, setShowingShortcuts] = useState(false);
  // React runs effects twice in development, which would otherwise start twice.
  const startRequested = useRef(false);
  const { status, load, unload, play, pause, seek, refresh } = usePlayback();

  const dirty = project !== file.saved;

  useAutosave({
    project,
    projectPath: file.path,
    dirty,
    enabled: started,
    onError: (error) => setError(`Autosave failed: ${String(error)}`),
  });

  useEffect(() => {
    if (!started) return;
    invoke("remember_project", { path: file.path }).catch((error) =>
      setError(`The open project could not be remembered: ${String(error)}`),
    );
  }, [started, file.path]);

  const onStart = useEffectEvent(() => {
    run(restoreSession).then(() => setStarted(true));
  });
  useEffect(() => {
    if (startRequested.current) return;
    startRequested.current = true;
    onStart();
  }, []);

  const onCloseRequested = useEffectEvent(
    async (event: CloseRequestedEvent) => {
      if (!dirty) return;
      // The window must be kept open before awaiting the user's answer;
      // it is then closed explicitly once the changes are dealt with.
      event.preventDefault();
      await run(async () => {
        if (!(await askToSaveChanges())) return;
        // Closing also unmounts autosave, so it cannot delete the recovery
        // file itself once the changes were saved or discarded.
        await invoke("delete_recovery");
        await getCurrentWindow().destroy();
      });
    },
  );
  useEffect(() => {
    const unlisten = getCurrentWindow().onCloseRequested((event) =>
      onCloseRequested(event),
    );
    return () => {
      unlisten.then((stop) => stop());
    };
  }, []);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setError(errorMessage(error));
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

  function skip(deltaMs: number) {
    if (!status) return;
    const positionMs = Math.min(
      Math.max(status.positionMs + deltaMs, 0),
      status.durationMs,
    );
    run(() => seek(positionMs));
  }

  /** Returns whether to go ahead, i.e. the changes were saved or discarded. */
  async function askToSaveChanges(): Promise<boolean> {
    if (!dirty) return true;
    const answer = await message(
      "Your changes will be lost if you don't save them.",
      {
        title: "Save changes?",
        kind: "warning",
        buttons: { yes: SAVE_LABEL, no: DISCARD_LABEL, cancel: "Cancel" },
      },
    );
    if (answer === SAVE_LABEL) return saveProject(false);
    return answer === DISCARD_LABEL;
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

  /** Restores unsaved changes after a crash, or else reopens the last project. */
  async function restoreSession() {
    if (!(await offerRecovery())) await reopenLastProject();
  }

  /** Returns whether the unsaved changes were restored. */
  async function offerRecovery(): Promise<boolean> {
    const recovery = await invoke<Recovery | null>("read_recovery");
    if (!recovery) return false;
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
      return true;
    }
    return false;
  }

  async function reopenLastProject() {
    const path = await invoke<string | null>("last_project");
    if (!path) return;
    let next: LyricProject;
    try {
      next = parseProject(await invoke<string>("read_project", { path }));
    } catch (error) {
      throw new Error(
        `${fileName(path)} could not be reopened: ${errorMessage(error)}`,
        { cause: error },
      );
    }
    await startProject(next, path);
  }

  async function newProject() {
    if (await askToSaveChanges()) await startProject(createProject(), null);
  }

  async function openProject() {
    if (!(await askToSaveChanges())) return;
    const path = await open({
      multiple: false,
      directory: false,
      filters: PROJECT_FILTERS,
    });
    if (!path) return;
    const next = parseProject(await invoke<string>("read_project", { path }));
    await startProject(next, path);
  }

  /** Returns false if the user cancelled choosing where to save. */
  async function saveProject(saveAs: boolean): Promise<boolean> {
    const path =
      saveAs || !file.path
        ? await save({
            filters: PROJECT_FILTERS,
            defaultPath:
              file.path ??
              suggestedFileName(project.metadata, ".lyricdive.json"),
          })
        : file.path;
    if (!path) return false;
    await invoke("write_text_file", {
      path,
      contents: serializeProject(project),
    });
    setFile({ path, saved: project });
    return true;
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
    const shortened = linesShortenedInLrc(project.lines).length;
    const warnings = [
      omitted > 0 &&
        `${omitted} ${omitted === 1 ? "line has" : "lines have"} no timestamp or no text outside square brackets and will be left out.`,
      shortened > 0 &&
        `${shortened} ${shortened === 1 ? "line starts" : "lines start"} with text in square brackets, which players read as tags, so it will be removed.`,
    ].filter(Boolean);
    if (
      warnings.length > 0 &&
      !(await confirm(warnings.join("\n\n"), {
        title: "Export anyway?",
        kind: "warning",
        okLabel: "Export",
      }))
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
    togglePlayback,
    skipBack: () => skip(-SKIP_MS),
    skipForward: () => skip(SKIP_MS),
    undo,
    redo,
    newProject: () => run(newProject),
    openProject: () => run(openProject),
    saveProject: () => run(() => saveProject(false)),
    saveProjectAs: () => run(() => saveProject(true)),
    openAudio: () => {
      if (!loading) run(chooseAudioFile);
    },
    importLrc: () => run(importLrc),
    exportLrc: () => run(exportLrc),
    showShortcuts: () => setShowingShortcuts(true),
    leaveTextField: () => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
  });

  return (
    <main className="app">
      <header className="toolbar">
        <h1>Lyric Dive</h1>
        <div className="actions">
          <button
            type="button"
            onClick={() => run(newProject)}
            title={shortcutLabel("newProject")}
          >
            New project
          </button>
          <button
            type="button"
            onClick={() => run(openProject)}
            title={shortcutLabel("openProject")}
          >
            Open project…
          </button>
          <button
            type="button"
            onClick={() => run(() => saveProject(false))}
            title={shortcutLabel("saveProject")}
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => run(() => saveProject(true))}
            title={shortcutLabel("saveProjectAs")}
          >
            Save as…
          </button>
          <button
            type="button"
            onClick={() => run(importLrc)}
            title={shortcutLabel("importLrc")}
          >
            Import LRC…
          </button>
          <button
            type="button"
            onClick={() => run(exportLrc)}
            title={shortcutLabel("exportLrc")}
          >
            Export LRC…
          </button>
        </div>
        <div className="actions">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo(history)}
            title={shortcutLabel("undo")}
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo(history)}
            title={shortcutLabel("redo")}
          >
            Redo
          </button>
          <button
            type="button"
            onClick={() => setShowingShortcuts(true)}
            title={shortcutLabel("showShortcuts")}
          >
            Keyboard shortcuts
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
          title={shortcutLabel("openAudio")}
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
      {showingShortcuts && (
        <ShortcutHelp onClose={() => setShowingShortcuts(false)} />
      )}
    </main>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default App;
