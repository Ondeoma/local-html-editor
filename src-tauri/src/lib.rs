mod workspace;

use percent_encoding::percent_decode_str;
use std::fs;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::http::{header, Response, StatusCode};
use tauri::{ipc::InvokeBody, ipc::Request, AppHandle, Manager, State};
use workspace::Entry;

/// 開いているワークスペース
#[derive(Default)]
struct Ws(Mutex<Option<PathBuf>>);

/// 参照されなくなって消した画像など(元に戻す操作で再び参照されたら書き戻す)
#[derive(Default)]
struct Trash(Mutex<HashMap<PathBuf, Vec<u8>>>);

impl Ws {
    fn root(&self) -> Result<PathBuf, String> {
        self.0.lock().unwrap().clone().ok_or_else(|| "ワークスペースが開かれていません".into())
    }
}

const RECENT_MAX: usize = 10;

fn recent_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("recent.json"))
}

fn load_recent(app: &AppHandle) -> Vec<String> {
    recent_file(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str::<Vec<String>>(&s).ok())
        .unwrap_or_default()
}

/// 最近開いたワークスペース(存在するものだけ、新しい順)
#[tauri::command]
fn recent_list(app: AppHandle) -> Vec<String> {
    load_recent(&app).into_iter().filter(|p| PathBuf::from(p).is_dir()).collect()
}

#[tauri::command]
fn recent_remove(app: AppHandle, path: String) -> Result<(), String> {
    let list: Vec<String> = load_recent(&app).into_iter().filter(|p| *p != path).collect();
    fs::write(recent_file(&app)?, serde_json::to_string(&list).unwrap()).map_err(|e| e.to_string())
}

/// ワークスペースを開きます(最近開いた一覧に加え、lhe.js を置く). 正規化したパスを返します.
#[tauri::command]
fn open_workspace(app: AppHandle, ws: State<Ws>, path: String) -> Result<String, String> {
    let root = fs::canonicalize(&path).map_err(|e| format!("{path}: {e}"))?;
    if !root.is_dir() {
        return Err(format!("ディレクトリではありません: {path}"));
    }
    workspace::ensure_runtime(&root)?;
    let s = root.to_string_lossy().to_string();
    let mut list = load_recent(&app);
    list.retain(|p| *p != s);
    list.insert(0, s.clone());
    list.truncate(RECENT_MAX);
    fs::write(recent_file(&app)?, serde_json::to_string(&list).unwrap()).map_err(|e| e.to_string())?;
    *ws.0.lock().unwrap() = Some(root);
    Ok(s)
}

#[tauri::command]
fn list_tree(ws: State<Ws>) -> Result<Vec<Entry>, String> {
    Ok(workspace::tree(&ws.root()?))
}

#[tauri::command]
fn create_dir(ws: State<Ws>, path: String) -> Result<(), String> {
    let p = workspace::resolve(&ws.root()?, &path)?;
    if p.exists() {
        return Err(format!("既に存在します: {path}"));
    }
    fs::create_dir_all(p).map_err(|e| e.to_string())
}

