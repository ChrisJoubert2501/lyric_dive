mod decode;
mod player;

pub use decode::{DecodedAudio, decode_file};
pub use player::{PlaybackStatus, Player};

#[derive(Debug, thiserror::Error)]
pub enum AudioError {
    #[error("cannot read the file: {0}")]
    Io(#[from] std::io::Error),
    #[error("cannot decode the file: {0}")]
    Decode(#[from] symphonia::core::errors::Error),
    #[error("the file contains no playable audio")]
    NoAudio,
    #[error("this file was not chosen through the file dialog")]
    PathNotAllowed,
    #[error("no audio output device was found")]
    NoOutputDevice,
    #[error("the audio output device cannot play {sample_rate} Hz audio")]
    UnsupportedSampleRate { sample_rate: u32 },
    #[error("audio output failed: {0}")]
    Output(#[from] cpal::Error),
    #[error("background task failed: {0}")]
    Task(#[from] tauri::Error),
}

impl serde::Serialize for AudioError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
