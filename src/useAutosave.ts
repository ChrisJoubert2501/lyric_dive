import { useEffect, useEffectEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LyricProject } from "./lyrics/model";
import { serializeProject } from "./lyrics/projectFile";

const DELAY_MS = 1000;

export interface Recovery {
  projectPath: string | null;
  /** The project as serialised by `serializeProject`. */
  project: string;
}

interface AutosaveOptions {
  project: LyricProject;
  projectPath: string | null;
  dirty: boolean;
  /** Off until an existing recovery file has been offered to the user. */
  enabled: boolean;
  onError: (error: unknown) => void;
}

/**
 * Keeps unsaved changes in a recovery file rather than in the project file
 * (ADR 0008), so they survive a crash but only reach the project when the
 * user saves. Waiting for a pause in editing avoids a write per keystroke.
 */
export function useAutosave({
  project,
  projectPath,
  dirty,
  enabled,
  onError,
}: AutosaveOptions) {
  const reportError = useEffectEvent(onError);

  useEffect(() => {
    if (!enabled) return;
    if (!dirty) {
      invoke("delete_recovery").catch((error) => reportError(error));
      return;
    }
    const timer = setTimeout(() => {
      invoke("write_recovery", {
        projectPath,
        project: serializeProject(project),
      }).catch((error) => reportError(error));
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, dirty, project, projectPath]);
}
