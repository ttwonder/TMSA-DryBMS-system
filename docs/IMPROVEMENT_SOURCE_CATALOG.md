# 待改善來源目錄管理（023 獨立批次）

基準：`1a7d5abe0dc5f9dfac8cd8f44a975bac6a82d1ef`。本批只延伸來源目錄，不重做前九項報表改善。實作 writer 初次交回時尚未 stage／commit；父流程完成驗證與獨立審查後才提交本機版本。Push、部署及正式 SQL 不在本次執行範圍。

## 使用與資料契約

- 管理 → 待改善來源。只有 active Owner／admin 且具既有 `manageUsers` authority 可開啟編輯並保存。新增、改名、停用、恢復都要明確「確認保存」；取消不保存。
- 沿用 `settingsEditor`／`useRecordEditor` 的 lease、CAS、server ACK、dirty draft 與同 operationId recovery。失鎖、舊版本、未知網路結果不可假裝成功，也不自動以新版本重送。
- `SystemSettings.improvementSources?: {id,name:{zh,en},active}[]` 是唯一目錄。沒有新表、RecordKind 或公開 RPC。名字至多各 160 字，至少一種語言非空；顯示缺語言時使用另一種語言。
- 八個內建 ID 與順序維持：`non_external`、`external`、`management_review`、`management_directive`、`vessel_safety_meeting`、`company_safety_meeting`、`seminar`、`external_regulatory_impact`。自訂來源只追加 `custom:<lowercase UUID v4>`；不得刪除、換 ID 或調序。停用是可逆狀態，不是刪除。
- 自訂來源是公司 standalone，章節／Item optional；`non_external` 保留原本關聯要求；`external` 保留 frozen finding identity、分類 authority、sourceKey 與 dedupe。改名不改 source ID，不重寫改善、原始 finding、event prose、frozen snapshot 或已授權 export。
- 新建只接受 known active source；預設 non_external 停用時改用其他 active source，全部停用時阻擋新建並顯示說明。既有停用來源仍顯示、保留選取，可修改其他欄位、結案／重開、篩選及匯出。
- external 停用同時阻擋 Improvements 與 Inspections 獨立新增入口；不阻既有 inspection／finding 編輯或既有改善保存。其他來源不可偽帶 inspectionId／findingId／sourceKey。
- management_review 快捷清單仍按 ID 過濾，不以可變名稱推斷語義。
- 共用 resolver 由傳入 settings 取名：清單、詳細、full／Framework inline editor、篩選、Overview priority、audit display、報表內容與檔名。report builder／descriptor 使用 **授權 canonical snapshot.settings**，不讀 live/global settings。已授權 snapshot 保持原標籤。

## 舊客戶端與 GM

- 缺少 catalog 的舊 settings 可保持無欄位；首次開啟目錄只在 draft materialize 八個預設，明確 Save 才保存。
- 已有 catalog 而舊客戶端 settings payload 省略欄位時，023 wrapper 在所有 object-key／原驗證之前合併原目錄。部門與 role-permissions 保存不清除目錄。明確 `[]`、`null`、重複、移除既有 ID、保留字偽造均拒絕。
- GM 在 legacy state、sync baseline／delta、legacy/performance canonical export 及 exports 持久化 **之前** 已剔除 catalog。既有 audit deny／空 audit projection 保持，不能只依賴 UI 隱藏。
- settings version／sync marker 仍可能因設定保存改變；本批不宣稱隱藏所有 timing metadata，也不 backfill 舊商業資料、audit 或 exports。
- source 鎖定、歷史 general finding 例外，以及 proposedDate／chapterIds／milestones 省略保存契約不變。

## SQL 交接（由使用者另行授權正式操作）

本批新增：

1. `supabase/migrations/023_improvement_source_catalog.sql`
2. `supabase/improvement-source-catalog-readback.sql`

001–022 與舊 readback **未修改**。本機 harness 明確安裝至 022 再套 023，QA server 的版本清單已延伸 018–023。

023 是單一交易 DDL-only：不更新 records、audit 或 exports。前置檢查比對 source-derived 精確 body hash、Owner、SECURITY DEFINER、空 search_path、RPC timeout 與 ACL。未知 predecessor／ACL 漂移會拒絕並 rollback；helper 禁止 PUBLIC／anon／authenticated 直接使用，既有函式 OID／ACL／owner/config 不變。

特別確認目前真正的 022 wrapper：

- `validate_record(text,jsonb,jsonb,text,jsonb)` predecessor MD5：`436871103836b8a12150d7f59d460102`
- `validate_record_finding_classes_rules(text,jsonb,jsonb,text,jsonb)` predecessor MD5：`481c0de2d763a1eb8595f35e01e41153`
- `performance_dispatch(text,text,text,jsonb)` predecessor MD5：`1d350f40ff41379be7f3bb14c1afe4ae`

來源在 `scripts/improvement-source-catalog-model.mjs`，由 frozen migration 鏈重建 expected bodies，不用被測資料庫的結果自證。不可套用舊 021 validator hash 取代 022。

