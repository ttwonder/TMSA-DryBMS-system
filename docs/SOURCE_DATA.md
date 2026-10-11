# 真實來源私有匯入與公開 Excel 樣板

本文件說明本機來源匯入，不代表已部署正式 Supabase，也不代表公司已完成新一輪自評或外部發現已結案。正式資料只在 gitignored 的 `private-seed/`；不得把該目錄、來源快照或 seed 放入 `public/`、`dist/`、前端程式碼或公開 Git。[3]

## 交付與執行

- `scripts/import_sources.py`：讀取真實來源、核對原檔 SHA-256、建立耐久私有副本、產生符合 `src/types.ts` 的 `SeedBundle`、建立去敏樣板，最後實際呼叫來源驗證；任何斷言失敗均回傳非零狀態，不輸出虛構成功。
- `scripts/verify_sources.py`：獨立重讀 seed、原來源、完整快照、原 Excel 儲存格及原 PDF 欄位，核對內容、識別碼、計數、關聯與公開樣板；驗證結果存入 `private-seed/source-verification.json`。
- `private-seed/platform-seed.json`：正式匯入資料，僅供受保護的 Owner 首次匯入流程讀取。
- `private-seed/snapshots/` 與 `snapshot-manifest.json`：兩個完整工作根的所有檔案及 13 個原 Excel／PDF 的逐檔副本與 SHA-256；不依賴易失的 scratch 目錄繼續存在。
- `private-seed/tmsa-style-manifest.json`：20 分章原樣式規格、原欄位座標、288 個 Item 的原列位置與公開文字白名單。
- `public/templates/tmsa-template.xlsx`：真正由原總表去敏的空白格式樣板，不是重新命名原來源。

在本機專案根目錄以 Git Bash 執行；套件版本固定，已用離線 `uv` 環境實際執行。不要使用不匹配的全域 `pip`，也不要加 `python -O/-OO`：

```bash
PYTHONDONTWRITEBYTECODE=1 uv run --offline --python 3.11 \
  --with openpyxl==3.1.5 --with pymupdf==1.28.2 \
  python scripts/import_sources.py --native-excel

PYTHONDONTWRITEBYTECODE=1 uv run --offline --python 3.11 \
  --with openpyxl==3.1.5 --with pymupdf==1.28.2 \
  python scripts/verify_sources.py --native-excel
```

`--native-excel` 使用 Windows 上獨立的 Microsoft Excel COM instance，以禁止巨集／外部連結更新、ReadOnly、正常開啟（非 repair）檢查樣板；關閉時不保存。若 Excel 不可用，此選項會失敗，不冒稱原生 Excel 已驗證。純 Python／OOXML 驗證可省略該選項。[3]

搬移專案後若原來源絕對路徑不可用，可執行 `verify_sources.py --snapshots-only`。這只聲稱私有副本仍完整，不聲稱已重新核對不存在的原檔。重新匯入需要原來源與真實工作根；可用 `--tmsa-root`／`--dry-root` 指定位置。重跑匯入會重新產生 version 1 seed 與實際匯入時間，不是合併使用中的雲端業務記錄，不應對已開始編輯的正式狀態無條件重匯。

## TMSA：來源權威與初始回覆

