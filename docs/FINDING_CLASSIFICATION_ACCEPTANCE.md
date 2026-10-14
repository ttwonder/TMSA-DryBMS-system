# 歷史檢查分類：本機驗收紀錄

## 驗收邊界與結果

本輪在原部署來源 `index.html → src/main.tsx → App`、原歷史編輯／細目表／改善清單與既有報表完成修改。測試使用**真實原UI＋合成資料＋獨立本機PostgreSQL**，不是正式Supabase／Pages驗收；不Push、不執行正式SQL、不修改正式資料。

- `finding`＝缺失／Observation；`ofi`＝建議改善／OFI。原其他分類與一般觀察不自動判No的規則保留。
- 兩類均可循原確認保存流程建立細目改善。已關聯來源可雙向改類，但不能藉此刪來源finding、變更原Item關聯或來源定位。
- 分類唯一權威為歷史finding。改善不另存可編輯分類副本；以inspection ID＋finding ID及sourceKey核對取得分類。同finding ID出現在其他檢查不會串錯；缺來源／缺分類metadata明確顯示未載入，不猜成缺失。
- 保存並取得ACK後，原改善ID、來源、內容、進度、事件、關聯及評分保留，只跟隨來源顯示新分類。取消不寫入；lease、CAS及失聯恢復沿用原協議。
- thin summary增加唯讀finding-ID/class map，沒有額外下載完整歷史正文。舊摘要缺map可照舊hydrate；存在map時要求與full detail精確匹配，偽造map仍拒絕。

## 實際通過的檢查

| 層級 | 執行命令／結果 | 範圍 |
|---|---|---|
| 全部單測 | `npm test`，226／226 PASS | 含44個新分類純函數回歸、來源保存、原表顯示、thin/full與舊摘要相容 |
| 原UI＋native分類 | `npm run qa:finding-classification`，23／23 PASS | 安裝／唯讀核驗／兩體系雙向改類、原項保留、第二視窗、取消、等待ACK、lost-ACK、OFI建立、雙語桌機／手機 |
| 既有歷史編輯回歸 | `npm run qa:inspection-sections-bulk`，29／29 PASS | 原章節／批量評定、資料保留、保存與失聯處理 |
| 實際報表 | `npm run qa:finding-classification-reports`，24／24 PASS | 四份中英文PDF，各4頁；PyMuPDF實際抽字核對分類、完整來源／內容與改善進度 |
| 文字輸入回歸 | `npm run qa:inspection-input -- --production`，7／7 PASS | 八個輸入視窗；原大型Item picker沒有多餘重寫，保持輸入節點、焦點／游標、取消零寫入及真實保存讀回 |
| 工程閘 | typecheck、production build、公開產物檢查、diff check PASS | 沒有將私有seed或QA產物納入公開交付 |

案例有重疊，不加總成端到端案例數。44個純函數案例已包含在226單測內，不重複計數。獨立子代理提供純函數／實際PDF檢查，不稱為獨立全系統審查；父代理已核對產物並用最終相關bytes重跑報表與總閘。

## 精確證據位置（ignored，本機保留）

- 總閘原始log：`qa-evidence/finding-classification/final-gates-2026-10-14T18-12-51.990841Z/receipt.json`。其中較早的分類結果由下面最新23案例receipt取代，不混稱同一候選版本。
- 最終分類：`qa-evidence/finding-classification/green-2026-10-14T18-18-43.754Z/receipt.json`。
- 歷史回歸：`qa-evidence/inspection-sections-bulk/green-2026-10-14T18-14-06.048Z/receipt.json`。
- 最終報表：`qa-evidence/finding-classification/reports-2026-10-14T18-14-46.318Z-23600/receipt.json`，同目錄保留四份實際PDF、抽字JSON／文字及選頁PNG。
- production輸入回歸：`qa-evidence/inspection-input/green-production-2026-10-14T18-15-14.826Z/receipt.json`。

23案例receipt核對安裝前後業務記錄／audit／operation不變；只改來源分類時，比對完整原改善及凍結評分。兩個helpers保持私有、原RPC路由／010授權不變。完整唯讀核驗回傳 `PASS_FINDING_CLASSIFICATION_INSTALL_ONLY`、`checkCount:11`且11項全部true。重複安裝被拒絕且零業務寫入。各native／browser QA的ui、api、pg cleanup均為true；報表生成不作網路呼叫，輸入fixture前後一致。

最終核對以各receipt的SHA-256綁定相關來源／harness，再與已暫存Git blob bytes比較；SHA-256不與Git blob ID混淆。`src/reports.ts`工作檔有547個CRLF，Git依既有設定收為LF；已逐位元組確認唯一差異為CRLF→LF，其餘已暫存檔案raw bytes完全一致，沒有為收尾改寫產品。release candidate receipt分別保存raw及blob SHA-256，不假稱兩者相等。

工程閘保留一項`reports.ts`同時static／dynamic import的打包分塊警告，build仍exit 0；沒有隱藏警告或擴大成分塊重構。後續只修改交付文件不要求重跑無關功能。SQL readback收斂為單一catalog JSON後已重跑最新23案例；該唯讀變更不影響其他已通過產品測試。

## 視覺與性能限制

原頁zh／390px與en／1440px可分別看到兩類，原細目表保留進度及來源；未重設計頁面、導航或密度。實際中文PDF抽查可清楚看到建議改善分類及來源／內容，無可見重疊；四份完整PDF文字另有程式核對。

本輪輸入檢查證明原picker工作量與保存行為未回退，不沿用舊版本P95作為新版本速度宣稱。下一requestAnimationFrame僅代理指標，CDP composition不代表Windows原生IME驗收。

新報表跟隨目前已保存的來源分類；已下載的舊PDF不會被改寫。正式011安裝、正式readback、Push、Pages對應commit與正式UI／資料讀回尚未驗證，步驟見 `docs/FINDING_CLASSIFICATION_UPGRADE.md`。
