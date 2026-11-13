ThisBuild / organization := "lhe"
ThisBuild / scalaVersion := "3.3.7"
ThisBuild / version      := "0.1.0"
ThisBuild / scalacOptions ++= Seq("-deprecation", "-feature")

// フロントエンド(Scala.js + Scalactive). Viteから読み込み、Tauriのウェブビューで表示する
lazy val root = (project in file("."))
  .enablePlugins(ScalaJSPlugin, ScalactivePlugin)
  .settings(
    name := "local-html-editor",
    scalaJSUseMainModuleInitializer := true,
    scalaJSLinkerConfig ~= (_.withModuleKind(ModuleKind.ESModule)),
    libraryDependencies ++= Seq(
      "io.github.ondeoma" %%% "scalactive" % "0.6.2"
    )
  )