正式環境只有在既有 022 已核實、使用者另行授權後才能執行 023。若已安裝，023 會明確拒絕重裝；改跑獨立 readback。readback 只讀 `pg_catalog`／角色權限，不讀商業 body、不寫入。成功標記：`PASS_IMPROVEMENT_SOURCE_CATALOG_INSTALL_ONLY`，並要求 `checkCount` 等於 checks key 數且全部 true。這個標記只證明安裝，不證明 hosted UI／檔案驗收。若失敗，停止，不重置／改舊 migration／補寫資料來強行通過。

## 本機重現命令

在唯一 repo 執行：

```sh
node --experimental-strip-types --test tests/improvement-source-catalog.test.ts tests/improvement-source-catalog-ui.test.ts
node --experimental-strip-types scripts/verify-improvement-source-catalog-sql.mjs --red-only
node --experimental-strip-types scripts/verify-improvement-source-catalog-sql.mjs
node --experimental-strip-types scripts/verify-improvement-source-catalog.mjs
npm test
npm run typecheck
npm run build
```

產物驗證：`<已安裝且具有 win32com、pypdfium2 的 Python> scripts/verify-improvement-source-catalog-artifacts.py <browser receipt.json>`。本機已用 Hermes 現有 venv，不下載工具。原系統 Python 缺 openpyxl／fitz 的失敗紀錄保留；新 script 改用標準 OOXML 解析、既有 read-only owned Excel worker 與 PDFium。

## 驗證邊界與 evidence

`qa-evidence/improvement-source-catalog/`（ignored）保留所有 RED、失敗與成功 receipts；最終索引／SHA256／git identity 見 `handback.json`。含：

- 真 022 anonymous RPC 拒絕新 settings 欄位，再以 023 通過；單元與 Overview label 的 RED→GREEN。
- Owner／admin 正常操作，operator／vessel／GM claim／direct save 拒絕；停用帳號失去權限。
- 不合法 catalog、來源不明、偽 external identity、immutable source、舊 client omission、inactive create／existing edit、legacy general／milestone omission。
- 雙端 label 同步；Cancel 無商業寫入；stale CAS／lease loss 留稿；真 COMMIT 後中斷 ACK，原 operation 重播不雙寫。
- GM read／sync／canonical exports／persisted exports 無 catalog；marker 仍正常前進。
- 原 App 390px 中英與桌面；實際 XLSX 下載檔名／PDF document title 與同份 canonical descriptor 一致。舊 popup 與既有 persisted exports 不受後續改名影響。
- owned Excel 正常開啟、篩選、雙向排序關聯、AutoFit／列高、12pt cells／footer、source bytes unchanged；CDP PDF 有改名 label、完整測試文字、有效字級與頁面 bounds。

這些是本機 synthetic/native 證據，**不是 hosted Supabase／部署驗收**。PDF 僅驗證既有 print popup + CDP artifact；沒有操作或重試先前遭拒絕的原生列印另存／取消流程，不宣稱實際另存成功。只結束自有 Chrome／Excel／PostgreSQL／localhost server，保留失敗 evidence。

## 父流程補核

- 已逐檔核對 writer handback 的 23 個修改檔 SHA256 與 gate logs，001–022 未異動。475 tests、typecheck、build、48 native SQL cases 與 28 catalog-only readback checks 均有實際通過紀錄；不把本機結果當成正式環境驗收。
- 初次英文手機截圖只有清單、沒有編輯框，不能支持編輯版面的視覺通過。只修正 browser harness 等待編輯框，再量測名稱輸入／checkbox 的水平邊界，捲動並驗證保存／取消可見；產品程式未因這項補核改動。
- 新一輪原 App 的 13 browser cases 全部通過，1440px 桌面及 390px 中英編輯框／底部操作共六張截圖留存。父流程已檢視手機中英操作及桌面底部畫面。`parent-browser-6a05a88c/receipt.json` 綁定 345 個輸入檔，執行前後一致。
- 新瀏覽器紀錄：`browser-2026-10-23T18-21-49.022Z/receipt.json`；同目錄 `catalog-artifacts-aa1e86c5.json` 證明實際下載的 XLSX 在 owned native Excel 正常開啟、篩選、排序／AutoFit、12pt 及來源 bytes 不變，PDF 全文／字級／邊界通過。owned Chrome、Excel、PostgreSQL 與 localhost server 均已關閉。
- 既有 writer handback 與所有失敗紀錄原樣保留。受影響 browser／artifact 已重驗；未改動的產品／SQL gates 按精確檔案核對承接，不虛稱全部矩陣再次執行。
- 首次完整 staged whitespace check 發現兩個新增驗證檔的 EOF 多一空行（未追蹤檔不在 writer 的普通 `git diff --check` 範圍）；僅移除該空行並驗證內容等價，再執行來源目錄定點測試與 model syntax／post-hash 檢查。沒有因此重跑無關產品矩陣。
