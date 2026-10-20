# General Manager：本機完成與正式啟用交接

## 結果與邊界

固定 `management_viewer` 已接入原 App，不按姓名或部門授權。帳號只保留總覽、TMSA、DRYBMS、歷史檢查記錄、報告中心、管理六入口；可查看及指定匯出，不能修改。管理只查看人員、部門、框架。改善正文、件數、星號、關聯改善、計劃與操作紀錄在伺服器完整／增量／匯出及 UI／PDF 均排除，不以「0件」冒充沒有改善。歷史原始缺失／建議、凍結標準、自評與手動備註保留。

**本機實作與驗證完成；正式 SQL、Push、部署、General Manager 正式建帳及正式登入驗收未完成。** 本次使用合成資料、原 App 與獨立原生 PostgreSQL，並非正式 Supabase／Pages。未改其他角色的既有權限，沒有正式業務資料修改或清除。

## 有限驗證證據

| 門檻 | 實際結果 | 本機證據 |
|---|---|---|
| 全套單測 | 279/279 PASS | `qa-evidence/management-viewer/gm-final-unit.log` |
| typecheck／build | PASS／PASS | `qa-evidence/management-viewer/gm-final-gates.json` |
| 原生 PostgreSQL | 57/57 PASS | `qa-evidence/management-viewer/green-2026-10-20T09-41-03.020Z/receipt.json` |
| 013 獨立 readback | 24項全部通過；包含於原生驗證，不加計成額外案例 | 同上 |
| 原 App 瀏覽器 | 28/28 PASS；中文／英文、1440／390px；原 admin／operator 正控制 | `qa-evidence/management-viewer/ui-green-2026-10-20T09-40-31.451Z/receipt.json` |
| 實際下載 | 12份 PASS：兩體系各框架 Excel/PDF、備註 Excel/PDF、歷史 PDF、總覽 PDF | 同 UI 目錄 `artifact-verification.json` |
| 公開產物 | PASS；22檔，1625個私有正文標記未出現在公開內容；模板無 comments／externalLinks | `node scripts/verify-public-artifacts.mjs` |

瀏覽器沒有相關執行錯誤或對外請求；QA 只停自己啟動的服務。UI/native receipts 的來源 SHA-256 與交付候選相符。下載另以 PyMuPDF、openpyxl、原生 Excel 檢查，並視覺核對實際 PDF／手機畫面。本機測試檔與證據留在 ignored `qa-evidence/`，不帶入公開網站。

一次有限自檢涵蓋固定權限、server scope、資料同步、六入口、報告 builder、管理唯讀及正式建帳界線；不把本批驗證宣稱為全站無缺陷或正式驗收。既有全站 layout 探針的非本批總覽高度問題不列為本批 PASS。

## 正式啟用順序（使用者操作）

1. **確認正式 Supabase 專案及前置 migration 至012已完成。** 不重跑001或整套初始化；前置未知先讀回核對。
2. **第一步：013 安裝。** 完整 SQL：`supabase/migrations/013_management_viewer.sql`。只替換已核對的函式，不建正式帳號、不存密碼、不改業務列、不新增公開 grants。預期無 SQL error；重複安裝會拒絕並要求 readback，不應因此重試。
3. **第二步：獨立唯讀 readback。** 新查詢執行 `supabase/management-viewer-readback.sql`。預期 `PASS_MANAGEMENT_VIEWER_INSTALL_ONLY`、`checkCount: 24`、全部 checks 為 true。只證明安裝，不代表正式帳號已可用。錯誤／timeout／未知結果／readback FAIL：停在該步保留結果，不重跑寫入。
4. **使用者 Push／發布前端。** 助手沒有 Push 或部署；發布後另核對正式版本。
5. **既有 Owner 或管理員登入管理 → 人員。** 建立名稱及登入名稱 `General Manager`，選既有「管理層」部門、角色「管理層唯讀／Management viewer」、啟用。必須於頁面安全輸入個人密碼並保存；密碼不貼聊天，不放 SQL、程式、文件或測試。普通操作員與 GM 自己不能建帳。
6. **新登入驗收。** 以正式 General Manager 登入，核對六入口／唯讀／無改善資訊；下載代表性框架、備註、歷史與總覽報告。再以既有管理員確認原編輯與改善功能保留。

助手交付的 Preview 包含從此批 commit blobs 取得的完整唯讀 SQL textareas；使用者自行 Ctrl+A／Ctrl+C，貼入正確專案的全新 SQL Editor 查詢並 Run。沒有剪貼簿 API、自動代貼或代執行正式 SQL。

## 後續獨立批次

使用者已確認的流量優化在本批獨立 commit 完成後開始；保持10秒前景更新，以小型無異動檢查、返回／重連追新減少傳輸。不與 General Manager 混成同一提交，也不將本機完成誤稱正式啟用。

## 015 後續契約修訂（原文為013交付歷史）

以上013驗證數量、備註可見／可下載與當時正式待辦保持為舊版本證據，不代表最新角色契約。使用者其後確認013／014及前端已部署、GM已使用，並明確要求「完整隱藏備註：頁面不顯示、不能匯出，伺服器也不回傳備註及其狀態」。最新有限修訂、015 SQL／獨立readback、本機證據與正式待部署界線見 `MANAGEMENT_VIEWER_REMARKS_DELIVERY.md`；不得再以本文件的舊備註允許條款否定新要求。本批不重建正式帳號、不重跑001–014。
