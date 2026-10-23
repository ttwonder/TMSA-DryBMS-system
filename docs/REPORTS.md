# 報告中心與瀏覽器匯出

## 使用與授權

報告中心沿用既有 `panel`、`toolbar`、篩選控制及 `MultiSelect`，不新增大型摘要卡或額外版面層。繁中／英文切換改變控制與表頭語言；Item、記錄 ID、來源檔名及原文字串保持原值。

1. 框架自評：選 TMSA／DRYBMS、完整分章及 XLSX／PDF。
2. 改善：依事項、Item、計劃、任一進度內容搜尋，搭配部門／執行人／日期／狀態／急迫程度篩選，**明選**有效記錄後輸出 PDF。空選不代表全部。
3. 歷史檢查：明選單一凍結檢查，輸出完整凍結條文、結果與發現／建議。
4. 總覽：選完整分章；部門／人員／日期用來選相關完整章，不從章內分母刪除 No。改善章節分佈可重疊。

`Reports(ctx: PageProps)` 在輸出前呼叫 `ctx.api.authorizeExport({format, kind, ids, frameworkId, snapshotToken, filters})`。Builders 只接收 RPC 回傳的快照，不拿 live page state 替代伺服器值。伺服器仍是權限／快照／輸出紀錄的安全權威；前端角色檢查是便利 gate，不是安全替代。等待期間若使用者、session 或 API 身分改變，停止產生／下載。查詢後不再有效的明選 ID 不會擴大成全部。

Windows 上 `reports.ts` 與 `Reports.tsx` 的無副檔名匯入有解析歧義。頁面應用 `import Reports from './Reports.tsx'`，builders 用 `./reports.ts`；不改名、不刪其中任何檔案。需要 TypeScript `allowImportingTsExtensions`（noEmit 模式）。

## 最新交付方式：瀏覽器列印／另存 PDF

使用者已批准改用瀏覽器列印，明確取代本文下方舊「直下載 PDF、不用 window.print」說明。報告中心五類，以及兩框架、總覽、歷史清單與改善清單的 mounted PDF 入口，均改走 `useReportPrint`：同步保留窗口→原授權RPC→canonical選取驗證→共享內容投影→安全 HTML→瀏覽器列印。不是目前畫面截圖／目前分頁，也沒有將 HTML 偽裝成 PDF bytes。

列印採本機系統字型，不呼叫字型資產／外部字型；HTML CSP 拒絕字型／圖片／script／連線來源，只允許固定內嵌樣式。rich text用既有decode/runs重建白名單標記、escape全部來源。A3橫式，15pt正文、14pt表頭／輔助，長段落可續頁並重複識別與表頭。

瀏覽器視窗若遭阻擋，允許彈出後重試；準備失敗／取消／頁面退出／登入身分或權限失效即關閉窗口。成功呼叫列印不宣稱已另存文件；可在保留的快照窗口 Ctrl+P 重開列印，原頁可再次操作。關閉列印對話框亦不永久busy。audit只證明授權提供快照。Excel未改交付方式。

`render*Report<T>` 為五種內容的單一投影；`HtmlReport` 與 legacy `TextPdf` 各自writer共享它。下方 `build*Pdf`／`download*Pdf` 是保留的歷史API，mounted頁面不再呼叫，也不需要刪大型TTF檔或改部署SQL。瀏覽器具體字形依使用者OS字型；未主張所有Unicode／所有瀏覽器均已驗證。

重跑：`npm run qa:browser-print`、`npm run qa:report-selection`。前者 print() stub檢查App流程並另用真Chrome CDP輸出PDF，並非native列印對話框驗收；本機證據與限制見 `docs/BROWSER_PRINT_DELIVERY.md`。

## 歷史 API（保留供離線回歸）

`src/reports.ts` 提供下列實際瀏覽器下載介面，皆為 `Promise<void>`：

```ts
await downloadFrameworkExcel(snapshot, frameworkId, lang, chapterIds?);
await downloadFrameworkPdf(snapshot, frameworkId, lang, chapterIds?);
await downloadImprovementsPdf(snapshot, selectedIds, lang, title?);
await downloadInspectionPdf(snapshot, inspectionId, lang);
await downloadOverviewPdf(snapshot, frameworkId, lang, chapterIds?);
```

另提供同名 `build*` 純產物 builders（`buildFrameworkExcel`、`buildFrameworkPdf`、`buildImprovementsPdf`、`buildInspectionPdf`、`buildOverviewPdf`），回傳 `Promise<Uint8Array>`。最後參數 `ReportBuildOptions` 可注入 `templateBytes`／`fontBytes`，便於 QA 無網路生成；overview options 另可指定改善 `filters`。資料不得含未經授權的正式記錄。

下載用正確 MIME 的 Blob、object URL 與 `<a download>`，60 秒後回收 URL，不在 click 後立即撤銷。Node 不執行瀏覽器下載；應使用 builders 保存 bytes 作 QA。

