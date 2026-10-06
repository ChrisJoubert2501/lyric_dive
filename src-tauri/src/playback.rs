use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{AppHandle, Runtime, State};
use tauri_plugin_fs::FsExt;

use crate::audio::{AudioError, PlaybackStatus, Player, decode_file};

type PlayerState<'a> = State<'a, Mutex<Player>>;

/// Async so that decoding, which can take a second or more, does not block
/// the main thread that the window and the other commands run on.
#[tauri::command]
pub async fn load_audio<R: Runtime>(
    app: AppHandle<R>,
    player: PlayerState<'_>,
    path: PathBuf,
) -> Result<PlaybackStatus, AudioError> {
    // The dialog plugin adds each file the user picks to this scope, so the
    // frontend cannot use this command to read arbitrary files.
    if !app.fs_scope().is_allowed(&path) {
        return Err(AudioError::PathNotAllowed);
    }
    let audio = tauri::async_runtime::spawn_blocking(move || decode_file(&path)).await??;

    let mut player = player.lock().unwrap();
    player.load(audio)?;
    Ok(player.status())
}

#[tauri::command]
pub fn unload_audio(player: PlayerState<'_>) {
    player.lock().unwrap().unload();
}

#[tauri::command]
pub fn play(player: PlayerState<'_>) -> PlaybackStatus {
    let player = player.lock().unwrap();
    player.play();
    player.status()
}

#[tauri::command]
pub fn pause(player: PlayerState<'_>) -> PlaybackStatus {
    let player = player.lock().unwrap();
    player.pause();
    player.status()
}

#[tauri::command]
pub fn seek(player: PlayerState<'_>, position_ms: u64) -> PlaybackStatus {
    let player = player.lock().unwrap();
    player.seek(position_ms);
    player.status()
}

#[tauri::command]
pub fn playback_status(player: PlayerState<'_>) -> PlaybackStatus {
    player.lock().unwrap().status()
}
