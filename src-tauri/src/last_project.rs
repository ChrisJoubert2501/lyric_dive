use std::path::PathBuf;

use tauri::{AppHandle, Runtime};
use tauri_plugin_fs::FsExt;

use crate::files::{self, FileError};

const LAST_PROJECT_FILE: &str = "last-project.txt";

/// Remembers the open project so that the next start can reopen it, or
/// forgets it when `path` is `None`. Reopening grants access to the path
/// again, so only a path the user already chose may be remembered.
#[tauri::command]
pub fn remember_project<R: Runtime>(
    app: AppHandle<R>,
    path: Option<PathBuf>,
) -> Result<(), FileError> {
    let file = files::data_file(&app, LAST_PROJECT_FILE)?;
    let Some(path) = path else {
        files::remove_data_file(&file)?;
        return Ok(());
    };
    if !app.fs_scope().is_allowed(&path) {
        return Err(FileError::PathNotAllowed);
    }
    // The path arrived as a JSON string, so it is valid UTF-8.
    files::write_data_file(&file, path.to_string_lossy().as_bytes())?;
    Ok(())
}

/// Also grants access to the remembered project again, so that it can be read
/// with `read_project` and saved as before the restart.
#[tauri::command]
pub fn last_project<R: Runtime>(app: AppHandle<R>) -> Result<Option<PathBuf>, FileError> {
    let Some(contents) = files::read_data_file(&files::data_file(&app, LAST_PROJECT_FILE)?)? else {
        return Ok(None);
    };
    let path = PathBuf::from(contents);
    if !path.is_absolute() {
        return Ok(None);
    }
    files::allow_file(&app, path.clone())?;
    Ok(Some(path))
}
