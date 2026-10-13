# 歷史檢查捲動與分數差距紅色顯示

## 範圍與歷史修訂說明

- 本批只修歷史檢查視窗的章節選單浮動遮擋，以及總覽逐章／平均分數差距的文字顏色。
- 已發布歷史保留原唯讀快照。現行 `reviseInspection` 複製該快照為新草稿、建立新 ID，並以 `supersedesId` 指向原版；草稿則可直接編輯。此處「副本」是同一檢查的修訂稿，不代表新的檢查事件。
- 已發布版本的就地覆寫仍由 SQL `FINAL_SNAPSHOT_IMMUTABLE` 拒絕。本批不改此規則、修訂入口名稱、原始來源、成績、日期、改善關聯或保存協作機制。
- 「修訂（保留原版）」僅是給使用者的按鈕名稱建議，未實作；是否允許直接覆寫已發布歷史也未獲決定，不能擅自改動。

## 兩項顯示修正

1. **歷史視窗的章節選單隨內容正常捲動。** 原選單共用主頁側欄 `.chapter-navigation` 的 `position:sticky`，在視窗內捲動後會停在上方，把多數內容遮住。僅覆寫 `.modal-body > .chapter-navigation` 為正常流，取消最大高度及裁切；保留原按鈕、順序、字級及密度，讓各章都可經視窗捲動到達。TMSA／DRYBMS 主頁側欄仍沿用原浮動行為。
2. **總覽有非零可見差距時，標籤和數值都顯示紅色。** 同時覆蓋每章及目標平均旁的差距。正／負差距都用既有 `--red` 色；顯示為 `0.00` 或未能計算的 `—` 維持原色。按原兩位小數判定顏色，不將浮點尾差顯示為零時染紅。原 `gapText`、`targetMean`、實際自評、保存與計分公式未變。

## 實際本機驗證

**層級：真實原 App＋合成資料＋自有 localhost PostgreSQL，不是正式 Supabase／Pages 驗收。**

- 修前捲動真 RED：TMSA 中文桌面修訂視窗中，章節選單仍為 sticky，底端停在約 829.75px，而內容視窗頂端約 94.75px；要求捲走的斷言失敗。原圖及 receipt 保留於 `qa-evidence/inspection-layout-and-score-gap/navigation-red`。
- 修前差距真 RED：逐章及平均差距 `+3.00` 已正確呈現，但標籤／數值並非紅色，顏色斷言失敗。保留於 `gap-red`。
- 最終新 UI **58 個具名 checks 全 PASS**：16 組兩框架×中英文×1440／390×查看／修訂捲動；4 組主頁側欄原定位控制；1 組取消／原快照完整保留；32 組正差距、負差距、零差距、無可計算分數的雙語／雙視窗；4 組小數顯示為正／負零不染紅；1 組試算零業務寫入。TMSA 空章會形成空篩選範圍，只核平均 `—`；DRYBMS 以真實未評百分比條目核逐章及平均 `—`，不製造不存在的 TMSA 目標列。
- 原主頁章節四色／篩選／草稿取消／原保存回歸 **25 個具名 checks 全 PASS**。
- 完整 **145 unit PASS，0 FAIL，0 SKIP**；typecheck、build、公開產物檢查均 exit 0；公開檔案22個，未出版私有正文。
- build 仍有先前聯動批次已出現的 `INEFFECTIVE_DYNAMIC_IMPORT` 非阻断警告（reports 混合動態／靜態匯入）；本批未改相關匯入，未隱藏警告或為此擴大架構改動。
- 新 UI 與主頁回歸的完整 case ID 集、輸入 hashes（分別14／12項）、零 runtime errors、零外部／正式請求、自有 UI／API／PostgreSQL 全部關閉均已以程式核對。已看修前／後桌面中文及手機英文代表截圖。
- setup 的多餘測試欄位、導覽名稱、英文雙 Close 定位及空章假設曾造成 harness failures；原失敗另名保留，僅修測試，不當產品 RED 或產品故障。
- 舊 mock-only `qa:layout` 的 sync 啟動限制不因本批冒稱已修；本批以當前原 App＋自有 PostgreSQL 驗證相關畫面。沒有另起全平台獨立 review。

## 重現與交付邊界

```bash
npm run qa:inspection-layout-gap
npm run qa:chapter-navigation
npm test
npm run typecheck
npm run build
node scripts/verify-public-artifacts.mjs
```

完整 receipt、原圖及命令 logs 都在 ignored `qa-evidence/inspection-layout-and-score-gap/`，不公開身份或 session handles。不得把本機 PASS 當成正式保存／多人或原生 Excel 已驗收。

本批不需要新增 SQL，不改 `src/Inspections.tsx`、API、租約／CAS、角色、計分 domain、報告及 Excel 模板。Excel 指定區塊仍為獨立未交付工作，不混入本批；助手只做 verified local commit，Push／正式部署及 SQL 仍由使用者掌握。既有 006／007 的正式安裝核驗屬獨立範圍。