## Excel：原總表版面與完整內容

- 以 ExcelJS 4.4.0 載入 `public/templates/tmsa-template.xlsx`；必須是已清除公司內容、標準全文及註解的 20 工作表樣板。帶 comments XML 的樣板直接拒絕。
- 樣板由資料製備流程提供，報告模組不讀正式公司母本、不把來源全文包入程式。樣板仍保留原 Item、實際樣式、合併、列高、欄寬及列印設定；不是 CSV 改副檔名。
- 核心七欄維持 `A Item / B KPI / C BPG / D Y/N / E Current Assessment / F Evidence / G PIC`。從 A 欄完整 Item 找原列；變更代碼可用別名或明確來源 A 儲存格定位。一般內容仍填同一原列；長文續列插入後，下方物理列號自然順延，業務 Item 不改。新自訂 Item 附在相應分章，新增分章另建工作表。
- KPI、BPG、目前自評與佐證保留完整英文在上／繁中在下，設定 WrapText，不用 shrinkToFit。部門多選解析 setting 名稱；目前自評與初始部門回覆分開標示原來源、部門及 Y/N，不合併成虛構共識。
- **欄寬調整只作用在敘述欄**：B 至少 32、C 至少 48、E 至少 54、F 至少 36（Excel 欄寬單位）；原本更寬者不縮。A／D／G 保留來源寬度，不能為了敘述擠窄 Item。其餘座標、章節結構、原框線與填色沿用原樣板。PIC 很長時也續列。
- 六列原表頭區保留；E 表頭年份取授權快照年份，明確標「目前自評」，不是把 H 的 2025 歷史值當現在。來源 H 以後的 body 值清空且隱藏；不得帶出舊公司文字。
- 字型／寬度量測後按同一 Item 分段續列，保留完整原字串與換行並加續列標記，不把文字截成摘要或藏進註解。需求列高超過 409.5pt 直接拒絕；來源單列 legacy 409.6pt floor 僅校正為 Excel 合法上限，不截斷量測後正文。短文列保留來源列高下限。
- 空格也具有四邊真框線；反白／原邊框類型保留，缺邊補框。列印範圍 A:G、重複表頭、fit-to-width 一頁寬、允許垂直續頁。DRYBMS 採同七欄，不假裝來源分析索引是官方條款。
- `ensureNativeExcelCompatibility` 修正 ExcelJS 的 `sheetPr` 順序為 `tabColor → outlinePr → pageSetUpPr`。僅 ZIP/openpyxl 能讀不等於 Microsoft Excel 接受。

## 可下載 PDF

使用 `pdf-lib 1.17.1` 與 `@pdf-lib/fontkit 1.1.1`，直接建立可選取的文字 PDF，不以 `window.print()` 或整頁點陣圖替代。

- A3 橫式，正文 15pt；表頭、來源輔助文字、頁碼至少 14pt；標題 17pt。中英字元以真字型寬度換行，英文優先空格、長 token／中文按字元斷行。
- 長 table 持續多頁、重複表頭、短 ID 續頁標籤、四邊框、頁首／頁尾／頁碼。未補齊來源缺口以淡黃底及文字說明，不縮字／不裁正文。
- 框架：完整 KPI／BPG／目前自評／佐證／多部門／Y/N、reviewed／符合程度／執行狀態／執行人／來源及 ★ 未結案改善參照。來源英文原文、分析對照、建議證據的界線完整保留。
- 改善：僅本次有效明選 ID；事項、完整內容、計劃、急迫、期限、狀態、百分比、多部門／人員、來源類型／來源 ID／關聯 Item 及**每一筆**進度事件，含事件 ID、時間、執行人、狀態、百分比及完整內容。
- 檢查：只用凍結定義／結果，不改套目前停用狀態或目前自評。正面觀察與建議也完整保留；缺評不是 0；顯示 frozen scoring version、方法、評定覆蓋率及完整 findings。
- 總覽：現在完整分章分數、分母、reviewed、provisional／source gap、未結案分佈及計劃、最近更新、上次獨立凍結檢查。試算只屬獨立 target model，不寫入／不混入目前分數。
- 計分直接使用 `src/domain.ts` 的 `frameworkScore` 與 `inspectionScore`，不另複製公式。DRYBMS 原始填值保留，但未解 source gap 對應級別按 unknown/null 保守計算；0.05 只套一次。歷史檢查缺少任一 active Item 的 reviewed／非 null 結果，使用 helper 的未完整記分結果。

## 開源中文字型

