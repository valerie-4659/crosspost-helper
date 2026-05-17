use chrono::{DateTime, Utc};
use image::imageops::FilterType;
use image::GenericImageView;
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
    perceptual_hash: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
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

        let image_metadata = read_image_metadata(entry.path());
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
            perceptual_hash: image_metadata.as_ref().and_then(|value| value.perceptual_hash.clone()),
            width: image_metadata.as_ref().map(|value| value.width),
            height: image_metadata.as_ref().map(|value| value.height),
        });
    }

    Ok(images)
}

#[tauri::command]
fn copy_images_to_folder(paths: Vec<String>, destination: String) -> Result<usize, String> {
    let destination = PathBuf::from(destination);
    if !destination.exists() || !destination.is_dir() {
        return Err("Destination folder does not exist".to_string());
    }

    let mut copied = 0;
    for path in paths {
        let source = PathBuf::from(path);
        if !source.exists() || !source.is_file() {
            continue;
        }

        let Some(filename) = source.file_name() else {
            continue;
        };

        let mut target = destination.join(filename);
        if target.exists() {
            target = unique_destination_path(&destination, filename);
        }

        fs::copy(source, target).map_err(|error| error.to_string())?;
        copied += 1;
    }

    Ok(copied)
}

fn unique_destination_path(destination: &Path, filename: &std::ffi::OsStr) -> PathBuf {
    let source_name = Path::new(filename);
    let stem = source_name
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let extension = source_name.extension().and_then(|value| value.to_str());

    for index in 1..10000 {
        let candidate_name = match extension {
            Some(extension) => format!("{stem}-{index}.{extension}"),
            None => format!("{stem}-{index}"),
        };
        let candidate = destination.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
    }

    destination.join(filename)
}

struct ImageMetadata {
    perceptual_hash: Option<String>,
    width: u32,
    height: u32,
}

fn read_image_metadata(path: &Path) -> Option<ImageMetadata> {
    let image = image::open(path).ok()?;
    let (width, height) = image.dimensions();
    let gray = image.resize_exact(8, 8, FilterType::Triangle).to_luma8();
    let average = gray.pixels().map(|pixel| u32::from(pixel[0])).sum::<u32>() / 64;
    let mut bits = 0_u64;
    for (index, pixel) in gray.pixels().enumerate() {
        if u32::from(pixel[0]) >= average {
            bits |= 1_u64 << index;
        }
    }

    Some(ImageMetadata {
        perceptual_hash: Some(format!("{bits:016x}")),
        width,
        height,
    })
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
        .invoke_handler(tauri::generate_handler![scan_local_folder, copy_images_to_folder])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
