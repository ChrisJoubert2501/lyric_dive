mod audio;
mod files;
mod playback;
mod recovery;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(Mutex::new(audio::Player::default()))
        .invoke_handler(tauri::generate_handler![
            playback::load_audio,
            playback::unload_audio,
            playback::play,
            playback::pause,
            playback::seek,
            playback::playback_status,
            files::read_project,
            files::read_text_file,
            files::write_text_file,
            recovery::write_recovery,
            recovery::read_recovery,
            recovery::delete_recovery,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
