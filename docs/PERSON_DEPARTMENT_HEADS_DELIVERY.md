# 人員多部門與部門負責人：本機交付

## 行為與相容性

- 原管理新增／編輯人員改為多選隸屬部門，新增「負責人」。一個旗標適用全部所選部門；同部門可有多位負責人，同人仍是同一 stable ID／帳號。它不改角色、權限、密碼或 GM 隔離。
- `Person.departmentIds?: string[]` 為升級後權威；`departmentId` 僅相容投影為陣列第一項，沒有「主要部門」產品功能。未帶陣列的舊記錄讀作原單一部門；未帶 `isDepartmentHead` 讀作不是負責人。讀取及安裝不回填舊資料。
- 新版仍使用原 person claim／lease／CAS／save／operation ACK。舊客戶端省略新增欄位時，已存多部門與負責人保留；顯式 `false` 才取消標記。若省略陣列卻試圖變更已升級記錄的單部門，回 `PERSON_DEPARTMENTS_UPGRADE_REQUIRED`，不截斷資料或偽報成功。
- 伺服器驗證非空陣列、字串有效 ID、重複引用及真 boolean。沿用已停用部門關係保留；設定刪除保護涵蓋人員的每個部門，不只第一項。
- 管理列表、姓名／帳號／部門搜尋、部門篩選與 gate 授權登入名冊均認識全部隸屬部門。安全 `departmentNames` 只在 roster 投影，不保存為 person 欄位；同人在每個所屬部門仍以同一帳號登入。

## 指派快捷與完整入口

「勾選部門負責人」／`Select department heads` 只在使用者主動按下時，把當前草稿部門內啟用且有標記的人員加入已選 stable IDs。聯集去重、重按冪等；不清除原已選（包含範圍外、停用或名冊缺失的歷史 ID）。一般候選的無部門＝全部啟用人員規則不變，但新快捷無部門時停用並提示先選部門；無匹配也停用，不回退普通人員。

原 UI 結構共四個接線位置，涵蓋下列 **13 個原入口**：

| 入口 | 原產品接線 |
|---|---|
| list-create | Improvements 新增完整表單 |
| list-full | Improvements 完整編輯 |
| list-progress | Improvements 直接更新 |
| TMSA-assessment | FrameworkPage 自評 |
| DRYBMS-assessment | FrameworkPage 自評 |
| TMSA-create | TMSA 細目新增改善 |
| DRYBMS-create | DRYBMS 細目新增改善 |
| TMSA-full | TMSA 細目改善完整編輯 |
| DRYBMS-full | DRYBMS 細目改善完整編輯 |
| TMSA-progress | TMSA 細目改善更新 |
| DRYBMS-progress | DRYBMS 細目改善更新 |
| history-TMSA-create | Inspections 發現建立改善 |
| history-DRYBMS-create | Inspections 發現建立改善 |

查詢用人員篩選不加快捷；原無指派欄位的結案／重開不新增。換部門、同步名冊不自動改選人；只有原保存才提交。新控制在 busy／失鎖／pendingUnknown 時停用，保留原操作重播與同節點草稿。沒有修改 `useRecordEditor`、同步排程或十秒同步協議。

## 018 與獨立 readback

- 新增 `supabase/migrations/018_person_department_heads.sql`；只對已知 post017 定義作 guarded DDL，改原 `validate_record_finding_classes_rules` 的 person 允許欄位／相容驗證／部門刪除引用，以及原 `dispatch` roster 名稱投影。
- 保留函式 OID、owner、ACL、SECURITY DEFINER、空 search_path、參數及原授權鏈。不新增公開 API／grants、不改 001–017、不批改業務、歷史、audit、credentials 或任何資料 tuple。
- `supabase/person-department-heads-readback.sql` 在獨立 read-only transaction 查 catalogue／ACL，共 **24 個確定 key**，成功狀態 `PASS_PERSON_DEPARTMENT_HEADS_INSTALL_ONLY`。PASS 僅代表該安裝狀態，不代表正式登入／畫面／報告驗收。
- native 證據覆蓋 clean post017、未知前置拒絕、四類真正 ACL drift、晚期 CREATE FUNCTION 故障整筆 rollback、重裝拒絕、所有資料 tuple 不變、完整 key set/all-true readback。
- **018 安裝後，舊 016／017 readback 因預期函式雜湊不同可能 FAIL；不得因此盲重跑舊 SQL。** 正式版本未知先唯讀確認。018 檔案與新 readback 的精確 SHA-256 位於本批 handback，由父流程依核驗後候選準備 Preview；本批沒有執行任何正式 SQL。

## 驗證層次與證據

完整機器證據：`qa-evidence/person-department-heads/handback.json`（本機忽略目錄，含來源指紋、命令退出碼、原始 receipt、下載／截圖 hashes、失敗歷程與 cleanup）。各層不相加假稱 E2E 總數：

