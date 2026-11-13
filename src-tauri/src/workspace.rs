//! ワークスペース(編集対象のディレクトリ)内のファイル操作と、HTMLの組み立て.
//!
//! パスはすべてワークスペースからの相対パス(区切りは `/`)で受け渡しする.
//! `..` や絶対パスは受け付けず、ワークスペースの外には触れない.

use percent_encoding::percent_decode_str;
use regex::Regex;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

/// 全HTMLから参照される実行時スクリプト(目次・mermaid図の描画). フロントのエディタも同じファイルを読み込む.
pub const LHE_JS: &str = include_str!("../assets/lhe.js");
pub const LHE_JS_NAME: &str = "lhe.js";

/// Claude Code などが、このエディタの形式でHTMLを書くための説明書(ワークスペース直下に置く)
pub const FORMAT_MD: &str = include_str!("../assets/LHE_FORMAT.md");
pub const FORMAT_MD_NAME: &str = "LHE_FORMAT.md";
const CLAUDE_MD_NAME: &str = "CLAUDE.md";
const CLAUDE_MD_IMPORT: &str = "@LHE_FORMAT.md";

/// 同じディレクトリの他のHTMLを、自分の「コンテンツ枠」に埋め込んで表示する特別なHTML
pub const LAYOUT_STEM: &str = "layout";

/// レイアウトの適用中は本文を隠す(lhe.js が外す. 読み込めなかった場合も1秒後には表示する)
const LAYOUT_HIDE: &str = "<style id=\"lhe-layout-hide\">body{visibility:hidden;animation:lhe-show 0s 1s forwards}@keyframes lhe-show{to{visibility:visible}}</style>";

/// 本文の範囲を示すコメント(読み込み時にここから本文を取り出す)
const CONTENT_START: &str = "<!-- lhe:content -->";
const CONTENT_END: &str = "<!-- /lhe:content -->";

#[derive(Serialize, Clone, Debug)]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub dir: bool,
    pub children: Vec<Entry>,
}

/// 相対パスを検証して、ワークスペース内の絶対パスにします.
pub fn resolve(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.trim_matches('/');
    let p = Path::new(rel);
    if p.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("不正なパスです: {rel}"));
    }
    Ok(root.join(p))
}

/// 画像などを置くディレクトリ名(HTMLの拡張子を除いた名前 + `_IMG`)
pub fn asset_dir_name(stem: &str) -> String {
    format!("{stem}_IMG")
}

fn is_html(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n.ends_with(".html") || n.ends_with(".htm")
}

fn skip_dir(name: &str) -> bool {
    name.starts_with('.') || name.ends_with("_IMG") || name == "node_modules"
}

