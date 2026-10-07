// Interface languages: Simplified Chinese, Japanese, English.
//
// Choice order: ?lang= in the URL (shared / search-engine links), then the
// visitor's saved choice, then the device languages (zh-* → zh, ja-* → ja),
// and English for everyone else.
//
// Static text in index.html is marked with data-i18n (text), data-i18n-html
// (text with links) and data-i18n-attr="attr:key;attr:key". Text built in
// app.js goes through t(). Keep the three dictionaries in step: every key in
// zh must exist in ja and en.

// manifest: the installed app's name follows the language (same app id "/").
const LANGS = {
  zh: { htmlLang: "zh-CN", locale: "zh-CN", name: "简体中文", manifest: "/manifest.webmanifest" },
  ja: { htmlLang: "ja", locale: "ja-JP", name: "日本語", manifest: "/manifest-ja.webmanifest" },
  en: { htmlLang: "en", locale: "en-US", name: "English", manifest: "/manifest-en.webmanifest" },
};

const LANG_KEY = "lang-pref";

const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
const L = {
  frankfurter: link("https://frankfurter.dev", "Frankfurter"),
  currencyApi: link("https://github.com/fawazahmed0/exchange-api", "currency-api"),
  m3: link("https://m3.material.io", "Material 3 Expressive"),
  compose: link("https://github.com/androidx/androidx/tree/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens", "Jetpack Compose Material 3"),
  font: link("https://fonts.google.com/specimen/Google+Sans+Flex", "Google Sans Flex"),
  icons: link("https://fonts.google.com/icons", "Material Symbols"),
  github: link("https://github.com/Saki340/cny-jpy-rate", "GitHub"),
};

