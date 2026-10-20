# General Manager／管理層唯讀帳號

## 已確認範圍
- 新帳號名稱與登入名稱為 `General Manager`，歸屬既有「管理層」部門。正式帳號與密碼由既有管理頁建立；密碼不寫進程式、SQL、文件或測試。
- 獨立角色 `management_viewer`，不以姓名、部門或客戶端自填值推斷權限。其他帳號／角色、業務資料與歷史原文不變。
- 只顯示總覽、TMSA、DRYBMS、歷史檢查記錄、報告中心、管理，順序沿用；管理提供人員、部門、框架唯讀查看，不開放操作紀錄、帳號設定、初始化或修改。
- 唯讀與匯出：自評、標準、四級百分比、歷史檢查、名冊／部門均不得修改。伺服器拒絕業務寫入、租約取得、改善及手動備註匯出。
- **GM-R1（取代013備註可見／可匯出約定）**：TMSA／DRYBMS 的 `assessment.remarks`／`remarksStatus` 完整隱藏。左欄備註標題、五態標籤／文字、正文與空殼全部缺席；報告中心無「條目備註」。依server-authored viewScope／真實management_viewer角色，不依姓名／部門。直接備註builder拒絕；新舊export_authorize的 `filters.reportVariant=remarks` 拒絕且零export snapshot副作用。全量、cold／warm delta與實際攜帶欄位的授權／持久化export snapshot須排除兩欄，不以frontend刪值代替伺服器投影。原sync_check小回覆、10秒更新、版本、scope及匯出新鮮度不變。
- **GM-R2（保留正控制）**：Owner/admin/operator／舊vessel的備註原字節、五態、編輯保存／匯出不變。GM部門／跟進人、自評、Y/N／分數、Implementation/evidence、歷史原始觀察／建議／凍結來源及其他note欄保留，不以「備註／改善」關鍵字清洗。inspection_detail只帶原inspection而非assessment；驗證原文相等，不虛構新增清洗路徑。
- 不顯示待改善頁、兩體系關聯改善、總覽重點改善與計劃、改善件數／圖表／篩選、⭐及改善操作紀錄；報表不含改善資料與改善欄位。隱藏資訊不能顯示為0件而誤導為無改善。
- 歷史檢查的既有缺失／建議、評定、凍結標準與來源原文完整保留；不產生改善、不顯示關聯改善狀態。
- 全量／增量／匯出雲端讀取對此角色排除改善及操作紀錄，不能只藏按鈕。角色／停用沿既有session失效機制，不另建登入架構。
- 允許原本框架Excel/PDF、歷史PDF及無改善總覽PDF，均不得夾帶手動備註兩欄／內容；GM不允許備註Excel/PDF。既有角色輸出不變。

## 有限驗證
1. 既有hasPermission的唯讀角色RED→GREEN，角色／停用／原角色正反控制。
2. 真實本機PostgreSQL按原migration鏈升級013，證明保留業務與權限；獨立唯讀readback、重複安裝拒絕。
3. 真實session下全量／增量／匯出不含改善，所有寫入與改善匯出拒絕；原Owner/admin/operator正控制。
4. 原App＋測試資料的六入口、桌面／手機／雙語、所有唯讀／隱藏面、刷新與身份切換。
5. 原報告入口實際下載，核對改善與手動備註正文／狀態／欄名缺席，歷史原文仍完整；非GM備註實際下載須有原文及色態。
6. 單測、typecheck/build、公開產物及diff檢查；來源bytes綁receipt。
7. 一次有限自檢；只處理可重現且違反以上契約的問題，不另開全站審計或多代理迴圈。
8. GM-R1：新增015在獨立native PG按013→014→015演練；前置缺失／漂移／重複安裝fail-closed，資料／ACL／四RPC保留；獨立唯讀readback核對完整checks及精確checkCount。001–014與舊readback原bytes不改。
9. 原App＋native合成資料於1440／390、繁中／英文驗TMSA及DRYBMS整塊缺席及保留欄位；角色切換、普通角色備註正控制、允許檔案實際下載與受影響sync-efficiency smoke。所有數量依新receipt聚合，不沿用013數字。

## 交付與界線
- 本機實作、驗證及分批commit由助手；Push／正式部署／正式SQL由使用者。
- 013不批量建立正式帳號、不修改其他角色、不刪業務資料。先完成SQL及readback，再發布前端，最後使用既有Owner/admin管理頁建立帳號及安全輸入密碼。
- 本機PASS不等於正式Supabase／Pages或正式General Manager帳號已驗收。若正式帳號尚未建立，須明確列為待操作，不稱完成建帳。
- 排除：身份系統全面重構、改善業務規則、評分規則、其他帳號權限、原始歷史文字過濾、全站版面重設計及未授權正式操作。
