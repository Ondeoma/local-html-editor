package lhe

import io.github.ondeoma.scalactive.components.ComponentManager.*
import org.scalajs.dom.document.body
import lhe.views.{AppView, Dialogs}

import scala.scalajs.js
import scala.scalajs.js.JSConverters.*
import scala.scalajs.concurrent.JSExecutionContext.Implicits.queue

object App {

  @main
  def main(): Unit = {
    // エディタ(JS)から使う入力ダイアログ
    org.scalajs.dom.window.asInstanceOf[js.Dynamic].__lhePrompt = (title: String, value: String, suggestions: js.Array[String]) =>
      Dialogs.prompt(title, value, suggestions.toList).map(_.orNull).toJSPromise
    AppView()(body, AddMethod.appendS(IdSelector("app"))).init()
  }

}
