#!/bin/sh
# Local HTML Editor のインストール(macOS)
#
#   curl -fsSL https://raw.githubusercontent.com/Ondeoma/local-html-editor/main/install.sh | sh
#
# GitHub のリリースから .dmg をダウンロードし、アプリを /Applications にコピーします.
# curl でダウンロードしたファイルには「インターネットから来た」印(quarantine)が付かないため、
# 公証していないアプリでも「開いていません」の警告なしで起動できます.
#
# 環境変数
#   LHE_VERSION … 入れるバージョン(例: v0.2.0). 省略すると最新
#   LHE_DEST    … 入れる先のディレクトリ. 省略すると /Applications(書き込めなければ ~/Applications)
set -eu

REPO="Ondeoma/local-html-editor"
APP="Local HTML Editor.app"

say() { printf '%s\n' "$*"; }
die() { printf 'エラー: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "このスクリプトは macOS 専用です(Windows・Linux はリリースのページからインストーラを入手してください)"

# Apple Silicon なら専用版、Intel なら Universal 版(Rosetta で動くシェルでも判別できるよう sysctl を見る)
if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = "1" ]; then
  ARCH="aarch64"
else
  ARCH="universal"
fi

if [ -n "${LHE_VERSION:-}" ]; then
  API="https://api.github.com/repos/$REPO/releases/tags/$LHE_VERSION"
else
  API="https://api.github.com/repos/$REPO/releases/latest"
fi

say "リリースの情報を取得しています…"
URL=$(curl -fsSL "$API" | grep -o '"browser_download_url": *"[^"]*_'"$ARCH"'\.dmg"' | head -n 1 | sed 's/.*"\(https[^"]*\)"/\1/') || true
[ -n "$URL" ] || die "ダウンロードするファイル(*_$ARCH.dmg)が見つかりません: $API"

DEST="${LHE_DEST:-/Applications}"
if [ -z "${LHE_DEST:-}" ] && [ ! -w "$DEST" ]; then
  DEST="$HOME/Applications"
fi
mkdir -p "$DEST"

TMP=$(mktemp -d)
MNT="$TMP/mnt"
cleanup() {
  hdiutil detach "$MNT" -quiet >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

say "ダウンロードしています: $(basename "$URL")"
curl -fL --progress-bar -o "$TMP/app.dmg" "$URL"

mkdir -p "$MNT"
hdiutil attach "$TMP/app.dmg" -nobrowse -readonly -mountpoint "$MNT" -quiet
[ -d "$MNT/$APP" ] || die "ディスクイメージの中に $APP が見つかりません"

if pgrep -xq "local-html-editor"; then
  say "注意: アプリが起動中です. インストール後に再起動してください."
fi

say "$DEST にコピーしています…"
rm -rf "${DEST:?}/$APP"
ditto "$MNT/$APP" "$DEST/$APP"
# 念のため、印が付いていれば外す
xattr -dr com.apple.quarantine "$DEST/$APP" 2>/dev/null || true

say "インストールしました: $DEST/$APP"
say "起動するには: open \"$DEST/$APP\""
