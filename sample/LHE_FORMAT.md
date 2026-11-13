# ローカルHTMLエディタ: HTMLの書き方

このディレクトリ(ワークスペース)のHTMLは「ローカルHTMLエディタ」で編集される。
エディタで開いても内容が崩れないよう、HTMLを作る・直すときはこの説明に従うこと。
(このファイルはエディタがワークスペースを開くたびに上書きする。編集しないこと。)

## ファイルの構成

```
ワークスペース/
  lhe.js              … 実行時スクリプト(目次・Mermaid図の描画). エディタが置く. 編集しない
  LHE_FORMAT.md       … この説明書. エディタが置く
  style.css           … 全ページ共通のCSS(任意)
  script.js           … 全ページ共通のJS(任意)
  page.html
  page.css            … page.html だけのCSS(任意)
  page.js             … page.html だけのJS(任意)
  page_IMG/           … page.html に貼った画像・動画・ファイル
  docs/
    style.css         … docs/ 以下のページ共通のCSS(任意)
    script.js         … docs/ 以下のページ共通のJS(任意)
    guide.html
    guide_IMG/
```

- 拡張子は `.html`。ディレクトリ名・ファイル名は自由(`_IMG` で終わるディレクトリはエディタのツリーに出ない)。
- `layout.html` は特別なHTML(下記「レイアウト」)。
- 画像・動画・添付ファイルは、HTMLと同じ階層の `<HTMLの拡張子を除いた名前>_IMG/` に元の名前で置き、
  HTMLからは `page_IMG/写真.png` のように相対パスで参照する。名前が重なったら `写真_1.png` のように連番を付ける。
- `_IMG/` の中で、HTMLから参照されていないファイルはエディタが保存時に削除する。

## HTMLの雛形

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ページのタイトル</title>
<!-- lhe:head -->
<link rel="stylesheet" href="../style.css">
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="guide.css">
<script src="../lhe.js" defer></script>
<script src="../script.js" defer></script>
<script src="script.js" defer></script>
<script src="guide.js" defer></script>
<!-- /lhe:head -->
</head>
<body>
<!-- lhe:content -->
<h1>見出し</h1>
<p>本文</p>
<!-- /lhe:content -->
</body>
</html>
```

- `<!-- lhe:head -->` 〜 `<!-- /lhe:head -->` の中は、次の順で **存在するファイルだけ** を並べる。
  1. ワークスペース直下から、HTMLと同じ階層まで、上位から順に `style.css`
  2. 同じ階層の `<HTML名>.css`
  3. ワークスペース直下の `lhe.js`(必ず入れる. `defer` 付き)
  4. ワークスペース直下から、HTMLと同じ階層まで、上位から順に `script.js`(`defer` 付き)
  5. 同じ階層の `<HTML名>.js`(`defer` 付き)
- 同じ階層に `layout.html` があるページ(`layout.html` 自身を除く)は、さらに次を入れる(下記「レイアウト」)。
  - 先頭に `<meta name="lhe-layout" content="layout.html">` と
    `<style id="lhe-layout-hide">body{visibility:hidden;animation:lhe-show 0s 1s forwards}@keyframes lhe-show{to{visibility:visible}}</style>`
  - 1 の後に `layout.css`、4 の後に `layout.js`(どちらも存在する場合だけ)
- head の中身はエディタが保存のたびに作り直す。CSS・JSを新しく作ったら、それを読み込むべきHTMLの head にも追加すること
  (エディタで作った場合は自動で追加される)。
- 本文は `<!-- lhe:content -->` 〜 `<!-- /lhe:content -->` の間だけに書く。エディタはこの間だけを読み込み・保存する。
- `<title>` は本文の最初の見出しの文字(見出しがなければファイル名)。

## 本文に使える要素

エディタが扱えるのは次の要素だけ。これ以外の要素・属性(`class`・`id`・`style` など)は、エディタで開いて保存すると消える。
見た目の調整は本文に書かず、CSSファイルで行うこと。動きはJSファイルで、本文の要素を探して付け加えること。

| 種類 | 書き方 |
|---|---|
| 段落 | `<p>文</p>`。寄せは `<p style="text-align: center">`(`center` / `right`) |
| 見出し | `<h1>`〜`<h4>`。寄せは段落と同じ |
| 太字・斜体・下線・取り消し線 | `<strong>` `<em>` `<u>` `<s>` |
| 文字色 | `<span style="color: #d00">文字</span>` |
| コード(文中) | `<code>x</code>` |
| リンク | `<a href="other.html">文字</a>`(ワークスペース内は相対パス、外部は https のURL) |
| 改行 | `<br>` |
| 箇条書き・番号付きリスト | `<ul><li><p>項目</p></li></ul>`、`<ol>…</ol>`(`li` の中は `p` で包む) |
| 引用 | `<blockquote><p>文</p></blockquote>` |
| コードブロック | `<pre><code class="language-js">コード</code></pre>`(`<` `>` `&` はエスケープ) |
| 水平線 | `<hr>` |
| 表 | 下記 |
| 画像 | `<img src="page_IMG/a.png" alt="説明" width="320" data-align="center">`(`width`・`height`・`data-align` は任意。`data-align` は `left` / `center` / `right`) |
| 動画 | `<video src="page_IMG/a.mp4" controls="true" data-align="center"></video>` |
| 添付ファイル | `<div class="lhe-file"><a href="page_IMG/資料.pdf" download="資料.pdf">📎 資料.pdf</a></div>` |
| 他ページの埋め込み | `<div class="lhe-embed"><iframe src="other.html" height="400" loading="lazy"></iframe></div>` |
| パネル | 下記 |
| 目次 | `<!--lhe:toc-->`(この1行だけ書く。h1〜h4 から lhe.js が目次を描く) |
| Mermaid図 | 下記 |

### 表

```html
<table><tbody>
<tr><th><p>名前</p></th><th><p>点数</p></th></tr>
<tr><td style="background-color: #e6f6ea"><p>佐藤</p></td><td><p>72</p></td></tr>
</tbody></table>
```

- セルの中身は `p` で包む。見出しセルは `th`。結合は `colspan` / `rowspan`。
- セルの背景色は `style="background-color: 色"` だけ使える。

### パネル(アイコンと背景色の付いた囲み)

```html
<div data-icon="⚠️" class="lhe-panel" style="background-color: #fff6dc;"><span class="lhe-panel-icon">⚠️</span><div class="lhe-panel-body">
<p>中身(段落・リスト・表などを入れられる)</p>
</div></div>
```

- `data-icon` と `lhe-panel-icon` の中身は同じ絵文字にする。
- よく使う組み合わせ: 情報 `ℹ️` `#e8f1fd` / 注意 `⚠️` `#fff6dc` / 成功 `✅` `#e6f6ea` / エラー `⛔` `#fde8e8` / メモ `📝` `#f1eafd`

