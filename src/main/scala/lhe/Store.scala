package lhe

import io.github.ondeoma.scalactive.reactive.*

import scala.concurrent.Future
import scala.scalajs.concurrent.JSExecutionContext.Implicits.queue
import scala.util.{Failure, Success}

/** 右側の領域の表示モード. D は同ディレクトリ(style.css / script.js)、F はHTMLと同名のファイル */
enum Mode(val label: String, val desc: String) {
  case Html extends Mode("編集", "HTMLをWYSIWYGで編集")
  case Source extends Mode("ソース", "保存されたHTMLのソース(読み取り専用)")
  case CssD extends Mode("CSS(共通)", "同じディレクトリの style.css")
  case CssF extends Mode("CSS(個別)", "HTMLと同じ名前の .css")
  case JsD extends Mode("JS(共通)", "同じディレクトリの script.js")
  case JsF extends Mode("JS(個別)", "HTMLと同じ名前の .js")
  case Preview extends Mode("プレビュー", "CSS・JSを読み込んだ表示")

  /** HTML(ワークスペースからの相対パス)に対して、このモードで開くファイル */
  def target(html: String): String = {
    val (dir, stem) = Paths.split(html)
    this match {
      case Html | Source | Preview => html
      case CssD => dir + "style.css"
      case CssF => dir + stem + ".css"
      case JsD => dir + "script.js"
      case JsF => dir + stem + ".js"
    }
  }

  def lang: String = this match {
    case CssD | CssF => "css"
    case Source => "html"
    case _ => "js"
  }
}

object Paths {

  /** `a/b/page.html` → ("a/b/", "page") */
  def split(path: String): (String, String) = {
    val i = path.lastIndexOf('/')
    val dir = if (i >= 0) path.take(i + 1) else ""
    val file = path.drop(i + 1)
    val j = file.lastIndexOf('.')
    (dir, if (j > 0) file.take(j) else file)
  }

  def dirOf(path: String): String = split(path)._1

  /** from(ディレクトリ, 末尾 / 付き)から to への相対パス */
  def relative(fromDir: String, to: String): String = {
    val f = fromDir.split('/').filter(_.nonEmpty).toList
    val t = to.split('/').filter(_.nonEmpty).toList
    val common = f.zip(t).takeWhile(_ == _).length
    ("../" * (f.length - common)) + t.drop(common).mkString("/")
  }

  /** ディレクトリとファイル名をつなぎます */
  def join(dir: String, name: String): String = if (dir.isEmpty) name else s"${dir.stripSuffix("/")}/$name"
}

/** 1つの表示領域(ペイン)の状態 */
final class PaneState(val id: Int, val file: RV[Option[String]], val mode: RV[Mode])

/** 右側の領域の分割. 葉が1つのペイン、節が縦または横の2分割 */
sealed trait Layout {
  def panes: List[PaneState] = this match {
    case Layout.Leaf(p) => List(p)
    case s: Layout.Split => s.a.panes ++ s.b.panes
  }
}

object Layout {
  final case class Leaf(pane: PaneState) extends Layout

  /** vertical = true なら上下に、false なら左右に並べる. ratio は先頭(a)の割合 */
  final case class Split(vertical: Boolean, ratio: RV[Double], a: Layout, b: Layout) extends Layout
}

/** 保存の通知(同じファイルを開いている他のペイン・プレビューに反映するため) */
final case class Saved(path: String, content: String, source: Int, seq: Int)

/** アプリ全体の状態 */
object Store {

  val MaxPanes = 4

  /** 開いているワークスペース(絶対パス) */
  val workspace: RV[Option[String]] = RV(None)
  val tree: RV[List[Entry]] = RV(Nil)
  /** ツリーで開いているディレクトリ */
  val expanded: RV[Set[String]] = RV(Set.empty)

  private var paneSeq = 0

  private def newPane(file: Option[String], mode: Mode): PaneState = {
    paneSeq += 1
    PaneState(paneSeq, RV(file), RV(mode))
  }

  val layout: RV[Layout] = RV(Layout.Leaf(newPane(None, Mode.Html)))
  /** 操作対象のペイン(ツリーで選んだファイルを開く先) */
  val active: RV[Int] = RV(1)
  val saved: RV[Option[Saved]] = RV(None)
  private var savedSeq = 0
  val toast: RV[String] = RV("")

  def notifySaved(path: String, content: String, source: Int): Unit = {
    savedSeq += 1
    saved := Some(Saved(path, content, source, savedSeq))
  }