- 20 分章、288 個唯一 Item，包含第 14 章人因的 22 項；不縮成官方 13 Element 範圍。`id = TMSA:<literal Item>`、`chapterId = TMSA:<chapter>`，Stage 由已驗證完整 Item 的第二段取得，不截斷、不修補原 token。[1][3]
- canonical master 是 KPI／BPG／章名／AIM 的權威；`primary` 是已完成來源責任分類的最新有效部門回覆。298 筆 primary、10 筆 supplementary、277 筆 unchanged copied-template reference 全數保存；後兩類不偷偷覆寫最新回覆。[1][3]
- 1,451 筆主要 registry 及 111 筆附加 registry，共 1,562 筆完整雙語文字與 2,483 筆用途關聯保存於 `seed.provenance`；原 registry、10 個翻譯批次、review notes 與覆蓋資訊另有完整私有副本。[3]
- 有提供翻譯 `en` 的中文／混合來源，使用該完整英文；只有 `zh` 的純英文來源，`en` 直接等於 registry 的 exact 原值，不另生成英文、不摘要、不 trim 原段落。registry 原文及翻譯各自保存，不以翻譯取代原來源。[1]
- `initialDepartmentResponses` 逐筆保留 response、完整 assessment／evidence、原檔／sheet／cell／原 Y/N／原 PIC。公司 PIC 中人名不是正式人員帳號；所有 `assigneeIds = []`，未建立任何人員或憑證。[1][3]
- 已知部門 ID：`safety` 安衛處、`technical` 船工處、`crew` 船員組、`management` 管理組、`marine` 海技組、`shipping` 航運處。其他原 PIC、參與標籤與人名留在 source record，不猜正式部門或人員 ID。
- `2.4.2` 船員組 No／管理組 Yes 保持為 `response = no, conformity = partial`；來源兩份答案都保留，不能以多數決或單一 Yes 抹平。來源 `N/A` 映射為 null，不當 Yes，也不視為完成更新。[1][3]
- 原格式錯誤 token `aA.1.4` 保持原值。既有可查證的 master `1A.1.4` 關聯及 bilingual mapping warning 一併保存；沒有把來源 token「修正」後冒稱來源本來就有效。[1]
- 所有匯入現況 `reviewed = false, executionStatus = not_started`。來源自述的 Y/N 和正文已保存，但匯入不等於使用者完成本次更新，也不從 prose 推定執行完成。`importedYear = 2026` 代表使用者指定的最新回覆批次；繼承的 2023／2025 表頭仍是原 metadata，不改寫成執行日期。
- 所有 versioned entity 為 version 1，`createdAt = updatedAt = importedAt` 真實 UTC ISO 時間、`updatedBy = source-import`。契約 `BaseEntity` 沒有 `createdBy` 欄位，因此建立者放在 private import receipt，沒有擅自更改 types 契約。

## DRYBMS：原文與中文分析的邊界

412 個 `rid` 是分析索引，不是官方條文編號。`id = DRYBMS:<rid>`、`chapterId = DRYBMS:<area>`；30 主題，Basic／Intermediate／Advanced／Excellence 分別為 1／2／3／4。[2][3]

### 要求與建議證據

- `kpi.zh = requirement_zh`，是原比較工作成果的完整中文整理。
- `kpi.en` 是該列 `source_unit_ids` 引用的完整原英文單元全文，按原引用順序以雙換行連接；`sourceOriginals` 保留每個單元的 id、kind、原英文、實體 PDF 頁。這些英文可能包含其他中文列共用的上下文，**不是該中文列的逐字英文翻譯**，UI 應在條目文字旁持續明示。
- `crosswalk` 保留 TMSA 引用、match、中文差異及核對事項；完整 rationale、summary、source pages、gap 等分析欄另在 `provenance` 保留。中文對照分析不能冒充官方 BPG。
- `guidance.en` 僅取相同主題／層級／來源頁的 **Suggested Objective Evidence 原英文**，不從中文核對事項反向翻譯或從 industry knowledge 補字。
- `guidance.zh` 明確使用「**建議證據原文為英文；參考核對事項：**」再接 `attention_zh`。這是中文分析提示，不冒稱已提供建議證據的原文翻譯；建議證據不升格為強制要求。[2][4]

570 個原單元（279 Expectation、291 Target）全數保存；566 個由 412 列引用，4 個被來源工作明確排除的浮水印／辨識雜訊單元，保留原 unit 及排除理由，不製造缺文要求。驗證會直接從 hash-bound PDF 的原頁及 y-range 重抽 378 個英文欄位，重建 570 個單元，與私有來源全文逐字比對；只使用原抽取已聲明的空白／行分組方式，不補正 OCR 拼字。[2][3][4]

### 頁 35 的已揭露抽取分組例外

分析列 `D17-I-01` 已由原圖核對為 Intermediate，但上游 `drybms_cells`／unit ID 把頁 35 的 Basic 與 Intermediate 合在同一 Basic cell。匯入保留原 `D17-B-p35-*` IDs 及全文，不「修補」ID；只把同頁 Suggested Objective Evidence 在原文唯一的 `Verification of:` 邊界切成 Basic 前段、Intermediate 後段。該切分是原字串的 exact substring，`provenance.suggestedEvidence.derivationNote` 明示原因；原 cell 全文及頁 35 私有核對圖均留存。[2][4]

