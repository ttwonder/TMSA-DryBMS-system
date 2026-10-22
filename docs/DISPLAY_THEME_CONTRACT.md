# 顯示模式（本機偏好）

- 頁首原語言按鈕旁新增緊湊選擇控制：正常／暗黑／護眼，英文為 Normal／Dark／Eye care；未登入也可使用。
- 正常保留原配色、正文大小與操作密度；暗黑使用深底淺字；護眼為低刺激的暖白／淡綠配色偏好，不宣稱醫療效果。
- 三模式共用既有頁面、導航、欄位、權限與業務操作，不重建 App、不切換身份、不丟失正在編輯的草稿。
- 模式使用 `html[data-theme]` 及 screen-only CSS。預設正常，不跟隨 OS 深色；選擇存於該瀏覽器的 `fpmc-compliance-theme`。無效值或不能讀取偏好時回正常；寫入偏好失敗仍可在當次頁面切換。
- 不將模式送至 Supabase，不修改 records、資料形狀、角色、lease/CAS/ACK、歷史、來源、匯出資料或富文字儲存格式。
- 暗黑／護眼需涵蓋七頁及入口、表格、表單、富文字編輯／閱讀、展開多選、對話框、選中／hover／focus／disabled、提示與語意狀態色；正文與底色須有足夠對比。
- 黑／紅／藍／綠富文字的暗色顯示調整只屬螢幕 CSS。原色 ID、原 inline 顏色及正文保存不改；列印及 PDF／Excel 仍用原色。
- 原 App＋合成測試資料＋獨立 native PostgreSQL 驗證，與正式 Supabase／Pages 分開；不自動 Push、部署或執行正式 SQL。
- 驗證入口：`node.exe --experimental-strip-types scripts/verify-display-themes.mjs --baseline=<原正常模式基準 JSON>`。先保留原版本正常配色與 print 基準，再驗證新模式、對比及保存讀回。
