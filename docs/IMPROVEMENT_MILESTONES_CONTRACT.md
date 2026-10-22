# 具體階段目標：已確認實作契約

基線：2022b9d4bc4f27e7e2b51abaee06ab35c05fc48d。使用者已確認先前方案並授權開始；本機實作、測試及commit，由使用者執行正式SQL／Push／部署。此前019–021使用者回報已執行；remote main已核對等於基線，未另稱正式DB已驗證。

## 使用者行為
- 原執行計劃富文字保持為總體計劃；完整編輯／直接更新加入同一改善的緊湊階段表。＋新增文字目標／預期日期；已達成勾選預填本地當日，實際日期可補登或更正。完整細節在編輯及詳情，清單只顯示已達成數／階段數／百分比。
- 等權已達成數÷有效階段數；顯示整數，未全部完成最多99%，非工時比例。無階段舊項目保留手動進度、原結案／重開行為。有階段禁手填另一百分比。首次加入或增刪分母須預覽保存後百分比；原手動值不暗中寫零。
- 延期從目前預期日期往後移，理由必填；預設勾選順延後續未達成階段，同日曆日差、依陣列順序、保留間隔；可只延當階段。前段／已達成／實際日期不動。記錄晚完成不自動順延。日期超出整項目標日期明示提醒，不改總期限。
- 撤銷達成需理由；實際日期更正留史。刪除已保存階段須確認；保留刪除前完整階段及歷史，重新按顯示序號排列，穩定ID不重建。新增／移除只改草稿，明確保存才上雲。移除最後階段回手動並預覽當前保留百分比。
- 100%不自動結案；未全部達成不可結案。有階段重開保留達成事實與日期。已結案的階段唯讀，先重開再改，close/reopen本身不改階段。
- 所有階段操作先草稿；取消零業務寫入；原角色、useRecordEditor、lease／CAS／ACK與失敗保稿不變。歷史不可改，沒有autosave。舊無階段記錄不回填。

## 固定工程介面（同一 improvement；不新增鎖或儲存實體）
- `milestones?: ImprovementMilestone[]`，每列 `{id,goal,plannedDate,achievedDate}`；goal純文字保留換行、plannedDate必填有效YYYY-MM-DD、achievedDate為空或有效日期。是否達成由非空實際日期決定；順序即array順序。
- `milestoneEvents?: MilestoneEvent[]`，append-only。每筆 `{id,at,by,kind,milestoneId,reason,cascade,before,after}`，before/after為完整有序階段列快照。kind為 `plan|achieve|correct|revoke|postpone|remove`。actor/time在server stamp，舊前綴精確保留。
- `plan` 是新增與目標修改的批次checkpoint，milestoneId/reason空、cascade=false；不得刪除、重排、改已保存預期日或達成日。允許尚未正式保存的新階段調整初始日期。達成／更正／撤銷／延期／移除各有對應單一明確event。
- 新事件從已保存milestones依序重播；每次before必須等於前一after，最後after必須等於提交milestones。plan只可保留原順序及尾端追加；其他事件必須等於該命令精確計算結果。不得以直接改欄位繞過理由或歷史。
- UI在明確階段命令前及確認保存前checkpoint未記錄的plan草稿，不逐鍵增加歷史。尚未完成的草稿可保留空欄，但保存／階段命令前驗證。
- client保存前計算percent；server重新計算並拒絕不一致。新的手寫進度event同樣使用最終百分比。階段異動由server追加一筆雙語進度摘要（獨立保留手寫說明），不改舊events。
- 已存在的milestones／milestoneEvents被舊client省略時保留；明確[]必須具有合法remove歷史。舊client嘗試有損改percent或未完成結案拒絕，不暗改階段。close/reopen保留階段與其歷史。
- 所有讀取／授權快照沿用既有body，不增加公開RPC或grants。前向022 migration在021之後；001–021與既有readback凍結；僅DDL、無業務回填，新增catalog-only readback。若增加私有helper，其ACL限owner，不新增browser能力。

## 有限驗證與收尾
- 行為RED經原improvementValidation：未完成階段不能結案；核心測試日期／跨月／連續延期／不順延完成階段、撤銷理由、分母與99%上限、舊手動流程、歷史重播。
- 原生PostgreSQL實際安裝前RED／安裝後保存讀回、資料與audit不回填、舊client省略、篡改拒絕、角色／lease／CAS／相同操作重播、server stamped history、close/reopen及GM排除。
- 真實原App＋合成資料：新增／達成／更正／撤銷／延期預覽／取消／保存／第二端收斂／失鎖保稿；桌面／390px與繁英；原總體plan與手寫進度保留。不冒充正式Supabase。
- 詳情、清單、inline、總覽／報告、PDF／Excel共用完成率；實際輸出含完整階段及延期／撤銷歷史、原授權篩選集合／字級／全文保留。
- npm test／typecheck／build與public hygiene；一次有限獨立審查，只修可重現且違反本契約的缺陷。無全面架構／權限重設計、無review迴圈。通過後精確本機commit、新SQL交接；不代Push或正式SQL。
