use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_fs::FsExt;

#[derive(Debug, thiserror::Error)]
pub enum FileError {
    #[error("this file was not chosen through the file dialog")]
    PathNotAllowed,
    #[error("{0}")]
    Io(#[from] io::Error),
    #[error("cannot grant access to the project's files: {0}")]
    Scope(#[from] tauri::Error),
    #[error("cannot find the app's data folder: {0}")]
    AppData(tauri::Error),
    #[error("the recovery file is damaged: {0}")]
    Recovery(#[from] serde_json::Error),
}

impl serde::Serialize for FileError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// Returns the file's contents unvalidated; the frontend owns the project
/// model and validates it.
///
/// Also grants access to the project's audio file, so that `load_audio`
/// accepts it without the user having to pick it again. Only a project file
/// the user chose can grant this, so the frontend still cannot reach
/// arbitrary files on its own.
#[tauri::command]
pub fn read_project<R: Runtime>(app: AppHandle<R>, path: PathBuf) -> Result<String, FileError> {
    let contents = read_text_file(app.clone(), path)?;
    if let Some(audio_path) = audio_path(&contents) {
        allow_file(&app, audio_path)?;
    }
    Ok(contents)
}

pub(crate) fn allow_file<R: Runtime>(app: &AppHandle<R>, path: PathBuf) -> Result<(), FileError> {
    // The scope compares existing files by their canonical path.
    app.fs_scope()
        .allow_file(fs::canonicalize(&path).unwrap_or(path))?;
    Ok(())
}

#[tauri::command]
pub fn read_text_file<R: Runtime>(app: AppHandle<R>, path: PathBuf) -> Result<String, FileError> {
    if !app.fs_scope().is_allowed(&path) {
        return Err(FileError::PathNotAllowed);
    }
    Ok(fs::read_to_string(&path)?)
}

#[tauri::command]
pub fn write_text_file<R: Runtime>(
    app: AppHandle<R>,
    path: PathBuf,
    contents: String,
) -> Result<(), FileError> {
    if !app.fs_scope().is_allowed(&path) {
        return Err(FileError::PathNotAllowed);
    }
    write_atomically(&path, contents.as_bytes())?;
    Ok(())
}

/// A file in the app's local data folder, which belongs to this machine
/// ([ADR 0008](../../docs/decisions/0008-autosave-to-a-recovery-file.md)).
pub(crate) fn data_file<R: Runtime>(app: &AppHandle<R>, name: &str) -> Result<PathBuf, FileError> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(FileError::AppData)?;
    Ok(dir.join(name))
}

/// Creates the data folder on first use.
pub(crate) fn write_data_file(path: &Path, contents: &[u8]) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    write_atomically(path, contents)
}

pub(crate) fn read_data_file(path: &Path) -> io::Result<Option<String>> {
    match fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

pub(crate) fn remove_data_file(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

/// Invalid JSON is not an error here: the frontend reports it when it
/// validates the file.
pub(crate) fn audio_path(contents: &str) -> Option<PathBuf> {
    let project: serde_json::Value = serde_json::from_str(contents).ok()?;
    let path = Path::new(project.get("audioPath")?.as_str()?);
    path.is_absolute().then(|| path.to_path_buf())
}

/// Writes a temporary file next to the target and renames it into place, so a
/// crash or a full disk during a save leaves the previous version intact.
pub(crate) fn write_atomically(path: &Path, contents: &[u8]) -> io::Result<()> {
    let mut temp_name = path
        .file_name()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "not a file path"))?
        .to_owned();
    temp_name.push(".tmp");
    let temp = path.with_file_name(temp_name);

    let result = File::create(&temp)
        .and_then(|mut file| {
            file.write_all(contents)?;
            file.sync_all()
        })
        .and_then(|()| fs::rename(&temp, path));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_an_absolute_audio_path() {
        let path = audio_path(r#"{"audioPath": "/music/song.mp3"}"#);
        assert_eq!(path, Some(PathBuf::from("/music/song.mp3")));
    }

    #[test]
    fn ignores_relative_missing_or_invalid_audio_paths() {
        assert_eq!(audio_path(r#"{"audioPath": "../song.mp3"}"#), None);
        assert_eq!(audio_path(r#"{"audioPath": null}"#), None);
        assert_eq!(audio_path(r#"{}"#), None);
        assert_eq!(audio_path("not json"), None);
    }

    #[test]
    fn replaces_the_file_and_leaves_no_temporary_file() {
        let dir = std::env::temp_dir().join(format!("lyric-dive-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("song.lyricdive.json");

        write_atomically(&path, b"first").unwrap();
        write_atomically(&path, b"second").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "second");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn treats_a_missing_data_file_as_absent() {
        let path = std::env::temp_dir()
            .join(format!("lyric-dive-missing-{}", std::process::id()))
            .join("last-project.txt");

        assert_eq!(read_data_file(&path).unwrap(), None);
        remove_data_file(&path).unwrap();
    }
}
