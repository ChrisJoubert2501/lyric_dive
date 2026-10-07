use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use tauri_plugin_fs::FsExt;

use crate::files::{self, FileError};

const RECOVERY_FILE: &str = "recovery.json";

/// Unsaved changes, kept apart from the project file so that a crash cannot
/// lose them and an unwanted edit cannot overwrite the saved version.
#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recovery {
    /// The project file the changes belong to, if it was ever saved.
    project_path: Option<PathBuf>,
    /// The project as the frontend serialised it.
    project: String,
}

#[tauri::command]
pub fn write_recovery<R: Runtime>(
    app: AppHandle<R>,
    project_path: Option<PathBuf>,
    project: String,
) -> Result<(), FileError> {
    // Restoring grants access to the project path, so only a path the user
    // already chose may be recorded.
    if let Some(path) = &project_path
        && !app.fs_scope().is_allowed(path)
    {
        return Err(FileError::PathNotAllowed);
    }
    write(
        &files::data_file(&app, RECOVERY_FILE)?,
        &Recovery {
            project_path,
            project,
        },
    )
}

/// Also grants access to the project file and its audio again, so that the
/// restored project can be saved and played as before the crash.
#[tauri::command]
pub fn read_recovery<R: Runtime>(app: AppHandle<R>) -> Result<Option<Recovery>, FileError> {
    let Some(recovery) = read(&files::data_file(&app, RECOVERY_FILE)?)? else {
        return Ok(None);
    };
    if let Some(path) = &recovery.project_path {
        files::allow_file(&app, path.clone())?;
    }
    if let Some(audio_path) = files::audio_path(&recovery.project) {
        files::allow_file(&app, audio_path)?;
    }
    Ok(Some(recovery))
}

#[tauri::command]
pub fn delete_recovery<R: Runtime>(app: AppHandle<R>) -> Result<(), FileError> {
    files::remove_data_file(&files::data_file(&app, RECOVERY_FILE)?)?;
    Ok(())
}

fn write(path: &Path, recovery: &Recovery) -> Result<(), FileError> {
    files::write_data_file(path, &serde_json::to_vec_pretty(recovery)?)?;
    Ok(())
}

fn read(path: &Path) -> Result<Option<Recovery>, FileError> {
    match files::read_data_file(path)? {
        Some(contents) => Ok(Some(serde_json::from_str(&contents)?)),
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("lyric-dive-recovery-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn creates_the_folder_and_round_trips() {
        let dir = test_dir("round-trip");
        let path = dir.join("data").join("recovery.json");
        let recovery = Recovery {
            project_path: Some(PathBuf::from("/music/song.lyricdive.json")),
            project: r#"{"audioPath": "/music/song.mp3"}"#.to_owned(),
        };

        write(&path, &recovery).unwrap();

        assert_eq!(read(&path).unwrap(), Some(recovery));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn reads_nothing_when_there_is_no_recovery_file() {
        let dir = test_dir("missing");

        assert_eq!(read(&dir.join("recovery.json")).unwrap(), None);
    }

    #[test]
    fn reports_a_damaged_recovery_file() {
        let dir = test_dir("damaged");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("recovery.json");
        fs::write(&path, "not json").unwrap();

        assert!(matches!(read(&path), Err(FileError::Recovery(_))));
        fs::remove_dir_all(&dir).unwrap();
    }
}
