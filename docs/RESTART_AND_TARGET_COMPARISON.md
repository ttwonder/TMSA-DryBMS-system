# 一鍵重新開始與目標／實際分數對照

## 本批邊界

本批完成使用者新增要求中的：

1. 管理 → 系統／資料的「一鍵重新開始」。
2. 總覽 → 目標分數試算的逐章及平均「實際自評」「分數差距」。
3. 「保存現目標」公司共用雲端：使用者明確答「是，公司共用」。Owner/admin保存、全登入人員查看、TMSA/DRYBMS分開。舊選擇表單未回答只屬歷史，不再當作阻擋或重新詢問。

新增資料只為每個既有framework的`scoreTargets`章節ID→0–4/null映射；不另建人員目標、不使用localStorage冒充雲端、不重設計既有介面。

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

## SHARED-TARGET-SAVE-1

- 「保存現目標」緊鄰「還原目前分數」；中文/英文、桌面/390px同原版面。修改、還原與篩選只動試算草稿，不自動保存。
- 保存目前框架的章節目標；篩選外的既有目標保留，不改另一框架。0–4、TMSA整數、DRYBMS小數；未評分保留null，不造零分。顯示與差距仍使用原targetMean/實際計分selector。
- 以框架穩定ID及`scoreTargets`保存公司共用資料。`target_claim`/`target_save`在伺服器驗證有效Owner/admin；此能力不附帶框架定義編輯權，管理員的manageFrameworks=false仍可存目標但仍不能改定義。全登入使用者透過既有read/sync讀同一份目標；操作員可試算但沒有保存控制，直接RPC也拒絕。
- 沿用精確`record:framework:<TMSA|DRYBMS>`交易guard與既有75秒lease、session/client/token fencing；CAS使用首次修改時的框架版本。保存只更新scoreTargets及正常版本/異動metadata；來源定義、實際自評/四級百分比、改善/歷史完全保留。
- 一交易含更新、before/after audit及原操作receipt。回覆遺失不自動重試；sessionStorage只保存完整pending意圖，不是業務真相。刷新同會話可核對/重播原保存；receipt優先於過期lease，無重複效果/audit；確認後釋放原lease，不等75秒才讓下一位保存。
- 伺服器ACK立刻單調合併，清理本機journal失敗或後續讀回失敗不把確認成功降成未知；真正未知時凍結原意圖，不可另建保存。版本衝突保留試算草稿，「載入公司目標」須明確确认放棄，不能自動覆蓋。
- 框架管理舊保存仍可用：新validator wrapper保留經hash核對的原validator，非framework全數交回原實作；framework metadata保存保留原公司目標，包括舊客戶端省略欄位。不可透過一般metadata保存改scoreTargets，必須專用命令。

## 驗證方式與界線

```bash
npm test
npm run typecheck
npm run build
npm run qa:restart-updates
npm run qa:restart-updates-ui
npm run qa:shared-targets
npm run qa:shared-targets-ui
npm run qa:shared-targets-regression
node scripts/verify-public-artifacts.mjs
```

- native 使用每次新建且端點驗明為 loopback 的自有 PostgreSQL，真實 anon 交易及正式 ApiClient。合成314個Item（TMSA208／DRYBMS106）跨過單頁／100筆界線，不是正式公司存量。
- 測試包含停用Item、未知舊欄位/null保留、完整正文/Y/N不動、Frozen history不動、角色拒絕、同操作重播、錯框架重播、有效lease全部拒絕、最後一筆audit故障使全批回滚、已未勾選零業務修改及新舊唯讀安裝核對。
- 原 App 使用自有無登入資料的 headless Chrome 及獨立測試身份；封鎖非 loopback 外連。不是正式 Supabase，也不動使用者既有 Chrome 分頁／profile。
- 原UI覆蓋否的零RPC／零資料修改、真SQL COMMIT後held ACK不提前完成、持有人拒絕、lost ACK＋刷新＋原操作重播、第二瀏覽器讀回、目標修改／還原零寫入、未知不是零、桌面1440及手機390與中英文對話框、ACK不被本機清理故障降級。截图与receipt在忽略的 `qa-evidence/restart-updates/`。
- 舊正式角色／多人保存及 Excel／PDF 實際下載／原生Excel接受的未收證據不因本批本機通過而結案。

