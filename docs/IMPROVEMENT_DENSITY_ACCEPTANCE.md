# 改善內容密度、四色急迫程度及細目表驗收

## 範圍與交付邊界
- 僅修改 `src/Improvements.tsx`、`src/FrameworkPage.tsx`、`src/styles.css` 的指定顯示層。
- 主清單用既有 `compactBlankLines` 移除空白顯示行；非空行文字、編號、縮排及換行保留。編輯、詳情、進度事件、報表及雲端原文不改。
- 主清單和兩體系細目改善表均顯示盡快紅／高橘／中藍／低綠文字標籤；低急迫程度新樣式只限這兩種表格，不擴改總覽。
- 細目改善表由七欄改為編號、來源／分類、完整內容、跟進資訊／操作四欄；後者依序上下排列部門、人員、進度、操作。
- 無新 SQL，未 Push、未發布 Pages、未操作正式資料。所有瀏覽器案例為「真實UI＋測試資料」，使用獨立本機原生 PostgreSQL，不是正式 Supabase 驗收。

## 修改前證據
`qa-evidence/improvement-density/baseline-2026-10-15T05-48-24.409Z/receipt.json`
- 主清單保留多餘空白行且無四色標籤；細目表仍七欄，低急迫程度為灰色。
- 已在修改前檢視原使用者兩張圖及主清單／TMSA原App截圖。細目表原有空行壓縮為通過的正向對照，未重做該邏輯。

## 最終驗證
| 檢查 | 實際結果／證據 |
|---|---|
| 本次版面與操作 | 43／43 PASS；`npm run qa:improvement-density`；`qa-evidence/improvement-density/green-2026-10-15T05-55-36.325Z/receipt.json` |
| 雙語、桌機與手機 | 主清單／TMSA／DRYBMS × 繁中／英文 × 1440／390px，共12個狀態；全文、非空行精確相等、四種背景與色相、文字對比≥4.5、四組垂直位置、表內橫捲與操作可見均PASS |
| 資料與原操作 | 瀏覽零業務寫入；三個入口查看／完整編輯／取消保持原文及資料；TMSA、DRYBMS原更新保存、native讀回及第二客戶端收斂PASS，百分比／急迫程度變更不改原文及其他記錄 |
| 既有清單回歸 | 16／16 PASS；`qa-evidence/improvement-list/green-2026-10-15T05-54-07.778Z/receipt.json`；三清單、精確來源、40筆分頁、跨頁勾選、實際PDF下載、結案／重開及原操作 |
| 全單元測試 | 244／244 PASS，0失敗／略過；`qa-evidence/improvement-density/gates-2026-10-15T05-54-06Z/aggregate.log` |
| Typecheck／build／公開產物／diff | 全部exit 0；同上aggregate log。公開產物檢查PASS、沒有發布私人資料 |
| 欄寬 | 同一1440px視窗，TMSA／DRYBMS正文欄從463.0625px增至690px，約增加49%；字級不縮小 |
| 收尾 | 最終相關input SHA-256無drift、案例ID無重複、兩套native QA所屬服務及瀏覽器已停止 |

## 有限自審與限制
- 完整檢查指定三檔diff：原ID、來源／分類、Item關聯、全部按鈕及權限條件保留；未改共享editor、API、資料型別、業務helper、保存協議、SQL或報表。
- 首次互動測試因包住textarea的label精確匹配失敗，修為原測試已使用的label容器定位；畫面可正常編輯，未為此修改產品。
- 並行QA一次因Vite將port 0解為預設5173而啟動衝突，未執行產品斷言；新runner改為顯式可用port並維持strictPort。成功的獨立aggregate及清單receipt保留，僅重跑修正後的本次runner。
- build仍有既有reports.ts靜態／動態import分塊警告，非build失敗；未擴大重構。沒有重跑／宣稱全站版面QA通過。
- 無另派獨立review；完成一次有限自審及上述實際執行。正式生效仍須使用者Push及發布。
