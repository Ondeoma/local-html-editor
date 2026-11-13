package lhe

/** ファイルの曖昧検索. 入力の文字が順番どおりに含まれていれば一致とする(間に他の文字があってよい) */
object Fuzzy {

  /** 一致したファイル. segments は表示用(文字列, 一致した部分か) */
  final case class Hit(path: String, score: Int, segments: List[(String, Boolean)])

  /**
   * query をパスと照合します. 空白区切りの語はすべて一致する必要がある(順不同).
   * 点数は、ファイル名での一致・連続した一致・単語の先頭での一致を高くする.
   */
  def matchPath(query: String, path: String): Option[Hit] = {
    val lower = path.toLowerCase
    val nameStart = path.lastIndexOf('/') + 1
    val terms = query.toLowerCase.split("\\s+").filter(_.nonEmpty).toList
    if (terms.isEmpty) return None

    /** term を from 以降で順に探し、一致した位置(見つからなければ None) */
    def find(term: String, from: Int): Option[List[Int]] = {
      var i = from
      val pos = List.newBuilder[Int]
      for (c <- term) {
        i = lower.indexOf(c, i)
        if (i < 0) return None
        pos += i
        i += 1
      }
      Some(pos.result())
    }

    val matched = terms.map { t =>
      // ファイル名の中で見つかればそちらを優先する
      find(t, nameStart).map(_ -> true).orElse(find(t, 0).map(_ -> false))
    }
    if (matched.exists(_.isEmpty)) return None

    var score = 0
    val all = scala.collection.mutable.Set.empty[Int]
    matched.flatten.foreach { case (ps, inName) =>
      if (inName) score += 20
      ps.zipWithIndex.foreach { case (p, k) =>
        all += p
        if (k > 0 && ps(k - 1) == p - 1) score += 8 // 連続
        if (p == 0 || "/_-. ".contains(path(p - 1))) score += 6 // 単語の先頭
        if (p == nameStart) score += 10
      }
      score -= (ps.last - ps.head - ps.length + 1) // 間の文字数
    }
    score -= path.length / 10 // 短いパスを少し優先

    // 表示用に、一致した文字とそれ以外を区切る
    val segs = List.newBuilder[(String, Boolean)]
    val buf = new StringBuilder
    var cur = false
    path.indices.foreach { i =>
      val m = all(i)
      if (m != cur && buf.nonEmpty) { segs += buf.toString -> cur; buf.clear() }
      cur = m
      buf += path(i)
    }
    if (buf.nonEmpty) segs += buf.toString -> cur
    Some(Hit(path, score, segs.result()))
  }

  /** パスの一覧を絞り込み、点数の高い順に並べます */
  def filter(query: String, paths: List[String]): List[Hit] =
    paths.flatMap(matchPath(query, _)).sortBy(h => (-h.score, h.path))
}
