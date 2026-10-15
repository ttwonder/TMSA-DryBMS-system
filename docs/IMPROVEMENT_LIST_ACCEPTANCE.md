# 待改善清單：分頁、來源與版面驗收

## 交付範圍
- 原待改善頁增加「總表／未完成／已完成」；完成沿用 `status=closed`，100%未結案仍在未完成。
- 來源可選全部、自行提出或精確檢查ID；與既有搜尋、框架、章節、狀態及進階篩選交集。
- 每頁最多40筆，上下方均可上一頁、下一頁、直接選頁；篩選同步回第一頁，資料減少時頁碼落在有效範圍。
- 跨頁選取不遺失；PDF僅匯出明選且仍符合完整篩選的ID，並在取得原伺服器授權快照後重核。
- 原四個輔助欄合成一欄，上下依序為部門／執行人、狀態／急迫程度、目標／更新及操作。完整中英內容、相關Item、原按鈕與權限不變。
- 僅修改清單顯示與其篩選投影；不改SQL、角色權限、ID、來源、事件、分類、計分、共用editor或保存協議。

## 真實執行結果
驗證層：**原App＋合成資料，獨立本機PostgreSQL；不是正式Supabase／Pages驗收**。

| 驗證 | 結果 | 證據 |
|---|---|---|
| 原頁每頁上限RED | 原版一次渲染123筆，要求40筆的斷言失敗 | `qa-evidence/improvement-list/baseline-2026-10-15T01-18-15.925Z/receipt.json` |
| 原頁＋native流程 | 16/16 PASS；含四頁不重複不漏項、來源、三清單、100%未結案、空集合、跨頁PDF、取消零業務寫入、held ACK結案／重開與第二客戶端收斂 | `qa-evidence/improvement-list/green-2026-10-15T01-33-28.081Z/receipt.json` |
| 原頁版面／原操作 | 15個視窗狀態PASS；1440px／390px、中英、長標題及全文、多Item、進階篩選、選取、詳情／進度視窗、最右操作 | `qa-evidence/layout/full-content-improvements-2026-10-15T01-33-58.519Z/summary.json` |
| 改善編輯輸入回歸 | 12/12案例、24個輸入視窗PASS，測試服務均已停止 | `qa-evidence/improvement-input/green-2026-10-15T01-36-32.882Z/receipt.json` |
| 全部單元測試 | 244/244 PASS，含本批18項純篩選／分頁回歸 | `qa-evidence/improvement-list/closing-gates-2026-10-15T01-36-07Z/aggregate.log` |
| typecheck、production build、公開產物與diff | 全部exit 0；沒有公開公司資料 | 同上 |
| 實際下載PDF | 兩份下載可讀；跨頁選取3頁、篩選後單選2頁；PyMuPDF核對只包含選取標題與完整中英文內容標記 | `qa-evidence/improvement-list/green-2026-10-15T01-33-28.081Z/pdf-content-verification.json` |

- 同1440px桌面，內容欄由669.0625px變為1062px（增加58.7%）；四組右欄共用280px。兩側文字未截斷，手機整頁未橫溢，表格仍可局部橫捲。
- 視覺檢查已涵蓋桌面原頁、手機內容端／英文右側按鈕及實際PDF內容頁。截圖與PDF均只使用合成資料，保留於ignored `qa-evidence/`。
- 最終native與輸入receipt的宣告檔案SHA-256已對目前工作檔核對，無漂移。版面receipt另核對CSS SHA-256。

## 驗證中的修正及界線
- 第4頁縮小來源至2頁時，初版兩個effect互相覆蓋，錯停第2頁。保留 `green-2026-10-15T01-23-29.413Z/receipt.json` 失敗證據；改為篩選與回第1頁在同一更新入口，原案例已PASS。
- 初次來源精確label與export RPC名稱為測試選擇器／觀察器錯誤，不算產品RED；依實際DOM及 `export_authorize` 修正。
- 全單測中的舊Item來源字串斷言移到共用helper後過期；現在檢查原頁及canonical匯出皆接同一helper，仍保留精確Item predicate，另有可執行交集單測。
- 舊全站 `qa:layout` 缺少目前的sync fixture回覆，已補上幾何專用模擬傳輸。其全站模式另在總覽「卡片高度<190px」斷言失敗；本批未改總覽，未調低該斷言，也不把全站指令稱為PASS。本次採 `npm run qa:layout -- --improvements-only` 完整覆蓋要求的改善頁；既有手機650px絕對位置改為「新增指定控制後，清單仍從第一視窗內開始」。
- Build保留既有 `reports.ts` 同時static／dynamic import的分塊提示，非編譯錯誤；不為消除提示重構報表。
- 一次有限自審完成：檢查實際產品diff、新檔、清單／來源／分頁／選取／匯出契約及原操作邊界；未另啟動獨立review或全系統審計。

## 發布
本批不需要新增SQL；本機commit後由使用者Push及發布。正式網站、正式資料庫、正式登入與SQL安裝狀態未在本批操作或驗證，不能以本機PASS當作已上線。