const I18N = {
  zh: {
    "doc.title": "日元人民币汇率 | 汇率板",
    "doc.description": "日元兑人民币（JPY ⇄ CNY）每日中间汇率（欧洲央行参考汇率）：金额换算支持算式，可保存房租等常用金额，附 30 天至 1 年的历史走势和近一年汇率位置。免费、无广告，支持深色模式。",
    "doc.siteName": "汇率板",
    "app.title": "日元人民币汇率",
    "theme.label": "主题",
    "theme.light": "浅色",
    "theme.auto": "系统",
    "theme.dark": "深色",
    "lang.label": "语言",
    "lang.auto": "跟随设备语言",
    "loading": "加载中",
    "section.rate": "今日汇率",
    "section.calc": "换算计算器",
    "section.chart": "历史走势",
    "section.mc": "Mastercard 官方换算器",
    "board.note": "欧洲央行每个工作日公布一次参考汇率，周末和节假日沿用上一个工作日的数据。",
    "board.next": "下次更新：{day} {time} 左右（当地时间）",
    "day.today": "今天",
    "day.tomorrow": "明天",
    "day.weekday": ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    "weekday.short": ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    "updated": "数据日期 {date} · 欧洲央行参考汇率（{link}）",
    "updated.fallback": "数据日期 {date} · 欧洲央行数据暂不可用，当前为备用源 {link}",
    "rate.error": "汇率获取失败，请稍后刷新页面重试。",
    "change.label": "较前一日（{date}）",
    "swap": "切换兑换方向",
    "calc.amount": "金额（{cur}）",
    "calc.result": "折合 {cur}",
    "calc.copyHint": "点击复制",
    "calc.pair": "{a} {from} ≈ {b} {to}",
    "section.date": "按日期查汇率",
    "date.label": "日期",
    "date.hint": "选择一个日期，查看当天的欧洲央行参考汇率，以及计算器中的金额在当天折合多少。可查 2005 年以来的任意一天。",
    "date.on": "{date}（{weekday}）的参考汇率",
    "date.fallback": "{asked} 没有公布汇率（周末或节假日），显示的是之前最近一个工作日 {date}（{weekday}）的汇率。",
    "date.loading": "查询中…",
    "date.error": "查询失败，请稍后再试。",
    "chart.ma": "30 日均线",
    "readout.ma": "30 日均线 {v}",
    "tooltip.ma": "30 日均线 {v}",
    "more.label": "更多选项",
    "more.shortcuts": "键盘快捷键",
    "more.install": "添加到桌面",
    "more.about": "数据来源与说明",
    "more.github": "GitHub 源码",
    "shortcut.title": "键盘快捷键",
    "shortcut.amount": "输入金额",
    "shortcut.swap": "切换兑换方向",
    "shortcut.range": "切换走势范围（30 天 / 90 天 / 180 天 / 1 年）",
    "shortcut.date": "按日期查汇率",
    "shortcut.help": "显示快捷键说明",
    "shortcut.close": "知道了",
    "calc.copy": "复制换算结果",
    "calc.share": "分享换算结果",
    "range.label": "时间范围",
    "range.30": "30 天",
    "range.90": "90 天",
    "range.180": "180 天",
    "range.365": "1 年",
    "readout.latest": "最新",
    "readout.range": "区间",
    "readout.high": "最高",
    "readout.low": "最低",
    "readout.fallback": "备用源",
    "chart.high": "高",
    "chart.low": "低",
    "chart.aria": "1 {from} 兑 {to} 的历史走势。可用左右方向键查看每一天的汇率。",
    "chart.error": "历史走势暂时加载失败，请稍后刷新重试。",
    "tooltip.latest": "最新数据",
    "tooltip.toLatest": "至最新 {pct}",
    "mc.note": "用万事达卡在海外刷卡时，入账按万事达的结算汇率计算，其中含有汇率差价，通常和本页的中间价略有不同；发卡行还可能另收货币转换费。实际金额请以万事达官方换算器和发卡行账单为准。",
    "mc.open": "打开万事达官方换算器",
    "rank.label": "今日汇率在近一年中的位置",
    "rank.verdict": "{from} → {to}：{level}",
    "rank.levelHigh": "处于近一年较高水平",
    "rank.levelMid": "处于近一年中间水平",
    "rank.levelLow": "处于近一年较低水平",
    "rank.pct": "高于近一年 {p}% 的日子",
    "rank.low": "一年最低 {v}",
    "rank.high": "最高 {v}",
    "amount.invalid": "无法计算这个算式",
    "amount.preview": "= {v}",
    "keys.label": "运算符",
    "section.saved": "常用金额",
    "saved.add": "添加",
    "saved.empty": "把每月房租、学费等常用金额保存在这里，每次打开网站都会按最新汇率算好。数据只保存在这台设备的浏览器里。",
    "saved.dialogAdd": "添加常用金额",
    "saved.dialogEdit": "编辑常用金额",
    "saved.name": "名称（可选，如：房租）",
    "saved.amount": "金额",
    "saved.currency": "币种",
    "saved.delete": "删除",
    "saved.cancel": "取消",
    "saved.save": "保存",
    "saved.done": "已保存",
    "saved.deleted": "已删除「{name}」",
    "saved.undo": "撤销",
    "saved.edit": "编辑「{name}」",
    "saved.full": "最多保存 {n} 个常用金额",
    "saved.invalid": "请输入大于 0 的金额",
    "install.title": "添加到桌面",
    "install.desc": "像 App 一样从桌面打开，离线时也能查看上次获取的汇率。",
    "install.ios": "点浏览器的「分享」按钮，再选「添加到主屏幕」，就能像 App 一样从桌面打开。",
    "install.dismiss": "不用了",
    "install.ok": "知道了",
    "install.button": "安装",
    "install.otherBrowser": "在手机上安装建议使用 Chrome。用其他浏览器安装时，系统可能会提示「这是为旧版 Android 设计的应用」。",
    "install.chrome": "用 Chrome 打开",
    "offline.date": "当前离线，显示的是 {date} 的汇率",
    "offline.plain": "当前离线，网络恢复后会自动更新",
    "notify.copied": "已复制 {value} {cur}",
    "notify.copyFail": "复制失败，请手动选择数字复制",
    "notify.online": "已恢复联网",
    "notify.installed": "已添加到桌面",
    "notify.shareCopied": "已复制分享文字和链接",
    "notify.shareFail": "分享失败，请手动复制地址栏中的链接",
    "share.title": "日元人民币汇率",
    "share.text": "{a} {from} ≈ {b} {to}（{date} {source}）",
    "share.source": "欧洲央行参考汇率",
    "share.sourceFallback": "参考汇率",
    "footer.data": `今日汇率、换算和历史走势使用同一数据源：欧洲央行（ECB）参考汇率（Source: ECB statistics），经 ${L.frankfurter} 获取，每个工作日更新一次。欧洲央行公布的是欧元兑各货币的汇率，本站的日元人民币汇率由此交叉计算得出，仅供参考。Frankfurter 暂时不可用时，改用社区维护的 ${L.currencyApi} 作为备用，页面会注明。以上均为中间汇率，不含任何机构的实际买卖点差。`,
    "footer.ui": `界面按 ${L.m3} 设计规范自行实现，配色、字号、形状、动效和各组件的尺寸取自 ${L.compose} 源码中的设计令牌；字体为 ${L.font}，图标为 ${L.icons}。`,
    "footer.github": `本项目开源于 ${L.github}，欢迎提交 Issue 反馈问题。`,
    "footer.privacy": "隐私：本站不使用 Cookie，也没有账号。网站托管在 Cloudflare，Cloudflare 会为运行和安全记录访问日志（含 IP 地址和浏览器信息），并提供不使用 Cookie 的匿名访问统计；这些信息只用于维护本站，不提供给其他第三方。主题、语言、换算方向和常用金额只保存在你的浏览器里，不会上传。",
    "footer.disclaimer": "本网站仅提供汇率查询与换算参考功能，不构成任何金融、投资或法律建议，也不对因使用本站数据造成的任何损失承担责任；具体交易请以银行、支付机构或万事达官方渠道公布的汇率为准。Mastercard 是其所有者的注册商标，本站与其没有关联。",
  },

  ja: {
    "doc.title": "円・人民元 為替レート | レートボード",
    "doc.description": "日本円と人民元（JPY ⇄ CNY）の毎日の仲値（欧州中央銀行の参照レート）。計算式に対応した換算、家賃などよく使う金額の保存、30日〜1年のチャートと過去1年でのレートの位置を確認できます。無料・広告なし・ダークモード対応。",
    "doc.siteName": "レートボード",
    "app.title": "円・人民元レート",
    "theme.label": "テーマ",
    "theme.light": "ライト",
    "theme.auto": "自動",
    "theme.dark": "ダーク",
    "lang.label": "言語",
    "lang.auto": "端末の言語に合わせる",
    "loading": "読み込み中",
    "section.rate": "本日のレート",
    "section.calc": "通貨換算",
    "section.chart": "レートの推移",
    "section.mc": "Mastercard 公式換算ツール",
    "board.note": "欧州中央銀行が営業日ごとに参照レートを公表します。土日・祝日は直前の営業日のレートです。",
    "board.next": "次回更新：{day} {time}ごろ（現地時間）",
    "day.today": "今日",
    "day.tomorrow": "明日",
    "day.weekday": ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"],
    "weekday.short": ["(日)", "(月)", "(火)", "(水)", "(木)", "(金)", "(土)"],
    "updated": "データ日付 {date} · 欧州中央銀行の参照レート（{link}）",
    "updated.fallback": "データ日付 {date} · 欧州中央銀行のデータを取得できないため、予備ソース {link} を表示中",
    "rate.error": "レートを取得できませんでした。しばらくしてから再読み込みしてください。",
    "change.label": "前日比（{date}）",
    "swap": "換算の向きを切り替え",
    "calc.amount": "金額（{cur}）",
    "calc.result": "{cur} 換算",
    "calc.copyHint": "クリックでコピー",
    "calc.pair": "{a} {from} ≈ {b} {to}",
    "section.date": "日付でレートを調べる",
    "date.label": "日付",
    "date.hint": "日付を選ぶと、その日の欧州中央銀行の参照レートと、換算ツールの金額がその日にいくらだったかを表示します。2005年以降の任意の日を調べられます。",
    "date.on": "{date} {weekday} の参照レート",
    "date.fallback": "{asked} はレートの公表がない日（土日・祝日）のため、直前の営業日 {date} {weekday} のレートを表示しています。",
    "date.loading": "取得中…",
    "date.error": "取得できませんでした。しばらくしてから再度お試しください。",
    "chart.ma": "30日移動平均",
    "readout.ma": "30日移動平均 {v}",
    "tooltip.ma": "30日移動平均 {v}",
    "more.label": "その他のオプション",
    "more.shortcuts": "キーボードショートカット",
    "more.install": "ホーム画面に追加",
    "more.about": "データソースと注意事項",
    "more.github": "GitHub のソースコード",
    "shortcut.title": "キーボードショートカット",
    "shortcut.amount": "金額を入力",
    "shortcut.swap": "換算の向きを切り替え",
    "shortcut.range": "チャートの期間を切り替え（30日 / 90日 / 180日 / 1年）",
    "shortcut.date": "日付でレートを調べる",
    "shortcut.help": "ショートカットの一覧を表示",
    "shortcut.close": "閉じる",
    "calc.copy": "換算結果をコピー",
    "calc.share": "換算結果を共有",
    "range.label": "期間",
    "range.30": "30日",
    "range.90": "90日",
    "range.180": "180日",
    "range.365": "1年",
    "readout.latest": "最新",
    "readout.range": "期間",
    "readout.high": "最高値",
    "readout.low": "最安値",
    "readout.fallback": "予備ソース",
    "chart.high": "高",
    "chart.low": "安",
    "chart.aria": "1 {from} あたりの {to} の推移。左右の矢印キーで日ごとのレートを確認できます。",
    "chart.error": "推移を読み込めませんでした。しばらくしてから再読み込みしてください。",
    "tooltip.latest": "最新データ",
    "tooltip.toLatest": "最新まで {pct}",
    "mc.note": "海外で Mastercard を使って支払うと、Mastercard の決済レートで請求されます。このレートには為替の差額が含まれ、本ページの仲値とは少し異なります。カード会社が別途、海外事務手数料を加算する場合もあります。正確な金額は Mastercard 公式の換算ツールとカードの明細でご確認ください。",
    "mc.open": "Mastercard 公式ツールを開く",
    "rank.label": "本日のレートの過去1年での位置",
    "rank.verdict": "{from}→{to}：{level}",
    "rank.levelHigh": "過去1年で高い水準",
    "rank.levelMid": "過去1年で中間の水準",
    "rank.levelLow": "過去1年で低い水準",
    "rank.pct": "過去1年の {p}% の日より高いレート",
    "rank.low": "1年の最低 {v}",
    "rank.high": "最高 {v}",
    "amount.invalid": "この式は計算できません",
    "amount.preview": "= {v}",
    "keys.label": "演算子",
    "section.saved": "よく使う金額",
    "saved.add": "追加",
    "saved.empty": "毎月の家賃や学費など、よく使う金額を保存しておくと、開くたびに最新のレートで換算されます。データはこの端末のブラウザにだけ保存されます。",
    "saved.dialogAdd": "よく使う金額を追加",
    "saved.dialogEdit": "よく使う金額を編集",
    "saved.name": "名前（任意。例：家賃）",
    "saved.amount": "金額",
    "saved.currency": "通貨",
    "saved.delete": "削除",
    "saved.cancel": "キャンセル",
    "saved.save": "保存",
    "saved.done": "保存しました",
    "saved.deleted": "「{name}」を削除しました",
    "saved.undo": "元に戻す",
    "saved.edit": "「{name}」を編集",
    "saved.full": "保存できるのは {n} 件までです",
    "saved.invalid": "0 より大きい金額を入力してください",
    "install.title": "ホーム画面に追加",
    "install.desc": "アプリのようにホーム画面から開けて、オフラインでも前回取得したレートを確認できます。",
    "install.ios": "ブラウザの「共有」ボタンから「ホーム画面に追加」を選ぶと、アプリのように開けます。",
    "install.dismiss": "今はしない",
    "install.ok": "OK",
    "install.button": "インストール",
    "install.otherBrowser": "スマートフォンへのインストールには Chrome をおすすめします。ほかのブラウザからインストールすると、「古いバージョンの Android 向けに作成されたアプリ」という警告が表示されることがあります。",
    "install.chrome": "Chrome で開く",
    "offline.date": "オフラインです。{date} のレートを表示しています",
    "offline.plain": "オフラインです。接続が戻ると自動で更新します",
    "notify.copied": "{value} {cur} をコピーしました",
    "notify.copyFail": "コピーできませんでした。数字を選択してコピーしてください",
    "notify.online": "オンラインに戻りました",
    "notify.installed": "ホーム画面に追加しました",
    "notify.shareCopied": "共有用のテキストとリンクをコピーしました",
    "notify.shareFail": "共有できませんでした。アドレスバーのリンクをコピーしてください",
    "share.title": "円・人民元レート",
    "share.text": "{a} {from} ≈ {b} {to}（{date} {source}）",
    "share.source": "欧州中央銀行の参照レート",
    "share.sourceFallback": "参考レート",
    "footer.data": `本日のレート、換算、推移はすべて同じデータソースを使用しています：欧州中央銀行（ECB）の参照レート（Source: ECB statistics。${L.frankfurter} 経由、営業日ごとに更新）。ECB が公表するのはユーロに対する各通貨のレートで、本サイトの円・人民元レートはそこから計算したクロスレートです（参考値）。Frankfurter を利用できない場合は、コミュニティが運営する ${L.currencyApi} を予備として使い、その旨をページに表示します。いずれも仲値で、金融機関の実際の売買スプレッドは含みません。`,
    "footer.ui": `UI は ${L.m3} のデザインガイドラインに沿って独自に実装し、配色、文字サイズ、シェイプ、モーション、各コンポーネントの寸法は ${L.compose} のソースコードにあるデザイントークンに基づいています。フォントは ${L.font}、アイコンは ${L.icons} です。`,
    "footer.github": `このプロジェクトは ${L.github} で公開しています。不具合などは Issue でお知らせください。`,
    "footer.privacy": "プライバシー：本サイトは Cookie を使用せず、アカウントもありません。本サイトは Cloudflare 上で運営されており、運用とセキュリティのため Cloudflare がアクセスログ（IP アドレス、ブラウザ情報を含む）を記録し、Cookie を使わない匿名のアクセス統計を提供します。これらはサイトの維持にのみ使用し、ほかの第三者には提供しません。テーマ、言語、換算の向き、よく使う金額はお使いのブラウザにのみ保存され、送信されません。",
    "footer.disclaimer": "本サイトは為替レートの参照と換算のみを目的としており、金融・投資・法律上の助言ではありません。本サイトのデータの利用によって生じたいかなる損害についても責任を負いません。実際の取引では、銀行、決済事業者、または Mastercard 公式が公表するレートをご確認ください。Mastercard はその所有者の登録商標であり、本サイトとは関係ありません。",
  },

  en: {
    "doc.title": "JPY to CNY Exchange Rate | Rate Board",
    "doc.description": "Daily mid-market JPY ⇄ CNY exchange rate (European Central Bank reference rate) with a converter that handles arithmetic, saved amounts like rent, and 30-day to 1-year charts showing where today's rate stands. Free, no ads, dark mode.",
    "doc.siteName": "Rate Board",
    "app.title": "Yen–Yuan Rate",
    "theme.label": "Theme",
    "theme.light": "Light",
    "theme.auto": "Auto",
    "theme.dark": "Dark",
    "lang.label": "Language",
    "lang.auto": "Device language",
    "loading": "Loading",
    "section.rate": "Today's rate",
    "section.calc": "Converter",
    "section.chart": "History",
    "section.mc": "Mastercard converter",
    "board.note": "The ECB publishes reference rates on working days; weekends and holidays show the previous working day's rate.",
    "board.next": "Next update: {day} around {time} (your time)",
    "day.today": "today",
    "day.tomorrow": "tomorrow",
    "day.weekday": ["on Sunday", "on Monday", "on Tuesday", "on Wednesday", "on Thursday", "on Friday", "on Saturday"],
    "weekday.short": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    "updated": "Data as of {date} · ECB reference rate ({link})",
    "updated.fallback": "Data as of {date} · ECB data unavailable, showing backup source {link}",
    "rate.error": "Couldn't load the rate. Please reload the page later.",
    "change.label": "vs. previous day ({date})",
    "swap": "Swap direction",
    "calc.amount": "Amount ({cur})",
    "calc.result": "In {cur}",
    "calc.copyHint": "Click to copy",
    "calc.pair": "{a} {from} ≈ {b} {to}",
    "section.date": "Rate on a date",
    "date.label": "Date",
    "date.hint": "Pick a date to see that day's ECB reference rate and what the converter's amount was worth then. Any day since 2005.",
    "date.on": "Reference rate for {date} ({weekday})",
    "date.fallback": "No rate was published on {asked} (weekend or holiday); showing the previous working day, {date} ({weekday}).",
    "date.loading": "Loading…",
    "date.error": "Couldn't load the rate. Please try again later.",
    "chart.ma": "30-day average",
    "readout.ma": "30-day average {v}",
    "tooltip.ma": "30-day average {v}",
    "more.label": "More options",
    "more.shortcuts": "Keyboard shortcuts",
    "more.install": "Add to home screen",
    "more.about": "Data sources & notes",
    "more.github": "Source on GitHub",
    "shortcut.title": "Keyboard shortcuts",
    "shortcut.amount": "Enter an amount",
    "shortcut.swap": "Swap direction",
    "shortcut.range": "Change the chart range (30D / 90D / 180D / 1Y)",
    "shortcut.date": "Look up a date",
    "shortcut.help": "Show these shortcuts",
    "shortcut.close": "Close",
    "calc.copy": "Copy result",
    "calc.share": "Share result",
    "range.label": "Time range",
    "range.30": "30D",
    "range.90": "90D",
    "range.180": "180D",
    "range.365": "1Y",
    "readout.latest": "Latest",
    "readout.range": "Period",
    "readout.high": "High",
    "readout.low": "Low",
    "readout.fallback": "backup source",
    "chart.high": "H",
    "chart.low": "L",
    "chart.aria": "History of 1 {from} in {to}. Use the left and right arrow keys to read each day.",
    "chart.error": "Couldn't load the history. Please reload the page later.",
    "tooltip.latest": "Latest",
    "tooltip.toLatest": "{pct} to latest",
    "mc.note": "When you pay abroad with a Mastercard, the charge is converted at Mastercard's settlement rate. It includes a spread and usually differs slightly from the mid-market rate shown here, and your card issuer may add a foreign transaction fee. Check Mastercard's official converter and your statement for the exact amount.",
    "mc.open": "Open Mastercard converter",
    "rank.label": "Where today's rate stands in the past year",
    "rank.verdict": "{from} → {to}: {level}",
    "rank.levelHigh": "high for the past year",
    "rank.levelMid": "mid-range for the past year",
    "rank.levelLow": "low for the past year",
    "rank.pct": "Higher than {p}% of days in the past year",
    "rank.low": "1Y low {v}",
    "rank.high": "high {v}",
    "amount.invalid": "Can't calculate this expression",
    "amount.preview": "= {v}",
    "keys.label": "Operators",
    "section.saved": "Saved amounts",
    "saved.add": "Add",
    "saved.empty": "Save amounts you convert often, like monthly rent or tuition, and they're converted at the latest rate every time you open the site. They're stored only in this browser.",
    "saved.dialogAdd": "Add saved amount",
    "saved.dialogEdit": "Edit saved amount",
    "saved.name": "Name (optional, e.g. Rent)",
    "saved.amount": "Amount",
    "saved.currency": "Currency",
    "saved.delete": "Delete",
    "saved.cancel": "Cancel",
    "saved.save": "Save",
    "saved.done": "Saved",
    "saved.deleted": "Deleted \"{name}\"",
    "saved.undo": "Undo",
    "saved.edit": "Edit \"{name}\"",
    "saved.full": "You can save up to {n} amounts",
    "saved.invalid": "Enter an amount greater than 0",
    "install.title": "Add to home screen",
    "install.desc": "Open it like an app from your home screen, and see the last rates even when you're offline.",
    "install.ios": "Tap your browser's Share button, then \"Add to Home Screen\" to open it like an app.",
    "install.dismiss": "Not now",
    "install.ok": "Got it",
    "install.button": "Install",
    "install.otherBrowser": "On phones, we recommend installing from Chrome. Other browsers may show a warning that the app was built for an older version of Android.",
    "install.chrome": "Open in Chrome",
    "offline.date": "You're offline. Showing rates from {date}",
    "offline.plain": "You're offline. Rates will update when you're back online",
    "notify.copied": "Copied {value} {cur}",
    "notify.copyFail": "Couldn't copy. Please select the number and copy it",
    "notify.online": "Back online",
    "notify.installed": "Added to home screen",
    "notify.shareCopied": "Copied text and link to share",
    "notify.shareFail": "Couldn't share. Please copy the link from the address bar",
    "share.title": "Yen–Yuan Rate",
    "share.text": "{a} {from} ≈ {b} {to} ({date}, {source})",
    "share.source": "ECB reference rate",
    "share.sourceFallback": "reference rate",
    "footer.data": `Today's rate, the converter and the history all use one source: the European Central Bank (ECB) reference rates (Source: ECB statistics), via ${L.frankfurter}, updated every working day. The ECB publishes rates against the euro; the yen–yuan rate here is a cross rate calculated from them, for reference only. If Frankfurter is unavailable, the community-run ${L.currencyApi} is used as a backup and the page says so. All figures are mid-market rates without any bank's buy/sell spread.`,
    "footer.ui": `The interface is a custom implementation of ${L.m3}; colours, type, shapes, motion and component sizes come from the design tokens in the ${L.compose} source. Font: ${L.font}; icons: ${L.icons}.`,
    "footer.github": `This project is open source on ${L.github}. Issues and feedback are welcome.`,
    "footer.privacy": "Privacy: this site uses no cookies and has no accounts. It is hosted on Cloudflare, which keeps access logs (including IP addresses and browser details) for operation and security and provides cookie-free, anonymous visit statistics. These are used only to run this site and are not shared with other third parties. Your theme, language, conversion direction and saved amounts stay in your browser and are never uploaded.",
    "footer.disclaimer": "This site is for reference and conversion only and is not financial, investment or legal advice. We accept no liability for any loss arising from use of its data. For actual transactions, check the rates published by your bank, payment provider or Mastercard. Mastercard is a registered trademark of its owner; this site is not affiliated with it.",
  },
};

