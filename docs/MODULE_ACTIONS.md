# 三個業務模組：操作與整合契約

寫入範圍僅 `src/Improvements.tsx`、`src/Inspections.tsx`、`src/Management.tsx`、`tests/modules.test.ts`、本文件。不改共用型別、domain、hook、API、App、CSS、package、SQL或私有來源；沒有 commit/push/正式雲端變更。驗證界線為有限原始碼／pure-helper／React靜態渲染自測與TypeScript檢查，不等同原生SQL或瀏覽器驗收。

## 儲存與草稿

- 所有業務記錄保存透過既有 `useRecordEditor<T>`：improvement、inspection、person、framework、chapter、item、settings。
- 新記錄使用 `newBase`，版本0；Claim在開啟編輯器時取得。新增／取消不自動保存；只有dirty才询問放棄草稿；busy禁止關閉。個人／敏感表單的未準備密碼以global editor event保護，不把秘密值放入event。失鎖由共用hook保稿並禁止保存。
- 進度模式只編輯本次新加的事件；既有事件唯讀。Close/reopen分別使用獨立intent，不改Y/N或自評。
- `Improvement.title`型別是string：英文與繁中以第一個換行分隔；舊單語title不改寫，列表使用BilingualText英文上／繁中下。content保持原BiText。

## 待改善項目

- 搜尋、框架、章節、部門、執行人、狀態、急迫程度、更新起迄日；日期不是回溯快照。
- 每列checkbox明選，沒有「自動選全部」。有效選取由明选ID與目前篩選結果交集、去重得到；空交集直接拒絕匯出。
- PDF：`authorizeExport({format:'pdf',kind:'improvements',ids,snapshotToken,filters})`後把返回canonical state傳給`downloadImprovementsPdf`。報告失敗只顯示錯誤，不宣稱已下載。
- 新改善預設non_external。external來源需要檢查及明確finding；既有來源欄位唯讀保留。inspectionId:findingId是去重key。正面、no_finding、guidance不產生缺失。相關Item／部門／執行人多選，Item可跨框架；external Item仍需來源finding涵蓋。
- 星標使用`domain.openIssuesFor`；接收父層`focusId?:string`，或hash query的`improvementId`／`focus`。Case id只開canonical詳情；Item id限定該Item的改善（仍用原id，不複製），新改善預填該Item。

## 歷史檢查

- 建立時冻结當前啟用framework/chapter/item，所有result未知；目前自評帶入必須使用者按按鈕及確認，寫入scoreNote警示，不冒充audit證據。
- 按章節導覽、獨立YN/reviewed/conformity、中英觀察／建議；DRY每章四級只接受未評／0／25／50／75／100。
- 共享`inspectionScore`，完整性與sourceGap／DRY未知級別的保守規則完全由domain計算；不複製分數公式。score=null顯示未完整記分而非0（包括舊來源results為空）。來源缺口顯示暫估。
- Final不開編輯鎖；修訂新id/version0/supersedesId，保留原快照，不覆寫舊inspection。
- 原始findings完整唯讀顯示observation/recommendation/source/warning。新人工檢查可由Item加入發現，預設general，必須自行明確分類；不自動改No。建立改善取已保存canonical finding並用另一個improvement hook，確認後才保存，去重後導到原改善。
- 檢查PDF同樣授權後使用canonical state；不匯出尚未保存的草稿。

## 管理

- Owner/admin及權限矩陣才能進入；operator/vessel即使矩陣有誤也不能進。
- 人員新增／編輯／停用／再啟用，穩定id保留。admin不能編輯Owner，Owner不能由一般角色選單建立或轉移。
- Owner/admin密碼必需，operator/vessel可選。密碼type=password；點「在瀏覽器準備密碼」以WebCrypto SHA-256處理，再明確保存。credentialHash只存在編輯payload，readstate與日誌不可含密碼/hash。
- Owner專用RPC：`site_password({credentialHash,newGateHash})`、`transfer_owner({targetId,credentialHash})`；執行後讀回再顯示成功。轉移可能撤銷舊session，若讀回未成功，顯示重新登入確認而非假成功。
- 角色矩陣依委派契約透過settings hook保存，僅Owner可變更。Owner全權及admin的enterManagement/manageUsers兩格固定true且不可編輯。原六部門同一settings紀錄：改名稱／停用／新建，不能硬刪舊關聯。
- 框架只TMSA／DRYBMS。framework/chapter/item增改停用再啟用，中英KPI/BPG、level/code/order/department多選、stable id不變。歷史與原sourceOriginals/crosswalk保留。
- sourceGap提示不可清空。resolved需新增有file、page/cell/rawItem及補證note的source locator，再勾選及明確保存。不得批次清缺口。
- 操作紀錄只`api.queryAudit`查詢種類／Item code／人／日期／全文，包含offset/limit及準確total；成功查詢的篩選獨立於輸入中的篩選，翻頁延用前次查詢。不是篩選state.auditLogs的最新部分。
- Owner私有JSON選檔：schemaVersion1、必需陣列與id/version／count預覽、拒絕seed內credential/person/settings，空業務庫及人工確認後`importSeed`，伺服器完整再驗證。私有資料不嵌程式。
- 備份由`api.read`下載本機private-platform-backup JSON，包含完整state，不是seed restore API；不宣稱已實作還原。備份不進git。SQL panel只顯示publicURL／anonKey。

