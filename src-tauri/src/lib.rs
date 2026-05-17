use chrono::{DateTime, Utc};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri_plugin_sql::{Migration, MigrationKind};
use walkdir::WalkDir;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalImageFile {
    local_path: String,
    source_file_id: String,
    filename: String,
    folder_path: String,
    mime_type: String,
    file_size: Option<u64>,
    created_at: Option<String>,
    modified_at: Option<String>,
}

#[tauri::command]
fn scan_local_folder(root_path: String) -> Result<Vec<LocalImageFile>, String> {
    let root = PathBuf::from(root_path);
    if !root.exists() {
        return Err("Folder does not exist".to_string());
    }
    if !root.is_dir() {
        return Err("Selected path is not a folder".to_string());
    }

    let mut images = Vec::new();
    for entry in WalkDir::new(&root).follow_links(false).into_iter() {
        let entry = entry.map_err(|error| error.to_string())?;
        if !entry.file_type().is_file() || !is_supported_image(entry.path()) {
            continue;
        }

        let metadata = fs::metadata(entry.path()).ok();
        let local_path = entry.path().to_string_lossy().to_string();
        let filename = entry.file_name().to_string_lossy().to_string();
        let folder_path = entry
            .path()
            .parent()
            .unwrap_or(&root)
            .to_string_lossy()
            .to_string();

        images.push(LocalImageFile {
            source_file_id: local_path.clone(),
            local_path,
            filename,
            folder_path,
            mime_type: mime_type_for(entry.path()),
            file_size: metadata.as_ref().map(|value| value.len()),
            created_at: metadata
                .as_ref()
                .and_then(|value| value.created().ok())
                .map(|value| DateTime::<Utc>::from(value).to_rfc3339()),
            modified_at: metadata
                .as_ref()
                .and_then(|value| value.modified().ok())
                .map(|value| DateTime::<Utc>::from(value).to_rfc3339()),
        });
    }

    Ok(images)
}

fn is_supported_image(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "jpg" | "jpeg" | "png" | "webp" | "gif"))
        .unwrap_or(false)
}

fn mime_type_for(path: &Path) -> String {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        _ => "application/octet-stream",
    }
    .to_string()
}

pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create_initial_schema",
        sql: include_str!("../../src/database/migrations/001_initial.sql"),
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:crossposthelper.db", migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![scan_local_folder])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
