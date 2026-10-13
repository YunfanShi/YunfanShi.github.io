# Actual GitHub source review

Retrieved 2026-10-14. Layout ideas were evaluated; no third-party source, fonts, assets or dependencies were copied.

- WatchReader: https://github.com/yingwang/WatchReader/blob/HEAD/shared/src/main/java/com/watchreader/shared/reader/PageGeometry.kt — rectangle inscribed in the round display; width and line count trade-off. We independently compute a native ScrollView rectangle, including real control reservation.
- WatchReader: https://github.com/yingwang/WatchReader/blob/HEAD/wear/src/main/java/com/watchreader/wear/ui/screen/ReaderScreen.kt — reading and controls occupy separate layers.
- wBooks: https://github.com/FredApps/wBooks/blob/HEAD/app/src/main/kotlin/com/fredapp/wbooks/ui/reader/NormalMode.kt — native continuous list scrolling, rotary support, bounded scroll steps, position restoration, autoscroll pause. Its small side padding is not directly suitable for our fixed full-line round viewport.
- wearbook: https://github.com/ZPW38/wearbook/blob/HEAD/app/src/main/java/com/webook/watch/ui/ReaderScreen.kt — explicit text width and body height, separate status-bar reservation, scroll and page modes. Our round layout adds circle safety rather than copying rectangular insets.

The reader retains Android Views, no Compose migration or WebView. The original 18sp default is unchanged. At 400x400 density 1 the new round text box is 288x268; square is 376x312. Geometry tests include 192/320/400/466 round diameters and density-scaled controls.
