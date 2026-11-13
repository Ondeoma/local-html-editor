package lhe

import org.scalajs.dom
import org.scalajs.dom.MouseEvent

/** 境界線のドラッグ(幅・比率の変更)の共通処理 */
object Drag {

  /** マウスを離すまで onMove を呼びます. ドラッグ中は iframe がマウスを奪わないようにする */
  def start(onMove: MouseEvent => Unit): Unit = {
    val body = dom.document.body
    body.classList.add("dragging")
    lazy val move: scalajs.js.Function1[MouseEvent, Unit] = (e: MouseEvent) => onMove(e)
    lazy val up: scalajs.js.Function1[MouseEvent, Unit] = (_: MouseEvent) => {
      body.classList.remove("dragging")
      dom.document.removeEventListener("mousemove", move)
      dom.document.removeEventListener("mouseup", up)
    }
    dom.document.addEventListener("mousemove", move)
    dom.document.addEventListener("mouseup", up)
  }
}
