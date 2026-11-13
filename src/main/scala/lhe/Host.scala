package lhe

import scala.concurrent.Future
import scala.scalajs.concurrent.JSExecutionContext.Implicits.queue
import scala.scalajs.js
import scala.scalajs.js.annotation.JSGlobal
import org.scalajs.dom

/** js/bridge.js が用意する JS の機能 */
@js.native
@JSGlobal("__lhe")
private object HostFacade extends js.Object {
  def invoke(cmd: String, args: js.Any): js.Promise[js.Any] = js.native
  def fileUrl(rel: String): String = js.native
  def pickDirectory(): js.Promise[String | Null] = js.native
  def createWysiwyg(el: dom.Element, opts: js.Object): WysiwygHandle = js.native
  def createCodeEditor(el: dom.Element, opts: js.Object): CodeHandle = js.native
  def panelPresets: js.Array[js.Dynamic] = js.native
}

/** WYSIWYG エディタ(js/wysiwyg.js) */
@js.native
trait WysiwygHandle extends js.Object {
  def exec(name: String, arg: js.Any = js.undefined): Unit = js.native
  def setContent(html: String): Unit = js.native
  def focus(): Unit = js.native
  def destroy(): Unit = js.native
}

/** CSS・JS エディタ(js/code.js) */
@js.native
trait CodeHandle extends js.Object {
  def setText(text: String): Unit = js.native
  def focus(): Unit = js.native
  def destroy(): Unit = js.native
}

/** ワークスペースのツリーの項目(Rust の workspace::Entry) */
@js.native
trait EntryJs extends js.Object {
  val name: String = js.native
  val path: String = js.native
  val dir: Boolean = js.native
  val children: js.Array[EntryJs] = js.native
}

final case class Entry(name: String, path: String, dir: Boolean, children: List[Entry])

object Entry {
  def from(e: EntryJs): Entry = Entry(e.name, e.path, e.dir, e.children.toList.map(from))
}

/** Rust 側のコマンドの呼び出し */
object Host {

  private def call[A](cmd: String, args: (String, js.Any)*): Future[A] =
    HostFacade.invoke(cmd, js.Dictionary(args*)).toFuture.map(_.asInstanceOf[A])

  def recentList(): Future[List[String]] = call[js.Array[String]]("recent_list").map(_.toList)
  def recentRemove(path: String): Future[Unit] = call[Unit]("recent_remove", "path" -> path)
  def openWorkspace(path: String): Future[String] = call[String]("open_workspace", "path" -> path)
  def listTree(): Future[List[Entry]] = call[js.Array[EntryJs]]("list_tree").map(_.toList.map(Entry.from))
  def createDir(path: String): Future[Unit] = call[Unit]("create_dir", "path" -> path)
  def createHtml(path: String): Future[String] = call[String]("create_html", "path" -> path)
  def readText(path: String): Future[Option[String]] = call[String | Null]("read_text", "path" -> path).map(v => Option(v.asInstanceOf[String]))
  def writeText(path: String, content: String): Future[Unit] = call[Unit]("write_text", "path" -> path, "content" -> content)
  def loadHtml(path: String): Future[String] = call[String]("load_html", "path" -> path)
  def saveHtml(path: String, title: String, content: String): Future[Unit] =
    call[Unit]("save_html", "path" -> path, "title" -> title, "content" -> content)

  def copyName(path: String): Future[String] = call[String]("copy_name", "path" -> path)
  def duplicateHtml(path: String, name: String): Future[String] = call[String]("duplicate_html", "path" -> path, "name" -> name)

  /** Finder(Windows はエクスプローラー)で表示します */
  def reveal(path: String): Future[Unit] = call[Unit]("reveal", "path" -> path)

  def pickDirectory(): Future[Option[String]] = HostFacade.pickDirectory().toFuture.map(v => Option(v.asInstanceOf[String]))
  def fileUrl(rel: String): String = HostFacade.fileUrl(rel)
  def createWysiwyg(el: dom.Element, opts: js.Object): WysiwygHandle = HostFacade.createWysiwyg(el, opts)
  def createCodeEditor(el: dom.Element, opts: js.Object): CodeHandle = HostFacade.createCodeEditor(el, opts)

  /** パネルの組み合わせ (id, 表示名, アイコン) */
  lazy val panelPresets: List[(String, String, String)] =
    HostFacade.panelPresets.toList.map(p => (p.id.asInstanceOf[String], p.label.asInstanceOf[String], p.icon.asInstanceOf[String]))

  /** エラーを画面下部に表示します */
  def report(e: Throwable): Unit = {
    val msg = e match {
      case js.JavaScriptException(v) => v.toString
      case _ => e.getMessage
    }
    dom.console.error(msg)
    Store.toast := msg
  }

}
