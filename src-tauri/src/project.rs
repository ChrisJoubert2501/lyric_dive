use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime};
use tauri_plugin_fs::FsExt;

#[derive(Debug, thiserror::Error)]
pub enum ProjectError {
    #[error("this file was not chosen through the file dialog")]
    PathNotAllowed,
    #[error("{0}")]
    Io(#[from] io::Error),
    #[error("cannot grant access to the project's audio file: {0}")]
    Scope(#[from] tauri::Error),
}

impl serde::Serialize for ProjectError {
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
pub fn read_project<R: Runtime>(app: AppHandle<R>, path: PathBuf) -> Result<String, ProjectError> {
    let scope = app.fs_scope();
    if !scope.is_allowed(&path) {
        return Err(ProjectError::PathNotAllowed);
    }
    let contents = fs::read_to_string(&path)?;
    if let Some(audio_path) = audio_path(&contents) {
        // The scope compares existing files by their canonical path.
        scope.allow_file(fs::canonicalize(&audio_path).unwrap_or(audio_path))?;
    }
    Ok(contents)
}

#[tauri::command]
pub fn write_project<R: Runtime>(
    app: AppHandle<R>,
    path: PathBuf,
    contents: String,
) -> Result<(), ProjectError> {
    if !app.fs_scope().is_allowed(&path) {
        return Err(ProjectError::PathNotAllowed);
    }
    write_atomically(&path, contents.as_bytes())?;
    Ok(())
}

/// Invalid JSON is not an error here: the frontend reports it when it
/// validates the file.
fn audio_path(contents: &str) -> Option<PathBuf> {
    let project: serde_json::Value = serde_json::from_str(contents).ok()?;
    let path = Path::new(project.get("audioPath")?.as_str()?);
    path.is_absolute().then(|| path.to_path_buf())
}

/// Writes a temporary file next to the target and renames it into place, so a
/// crash or a full disk during a save leaves the previous version intact.
fn write_atomically(path: &Path, contents: &[u8]) -> io::Result<()> {
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
}
