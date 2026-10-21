# FPMC 第二批報告交付說明

## 交付邊界

本批從 `6489ba6d32f8aa04f0ba36a666d3695be1cb0d65` 接續，不重做第一批。實作者交回13檔候選後，父流程已核對242項source/test/config及tracked輸入、370組產物／證據、39項保護檔與原阻點26組證據，並核對實際PDF及原生Excel收據。按既定授權獨立本機commit；實際commit／tree與僅文檔狀態更新記錄見 `qa-evidence/fpmc-reporting/resumed/local-delivery-receipt.json`。原 `handback.json`／根目錄阻點 `handback.json`及`BLOCKER.md` 均原樣保留。

驗證使用原 App、真實 ApiClient、owned localhost HTTP／原生 PostgreSQL 與合成資料，**不是正式 Supabase、部署或正式資料驗收**。實作者未stage／commit；父流程核驗後按既定授權建立獨立本機commit。未Push、未正式SQL或正式資料寫入；正式安裝、部署與使用者資料驗收仍分開處理。

## 報告中心

- 待改善項目新增「全選符合篩選結果」及「取消全選」，作用於全部目前符合結果，不限第一頁；仍可手動逐筆選取。
- 共用主清單的 `ImprovementListFilters`／`filterImprovementList`。來源與提出日期起迄，和搜尋、框架／章節、部門、人員、更新日期、狀態及急迫度均為 AND。
- 提出日期含首尾，未填不借用其他日期。公司來源無 Item 可在 all 框架出現，指定框架／章節仍須實際關聯。
- 手選 ID 與有效選取分開：縮窄只輸出可見交集，清除篩選仍保留手選；背景刷新不自動選新筆。空選／零結果不轉成全部。
- PDF／Excel 經相同 `authorizeReportSnapshot → export_authorize canonical → builder → download`；回傳後重新核對原篩選。主清單既有明選 PDF 使用相同新版 builder。GM 的改善及條目備註入口、資料與匯出拒絕保持。

## PDF

- 條目備註為三個邏輯表格列：章節／Item／備註狀態；涉及部門／追蹤人員；跨滿寬完整備註。責任欄取當前 assessment 的保存 assignment；部門僅依原 `assessment.departmentIds ?? item.departmentIds` 規則，已保存空陣列不回填。人名可保留停用歷史人員。
- 明選改善為六個邏輯列：急迫度／狀態／record 更新日；真實關聯業務 code／來源／分類／目標日／結案日；部門／執行人；完整內容；執行計劃；全部進度。進度僅更新日期／更新人／狀態／完整內容，依原事件順序，沒有事件則明示。
- 邏輯列可分頁續文，不硬擠六個實體行；正文 15pt、輔助字至少 14pt。備註五態文字與語意色保留。
- 只有備註與明選改善的可見 header／正文／footer 移除指定的快照、token、明選數、UUID／version、findingId／sourceKey／自動匯入追溯資訊；保留 FPMC、業務來源及頁碼。內部快照驗證與 PDF properties 不因此移除，也不 regex 抹除使用者正文中的同名引用。凍結歷史報告仍保留原追溯欄。
- 共用投影去多餘空行，保留非空行、縮排、編號、雙語及必要換行，不寫回 raw、events、frozen snapshots 或 JSON 備份。

## Excel 的閱讀、篩選與排序

- 備註工作表：章節、Item、狀態、部門、人員、全文、段次；保留狀態色。
- 改善主表：文件序號、標題、提出日期、來源、分類、關聯編號、部門、人員、急迫度、狀態、更新／目標／結案日期、全文、計劃、段次。全部進度另表，以**文件內序號**對回主表；此序號不是新增持久業務 ID。
- 第 4 列為完整 AutoFilter 表頭，凍結前 4 列，資料區不合併；日期是實際 Excel date serial，格式 `yyyy-mm-dd`，未填為空白。
- 全文依可讀寬度與安全字數拆續列，必要 metadata／文件序號隨列保留。主表按「文件序號、段次」，進度按「文件序號、事件次序、段次」閱讀；不要把實體列數當業務筆數。
- **原生 Excel 排序不會隨資料搬動實體列高**，因此 operational 續列採一致安全高度（至少 256pt，低於 409.5pt）及 14pt 正文字，避免排序後長文落入短列而裁切。這會使短內容列較高，為可排序且不裁文的刻意取捨。
- 框架自評仍用原正式模板、欄位、公式／樣式及同 Item 續列；本批僅整理空行，沒有改成新的平面登錄表。
- 原生驗證用新建且已證明 owned 的 Excel COM process，`CorruptLoad=0`、唯讀開啟 disposable copy，實際 AutoFilter、日期篩選、Sort、全文／metadata 關係及 native AutoFit 檢查；不保存，源檔雜湊保持。這是 COM 原生操作，不冒稱人工滑鼠驗收或僅 ZIP 驗收。

## 017 的精確範圍與 readback 適用版本

新增 `supabase/migrations/017_fpmc_reporting.sql` 和獨立 `supabase/fpmc-reporting-readback.sql`。只對已知 post-016 installed `performance_dispatch` 的一處格式 predicate 做替換：XLSX 原只允許 framework，延伸為 framework 或 improvements；inspection／overview 的 XLSX 仍拒絕。其他角色、selected scope、canonical snapshot、audit、session、GM、函式 owner／ACL 及所有業務資料不變。

017 為 guarded、單次、DDL-only 交易：未知 predecessor、重裝、private／client／public ACL drift 拒絕；5 秒 lock timeout、15 秒 statement timeout。本機實驗比較所有業務表 tuple／xmin／ctid 及函式 attributes，證明只有目標定義的單一 seam 改變。獨立 readback 同時核對 016 validator、015 GM 防線、RPC chain 及 ACL。

**001–016 migrations 和所有舊 readback 不改。** 舊 `fpmc-tracking-readback.sql` 是 016 時點核對，不能用來判斷 017 已安裝狀態；017 應使用新 reporting readback。正式順序為：確認前置版本 → 016 及其核對 → 017 及其核對；已安裝或版本不明時先唯讀確認，不盲重跑。本文件不是正式 SQL 執行授權，也沒有產生新的可執行正式交接包。

## 驗證範圍

最終 handback 區分：
1. 原阻點 native／原 App RED、對照與新 GREEN；fixture／selector 錯誤另外分類，不當產品 RED。
2. 017 原生授權、拒絕、tuple／ACL／owner、一次 export＋audit、canonical＝persisted snapshot、獨立 readback。
3. 原 App 全選／手選／窄化／刷新／來源／提出日、真實下載、GM／無權限／授權拒絕／session fence、桌面／手機及中英。
4. 實際下載的 5 類 PDF 及 3 類 XLSX，獨立保存檔讀回、完整非空行、幾何／字型／glyph、原生 Excel 及源 hash。
5. `npm test`、typecheck、保留舊產物的 build、public-artifact hygiene、diff check。

正式主機安裝、正式登入、正式使用者資料、Push／部署與上線 smoke 不在本次完成宣告內。歷史 NETWORK_UNKNOWN 根因亦不因這次本機成功被宣稱修復。
