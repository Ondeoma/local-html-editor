# Local HTML Editor

指定したディレクトリ(ワークスペース)の中の HTML を、WYSIWYG エディタで編集するデスクトップアプリ。
Tauri 2(Rust) + Scalactive 0.6.2(Scala.js) + Tiptap(WYSIWYG) + CodeMirror(CSS/JS)。

## 必要なもの
- Rust(cargo)、sbt 1.12 系、Node.js 24 系

## 起動
```bash
npm install
npx tauri dev        # 開発(Vite + sbt ~fastLinkJS + Tauri)
npx tauri build      # 配布用ビルド
npm run dev:vite     # ブラウザだけで画面を確認(仮のワークスペース js/mock.js で動く)
```

## 構成
| 場所 | 内容 |
|---|---|
| `src-tauri/src/workspace.rs` | ファイル操作・HTML の組み立て(CSS/JS の参照)・`_IMG` への保存 |
| `src-tauri/src/lib.rs` | Tauri コマンド、最近開いたワークスペース、`lhe://` プロトコル(プレビュー・画像表示) |
| `src-tauri/assets/lhe.js` | 全 HTML が読み込む実行時スクリプト(目次・mermaid 描画・共通スタイル)。ワークスペース直下に置かれる |
| `src/main/scalactive/lhe/views/*.st` | 画面(Scalactive) |
| `src/main/scala/lhe/` | 状態管理(`Store`)、Tauri 呼び出し(`Host`)、保存の遅延(`Saver`) |
| `js/` | Tiptap / CodeMirror のエディタと、Scala.js から使うための橋渡し(`bridge.js`) |

## 保存される HTML
- 本文は `<!-- lhe:content -->` 〜 `<!-- /lhe:content -->` の間。
- head では次の順に読み込む(存在するものだけ。後から作られたら自動で付け直す):
  上位から同階層までの `style.css` → `<HTML名>.css` → `lhe.js` → 上位から同階層までの `script.js` → `<HTML名>.js`
- 画像・動画・ファイルは `<HTML名>_IMG/` に元の名前で保存(重複時は `名前_1.拡張子`)。
  HTMLから参照されなくなったファイルは保存時に削除(アプリ起動中に元に戻す操作をすれば書き戻す)。
- ワークスペース直下に `LHE_FORMAT.md`(この形式の説明書)を置き、`CLAUDE.md` から読み込むようにする
  (`CLAUDE.md` がなければ作り、あれば `@LHE_FORMAT.md` の行を末尾に足す)。
- 目次は `<!--lhe:toc-->`、mermaid 図は `<!--lhe:mermaid-->` + `<pre class="lhe-mermaid">` を残し、`lhe.js` が描画する
  (公開ページでの mermaid は CDN から読み込む)。

## 操作
- 左のツリー: 右クリックで「開く」「複製…」「Finderで表示」「この中に新しいHTMLファイル/ディレクトリ」。
  複製では `<HTML名>_IMG/`・`<HTML名>.css`・`<HTML名>.js` も新しい名前で複製されます。
- 右の領域: モードは「編集」「ソース(読み取り専用)」「CSS(共通)=style.css」「CSS(個別)=<HTML名>.css」「JS(共通)=script.js」「JS(個別)=<HTML名>.js」「プレビュー」。
  ⊟◫ で分割(最大4)、左上の ⠿ をドラッグして別の領域に落とすと入れ替え。
- 編集: 各ブロックの左の ⠿ をドラッグして並べ替え。「/」で挿入メニュー。画像・動画を選ぶと寄せのメニュー、表の中にカーソルを置くと表の上に表のメニューが出る。

## レイアウト(layout.html)
同じディレクトリに `layout.html` を作ると、そのディレクトリの他のHTMLは `layout.html` の「コンテンツ枠」(`<!--lhe:slot-->`)の中に本文を入れて表示されます(lhe.js が `fetch` で読み込んで組み立てる)。
コンテンツ枠は `layout.html` の編集中だけ、ツールバーの「📄枠」か「/」メニューから1つだけ置けます。`layout.css`・`layout.js` は同じディレクトリの全ページが読み込みます。

## サンプル
`sample/` をワークスペースとして開き、`index.html` をプレビューすると、共通の `script.js` と個別の `index.js` の動作を確認できます
(JS動作中バッジ・コードのコピーボタン・ページ上部へボタン・`{{時刻}}` の時計・表の並べ替え)。
`blog/post1.html` をプレビューすると、`blog/layout.html` に埋め込まれた表示を確認できます。
