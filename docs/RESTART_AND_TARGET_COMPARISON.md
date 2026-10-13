# 一鍵重新開始與目標／實際分數對照

## 本批邊界

本批只完成使用者新增要求中的：

1. 管理 → 系統／資料的「一鍵重新開始」。
2. 總覽 → 目標分數試算的逐章及平均「實際自評」「分數差距」。

「保存現目標」尚未接上儲存：共用雲端（Owner/admin保存）、個人雲端或本機保存會有不同的多人與權限後果，已提出選擇但未收到使用者答案，不能把建議當成批准。這個未完成範圍獨立保留，不把本批稱為兩項需求全部完成。

## RESTART-UPDATES-1

- 沿用系統／資料現有 Owner 專屬入口；伺服器以 opaque session 再次確認有效 Owner。管理員、操作員、船舶相容角色及匿名均不能呼叫此寫入。
- 對話框提供「否／TMSA／DRYBMS」。否、關閉及尚未選取不呼叫重置命令、不改任何業務資料。
- 選擇框架後，伺服器在一個交易中將该框架所有現存 Item 對應且 reviewed 嚴格為 true 的 assessment 改為 false，包含停用 Item。已未勾選者不重寫，不補建缺少的 assessment。
- 只允許 reviewed 及正常版本／業務異動時間／操作人改變。保留 Y/N、符合程度、執行狀態、自評、佐證、部門、人員、來源、未知舊欄位、原ID、createdAt、另一框架及全部改善與歷史。
- 使用與一般單條編輯相同的 `record:item:<itemId>` 交易鎖，依穩定ID順序取得；保留單筆 CAS 版本。所選框架存在任何有效 Item 編輯 lease（包括另一個 Owner 分頁）則全部拒絕，傳回持有人，不竊取／清除鎖。
- 伺服器接纳批次時一次固定该框架現存Item IDs，鎖、lease檢查、修改使用同一份集合；批次開始後新建的條目不混入，不能繞過其新編輯鎖。並行回歸在自有PostgreSQL的原函數中僅插入QA交易屏障，透過正常admin claim/save建立新條目，修前實證會誤改，修後原值／版本保留；驗完還原精確函數。此受控屏障證據與10項未插入屏障的原SQL情境分開描述。
- 每個受影響 assessment 同交易記錄 before/after audit；整批共用不可變 operationId 及 session/client 绑定 receipt。重播先查原 receipt，再進入 Item 鎖，不重做已提交的修改或重複 audit。跨框架換用同一 operationId 必須拒絕。
- ACK完整檢查框架、原操作、changedCount、唯一Item/record、reviewed=false及合法版本。立即合併權威回覆並抬高 ACK fence，舊同步不能把狀態倒退。其後再權威讀回。
- 本機 sessionStorage 只保留待核對的操作意圖，按URL/client/actor/opaque-session雜湊隔離，非業務真相。送出前保存原意圖；未知結果不自動新建批次，刷新同一會話後仍能人工核對／重播。伺服器已ACK但本機清理失敗不得改成未知失敗；已ACK而後續讀取失敗要明示部分成功，不能再做一次。
- 現行 TMSA 計分以 reviewed 為門檻，因此重新開始會按原規則重算目前分數。DRYBMS 的四級百分比不清空。凍結歷史分數不變。

## TARGET-COMPARE-1

- 保留原試算模型、輸入範圍、框架／章節篩選與「還原目前分數」操作。
- 每個章節目標旁顯示原共享計分函數的實際自評與 `目標－實際` 差距；目標平均旁同樣比較同一所選完整章節範圍的實際平均。
- 未評分用 —，暫估明示；沒有實際分數就不製造零分或數字差距。輸入／還原目標沒有雲端業務寫入，不改評定／稽核／改善。
- 維持原導航、表格密度、字體、品牌及双語。新增平均辅助行採14px；不改既有主分數字級，手機不撐寬 document。

## 驗證方式與界線

```bash
npm test
npm run typecheck
npm run build
npm run qa:restart-updates
npm run qa:restart-updates-ui
node scripts/verify-public-artifacts.mjs
```

- native 使用每次新建且端點驗明為 loopback 的自有 PostgreSQL，真實 anon 交易及正式 ApiClient。合成314個Item（TMSA208／DRYBMS106）跨過單頁／100筆界線，不是正式公司存量。
- 測試包含停用Item、未知舊欄位/null保留、完整正文/Y/N不動、Frozen history不動、角色拒絕、同操作重播、錯框架重播、有效lease全部拒絕、最後一筆audit故障使全批回滚、已未勾選零業務修改及新舊唯讀安裝核對。
- 原 App 使用自有無登入資料的 headless Chrome 及獨立測試身份；封鎖非 loopback 外連。不是正式 Supabase，也不動使用者既有 Chrome 分頁／profile。
- 原UI覆蓋否的零RPC／零資料修改、真SQL COMMIT後held ACK不提前完成、持有人拒絕、lost ACK＋刷新＋原操作重播、第二瀏覽器讀回、目標修改／還原零寫入、未知不是零、桌面1440及手機390與中英文對話框、ACK不被本機清理故障降級。截图与receipt在忽略的 `qa-evidence/restart-updates/`。
- 舊正式角色／多人保存及 Excel／PDF 實際下載／原生Excel接受的未收證據不因本批本機通過而結案。

## 已執行的本機驗證

- `npm test`：132/132 PASS、0 fail、0 skip。
- `npm run typecheck`／`npm run build`／公開產物掃描：exit 0；22公開檔、沒有公司私有正文洩漏。
- native：11項 PASS（10項原SQL、1項仅在自有DB插入QA屏障的並行回歸）；初始合成314 Items，重置208 TMSA／106 DRYBMS；新唯讀安裝核對11 checks全部true。這不是正式存量或正式重置驗收。
- 原UI／版面：15項 PASS，含兩個真瀏覽器身份、1440／390、中文／英文、未知結果＋刷新＋原操作與ACK清理故障。所有自有UI/API/PG端口已核關閉。
- 受影響程式及SQL輸入SHA與receipt對照；不把未回覆的保存範圍問題當成通過。未要求新独立代理review；使用有限自我檢查及可重現回歸，不代表全平台無缺陷。

## 尚未執行的正式發布

本機允許驗證與 commit；使用者仍負責 Push、部署及正式SQL。正式站/資料目前沒有被本批修改。

新增後端檔案：`supabase/migrations/006_restart_updates.sql`。它只安装功能，不會執行重新開始，不重跑001–005／Owner初始化／seed。

獨立唯讀檔：`supabase/restart-updates-readback.sql`，預期 `PASS_RESTART_UPDATES_INSTALL_ONLY`，所有 checks 為嚴格true、initialized/imported true、唯一有效Owner。此結果僅證安裝，不等於實際正式重置／多人保存驗收。

若已Run006或結果未知，先唯讀核對，不重跑安裝。完整SQL須於完成本機commit後從 immutable commit blob 生成唯讀textarea，依既有Preview手動Ctrl+C／SQL Editor流程另行交接；助手不代貼／Run，不用剪貼簿API。為讓「保存現目標」一併交付，目前不催促單獨發布這個部分批次，先收取目標保存範圍的使用者決定。