/// 空のHTMLを作ります. 拡張子がなければ .html を付けます. 作ったパスを返します.
#[tauri::command]
fn create_html(ws: State<Ws>, path: String) -> Result<String, String> {
    let root = ws.root()?;
    let lower = path.to_ascii_lowercase();
    let path = if lower.ends_with(".html") || lower.ends_with(".htm") { path } else { format!("{path}.html") };
    let p = workspace::resolve(&root, &path)?;
    if p.exists() {
        return Err(format!("既に存在します: {path}"));
    }
    if let Some(d) = p.parent() {
        fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    let title = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let body = if title == workspace::LAYOUT_STEM { "<!--lhe:slot-->" } else { "<p></p>" };
    fs::write(&p, workspace::compose(&root, &path, &title, body)).map_err(|e| e.to_string())?;
    workspace::after_html_created(&root, &path)?;
    Ok(path)
}

/// テキストファイルを読みます(存在しなければ null)
#[tauri::command]
fn read_text(ws: State<Ws>, path: String) -> Result<Option<String>, String> {
    let p = workspace::resolve(&ws.root()?, &path)?;
    if !p.is_file() {
        return Ok(None);
    }
    fs::read_to_string(p).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text(ws: State<Ws>, path: String, content: String) -> Result<(), String> {
    workspace::write_text(&ws.root()?, &path, &content)
}

/// HTMLの本文を読みます
#[tauri::command]
fn load_html(ws: State<Ws>, path: String) -> Result<String, String> {
    let p = workspace::resolve(&ws.root()?, &path)?;
    let html = fs::read_to_string(p).map_err(|e| e.to_string())?;
    Ok(workspace::extract_content(&html))
}

/// 本文を受け取り、CSS・JSの参照を付けたHTMLとして保存します
#[tauri::command]
fn save_html(ws: State<Ws>, trash: State<Trash>, path: String, title: String, content: String) -> Result<(), String> {
    let root = ws.root()?;
    let p = workspace::resolve(&root, &path)?;
    let html = workspace::compose(&root, &path, &title, &content);
    if fs::read_to_string(&p).ok().as_deref() != Some(html.as_str()) {
        fs::write(p, html).map_err(|e| e.to_string())?;
    }
    workspace::sync_assets(&root, &path, &content, &mut trash.0.lock().unwrap())
}

/// 複製するときの既定の名前
#[tauri::command]
fn copy_name(ws: State<Ws>, path: String) -> Result<String, String> {
    workspace::copy_name(&ws.root()?, &path)
}

/// HTMLを複製します(画像など・個別のCSS・JSも). 作ったパスを返します.
#[tauri::command]
fn duplicate_html(ws: State<Ws>, path: String, name: String) -> Result<String, String> {
    let root = ws.root()?;
    let lower = name.to_ascii_lowercase();
    let name = if lower.ends_with(".html") || lower.ends_with(".htm") { name } else { format!("{name}.html") };
    if name.contains('/') || name.contains('\\') {
        return Err("名前に / は使えません".into());
    }
    let new_rel = match path.rsplit_once('/') {
        Some((d, _)) => format!("{d}/{name}"),
        None => name,
    };
    workspace::duplicate_html(&root, &path, &new_rel)?;
    workspace::after_html_created(&root, &new_rel)?;
    Ok(new_rel)
}

/// ファイル・ディレクトリを Finder(Windows はエクスプローラー)で選択した状態で表示します
#[tauri::command]
fn reveal(ws: State<Ws>, path: String) -> Result<(), String> {
    let p = workspace::resolve(&ws.root()?, &path)?;
    if !p.exists() {
        return Err(format!("見つかりません: {path}"));
    }
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg("-R").arg(&p).spawn();
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("explorer").arg(format!("/select,{}", p.display())).spawn();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let r = std::process::Command::new("xdg-open").arg(p.parent().unwrap_or(&p)).spawn();
    r.map(|_| ()).map_err(|e| e.to_string())
}

/// ファイルの中身(本文はバイト列のまま)を `<HTML名>_IMG` に保存します.
/// ヘッダー `x-html-path`・`x-file-name` (パーセントエンコード)で保存先を受け取ります.
#[tauri::command]
fn save_asset(ws: State<Ws>, request: Request) -> Result<String, String> {
    let header = |k: &str| -> Result<String, String> {
        let v = request.headers().get(k).ok_or(format!("{k} がありません"))?;
        Ok(percent_decode_str(v.to_str().map_err(|e| e.to_string())?).decode_utf8_lossy().to_string())
    };
    let InvokeBody::Raw(data) = request.body() else { return Err("本文がバイト列ではありません".into()) };
    workspace::save_asset(&ws.root()?, &header("x-html-path")?, &header("x-file-name")?, data)
}

/// `lhe://localhost/<ワークスペースからの相対パス>` でワークスペースのファイルを返します(プレビュー・エディタの画像表示用).
/// 動画のシークのため Range に対応します.
fn serve(app: &AppHandle, req: &tauri::http::Request<Vec<u8>>) -> Response<Vec<u8>> {
    let err = |code: StatusCode, msg: &str| Response::builder().status(code).body(msg.as_bytes().to_vec()).unwrap();
    let Ok(root) = app.state::<Ws>().root() else { return err(StatusCode::NOT_FOUND, "no workspace") };
    let rel = percent_decode_str(req.uri().path()).decode_utf8_lossy().to_string();
    let Ok(path) = workspace::resolve(&root, &rel) else { return err(StatusCode::FORBIDDEN, "forbidden") };
    let Ok(data) = fs::read(&path) else { return err(StatusCode::NOT_FOUND, "not found") };
    let builder = Response::builder()
        .header(header::CONTENT_TYPE, workspace::mime_of(&path))
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::ACCEPT_RANGES, "bytes");
    let range = req.headers().get(header::RANGE).and_then(|v| v.to_str().ok()).and_then(|v| v.strip_prefix("bytes="));
    if let Some((s, e)) = range.and_then(|r| r.split_once('-')) {
        let len = data.len();
        let start: usize = s.parse().unwrap_or(0);
        let end: usize = e.parse().unwrap_or(len.saturating_sub(1)).min(len.saturating_sub(1));
        if start <= end && end < len {
            return builder
                .status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_RANGE, format!("bytes {start}-{end}/{len}"))
                .body(data[start..=end].to_vec())
                .unwrap();
        }
    }
    // アプリの中で表示するHTMLでは、ブラウザ標準の右クリックメニュー(「Open Frame in New Window」など)を出さない
    let data = if workspace::mime_of(&path).starts_with("text/html") { inject_no_menu(data) } else { data };
    builder.status(StatusCode::OK).body(data).unwrap()
}

const NO_MENU_SCRIPT: &str = "<script>document.addEventListener('contextmenu',function(e){if(!e.defaultPrevented)e.preventDefault()})</script>";

fn inject_no_menu(data: Vec<u8>) -> Vec<u8> {
    let s = String::from_utf8_lossy(&data);
    match s.rfind("</body>") {
        Some(i) => format!("{}{NO_MENU_SCRIPT}{}", &s[..i], &s[i..]).into_bytes(),
        None => format!("{s}{NO_MENU_SCRIPT}").into_bytes(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Ws::default())
        .manage(Trash::default())
        .register_uri_scheme_protocol("lhe", |ctx, req| serve(ctx.app_handle(), &req))
        .invoke_handler(tauri::generate_handler![
            recent_list,
            recent_remove,
            open_workspace,
            list_tree,
            create_dir,
            create_html,
            read_text,
            write_text,
            load_html,
            save_html,
            save_asset,
            reveal,
            copy_name,
            duplicate_html
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