### 缺口與初始評分

20 筆來源裁切／不可辨識缺口影響 19 個分析列。`sourceGap` 保留完整 `gap_zh`、`sourceGapResolved = false`，`provenance` 另存全部 gap 原 record 及各列關聯 `gapIds`；未據此猜缺文或判定已符合。[2][3]

未提供公司的 DRYBMS 現況自評，所以 412 項 `response = null, reviewed = false`，assessment／evidence 空白；30 個 `dryScores.levels = [null, null, null, null]`。null 的 `conformity = none` 只是 enum 初始化值，不代表已評不符合。四級百分比計分由網站的 Guidance v1.1 方法處理，匯入不從 TMSA Stage、中文對照或外部發現自行造分。[3]

## 外部歷史檢查與待改善

建立兩個 `imported = true, status = final` 的檢查：Mandeep／Quantum 與 ExxonMobil。每個 snapshot 固定公司完整 20 分章、288 個 Item 及版本；288 個 result 全部 `response = null, reviewed = false`。`scoreNote` 明示僅有發現／回饋報告，沒有完整逐項成績，不假造歷史分數、不把 OFI 判 No、不把未提及或「無發現」判 Yes。[5][6][7]

保存：

- Mandeep：88 個真正逐項 finding、10 個 positive（含 9 個 general strength）、3 個 no_finding、23 個未編號 general 改善／培訓主題；共 124 個 Finding record。
- Exxon：13 個 finding（原 OFI／Observation classification 在 source record 仍保留）及 2 個 guidance（回覆／保密要求）；共 15 個 Finding record。原 coverage 中明示無 finding 的 Element 範圍也完整保留，不編造單項合格評定。
- 雙語 observation／recommendation、原 reported heading、來源頁／printed page、mapping warnings、existing annotations 與原 source report coverage 都保留，沒有以公司後來自述取消舊稽核觀察。[5][6][7]

僅 88 + 23 + 13 個真正 finding／general 改善主題產生 **124 筆**外部 improvement；positive、no_finding、回覆／保密 guidance 不列入未結案缺失。未編號 general 的 `itemIds = []`，不猜 Item；同一 Item 可有不同來源發現，關聯與進度不複製成兩份業務記錄。[3]

每筆有 `inspectionId`／`findingId`／由 exact source record 及位置計算的穩定 `sourceKey`。來源去重鍵防止同一發現重匯；不做跨來源語意「去重」而丟掉不同來源的觀察。初始為 `open`、0%、空 assignees／targetDate／plan／events、`closedAt = closedBy = null`，來源註記 **Closure unverified／結案未核實**。`urgency = medium` 是可編輯的匯入預設，明示不是稽核人給的急迫分級。

168 筆歷史附加欄、88 筆 PDF annotation、28 筆 distinct Excel comment 的全部 occurrence、146 筆週期整理（原 51 筆逐筆保留、新增 95 筆）、1,242 個原 cell quote 及 notes／coverage 一併保存。original Item annotation／markers 不改寫；摘要以外原正文也在完整快照中可取回。[3]

## 公開樣板：白名單而不是「看起來空白」

樣板以原總表實際 workbook 清除內容，保留原 20 個 sheet 的名稱／順序（含原名稱尾端空白）、column headers、完整 Item code、E4 的 numeric Item suffix，以及欄寬、列高、合併、列印、框線、字型、填色與 alignment。原標題、章名、AIM、KPI／BPG、自評／佐證／PIC、歷史欄（含歷史表頭）、批註、隱藏／表外範圍正文及頁首頁尾文字均清除；不保留原個人／公司 metadata、外部 link、named range、圖片、巨集、table、validation 或 conditional-format 內可能攜帶的原內容。[3]