function readLangPref() {
  try { return localStorage.getItem(LANG_KEY); } catch { return null; }
}

function saveLangPref(value) {
  try {
    if (value) localStorage.setItem(LANG_KEY, value);
    else localStorage.removeItem(LANG_KEY);
  } catch { /* ignore */ }
}

function deviceLang() {
  const list = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""];
  for (const tag of list) {
    const base = String(tag).toLowerCase().split("-")[0];
    if (base in LANGS) return base;
  }
  return "en";
}

function urlLang() {
  const value = new URLSearchParams(location.search).get("lang");
  return value && value in LANGS ? value : null;
}

// The language in effect, and whether it was picked by the visitor ("pref")
// or follows the device ("auto").
let currentLang = urlLang() || (readLangPref() in LANGS ? readLangPref() : null) || deviceLang();

// What the menu shows as selected: a language fixed by the URL or saved by
// the visitor, otherwise "auto".
function langChoice() {
  const saved = readLangPref();
  return urlLang() || (saved in LANGS ? saved : "auto");
}

function t(key, params) {
  let text = I18N[currentLang][key] ?? I18N.zh[key] ?? key;
  if (params && typeof text === "string") {
    text = text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? params[name] : m));
  }
  return text;
}

function locale() {
  return LANGS[currentLang].locale;
}