  def activePane: Option[PaneState] = layout.v.panes.find(_.id == active.v).orElse(layout.v.panes.headOption)

  def paneCount: Int = layout.v.panes.length

  // ---- ワークスペース ----

  def open(path: String): Future[Unit] =
    Host.openWorkspace(path).flatMap { root =>
      workspace := Some(root)
      expanded := Set.empty
      val p = newPane(None, Mode.Html)
      layout := Layout.Leaf(p)
      active := p.id
      reloadTree()
    }.andThen { case Failure(e) => Host.report(e) }

  def close(): Unit = workspace := None

  def reloadTree(): Future[Unit] = Host.listTree().map(tree := _).andThen { case Failure(e) => Host.report(e) }

  /** HTMLを操作対象のペインで開きます */
  def openFile(path: String): Unit = activePane.foreach(_.file := Some(path))

  def toggleDir(path: String): Unit = expanded := (if (expanded.v(path)) expanded.v - path else expanded.v + path)

  def createDir(parent: String, name: String): Unit = {
    val path = Paths.join(parent, name)
    Host.createDir(path).flatMap { _ =>
      expanded := expanded.v ++ Set(path, parent).filter(_.nonEmpty)
      reloadTree()
    }.onComplete {
      case Failure(e) => Host.report(e)
      case Success(_) =>
    }
  }

  def createHtml(parent: String, name: String): Unit =
    Host.createHtml(Paths.join(parent, name)).flatMap { path =>
      if (parent.nonEmpty) expanded := expanded.v + parent
      reloadTree().map(_ => openFile(path))
    }.onComplete {
      case Failure(e) => Host.report(e)
      case Success(_) =>
    }

  /** ツリーにあるHTMLのパスすべて */
  def allHtml: List[String] = {
    def go(es: List[Entry]): List[String] = es.flatMap(e => if (e.dir) go(e.children) else List(e.path))
    go(tree.v)
  }

  /** ディレクトリに layout.html を作ります(既にあればそれを開く) */
  def createLayout(parent: String): Unit = {
    val path = Paths.join(parent, "layout.html")
    if (allHtml.exists(_.equalsIgnoreCase(path))) openFile(path) else createHtml(parent, "layout.html")
  }

  // ---- 分割 ----

  private def mapLeaf(l: Layout, id: Int)(f: Layout.Leaf => Layout): Layout = l match {
    case leaf @ Layout.Leaf(p) => if (p.id == id) f(leaf) else leaf
    case s: Layout.Split => s.copy(a = mapLeaf(s.a, id)(f), b = mapLeaf(s.b, id)(f))
  }

  /** ペインを分割します(新しいペインは同じファイル・モードで開く) */
  def split(id: Int, vertical: Boolean): Unit = if (paneCount < MaxPanes) {
    val created = layout.v.panes.find(_.id == id).map(p => newPane(p.file.v, p.mode.v))
    created.foreach { np =>
      layout := mapLeaf(layout.v, id)(leaf => Layout.Split(vertical, RV(0.5), leaf, Layout.Leaf(np)))
      active := np.id
    }
  }

  /** ドラッグ中のペイン */
  val dragging: RV[Option[Int]] = RV(None)

  /** 2つのペインの位置を入れ替えます */
  def swap(a: Int, b: Int): Unit = if (a != b) {
    val ps = layout.v.panes
    for (pa <- ps.find(_.id == a); pb <- ps.find(_.id == b)) {
      def go(l: Layout): Layout = l match {
        case Layout.Leaf(p) => Layout.Leaf(if (p.id == a) pb else if (p.id == b) pa else p)
        case s: Layout.Split => s.copy(a = go(s.a), b = go(s.b))
      }
      layout := go(layout.v)
    }
  }

  /** ペインを閉じます(最後の1つは閉じない) */
  def closePane(id: Int): Unit = {
    def remove(l: Layout): Layout = l match {
      case s: Layout.Split =>
        (s.a, s.b) match {
          case (Layout.Leaf(p), other) if p.id == id => other
          case (other, Layout.Leaf(p)) if p.id == id => other
          case _ => s.copy(a = remove(s.a), b = remove(s.b))
        }
      case leaf => leaf
    }
    if (paneCount > 1) {
      layout := remove(layout.v)
      if (active.v == id) layout.v.panes.headOption.foreach(p => active := p.id)
    }
  }
}