- 行為 RED：原 post017 RPC 的雙部門 payload 被 `INVALID_PAYLOAD` 拒絕；原 mounted 管理沒有多選／負責人，13 入口沒有快捷；既有候選函式漏掉次要部門。原始成功／失敗 artifacts 全保留。
- 主 mounted matrix：管理原保存、取消、修改／取消旗標、原新增、搜尋／篩選、同人兩部門真登入、GM／admin／operator 邊界、13 入口逐一 draft 加選／取消零寫入／原保存／native readback／另一客戶端 sync／重開、四個版型名冊刷新同節點保稿、繁中／英文 1440／390 幾何與截圖。case IDs 由 `PDH-<入口>-head-shortcut`、`-union-retention-cancel-zero-write`、`-save-native-peer-reopen` 精確對應。
- native matrix：34 個 unique cases，含舊省略、顯式 false、非法引用／陣列／boolean、第二部門刪除保護、停用部門保留、無升權、Owner 保護、fenced lease／CAS、同 operation 重播、full／delta／fresh／gate roster、GM 排除、既有 credentials 不變及上述 SQL 安裝拒絕矩陣。
- guard matrix：10 個 cases；四種指派版型實際失鎖與 busy／丟回覆 pendingUnknown／同 operation replay，加管理多部門／負責人新控制。保留早期 guard RED；修的是新增控制，沒有改共用 editor。
- 輸入效能回歸：原 `verify-improvement-input.mjs` 的 12 cases／24 typing windows；原 native016 業務 authority 足以驗證未改的輸入保存語義，這不是018安裝證據。same-node／caret／IME／原選項不逐鍵重寫及兩客戶端讀回通過。
- 四份原報告中心真授權／下載：改善 XLSX/PDF、條目備註 XLSX/PDF。比對 native 已存 canonical snapshot、stable assignee／event-author／closer 引用及停用人員姓名；原 records 不變，每次 export/audit 一次。實體檔另經 PyMuPDF、openpyxl 及獨立 owned Excel `CorruptLoad=0`／read-only 開啟核對姓名，關閉不保存。
- `npm test` 351／351，typecheck、production build、public artifact hygiene、diff-check。保留既有 reports 動態／靜態 import 的 build warning，不藉此改造報告。build 使用獨立 evidence outDir 與 `--emptyOutDir=false`，不清空既有 dist；原 public verifier 僅新增可選 outDir 參數。
- 一次有限自審發現新增管理說明與「Department head」緊貼，先保存原 mounted 幾何 RED，再將新增說明設為獨立行；四種語言／寬度 focused geometry GREEN，無頁面重設計。

## 報告與正式環境界線

本批未修改 `Reports.tsx`／`reports.ts`、原 Excel 欄寬／段次欄或 PDF 效能。使用者已確認正式 PDF **最終能匯出但耗時異常，精確耗時未知**；此問題及 Excel 版面是父流程下一批，不能稱完全不能下載或已由本批修復。

本批一筆小樣本實測 click→下載並核對：改善 XLSX 600ms、PDF 483ms；備註 XLSX 178ms、PDF 303ms。這只是 owned localhost 小樣本引用回歸，不代表正式完整內容的效能。

所有測試皆原 App＋合成資料＋owned localhost PostgreSQL/HTTP/Chromium；未碰正式 Supabase／Pages、使用者 browser／Excel 或其他專案。子流程交回時未 stage／commit；父流程已收到唯一 writer ownership 並完成一次有限來源／證據核驗，按既有授權獨立本機 commit。未 Push、未部署、未執行正式 SQL、未刪除檔案；正式 SQL／Push 仍由使用者處理。

## 父流程核對與本機版本

父流程已逐檔核對 20 個候選、209 個 production/test/config 輸入、956 個保護檔及 412 個證據檔的原始 SHA-256；核對各 run 的 unique case IDs、原始命令 log 與完整24項SQL readback。13/13入口的保存 IDs 與另一端讀回一致；351單測、91 mounted、34 native、10 guards、4管理版面、12輸入案例／24 typing windows、4真下載／6實體檔核對分層成立，不相加成虛構E2E總數。另抽看繁中管理桌面及英文390px指派區截圖。

最後 aggregate 的前四個產品 gate 通過；其 diff-check 失敗為契約末尾多一空行，已由其後 integrity receipt閉合。父流程 path-limited staging 另發現新增 unit test 末尾空行，僅移除一個尾端 LF，並重跑351單測及 staged diff-check；產品 bytes 未改，不重跑無關UI／SQL。最終本機 commit／tree、精確 staged blobs 及文檔狀態追加由 `qa-evidence/person-department-heads/local-delivery-receipt.json` 記錄。