`public/fonts/NotoSansTC-Regular.ttf` 是官方 [notofonts/noto-cjk](https://github.com/notofonts/noto-cjk) 的 Noto Sans CJK TC 變體固化為 Regular；同目錄保存 SIL OFL 1.1 `OFL.txt`、完整 upstream commit／URL／SHA256 的 `provenance.json` 及重建程式 `build-font.py`。**不複製 Microsoft 正黑體或其他系統商業字型。**

目前資產約 19MB；每份 PDF 只嵌入實際使用的 glyph subset，合成長文 PDF 約數十 KB，不是每份嵌入整個字型。所有 U+4E00–U+9FEF 基本 CJK 均有字形，含簡繁原文；其他保留的 Unicode mappings 見 provenance。上游此版本缺少 U+9FF0–U+9FFF 的 16 個較新基本字；emoji／其他未覆蓋字元亦非默默代換：產生時檢查 codepoint，遇缺字直接停止並報碼位，不能轉換原文字串或下載空白字形。

TrueType `glyf` 四位元組 padding 是必要的 fontkit 相容性修正；未對齊 subset 可能「可抽取文字但畫面缺字」。QA 同時檢查 embedded font glyph outlines，不以文字抽取 PASS 代替渲染驗證。

重建（免費下載，無公司資料）：

```sh
uv run --with fonttools==4.60.1 python public/fonts/build-font.py --scratch 'C:/Users/tuotu/AppData/Local/hermes/cache/scratch/tmsa-report-qa'
```

## 實際合成驗證

正式公司自評不放在 public sample 或 tests。`tests/reports.test.ts` 从空白樣板的實際 Item／樣式建立合成測試，再由 builders 產生 XLSX／PDF；樣本與 receipts 寫在 Hermes scratch，git 外。

```sh
cd 'E:/Projects/TMSA&DryBMS-system' && \
REPORT_QA_DIR='C:/Users/tuotu/AppData/Local/hermes/cache/scratch/tmsa-report-qa' \
node --experimental-strip-types --test tests/reports.test.ts
```

`REPORT_TEMPLATE` 可另指指定空白合成樣板；不設時測實際公開 sanitized asset。Windows tool `workdir` 不接受路徑的 `&` 時，維持工作目錄 `C:/Users/tuotu` 並執行上面的 quoted `cd`，不要改名／duplicate clone。

獨立驗證器 `scripts/verify-report-files.py` 使用 openpyxl、PyMuPDF、fontTools；選用 pywin32 開啟自有唯讀副本：

```sh
uv run --offline --with openpyxl==3.1.5 --with pymupdf==1.26.5 --with fonttools==4.60.1 --with pywin32 python \
  'E:/Projects/TMSA&DryBMS-system/scripts/verify-report-files.py' \
  --xlsx 'C:/Users/tuotu/AppData/Local/hermes/cache/scratch/tmsa-report-qa/framework-long-custom.xlsx' \
  --template 'E:/Projects/TMSA&DryBMS-system/public/templates/tmsa-template.xlsx' \
  --expected 'C:/Users/tuotu/AppData/Local/hermes/cache/scratch/tmsa-report-qa/long-expectations.json' \
  --native-excel --native-pdf 'C:/Users/tuotu/AppData/Local/hermes/cache/scratch/tmsa-report-qa/native-long.pdf' \
  --receipt 'C:/Users/tuotu/AppData/Local/hermes/cache/scratch/tmsa-report-qa/native-long-verification.json'
```

另以 `--pdf`、`--pdf-expected`、`--render-dir` 驗 PDF 字體、可選中文、完整長文及頁邊界。`--native-excel` 使用 `DispatchEx`、`ReadOnly=True`、`UpdateLinks=0`、`CorruptLoad=0`、禁止巨集、關閉不保存；記錄自有 PID，絕不 kill 全部 EXCEL。`nativeTextBand` 是該合成測試的實測列印區域，不是所有任意來源的通用座標。

驗證範圍：20 sheet／288 unique Items，原樣式與合併、完整四邊框、inactive 排除、新自訂 chapter／Item、兩語各 120 段的續列全文重建、原生 Excel 無修復開啟、81 個長文 segment 的原生列印重建、PDF 全文字／全進度／14–17pt／頁界、字形 outlines 及來源缺口保守計分。瀏覽器 scratch harness 用本機真 Chrome 實際下載五種 wrapper 及報告中心 XLSX，明示授權 adapter 為合成 seam，不冒充正式 provider／DB 驗收。

實體產物根目錄：`C:/Users/tuotu/AppData/Local/hermes/cache/scratch/tmsa-report-qa/`。主要檔案：`framework-20.xlsx`、`framework-long-custom.xlsx`、`improvements.pdf`、`inspection.pdf`、`overview.pdf`、`drybms.xlsx`、`drybms.pdf`、`chrome-report-center.xlsx`、`chrome-framework.pdf`、`native-long.pdf`；對應 `native-verification.json`、`native-long-verification.json`、`all-pdf-verification.json`、`browser-report-verification.json`。樣本皆為 synthetic，不代表正式公司資料或正式網站已驗收。