## SQL／共用端的整合接線與剩餘驗證

本模組不修改API或SQL。已讀取同伴更新後的源码，确认以下先前差異已由其收斂；這是接線確認，不是本模組的SQL執行驗收：

1. settings一般保存現在走manageUsers，Owner/admin可保存departments；siteGateConfigured不能由一般保存修改。
2. 本頁仍使用settings hook與update intent；`ApiClient.save`比較rolePermissions並自動選擇`role_permissions`專用RPC，沿用lease/CAS/operationId。SQL僅Owner可變更矩陣，且部門不得一併變更。Owner全權、admin.enterManagement/manageUsers固定true。
3. Item sources採原前綴不可變／sourceOriginals及sourceGap保留，追加補證可用，SQL再次要求resolution有新增支援。UI也將已保存來源定位欄位禁編。
4. external source只允許classification=finding；UI也只對明確缺失建立改善，不把positive/no_finding/guidance/general推成No。
5. 檢查snapshot.scoringVersion與SQLcanonical一致：`company-20-equal-stage-v1`／`drybms-guidance-v1.1-p7`。SQL會構建當前完整框架，仍請父層驗證「新草稿打開後框架被別人修改」時，不會悄悄把舊評定套到新要求；這個競態不是本模組已驗收的範圍。
6. `site_password`已支援newGateHash；`transfer_owner`已支援targetId。前端使用精確委派契約欄位，不自行猜舊鍵。
7. hook保存會refresh讀回；轉移Owner會使舊session失效，成功命令後原Owner讀回可能失敗。本頁不宣稱未確認的成功，提示重新登入核對；父層需驗證重新登入後唯一Owner及舊session撤銷。

父層尚需完成整體typecheck/build、真正mounted瀏覽器操作／下載、原生SQL整合與手機版面驗證；本文件不將父層正在執行的工作列為已通過。

## 父層CSS需覆蓋的額外小類

- `improvement-table`：清單正文16px，緊湊列距但不縮字。
- `text-button`：清單標題可點，字體繼承、左對齊。
- `preserve-lines`：white-space:pre-wrap;overflow-wrap:anywhere。
- `progress-history`、`inspection-item`、`inspection-finding`：區塊間距／邊線。
- `chapter-navigation`：flex wrap。
- 既有modal-body需max-height/overflow:auto，手機form-grid單欄／表格可水平scroll，長英文不撐出viewport。

## 有限驗證記錄

- 新增前先跑4個原始碼接線契約，全為RED（頁面缺失），實作後4/4 GREEN。這是原始碼接線證據，不是使用者事件端到端TDD證據。
- 直接執行typescript bin（原目錄名稱有&，npm/cmd的.bin wrapper在Windows會失敗）。完整typecheck/build由父層整合後再次驗證。
- 父層追加focusId契約後，先以真helper回歸觀察RED（resolver缺失），加入實作後GREEN。其餘helpers與React靜態渲染為實作後有限回歸，未宣稱全面test-first。
- `tests/modules.test.ts`包含原始碼接線、真pure helper執行、WebCrypto及React靜態渲染；最終18/18通過（exit 0）。不等同事件操作、瀏覽器下載或原生SQL。
- 整合typecheck中App的Reports/reports大小寫及其他父層檔案曾失敗，沒有越權修正或等待反覆poll；本模組另以TypeScript program限定三頁與module tests及其imports檢查，最終diagnostics=0（exit 0）。該program需process.chdir至正確repo，否則測試工具從E:/Projects解析vite/client會失敗，已修正測試工具cwd而非修改產品。
