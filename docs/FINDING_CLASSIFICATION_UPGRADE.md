# 歷史檢查：缺失／建議改善分類升級與交接

## 會改變什麼

- 原「缺失／發現」改成「缺失」（Observation），另增「建議改善」（OFI）。儲存值分別為 `finding`／`ofi`；其他原分類保留。
- 在原歷史檢查中改類，按「保存檢查」並獲伺服器確認後，細目下同一筆待改善項、改善清單／來源說明、新匯出PDF跟隨分類；反向修改同樣適用。
- 兩類均可用原「建立改善（先確認再保存）」流程，仍需明確確認保存。既有改善不刪除、不重建；原ID、細目關聯、來源、改善內容、進度／事件、人員／部門、期限與急迫程度保留。
- 不自動猜測或批次改寫既有資料的分類，也不把OFI自動當成Y/N的No。逐項評定、凍結標準與計分公式不變。

## 新增SQL與前置條件

- 安裝：`supabase/migrations/011_finding_classification.sql`。
- 獨立唯讀核驗：`supabase/finding-classification-readback.sql`。
- 011須在本App原009／010後使用；精確核對既有函式，拒絕未知前版。只擴充驗證與唯讀摘要投影、建立私有helper；不更新任何業務記錄、重新匯入或清除資料，不增加新RPC或公開私有helper。
- 本機沒有代為確認正式Supabase Dashboard目前選取的專案，也未執行正式SQL。執行前請確認是本App專用TMSA／DRYBMS專案、正式環境與原SQL Editor執行身分，不能套用到其他App。
- 若不確定011是否曾執行，先跑本次唯讀核驗：完整PASS表示不要重裝；FAIL／SQL錯誤不是重新安裝許可，先保留結果並釐清前置狀態。不要重跑001、bootstrap、公司匯入或整包migration。

## 已確認尚未安裝011時的順序

1. 先保存正在編輯的內容。安排安裝與新版發布接續完成；舊前端與新摘要格式不視為混版驗收，期間舊歷史視窗可能因摘要核對不同而拒絕開啟。不要用反覆保存或清除瀏覽器資料處理。
2. 在本次commit綁定的Preview第一步，確認完整性PASS後按「選取全部SQL」，自行Ctrl+C；貼到正確Supabase專案的全新SQL Editor查詢，完整執行011 **一次**。此腳本為交易式DDL，正常完成沒有業務結果列；成功畫面本身不證明已核驗安裝。
3. 無錯誤完成後另開全新查詢，執行Preview第二步的完整唯讀readback。兩段分開執行，不合併，也不重跑第一步。
4. 須得到單一JSON結果：`status: PASS_FINDING_CLASSIFICATION_INSTALL_ONLY`、`checkCount: 11`，且11項checks全部為boolean true。保留原結果或匯出CSV供核對；正常通過可依序操作，不必每一步等待對話回覆。
5. 安裝核對通過後，由使用者在原GitHub Desktop資料夾Push已驗證的本機commit，等待Pages發布對應版本；助手不代Push、部署或Run SQL。
6. 發布後在已保存內容的前提下重新開啟新版：選一筆已關聯細目的歷史缺失→建議改善→保存，確認原細目同一項的分類更新；再改回缺失，核對原進度、內容與關聯不變。此正式修改有真實資料影響，應選使用者確定要修正的記錄，不把正式資料當任意測試。

## 遇到以下狀況就停止

- `FINDING_CLASSES_ALREADY_INSTALLED_VERIFY_READBACK`：不重裝，改做本次唯讀核驗。
- `FINDING_CLASSES_UNKNOWN_PREDECESSOR`或任何`*_SEAM_MISSING`：保留錯誤，不移除護欄、不覆寫其他版本。
- 逾時／斷線／是否成功不明：不重試安裝；先保留原結果並做獨立唯讀核驗。
- 任一check為false、目標專案不明或意外警告：先停，不Push、不連續重跑SQL。

## 證據界線

本機原App＋合成資料＋獨立PostgreSQL已驗證分類與原項保留，詳見 `docs/FINDING_CLASSIFICATION_ACCEPTANCE.md`。SQL交接從最終本機commit的raw blob產生，兩段readonly textarea各有SHA-256／UTF-8長度核對；按鈕只聚焦及全選，不操作剪貼簿或遠端系統。

本機完成、正式安裝、正式readback、Push、Pages發布與正式資料驗收是不同狀態。`PASS_FINDING_CLASSIFICATION_INSTALL_ONLY`只證明安裝catalog核對，不代表已代你改類或完成正式畫面驗收。