## 已執行的本機驗證

- `npm test`：134/134 PASS、0 fail、0 skip。PDF/Excel原測試保留；build既有INEFFECTIVE_DYNAMIC_IMPORT提示不另擴範圍修理。
- `npm run typecheck`／`npm run build`／公開產物掃描：exit 0；22公開檔、沒有公司私有正文洩漏。
- native：11項 PASS（10項原SQL、1項仅在自有DB插入QA屏障的並行回歸）；初始合成314 Items，重置208 TMSA／106 DRYBMS；新唯讀安裝核對11 checks全部true。這不是正式存量或正式重置驗收。
- 原UI／版面：15項 PASS，含兩個真瀏覽器身份、1440／390、中文／英文、未知結果＋刷新＋原操作與ACK清理故障。所有自有UI/API/PG端口已核關閉。
- 公司目標Native：14項PASS，含Owner/admin／原管理能力拒絕保持、其他角色拒絕、兩框架獨立、CAS、普通metadata保留目標、audit回滾、原操作重播、重置保留目標、安裝零業務寫入；唯讀13/11/22檢查全部true。
- 公司目標原UI/版面：14項PASS，Owner/admin/operator三個真瀏覽器上下文，刷新／跨人、held/lost ACK＋原操作、衝突保稿、篩選外保留、儲存拒絕、中文/英文1440/390；手機長按鈕自然換行，不縮字、不橫溢。
- 既有業務Native回歸：25項PASS；主要業務cluster在005→006→007後測試，另保留原HTTP及pgcrypto基線控制。不是25項全都在正式雲端。
- 受影響程式及SQL輸入SHA與receipt對照；公司共用範圍已由使用者直接確認，正式驗收仍分开。未要求新独立代理review；使用有限自我檢查及可重現回歸，不代表全平台無缺陷。

目標保存原UI真RED（原畫面沒有按鈕）→GREEN；真PostgreSQL專用保存原UNKNOWN_ACTION→GREEN。框架metadata保存INVALID_PAYLOAD回歸→最小wrapper→GREEN；未知保存刷新後lease未釋放真RED→補原token釋放→GREEN。詳細受控QA紀錄在ignored `qa-evidence/shared-targets/`，不公開身份/session或私有原文。最終數量以本批final-gates receipt核對，不把測試代替正式驗收。

## 尚未執行的正式發布

本機允許驗證與 commit；使用者仍負責 Push、部署及正式SQL。正式站/資料目前沒有被本批修改。

新增後端檔案：`supabase/migrations/006_restart_updates.sql`。它只安装功能，不會執行重新開始，不重跑001–005／Owner初始化／seed。

獨立唯讀檔：`supabase/restart-updates-readback.sql`，預期 `PASS_RESTART_UPDATES_INSTALL_ONLY`，所有 checks 為嚴格true、initialized/imported true、唯一有效Owner。此結果僅證安裝，不等於實際正式重置／多人保存驗收。

新增`007_shared_targets.sql`在006之後安裝，僅DDL，不初始化、不保存目標、不重置任何評定；未知前置fingerprint拒絕，已安裝停止重Run。新版006 readback同時識別精確006/007路由，無未知降級。

本批正式交接順序：006安裝（只在尚未安裝時）→007安裝→另開query執行`supabase/shared-targets-readback.sql`（22 checks全部true、PASS_SHARED_TARGETS_INSTALL_ONLY、initialized/imported true、唯一有效Owner）→使用者Push→核新版CI/Pages→實際公司目標保存/刷新/另一使用者顯示。不重Run已完成001–005、Owner/名冊/業務seed。若006/007已Run或結果未知，先用獨立唯讀核對，不重跑安裝。

完整SQL在本機commit後從immutable commit blob生成唯讀textarea，依既有Preview手動Ctrl+C／SQL Editor流程交接；助手不代貼／Run，不用剪貼簿API。保存範圍已得到使用者答案，不再把等待選擇作為未完成理由。正式角色多人及原Excel/PDF待收證據仍獨立保留。