### Mermaid図

```html
<!--lhe:mermaid-->
<pre class="lhe-mermaid">graph LR
  A[開始] --&gt; B[終了]</pre>
```

- 目印のコメントのすぐ後に `<pre class="lhe-mermaid">` を置き、中に Mermaid のコードを書く(`<` `>` `&` はエスケープ)。
- 表示は lhe.js が行う(Mermaid は CDN から読み込むため、表示にはネットへの接続が必要)。

## レイアウト(layout.html)

同じディレクトリに `layout.html` を置くと、そのディレクトリの他のHTMLは、表示するときに
`layout.html` の本文の中の「コンテンツ枠」`<!--lhe:slot-->` の位置に自分の本文を入れて表示される(lhe.js が行う)。
ヘッダー・フッター・メニューなど、ページに共通の部分は `layout.html` に書く。

```html
<!-- lhe:content -->
<p><strong>サイト名</strong> | <a href="index.html">トップ</a></p>
<hr>
<!--lhe:slot-->
<hr>
<p>フッター</p>
<!-- /lhe:content -->
```

- `<!--lhe:slot-->` は `layout.html` の本文に1つだけ書く(他のHTMLには書かない)。
- 埋め込まれた本文は `<div class="lhe-page">` で囲まれる。CSSでの指定に使える。
- 下の階層のディレクトリには効かない(そのディレクトリに別の `layout.html` を置く)。
- `layout.css`・`layout.js` は、`layout.html` と同じディレクトリの全ページが読み込む。
- レイアウトの適用は読み込み後に非同期で行われる。JSで本文やレイアウトの要素を扱うときは、
  `document.addEventListener('lhe:ready', () => { … })` の中で行う(目次・Mermaid図の描画もこの前に終わる)。
- レイアウトの読み込みに `fetch` を使うため、`file://` で直接開いたときは適用されない場合がある(エディタのプレビューやWebサーバーでは適用される)。

## してはいけないこと

- `lhe.js`・`LHE_FORMAT.md` を書き換えること(エディタが上書きする)。
- `<!-- lhe:content -->` の外(body の中)に本文を書くこと(エディタで保存すると消える)。
- 本文に `<script>`・`<style>` を書くこと(JS・CSSはファイルに分ける)。
- 画像などを `_IMG/` 以外に置くこと、絶対パス(`/` や `file://` で始まる)で参照すること。