驗證白名單是 **446 個非空值**：288 個完整 Item、141 個 column header、E4 的 17 個 numeric suffix。2,655 個實際 style cell 與原總表逐格比較；來源 630 個 hidden zero-width column 經精確 OOXML 修補維持 width=0（openpyxl 原本會漏寫 0 而變成預設 13）。ZIP 中沒有 comment／VML／externalLinks／connection／drawing／embedding／customXml／printerSettings parts；沒有公式、公司正文或標準全文。除了白名單，其他儲存格值必須是空白。[3]

`Reports` 填值注意：

1. 用 A 欄 **完整 literal Item** 找原 row，不假設 `Stage` 表頭下就是數字 Stage。E4 的 A 欄仍為 `4.1.1` 等完整 ID；它的欄位比其他分章多一欄。
2. `tmsa-style-manifest.json.itemPositions`／`.sheets[].dataColumns` 給出各章精確座標。這份 manifest 含私有來源 metadata，不可打包公開；公開模板本身的 header＋ID 足以動態辨識欄位。
3. 匯出時明確填報告名稱、章名、AIM、當次年份與最新授權快照，不把模板原 2025 表頭當目前年度已更新證明。
4. 空白模板保留原幾何不等於長文報告已排版驗證。實際報告需要 wrap、中文正文 15pt／其他 ≥14pt、長文 continuation rows、重複表頭、實際 Excel／PDF containment 驗證，不能靜默裁切或只壓低字型。

## 實際驗證與反例

已實際執行完整匯入、來源驗證、Microsoft Excel 16.0 正常唯讀開啟 20 sheet，以及由 TypeScript compiler 直接讀取未修改 `src/types.ts` 的 `SeedBundle` 型別逐欄驗證。結果檔在 `private-seed/source-verification.json`、`type-contract-verification.json`；不是另寫一份可能漂移的手工型別。[3]

反例測試 `private-seed/tests/negative_checks.py` 已驗證 8 種真實資料突變被拒絕：少一個 master Item、把衝突抹成 Yes、Stage 0、把缺口聲稱解決、用摘要替換完整段落、假造歷史 Yes、漏 registry reference、公開 ZIP 增加隱藏 comment part。測試只覆寫私有 fixture，不修改官方 seed／模板／原來源，正式結果檔不被 fixture 取代。

```bash
node private-seed/tests/validate_types.cjs
PYTHONDONTWRITEBYTECODE=1 uv run --offline --python 3.11 \
  --with openpyxl==3.1.5 --with pymupdf==1.28.2 \
  python private-seed/tests/negative_checks.py
```

`verify_sources.py --seed ...`／`--template ...` 只供本機反例，需要搭配 `--no-write`。正式來源 hash、stage／Item tokens、原文段落、缺口、歷史未評狀態，以及 private-seed 的 gitignore 都是 hard gate，不以「大概有資料」通過。

尚待業務確認：20 個來源缺口、`2.4.2` 部門衝突、未編號 general 的 Item 定位，以及所有外部改善的真實結案佐證。這些不是程式漏匯；資料中已明示不確定／未核實，不捏造填滿。

## Sources

[1] file:///E:/Projects/TMSA%26DryBMS-system/private-seed/snapshots/tmsa/structured/canonical.json — TMSA authoritative canonical (private)
[2] file:///E:/Projects/TMSA%26DryBMS-system/private-seed/snapshots/drybms/analysis/mapping_merged.json — DRYBMS analytical crosswalk and gaps (private)
[3] file:///E:/Projects/TMSA%26DryBMS-system/private-seed/source-verification.json — Executed import verification (private)
[4] file:///E:/Projects/TMSA%26DryBMS-system/private-seed/snapshots/drybms/analysis/drybms_cells.json — Literal English source columns (private)
[5] file:///E:/Projects/TMSA%26DryBMS-system/private-seed/snapshots/tmsa/out/audit_mandeep_early.json — Mandeep report extraction part 1 (private)
[6] file:///E:/Projects/TMSA%26DryBMS-system/private-seed/snapshots/tmsa/out/audit_mandeep_late.json — Mandeep report extraction part 2 (private)
[7] file:///E:/Projects/TMSA%26DryBMS-system/private-seed/snapshots/tmsa/out/audit_exxon.json — Exxon report extraction (private)
