package lhe

import org.scalajs.dom

import scala.concurrent.Future
import scala.scalajs.concurrent.JSExecutionContext.Implicits.queue
import scala.util.Failure

/**
 * 入力が落ち着いてから保存する(リアルタイム保存). 画面を閉じるときは flush で残りを保存する.
 * @param save 保存する処理. 最後に schedule に渡した値を受け取る
 */
final class Saver[A](delayMs: Int)(save: A => Future[Unit]) {
  private var timer: Option[Int] = None
  private var pending: Option[A] = None

  def schedule(v: A): Unit = {
    pending = Some(v)
    timer.foreach(dom.window.clearTimeout)
    timer = Some(dom.window.setTimeout(() => flush(), delayMs))
  }

  def flush(): Unit = {
    timer.foreach(dom.window.clearTimeout)
    timer = None
    pending.foreach { v =>
      pending = None
      save(v).onComplete { case Failure(e) => Host.report(e); case _ => }
    }
  }
}
