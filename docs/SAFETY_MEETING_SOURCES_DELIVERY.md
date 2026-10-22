# 安全會議來源：本機交付

## 已確認規則

| 中文來源 | 儲存值 | 英文顯示 |
|---|---|---|
| 船舶安全會議 | `vessel_safety_meeting` | Vessel safety meeting |
| 公司安全會議 | `company_safety_meeting` | Company safety meeting |

使用者已確認：兩者都可獨立建立，TMSA／DRYBMS 條目關聯選填。新增選項接在原「管理層指令」之後，原來源順序、預設來源與已保存值不變。

- 新增／完整編輯、清單來源篩選、報告中心來源篩選、來源顯示與操作紀錄都識別兩個新值；原 PDF／Excel builder 沿共用來源標籤輸出。
- 新來源可新增、編輯內容、增加或清除 Item 關聯；已保存的來源欄仍鎖定，不開放來源改碼。
- 原自行提出仍需至少一個 Item；外部來源的檢查／finding 身分、去重與關聯範圍不變。
- 保留明確保存／取消、record lease、CAS、ACK、事件歷史及角色規則；無業務資料回填，未改 UI／CSS 版面。

## 本機證據（非正式 Supabase／Pages 驗收）

基準：`f61c9b1e201fdd21306db9f22cd134a27980d18d`。

- `qa-evidence/safety-meeting-sources/unit-red.log`：原 `improvementValidation` 拒絕兩個無 Item 新來源；保留行為 RED。
- `qa-evidence/safety-meeting-sources/gates-2026-10-22T20-20-43Z/receipt.json`：409／409 單元測試、typecheck、production build 及 diff check PASS。後續僅調整 QA script 的定位／等待／截圖，這份收據的 src／tests／package 輸入 hash 仍須吻合才可沿用。
- `qa-evidence/safety-meeting-sources/sql/run-2026-10-22T20-12-47.090Z/receipt.json`：21 個 native PostgreSQL 情境 PASS；包含升級前拒絕、舊四來源、LF／CRLF 升級及相同候選重跑、unknown predecessor／來源拒絕、來源不可改、外部去重及原保存 guards。安裝／重跑前後全部私有表 count／digest 不變。
- `qa-evidence/safety-meeting-sources/ui-2026-10-22T20-27-18.133Z/receipt.json`：原 App＋合成資料＋獨立本機 PostgreSQL，16 個情境 PASS。兩來源均經新增無 Item→另一客戶端完整編輯→新增 Item→讀回→清除 Item→讀回；清單與報告來源篩選正確。涵蓋取消零寫入、原自行提出限制、桌面繁中／390px英文及真 PDF／XLSX 下載。無頁面錯誤／外部連線，owned UI／API／PG 已停止。
- 同 UI 目錄 `artifact-verification.json`：兩份下載 PDF 的來源／選取集合及可選文字確認；兩份 XLSX 經原生 Excel `CorruptLoad=0` 正常唯讀開啟，來源、選取集合及原檔／副本 hash 均正確；owned Excel 正常退出。
- 較早的 UI 失敗收據保留：QA 誤找語言 select、誤在 modal 遮罩後點語言鈕、未等待 lease-backed modal 的立即查詢。只修驗證器，未為此改產品操作或放寬斷言。

可重跑原 App 測試：`npm run qa:safety-meeting-sources`。全部資料為合成 QA；不要把測試資料匯入正式站。

## 正式套用順序（使用者執行）

1. 先保存／關閉既有未保存草稿；確認正式庫已完成 001–018。版本未知時先唯讀核對，不能盲目重跑舊 migration。
2. 執行 `supabase/migrations/019_safety_meeting_sources.sql`。此檔只擴充已知函式的來源與無 Item 白名單，不回填業務資料。未知版本／權限漂移會拒絕；相同已驗證候選重跑為 no-op。
3. **另行執行唯讀** `supabase/safety-meeting-sources-readback.sql`，確認 `PASS_SAFETY_MEETING_SOURCES_INSTALL_ONLY`、26 個檢查皆為 true。此 PASS 只證明安裝，非正式 UI／保存／匯出驗收。
4. SQL 核對通過後，由使用者 Push／發布新版前端，再重新開啟新版。部署前先做好草稿保存；不要只更新前端而漏裝 SQL，否則新來源會被舊 validator 拒絕。
5. 依使用者允許的正式測試資料驗證新增、讀回及報告；本機驗證不能取代這一步。001–018及舊 readback 未修改，舊 readback 的函式 hash 可能因019升級失配，不代表應重裝舊 SQL。

本交付未 Push、未部署、未執行正式 SQL，未清除正式資料或瀏覽器草稿。
