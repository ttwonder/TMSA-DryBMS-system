# 待改善更新：來源讀取與保存結果分離

## 範圍與現場事實

- 使用者確認：尚未按「確認保存」，開啟更新後即出現提示。兩張截圖分別是外部發現分類警告，以及要求核對／重播原操作的 `NETWORK_UNKNOWN`。
- 018及第三步readback由使用者明確確認已完成；本批不重跑018、不修改任何SQL，也不把本次前端問題歸因於018未安裝。
- 本批只有本機修正及驗證。沒有刷新使用者的正式分頁、清除草稿、重試正式保存、Push或部署。

## 可重現的程式問題

1. 原更新視窗對既有外部改善亦會自動hydrate整份來源檢查，即使進度更新不使用完整歷史snapshot。
2. 此背景讀取的錯誤直接進入保存驗證提示，導致未發出save也顯示「無法確認伺服器結果／原操作重播」。
3. 原前端驗證只接受完整finding。權威thin來源摘要已有該finding的分類，卻因沒有完整findings陣列而誤報「正面觀察或指引不能作為缺失」。
4. 原App＋ApiClient＋owned native PostgreSQL的受控來源讀取中斷，重現了未保存即出現相同NETWORK_UNKNOWN；前端單元RED重現相同分類警告。這是程式路徑及受控失敗證據，**不是正式網路中斷／20秒逾時原因的證明**。沒有取得當時正式瀏覽器的RPC trace，亦不聲稱正式環境已恢復。

## 最小修正

- 既有記錄、相同version及完全相同外部identity，且Item未超出原已保存集合時，使用目前權威來源摘要的分類驗證；Observation及OFI皆可追蹤，不另存第二個分類欄位。
- 進度／結案／重開符合上述條件時，不再因開啟視窗而下載整份來源檢查。完整編輯仍可載入來源選項，但其讀取失敗不阻斷已可由權威摘要驗證的原連結進度／metadata保存。
- 新增／更換來源／新增Item、分類未知，以及無定位imported general例外，仍須完整來源驗證；不猜測資料、不放寬原例外。一般觀察所需來源缺失時保留草稿並提示「資料尚未載入」，不誤說它是正面觀察。
- 來源讀取錯誤獨立呈現為讀取提示；保留診斷code，但不冒充保存結果、不要求重播一個尚未提交的操作。保留generation／actor／session邊界。
- 原server來源校驗、權限、lease、CAS、手動保存、不可變operation、pendingUnknown及ACK成功條件不變。沒有新增RPC／SQL、增長timeout、業務回填或持久快取。

## 驗證與證據

- 原始RED：`qa-evidence/improvement-update-save-incident/unit-red.log`；`red-2026-10-21T07-12-00.350Z/receipt.json`。
- 最終專項：`green-2026-10-21T07-27-18.298Z/receipt.json`，9個唯一案例PASS：非外部控制、兩框架進度保存及讀回、完整編輯來源失敗、general缺來源／完整來源、實際續鎖＋來源分類增量同步＋第二客戶端、結案及原生來源Item拒絕。
- 原改善操作回歸：`qa-evidence/improvement-update-actions/green-all-2026-10-21T07-28-11.501Z/receipt.json`，18個唯一案例PASS；含失鎖、真正lost-ACK、角色／GM、取消、完整編輯、結案、雙語桌面／手機。
- 專項驗證在保存前比較完整business records，確認開啟／輸入零寫入；保存後核對版本、進度事件、來源identity／正文／Item及原檢查。分類更新與續鎖後保留同一textarea、游標及草稿。
- 新增可重跑命令：`npm run qa:improvement-source-loading`。使用合成資料、原App／ApiClient及本機原生PostgreSQL；受控故障僅作用測試的inspection_detail，不接觸正式服務。
- 最終exact staged unit／typecheck／build／公開產物檢查與blob綁定：見本批`parent-exact-staged.json`及`delivery-receipt.json`。QA與失敗證據全部保留，owned測試服務已停止。
- 未更動報告／Excel／PDF，故不重啟無關匯出驗證。正式網路原因與使用者原分頁版本不以本機PASS替代。

## 上線界線

由使用者Push並等待Pages發布。原分頁若有未保存草稿，先另外備份文字，不要為載入修正版直接刷新而丟稿。修正版在新載入頁面生效；正式編輯／保存結果仍需以該次server ACK及讀回確認。本批不代執行該次正式寫入。