/// ディレクトリとHTMLファイルだけのツリー
pub fn tree(root: &Path) -> Vec<Entry> {
    fn walk(root: &Path, dir: &Path) -> Vec<Entry> {
        let Ok(rd) = fs::read_dir(dir) else { return vec![] };
        let mut v: Vec<Entry> = rd
            .flatten()
            .filter_map(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                let path = e.path();
                let rel = rel_of(root, &path);
                if path.is_dir() {
                    (!skip_dir(&name)).then(|| Entry { name, path: rel, dir: true, children: walk(root, &path) })
                } else if is_html(&name) {
                    Some(Entry { name, path: rel, dir: false, children: vec![] })
                } else {
                    None
                }
            })
            .collect();
        v.sort_by(|a, b| b.dir.cmp(&a.dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
        v
    }
    walk(root, root)
}

fn rel_of(root: &Path, p: &Path) -> String {
    p.strip_prefix(root)
        .unwrap_or(p)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("/")
}

/// `a/b/page.html` → (["a","b"], "page")
fn split_html(rel: &str) -> (Vec<String>, String) {
    let mut parts: Vec<String> = rel.split('/').filter(|s| !s.is_empty()).map(String::from).collect();
    let file = parts.pop().unwrap_or_default();
    let stem = match file.rfind('.') {
        Some(i) => file[..i].to_string(),
        None => file,
    };
    (parts, stem)
}

fn escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// HTML全体を組み立てます.
///
/// 読み込む順:
/// 1. ワークスペースから同階層まで、上位から順に `style.css`
/// 2. 同階層の `<HTML名>.css`
/// 3. `lhe.js`(ワークスペース直下)
/// 4. ワークスペースから同階層まで、上位から順に `script.js`
/// 5. 同階層の `<HTML名>.js`
///
/// CSS・JSは存在するものだけを参照します(後から作られた場合は [`refresh_dir`] で付け直す).
pub fn compose(root: &Path, rel: &str, title: &str, content: &str) -> String {
    let (dirs, stem) = split_html(rel);
    let depth = dirs.len();
    let up = |k: usize| "../".repeat(depth - k);
    let dir_path = |k: usize| dirs[..k].iter().fold(root.to_path_buf(), |p, d| p.join(d));

    // 同じディレクトリに layout.html があれば、その中に埋め込んで表示する(layout.html 自身は除く)
    let layout = stem != LAYOUT_STEM && dir_path(depth).join(format!("{LAYOUT_STEM}.html")).is_file();
    let mut head = Vec::new();
    if layout {
        head.push(format!(r#"<meta name="lhe-layout" content="{LAYOUT_STEM}.html">"#));
        head.push(LAYOUT_HIDE.to_string());
    }
    for k in 0..=depth {
        if dir_path(k).join("style.css").is_file() {
            head.push(format!(r#"<link rel="stylesheet" href="{}style.css">"#, up(k)));
        }
    }
    if layout && dir_path(depth).join(format!("{LAYOUT_STEM}.css")).is_file() {
        head.push(format!(r#"<link rel="stylesheet" href="{LAYOUT_STEM}.css">"#));
    }
    if dir_path(depth).join(format!("{stem}.css")).is_file() {
        head.push(format!(r#"<link rel="stylesheet" href="{}">"#, escape(&format!("{stem}.css"))));
    }
    head.push(format!(r#"<script src="{}{LHE_JS_NAME}" defer></script>"#, up(0)));
    for k in 0..=depth {
        if dir_path(k).join("script.js").is_file() {
            head.push(format!(r#"<script src="{}script.js" defer></script>"#, up(k)));
        }
    }
    if layout && dir_path(depth).join(format!("{LAYOUT_STEM}.js")).is_file() {
        head.push(format!(r#"<script src="{LAYOUT_STEM}.js" defer></script>"#));
    }
    if dir_path(depth).join(format!("{stem}.js")).is_file() {
        head.push(format!(r#"<script src="{}" defer></script>"#, escape(&format!("{stem}.js"))));
    }

    format!(
        "<!DOCTYPE html>\n<html lang=\"ja\">\n<head>\n<meta charset=\"UTF-8\">\n\
         <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n\
         <title>{}</title>\n<!-- lhe:head -->\n{}\n<!-- /lhe:head -->\n</head>\n<body>\n\
         {CONTENT_START}\n{}\n{CONTENT_END}\n</body>\n</html>\n",
        escape(title),
        head.join("\n"),
        fill_children(root, rel, content.trim())
    )
}

// ---- 子ページ一覧 ----
//
// `a/page.html` の子ページは、同じ階層の同名のディレクトリ `a/page/` の中(孫を含む)のHTML.
// 本文の `<nav class="lhe-children" data-order="asc|desc">` の中身は、保存のたびにここで作り直す
// (lhe.js を使わない静的なリンクなので、ファイルを直接開いても表示できる).

const CHILDREN_CLASS: &str = "lhe-children";

/// リンクの href に使うため、パスの各部分をエンコードする(日本語などはそのまま)
const HREF_SET: &percent_encoding::AsciiSet =
    &percent_encoding::CONTROLS.add(b' ').add(b'"').add(b'#').add(b'%').add(b'?').add(b'<').add(b'>').add(b'\'');

fn href_of(parts: &[String]) -> String {
    parts.iter().map(|p| percent_encoding::utf8_percent_encode(p, HREF_SET).to_string()).collect::<Vec<_>>().join("/")
}

/// HTMLのタイトル(なければ拡張子を除いたファイル名)
fn title_of(path: &Path) -> String {
    let stem = path.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    fs::read_to_string(path).ok().and_then(|h| extract_title(&h)).filter(|t| !t.trim().is_empty()).unwrap_or(stem)
}

/// dir の中のHTMLを入れ子のリスト(<ul>)にします. base は呼び出し元のHTMLからの相対パスの先頭
fn children_list(dir: &Path, base: &[String], desc: bool) -> String {
    let Ok(rd) = fs::read_dir(dir) else { return String::new() };
    let mut files = Vec::new();
    let mut dirs = Vec::new();
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        let p = e.path();
        if p.is_dir() {
            if !skip_dir(&name) {
                dirs.push(name);
            }
        } else if is_html(&name) && !name.to_ascii_lowercase().starts_with(&format!("{LAYOUT_STEM}.")) {
            files.push(name);
        }
    }
    let stems: HashSet<String> = files.iter().map(|f| f.rsplit_once('.').map(|(s, _)| s.to_string()).unwrap_or_default()).collect();
    // (並べ替えの名前, li の中身)
    let mut items: Vec<(String, String)> = Vec::new();
    for f in &files {
        let stem = f.rsplit_once('.').map(|(s, _)| s.to_string()).unwrap_or_default();
        let mut parts = base.to_vec();
        parts.push(f.clone());
        let mut li = format!(r#"<a href="{}">{}</a>"#, href_of(&parts), escape(&title_of(&dir.join(f))));
        if dirs.contains(&stem) {
            let mut sub = base.to_vec();
            sub.push(stem.clone());
            li.push_str(&children_list(&dir.join(&stem), &sub, desc));
        }
        items.push((f.clone(), li));
    }
    // 同名のHTMLがないディレクトリは、名前だけを出して中を並べる
    for d in dirs.iter().filter(|d| !stems.contains(*d)) {
        let mut sub = base.to_vec();
        sub.push(d.clone());
        let inner = children_list(&dir.join(d), &sub, desc);
        if !inner.is_empty() {
            items.push((d.clone(), format!("<span>{}</span>{inner}", escape(d))));
        }
    }
    if items.is_empty() {
        return String::new();
    }
    items.sort_by(|a, b| a.0.to_lowercase().cmp(&b.0.to_lowercase()).then_with(|| a.0.cmp(&b.0)));
    if desc {
        items.reverse();
    }
    format!("<ul>{}</ul>", items.into_iter().map(|(_, li)| format!("<li>{li}</li>")).collect::<String>())
}

/// HTML(ワークスペースからの相対パス)の子ページ一覧の中身
pub fn children_html(root: &Path, rel: &str, desc: bool) -> String {
    let (dirs, stem) = split_html(rel);
    let dir = dirs.iter().fold(root.to_path_buf(), |p, d| p.join(d)).join(&stem);
    let list = children_list(&dir, &[stem], desc);
    if list.is_empty() { r#"<p class="lhe-children-empty">(子ページはありません)</p>"#.to_string() } else { list }
}

/// 本文の子ページ一覧の中身を作り直します
fn fill_children(root: &Path, rel: &str, content: &str) -> String {
    if !content.contains(CHILDREN_CLASS) {
        return content.to_string();
    }
    static NAV: OnceLock<Regex> = OnceLock::new();
    let re = NAV.get_or_init(|| Regex::new(r#"(?s)<nav\b([^>]*\bclass="lhe-children"[^>]*)>.*?</nav>"#).unwrap());
    re.replace_all(content, |c: &regex::Captures| {
        let desc = c[1].contains(r#"data-order="desc""#);
        format!("<nav{}>{}</nav>", &c[1], children_html(root, rel, desc))
    })
    .to_string()
}

/// rel の祖先にあたるHTML(子ページ一覧を持つもの)の一覧を作り直します.
/// `a/b/c.html` なら `a.html`・`a/b.html` が対象.
pub fn refresh_parents(root: &Path, rel: &str) -> Result<(), String> {
    let parts: Vec<&str> = rel.split('/').filter(|s| !s.is_empty()).collect();
    for k in 1..parts.len() {
        for ext in ["html", "htm"] {
            let parent = format!("{}.{ext}", parts[..k].join("/"));
            let p = resolve(root, &parent)?;
            if fs::read_to_string(&p).map(|h| h.contains(CHILDREN_CLASS)).unwrap_or(false) {
                refresh_html(root, &parent)?;
            }
        }
    }
    Ok(())
}

/// 保存されたHTMLから本文を取り出します(目印のコメントがなければ body の中身).
pub fn extract_content(html: &str) -> String {
    if let (Some(s), Some(e)) = (html.find(CONTENT_START), html.rfind(CONTENT_END)) {
        if s < e {
            return html[s + CONTENT_START.len()..e].trim().to_string();
        }
    }
    static BODY: OnceLock<Regex> = OnceLock::new();
    let re = BODY.get_or_init(|| Regex::new(r"(?is)<body[^>]*>(.*)</body>").unwrap());
    match re.captures(html) {
        Some(c) => c[1].trim().to_string(),
        None => html.trim().to_string(),
    }
}

pub fn extract_title(html: &str) -> Option<String> {
    static TITLE: OnceLock<Regex> = OnceLock::new();
    let re = TITLE.get_or_init(|| Regex::new(r"(?is)<title>(.*?)</title>").unwrap());
    re.captures(html).map(|c| {
        c[1].replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&amp;", "&")
    })
}

/// HTMLの head(CSS・JSの参照)を今のファイル構成に合わせて付け直します.
pub fn refresh_html(root: &Path, rel: &str) -> Result<(), String> {
    let path = resolve(root, rel)?;
    let old = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let (_, stem) = split_html(rel);
    let title = extract_title(&old).unwrap_or(stem);
    let new = compose(root, rel, &title, &extract_content(&old));
    if new != old {
        fs::write(&path, new).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// ディレクトリ配下(サブディレクトリを含む)のHTMLの head を付け直します.
pub fn refresh_dir(root: &Path, dir_rel: &str) -> Result<(), String> {
    fn walk(root: &Path, dir: &Path) {
        let Ok(rd) = fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            if p.is_dir() {
                if !skip_dir(&name) {
                    walk(root, &p);
                }
            } else if is_html(&name) {
                let _ = refresh_html(root, &rel_of(root, &p));
            }
        }
    }
    walk(root, &resolve(root, dir_rel)?);
    Ok(())
}

/// ディレクトリ直下(サブディレクトリは含まない)のHTMLの head を付け直します.
pub fn refresh_siblings(root: &Path, dir_rel: &str) -> Result<(), String> {
    let Ok(rd) = fs::read_dir(resolve(root, dir_rel)?) else { return Ok(()) };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if e.path().is_file() && is_html(&name) {
            refresh_html(root, &rel_of(root, &e.path()))?;
        }
    }
    Ok(())
}

/// HTMLを作った後の処理: layout.html なら、同じディレクトリのHTMLが読み込むよう head を付け直す
pub fn after_html_created(root: &Path, rel: &str) -> Result<(), String> {
    refresh_parents(root, rel)?;
    let (_, stem) = split_html(rel);
    if stem == LAYOUT_STEM {
        refresh_siblings(root, rel.rsplit_once('/').map(|(d, _)| d).unwrap_or(""))?;
    }
    Ok(())
}

/// CSS・JSを書き込みます. 新しく作った場合は、それを参照すべきHTMLの head を付け直します.
pub fn write_text(root: &Path, rel: &str, content: &str) -> Result<(), String> {
    let path = resolve(root, rel)?;
    let created = !path.exists();
    if created && content.is_empty() {
        return Ok(()); // 空のまま作らない
    }
    if let Some(p) = path.parent() {
        fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())?;
    if created {
        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        let dir_rel = rel.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
        if name == "style.css" || name == "script.js" {
            refresh_dir(root, dir_rel)?;
        } else if let Some((stem, _)) = name.rsplit_once('.') {
            // layout.css・layout.js は、同じディレクトリのHTMLすべてが読み込む
            if stem == LAYOUT_STEM {
                refresh_siblings(root, dir_rel)?;
            }
            for ext in ["html", "htm"] {
                let html = if dir_rel.is_empty() { format!("{stem}.{ext}") } else { format!("{dir_rel}/{stem}.{ext}") };
                if resolve(root, &html)?.is_file() {
                    refresh_html(root, &html)?;
                }
            }
        }
    }
    Ok(())
}

/// 画像などをHTMLと同じ階層の `<HTML名>_IMG` に保存し、HTMLからの相対パスを返します.
/// 同名のファイルがある場合は `名前_1.拡張子` のように連番を付けます.
pub fn save_asset(root: &Path, html_rel: &str, file_name: &str, data: &[u8]) -> Result<String, String> {
    let file_name = Path::new(file_name)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty() && n != "." && n != "..")
        .ok_or("ファイル名が不正です")?;
    let (dirs, stem) = split_html(html_rel);
    let dir_name = asset_dir_name(&stem);
    let dir = dirs.iter().fold(root.to_path_buf(), |p, d| p.join(d)).join(&dir_name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let (base, ext) = match file_name.rfind('.') {
        Some(i) if i > 0 => (&file_name[..i], &file_name[i..]),
        _ => (file_name.as_str(), ""),
    };
    let mut name = file_name.clone();
    let mut n = 1;
    while dir.join(&name).exists() {
        name = format!("{base}_{n}{ext}");
        n += 1;
    }
    fs::write(dir.join(&name), data).map_err(|e| e.to_string())?;
    Ok(format!("{dir_name}/{name}"))
}

fn write_if_changed(p: &Path, content: &str) -> Result<(), String> {
    if fs::read_to_string(p).ok().as_deref() != Some(content) {
        fs::write(p, content).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 実行時スクリプトと説明書をワークスペース直下に置きます(内容が同じなら書き込まない).
/// CLAUDE.md がなければ説明書を読み込むだけの CLAUDE.md を作り、あれば読み込みの行を末尾に足します.
pub fn ensure_runtime(root: &Path) -> Result<(), String> {
    write_if_changed(&root.join(LHE_JS_NAME), LHE_JS)?;
    write_if_changed(&root.join(FORMAT_MD_NAME), FORMAT_MD)?;
    let claude = root.join(CLAUDE_MD_NAME);
    match fs::read_to_string(&claude) {
        Ok(s) if s.contains(CLAUDE_MD_IMPORT) => {}
        Ok(s) => {
            let sep = if s.ends_with('\n') || s.is_empty() { "" } else { "\n" };
            fs::write(&claude, format!("{s}{sep}\n# ローカルHTMLエディタ\nこのディレクトリのHTMLは次の形式に従って読み書きすること。\n{CLAUDE_MD_IMPORT}\n"))
                .map_err(|e| e.to_string())?;
        }
        Err(_) => fs::write(
            &claude,
            format!("# このディレクトリについて\nローカルHTMLエディタで編集するHTMLのワークスペース。HTMLは次の形式に従って読み書きすること。\n\n{CLAUDE_MD_IMPORT}\n"),
        )
        .map_err(|e| e.to_string())?,
    }
    Ok(())
}

/// 本文が参照している `<HTML名>_IMG/` 内のファイル名
fn referenced_assets(stem: &str, content: &str) -> HashSet<String> {
    static ATTR: OnceLock<Regex> = OnceLock::new();
    let re = ATTR.get_or_init(|| Regex::new(r#"=\s*"([^"]*)""#).unwrap());
    let prefix = format!("{}/", asset_dir_name(stem));
    re.captures_iter(content)
        .filter_map(|c| {
            let v = c[1].replace("&amp;", "&");
            let v = percent_decode_str(&v).decode_utf8_lossy().to_string();
            let v = v.trim_start_matches("./");
            v.strip_prefix(&prefix).map(|rest| rest.split(['/', '?', '#']).next().unwrap_or("").to_string())
        })
        .filter(|n| !n.is_empty())
        .collect()
}

/// HTMLから参照されなくなった `<HTML名>_IMG/` のファイルを消します.
/// 消したファイルは trash に覚えておき、元に戻す操作などで再び参照されたら書き戻します.
pub fn sync_assets(root: &Path, html_rel: &str, content: &str, trash: &mut HashMap<PathBuf, Vec<u8>>) -> Result<(), String> {
    let (dirs, stem) = split_html(html_rel);
    let dir = dirs.iter().fold(root.to_path_buf(), |p, d| p.join(d)).join(asset_dir_name(&stem));
    let refs = referenced_assets(&stem, content);
    for name in &refs {
        let p = dir.join(name);
        if !p.exists() {
            if let Some(data) = trash.remove(&p) {
                fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                fs::write(&p, data).map_err(|e| e.to_string())?;
            }
        }
    }
    let Ok(rd) = fs::read_dir(&dir) else { return Ok(()) };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        let p = e.path();
        if p.is_file() && !refs.contains(&name) {
            if let Ok(data) = fs::read(&p) {
                trash.insert(p.clone(), data);
            }
            fs::remove_file(&p).map_err(|e| e.to_string())?;
        }
    }
    // 空になったら、ディレクトリも消す
    if fs::read_dir(&dir).map(|mut r| r.next().is_none()).unwrap_or(false) {
        let _ = fs::remove_dir(&dir);
    }
    Ok(())
}

/// 同じディレクトリに、まだない名前 `<名前>_copy.html`(重複時は `_copy2`…)を探します
pub fn copy_name(root: &Path, rel: &str) -> Result<String, String> {
    let (dirs, stem) = split_html(rel);
    let dir = dirs.join("/");
    let ext = rel.rsplit_once('.').map(|(_, e)| e).unwrap_or("html");
    for n in 1.. {
        let name = if n == 1 { format!("{stem}_copy.{ext}") } else { format!("{stem}_copy{n}.{ext}") };
        let r = if dir.is_empty() { name } else { format!("{dir}/{name}") };
        if !resolve(root, &r)?.exists() {
            return Ok(r);
        }
    }
    unreachable!()
}

/// HTMLを複製します. `<HTML名>_IMG/`・`<HTML名>.css`・`<HTML名>.js` も新しい名前で複製し、本文の参照を付け替えます.
pub fn duplicate_html(root: &Path, rel: &str, new_rel: &str) -> Result<(), String> {
    let src = resolve(root, rel)?;
    let dst = resolve(root, new_rel)?;
    if dst.exists() {
        return Err(format!("既に存在します: {new_rel}"));
    }
    let (sdirs, sstem) = split_html(rel);
    let (ddirs, dstem) = split_html(new_rel);
    let sdir = sdirs.iter().fold(root.to_path_buf(), |p, d| p.join(d));
    let ddir = ddirs.iter().fold(root.to_path_buf(), |p, d| p.join(d));
    fs::create_dir_all(&ddir).map_err(|e| e.to_string())?;
    let html = fs::read_to_string(&src).map_err(|e| e.to_string())?;
    let title = extract_title(&html).unwrap_or_else(|| sstem.clone());
    let mut content = extract_content(&html);
    // 画像などのディレクトリ
    let simg = sdir.join(asset_dir_name(&sstem));
    if simg.is_dir() {
        let dimg = ddir.join(asset_dir_name(&dstem));
        fs::create_dir_all(&dimg).map_err(|e| e.to_string())?;
        for e in fs::read_dir(&simg).map_err(|e| e.to_string())?.flatten() {
            if e.path().is_file() {
                fs::copy(e.path(), dimg.join(e.file_name())).map_err(|e| e.to_string())?;
            }
        }
        // 本文の参照を付け替える(複製は同じディレクトリに作る前提)
        let (from, to) = (asset_dir_name(&sstem), asset_dir_name(&dstem));
        let enc = percent_encoding::utf8_percent_encode(&from, percent_encoding::NON_ALPHANUMERIC).to_string();
        content = content.replace(&format!("=\"{from}/"), &format!("=\"{to}/")).replace(&format!("=\"{enc}/"), &format!("=\"{to}/"));
    }
    // 個別のCSS・JS
    for ext in ["css", "js"] {
        let f = sdir.join(format!("{sstem}.{ext}"));
        if f.is_file() {
            let t = ddir.join(format!("{dstem}.{ext}"));
            if !t.exists() {
                fs::copy(&f, &t).map_err(|e| e.to_string())?;
            }
        }
    }
    let title = if title == sstem { dstem.clone() } else { format!("{title}(コピー)") };
    fs::write(&dst, compose(root, new_rel, &title, &content)).map_err(|e| e.to_string())
}

pub fn mime_of(path: &Path) -> &'static str {
    let ext = path.extension().map(|e| e.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "bmp" => "image/bmp",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "ogg" | "ogv" => "video/ogg",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "pdf" => "application/pdf",
        "txt" | "md" => "text/plain; charset=utf-8",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("lhe-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn resolve_rejects_parent() {
        let r = Path::new("/ws");
        assert!(resolve(r, "../x").is_err());
        assert!(resolve(r, "a/../../x").is_err());
        assert_eq!(resolve(r, "a/b.html").unwrap(), PathBuf::from("/ws/a/b.html"));
    }

    #[test]
    fn compose_order() {
        let root = tmp("compose");
        fs::create_dir_all(root.join("a/b")).unwrap();
        fs::write(root.join("style.css"), "").unwrap();
        fs::write(root.join("a/b/style.css"), "").unwrap();
        fs::write(root.join("a/script.js"), "").unwrap();
        fs::write(root.join("a/b/page.css"), "").unwrap();
        fs::write(root.join("a/b/page.js"), "").unwrap();
        let html = compose(&root, "a/b/page.html", "T", "<p>x</p>");
        let order = ["../../style.css", "\"style.css", "page.css", "../../lhe.js", "../script.js", "page.js"];
        let pos: Vec<usize> = order.iter().map(|s| html.find(s).unwrap_or_else(|| panic!("{s} missing"))).collect();
        assert!(pos.windows(2).all(|w| w[0] < w[1]), "{html}");
        assert_eq!(extract_content(&html), "<p>x</p>");
        assert_eq!(extract_title(&html).as_deref(), Some("T"));
    }

    #[test]
    fn asset_suffix() {
        let root = tmp("asset");
        assert_eq!(save_asset(&root, "d/p.html", "a.png", b"1").unwrap(), "p_IMG/a.png");
        assert_eq!(save_asset(&root, "d/p.html", "a.png", b"2").unwrap(), "p_IMG/a_1.png");
        assert_eq!(save_asset(&root, "d/p.html", "a.png", b"3").unwrap(), "p_IMG/a_2.png");
    }

    #[test]
    fn assets_removed_and_restored() {
        let root = tmp("gc");
        let a = save_asset(&root, "p.html", "a.png", b"A").unwrap();
        let b = save_asset(&root, "p.html", "b c.png", b"B").unwrap();
        let mut trash = HashMap::new();
        sync_assets(&root, "p.html", &format!(r#"<img src="{a}"><img src="p_IMG/b%20c.png">"#), &mut trash).unwrap();
        assert!(root.join(&a).exists() && root.join(&b).exists());
        sync_assets(&root, "p.html", &format!(r#"<img src="{a}">"#), &mut trash).unwrap();
        assert!(!root.join(&b).exists());
        sync_assets(&root, "p.html", "<p></p>", &mut trash).unwrap();
        assert!(!root.join("p_IMG").exists());
        // 元に戻すと書き戻される
        sync_assets(&root, "p.html", &format!(r#"<img src="{b}">"#), &mut trash).unwrap();
        assert_eq!(fs::read(root.join(&b)).unwrap(), b"B");
    }

    #[test]
    fn duplicate_rewrites_assets() {
        let root = tmp("dup");
        let a = save_asset(&root, "p.html", "a.png", b"A").unwrap();
        fs::write(root.join("p.html"), compose(&root, "p.html", "T", &format!(r#"<img src="{a}">"#))).unwrap();
        fs::write(root.join("p.css"), "x").unwrap();
        let n = copy_name(&root, "p.html").unwrap();
        assert_eq!(n, "p_copy.html");
        duplicate_html(&root, "p.html", &n).unwrap();
        let html = fs::read_to_string(root.join(&n)).unwrap();
        assert!(html.contains(r#"src="p_copy_IMG/a.png""#), "{html}");
        assert!(html.contains(r#"href="p_copy.css""#), "{html}");
        assert!(root.join("p_copy_IMG/a.png").exists());
        assert_eq!(copy_name(&root, "p.html").unwrap(), "p_copy2.html");
    }

    #[test]
    fn layout_is_loaded_by_siblings() {
        let root = tmp("layout");
        fs::create_dir_all(root.join("d/sub")).unwrap();
        for p in ["d/a.html", "d/sub/b.html"] {
            fs::write(root.join(p), compose(&root, p, "t", "<p>x</p>")).unwrap();
        }
        fs::write(root.join("d/layout.html"), compose(&root, "d/layout.html", "L", "<!--lhe:slot-->")).unwrap();
        after_html_created(&root, "d/layout.html").unwrap();
        write_text(&root, "d/layout.css", "body{}").unwrap();
        let a = fs::read_to_string(root.join("d/a.html")).unwrap();
        assert!(a.contains(r#"<meta name="lhe-layout" content="layout.html">"#), "{a}");
        assert!(a.contains(r#"href="layout.css""#), "{a}");
        let l = fs::read_to_string(root.join("d/layout.html")).unwrap();
        assert!(!l.contains("lhe-layout\""), "{l}");
        assert!(l.contains(r#"href="layout.css""#), "{l}"); // 自分の個別CSSとして
        let b = fs::read_to_string(root.join("d/sub/b.html")).unwrap();
        assert!(!b.contains("lhe-layout"), "{b}"); // 下の階層には効かない
    }

    #[test]
    fn children_list_nested_and_ordered() {
        let root = tmp("children");
        fs::create_dir_all(root.join("doc/page/b")).unwrap();
        fs::create_dir_all(root.join("doc/page/x")).unwrap();
        for (p, t) in [("doc/page/a.html", "Aの記事"), ("doc/page/b.html", "B"), ("doc/page/b/c.html", "C"), ("doc/page/x/y z.html", "Y")] {
            fs::write(root.join(p), compose(&root, p, t, "<p></p>")).unwrap();
        }
        let page = r#"<nav class="lhe-children" data-order="asc"></nav>"#;
        fs::write(root.join("doc/page.html"), compose(&root, "doc/page.html", "P", page)).unwrap();
        let html = fs::read_to_string(root.join("doc/page.html")).unwrap();
        let want = r#"<ul><li><a href="page/a.html">Aの記事</a></li><li><a href="page/b.html">B</a><ul><li><a href="page/b/c.html">C</a></li></ul></li><li><span>x</span><ul><li><a href="page/x/y%20z.html">Y</a></li></ul></li></ul>"#;
        assert!(html.contains(want), "{html}");
        assert_eq!(extract_content(&html).matches("<nav").count(), 1);
        // 降順
        let desc = children_html(&root, "doc/page.html", true);
        assert!(desc.find("span>x").unwrap() < desc.find("Aの記事").unwrap(), "{desc}");
        // 孫を作ると、祖先の一覧が作り直される
        fs::write(root.join("doc/page/a2.html"), compose(&root, "doc/page/a2.html", "A2", "<p></p>")).unwrap();
        after_html_created(&root, "doc/page/a2.html").unwrap();
        assert!(fs::read_to_string(root.join("doc/page.html")).unwrap().contains("page/a2.html"));
        // 子がなければ空の表示
        assert!(children_html(&root, "doc/none.html", false).contains("lhe-children-empty"));
    }

    #[test]
    fn new_css_refreshes_html() {
        let root = tmp("refresh");
        fs::create_dir_all(root.join("x")).unwrap();
        fs::write(root.join("x/p.html"), compose(&root, "x/p.html", "p", "<p>a</p>")).unwrap();
        write_text(&root, "style.css", "body{}").unwrap();
        write_text(&root, "x/p.js", "1").unwrap();
        let html = fs::read_to_string(root.join("x/p.html")).unwrap();
        assert!(html.contains(r#"href="../style.css""#), "{html}");
        assert!(html.contains(r#"src="p.js""#), "{html}");
    }
}