// Applies the dictionary to the static page and the document metadata.
function applyI18n(root = document) {
  document.documentElement.lang = LANGS[currentLang].htmlLang;
  document.title = t("doc.title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("doc.description"));
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", t("doc.siteName"));
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest && manifest.getAttribute("href") !== LANGS[currentLang].manifest) manifest.setAttribute("href", LANGS[currentLang].manifest);
  root.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  root.querySelectorAll("[data-i18n-html]").forEach((node) => { node.innerHTML = t(node.dataset.i18nHtml); });
  root.querySelectorAll("[data-i18n-attr]").forEach((node) => {
    for (const pair of node.dataset.i18nAttr.split(";")) {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key) node.setAttribute(attr, t(key));
    }
  });
}

// Switch language. `choice` is a language code or "auto" (follow the device).
// The address bar keeps ?lang= in step, so the URL being shared or bookmarked
// opens in the same language; Chinese (the default) and "auto" need none.
function setLang(choice) {
  saveLangPref(choice === "auto" ? null : choice);
  currentLang = choice === "auto" ? deviceLang() : choice;
  const url = new URL(location.href);
  if (choice === "auto" || currentLang === "zh") url.searchParams.delete("lang");
  else url.searchParams.set("lang", currentLang);
  history.replaceState(null, "", url.pathname + url.search + url.hash);
  applyI18n();
  document.dispatchEvent(new CustomEvent("langchange", { detail: { lang: currentLang } }));
}

// Translate as early as possible (this script runs at the end of <body>,
// after the markup is parsed) so other languages do not flash Chinese first.
applyI18n();
