# 操作紀錄明細及改善中英並排：本機驗收

## 授權範圍與交付界線
- 沿用原 App；只改操作紀錄顯示，以及主改善清單、TMSA／DRYBMS 細目改善表的正文布局。
- 不新增／更改 SQL，不重寫歷史，不更改權限、分頁查詢、保存、lease／CAS／ACK、分類或計分。使用者執行 Push 及正式發布。
- 所有 native QA 都是「真實 UI＋測試資料＋獨立本機 PostgreSQL」，不是正式 Supabase／Pages 驗收。

## 交付行為
1. 操作紀錄翻譯已知動作與種類，摘要列出實際變更欄位。短值直接顯示修改前 → 修改後；長文顯示改動欄位，展開後完整並排對照，不截斷、不正規化原文。
2. 來源為該筆 audit 已保存的 before／after。缺快照明示無法還原，不以目前業務記錄猜補；未記錄／空值、空白、0、false、空清單分開呈現。後端 audit JSON 可能省略 null，故不將缺欄一律稱為刪除。
3. 多筆 finding／進度等先按穩定 ID 配對，不因插入或排序移動製造大量假變更。新增／移除條目只有在兩側清單均已知時才明示；短標籤使用筆次，原穩定 ID 保留於明細欄位 tooltip。人員、部門和 Item 可用現行名冊補充名稱，但原 ID 保留並註明來源；歷史快照已有 Item code 時優先用該側保存值。
4. 略過純版本／系統更新時間與敏感欄位；不顯示密碼、憑證、token 或 hash。進度事件自己的時間與記錄人保留。未知動作／欄位保留原始值，不猜測含義。
5. 明細按使用者展開才建立 DOM，展開／收起不查寫業務資料。原四欄、伺服器篩選／分頁與角色界線不變；原技術摘要在明細保留，缺快照紀錄直接保留原摘要。
6. 三處改善表正文英文左、繁中右；標題維持兩欄之上。只加 scoped Grid／細分隔線，右側資訊、四色標籤、字級、按鈕、Item 連結、最新進度與原文保存不變。手機使用既有表內橫捲，無整頁橫溢；詳情、編輯器與 PDF／Excel 呈現不改。

## 有效 RED
- `qa-evidence/improvement-density/baseline-2026-10-16T00-35-39.731Z/receipt.json`：原 UI 三處英文／中文上下排列，3 個同排斷言失敗；原內容／四色／右側欄 9 個正向對照通過。
- `qa-evidence/audit-details/baseline-2026-10-16T00-39-23.341Z/receipt.json`：真實自評保存及 SQL before／after 通過；原頁面僅 `update assessment:assessment-item-a`，具體勾選摘要斷言失敗。
- helper 的 DRYBMS 歷史四級標籤、進度新增筆次及缺前筆語義另經 focused RED→GREEN。

## 最後候選驗證
總收據：`qa-evidence/audit-bilingual/closing-2026-10-16T00-56-10Z/receipt.json`。前一完整批次仍保留於 `gates-2026-10-16T00-50-19Z`；有限自審移除了一個未使用的 React import，重跑受影響的 aggregate／audit 兩套驗證，改善版面與清單證據按未變輸入 SHA-256 重用，未重複計數。

| 層級 | 結果 | 證據 |
|---|---|---|
| 全部單元測試 | 268 / 268，0 fail／skip；含新增24項 audit 比對 | 同目錄 `aggregate.log` |
| Typecheck／build／public-artifact／diff | PASS | 同目錄 `aggregate.log` |
| 三處改善表原 UI＋native | 55 / 55；12語言／視窗／入口組合、原文、取消、原保存及第二端讀回 | `qa-evidence/improvement-density/green-2026-10-16T00-50-20.924Z/receipt.json` |
| 操作紀錄原 UI＋native | 11 / 11；自評及改善進度真保存、before／after、展開零寫入、查詢、空結果、雙語／手機、admin與operator邊界 | `qa-evidence/audit-details/green-2026-10-16T00-56-12.388Z/receipt.json` |
| 舊摘要版面回歸（唯讀合成 transport） | 9 / 9；1440／1920／1366／390、兩語及原摘要全文 | `qa-evidence/audit-layout/fixed-2026-10-16T00-56-12.341Z/receipt.json` |
| 既有改善清單原 UI＋native／PDF | 16 / 16；來源、40筆、跨頁選取與實際PDF下載等 | `qa-evidence/improvement-list/green-2026-10-16T00-50-21.232Z/receipt.json` |

- 已檢視最終主清單中英並排、細目表、操作摘要／進度展開及390px英文明細截圖；測試輸入 SHA-256 與候選檔核對一致，案例 ID 唯一，browser errors 為空，owned ports 全部關閉。
- 未改全站總覽；舊全站 layout 的總覽高度問題不在本次驗證／完成宣告內。`reports.ts` 既有 static／dynamic import 分塊警告仍在，build 成功，未擴大重構。
- 一次有限自審；未要求獨立審查，不以測試通過冒稱獨立 review 或正式環境成功。
