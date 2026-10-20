# 手動備註及五種狀態：本機驗收

## 結論與邊界
原App上的TMSA／DRYBMS備註文字、五態下拉／顏色、同筆手動保存及報告中心獨立Excel／PDF已完成本機驗證。這是**真實UI＋合成測試資料＋獨立本機PostgreSQL**，不是正式Supabase／Pages驗收；未Push、未執行正式SQL、未修改來源資料。

## 使用方式
1. 在TMSA或DRYBMS選Item，按原「修改」。涉及部門／執行跟進人下方填備註、選備註狀態，按原「保存」。
2. 報告中心選「條目備註」、體系及章節，再選Excel或PDF，按「生成並下載」。
3. 只納入**有手動備註文字**的啟用Item；純空白、只有狀態無文字、停用Item及未選章節均排除。有文字但未選狀態顯示「未選擇」。不輸出未保存草稿。

| 狀態 | 顏色 | 儲存值 |
|---|---|---|
| 完全符合 | 綠 | fully_met |
| 部分符合可完善 | 藍 | partial_improvable |
| 部分符合近期無法完善 | 紫 | partial_blocked |
| 不符合可完善 | 橘 | not_met_improvable |
| 不符合近期無法完善 | 紅 | not_met_blocked |

兩欄獨立於來源note、自評、Y/N、計分、完成更新、改善分類／進度／結案；不從狀態推導其他事實。文字與狀態一起走原lease／CAS／手動保存及伺服器ACK，無新自動保存。

## 實際證據
### 行為RED
- `qa-evidence/item-remarks/baseline-2026-10-20T05-39-26.827Z/receipt.json`：原編輯器正向對照PASS；缺備註textbox及native `INVALID_PAYLOAD`。
- `qa-evidence/item-remarks/status-baseline-2026-10-20T05-41-47.406Z/receipt.json`：已有備註文字與DDL資料保留正向對照PASS；缺五態下拉，native拒絕新增狀態。
- 報告builder先得到缺入口的API單測RED，之後以原報告中心實際下載驗證；不把錯誤英文導航名稱造成的測試逾時當成產品RED。

### 最新GREEN
`qa-evidence/item-remarks/green-2026-10-20T06-12-08.319Z/receipt.json`：**29項PASS**。
涵蓋：DDL升級零資料／audit改寫、10項catalog-only安裝核驗、重複安裝拒絕；兩體系保存／讀回／重載／取消；五態逐一保存且不動原評定／來源；已commit但丟失ACK保稿與同操作只提交一次；明確清空；兩客戶端同Item互斥；錯型別／非法狀態／無權限拒絕及零寫入；舊客戶端省略兩欄保存仍保留新欄位；過期版本拒絕；繁中／英文×桌面／390px手機；原報告中心四個實際下載；空選零匯出；無JS錯誤／外部網路。自有三個服務端口均已關閉。

`artifact-verification.json`：**4個實際下載檔PASS**。
- TMSA Excel：7個唯一Item／12實體列；DRYBMS Excel：6個唯一Item／11實體列。從保存XLSX重組每項完整原文，檢查狀態字色／底色、四邊框、WrapText、row-height上限及無公式注入。
- Microsoft Excel以獨立實例、ReadOnly、CorruptLoad=0、禁外部連結／巨集開啟兩份複本；原XLSX hash不變。原生列印PDF均4頁，全文及範圍PASS。自有Excel PID均停止；一次Quit後殘留僅結束可證明新建的自有PID，未操作既有使用者程序。
- 兩份應用程式PDF各4頁；選取文字與完整備註重組、精確Item、五種底色及字色、頁界、字級14／15／17pt、續頁最後LONG_END均PASS。已實際檢視首／續頁圖。

完整 `npm test`：**275/275 PASS**；`npm run build`含typecheck PASS；`git diff --check` PASS。`verify-public-artifacts.mjs` PASS：22個public檔、0個模板comment parts、1625個private narrative markers檢查、無private data公開。既有reports.ts static/dynamic import分塊warning仍在，非本批新增或失敗。

## 有限自審
本次只檢查：新欄位與來源／評分分離、保存／取消／失敗保稿、相容validator、狀態文字與顏色、授權快照及選取範圍、Excel/PDF全文與原UI保留。當前diff內未發現阻塞性問題；沒有聲稱第三方獨立review。

測試修正與產品結果分開：原報告導航英文名是Reports而非頁面標題Report center；測試直接peer寫入後的舊snapshot被正確拒絕，正向下載前重新載入本機合成快照；Excel COM程序清理另設自有worker／PID核對。這些不以放寬產品驗證解決，早期失敗receipt保留。

## SQL交接與正式尚未驗證部分
- 安裝檔：`supabase/migrations/012_item_remarks.sql`，要求011已安裝；**不要重跑bootstrap、001或整包migration**。
- 獨立唯讀核驗：`supabase/item-remarks-readback.sql`。預期 `PASS_ITEM_REMARKS_INSTALL_ONLY`、`checkCount:10`、每個check=true。只證明私有函式／ACL／前後鏈與public route的安裝狀態。
- Migration僅DDL，保留現有業務資料；先保存編輯內容再安裝。未知前置版本或已安裝時停止，不盲重試、不移除guard。
- 正式順序：先確認既有目標專案／011 → 使用者手動Run 012 → 單獨Run唯讀核驗 → 使用者Push／發布新前端 → 新開正式站驗保存、重載與匯出。正式執行、版本及readback尚未驗證。
- 完整SQL將從本次commit blob生成編號唯讀textarea交接，使用者自行Ctrl+A／Ctrl+C／貼SQL Editor／Run；助手不代貼、不使用剪貼簿API、不代Run。

## 重現命令
```bash
node --experimental-strip-types scripts/verify-item-remarks.mjs
uv run --offline --no-project --python 3.12 --with pymupdf==1.26.5 --with openpyxl==3.1.5 --with pywin32 python scripts/verify-item-remarks-artifacts.py <新receipt.json>
npm test
npm run build
node scripts/verify-public-artifacts.mjs
```
Pinned Python套件使用已驗證cache；未固定版本時曾嘗試解析未快取的新版依賴，不能把那次環境失敗當PDF產品失敗。
