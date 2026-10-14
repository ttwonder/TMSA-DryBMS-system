# 歷史檢查觀察／建議輸入效能：本機驗收

## 範圍與原因

使用者回報原「編輯檢查記錄 → 缺陷／改善建議」的觀察／建議文字輸入卡頓。保留原畫面、導航、文字與操作，只修正每次文字變動都重新建構選項及callback，導致每筆finding的全部Item checkbox重複更新。

產品變動只在 `src/Inspections.tsx`：沿用原MultiSelect，以memo包裝發現相關Item選擇器；選項依同份frozen snapshot及語言建立穩定引用；穩定callback轉送至最新updateFinding，不保留過期草稿或busy／pendingUnknown判斷。原textarea、updateFinding、sessionStorage保稿、計分、角色、lease／CAS／ACK、手動保存及SQL均未改。不增加debounce，不另造草稿或保存協議。

## 測試環境與RED

**真實原App＋合成資料＋自有本機PostgreSQL，不是正式Supabase／Pages驗收。**

每框架12筆finding；TMSA為20章／288 Item，DRYBMS為30章／300 Item，分別在原畫面保留3456／3600個Item勾選框。這是明示的性能測試規模，不是公司正式資料盤點。四個中英文觀察／建議欄位逐字輸入，另測瀏覽器composition協議；不將CDP組字等同Windows原生輸入法驗收。

- 有效RED：`qa-evidence/inspection-input/baseline-2026-10-14T17-17-39.401Z/receipt.json`。8個欄位視窗皆超量更新；兩框架取消零業務寫入及內容斷言先通過，最後因不必要checkbox更新而FAIL。
- 首次基線的關閉按鈕selector歧義另留在較早receipt，是測試定位錯誤，不是產品故障。已限定原page-actions後取得上述有效RED。
- 第一個GREEN：`qa-evidence/inspection-input/green-2026-10-14T17-20-32.630Z/receipt.json`。同一開發模式、相同fixture及相同測試腳本hash；8個視窗的未變動picker DOM mutation全為0，輸入不觸發save／claim／finalize／restart寫入。

| 開發模式比較（每框架64次輸入） | 修正前中位／P95 | 修正後中位／P95 | 未變動picker DOM mutation合計 |
|---|---|---|---|
| TMSA | 181.85／512.7 ms | 103.05／135.4 ms | 673920 → 0 |
| DRYBMS | 257.4／568.5 ms | 109.1／125.3 ms | 702000 → 0 |

指標為input事件至下一個requestAnimationFrame，不是物理顯示延遲或React render時間。開發與正式編譯模式不可混算倍數。比較記錄：`qa-evidence/inspection-input/comparison-2f31a0c.json`。

## 正式編譯版本機驗證

開發模式殘餘延遲另用已編譯dist核對，未繼續擴大產品修改。

- 指令：`npm run build`；`npm run qa:inspection-input -- --production --profile`。
- PASS receipt：`qa-evidence/inspection-input/green-production-2026-10-14T17-33-22.205Z/receipt.json`，綁定31個原始碼／測試／SQL／實際dist檔案SHA-256。
- 每框架4欄位／64次輸入：TMSA中位30.8 ms、P95 38.2 ms；DRYBMS中位38.95 ms、P95 45.8 ms。每框架第一個欄位有額外CPU取樣，其他三欄位未開取樣；未開取樣的48次輸入P95分別39／43.4 ms。此處僅描述修正版，沒有以開發基線冒充正式編譯版前後比較。
- 7個完整案例、8個欄位輸入視窗PASS。包括同DOM節點、焦點／游標、完整文字、瀏覽器組字、Item勾選與後續文字不互相覆蓋、語言切換、改開另一體系記錄、新finding、390px手機。
- 四欄位及Item關聯經原保存按鈕實際寫入本機PostgreSQL；等待ACK時變更被原guard拒絕。另開全新admin瀏覽器查看，再刷新重開核對保存內容；一次保存只有一次版本／audit／operation推進。
- 取消零業務寫入；其他finding、snapshot、逐項results、DRYBMS百分比、來源、原final/imported狀態、另一體系、當前自評及linked improvement均保留。
- 0 pageerror、0外部網路請求；測試擁有的UI／API／PG均已停止，receipt cleanup全true。桌面／手機截圖已檢視；CSS與原表單結構不變。

## 回歸與交付

- `npm test`：178 PASS；`npm run typecheck`、`npm run build`、`git diff --check` PASS。
- `npm run qa:inspection-sections-bulk`：29原UI案例PASS，內含4個native斷言組，不相加當獨立E2E總數。receipt：`qa-evidence/inspection-sections-bulk/green-2026-10-14T17-23-50.464Z/receipt.json`；13個受測輸入hash與產品候選一致。
- 公開產物核驗PASS：22公開檔、0模板註解、1625私有正文標記核對，privateDataPublished=false。
- build保留既有reports.ts混用靜態／動態import提示；不是新增錯誤，本批未擴大處理。
- 有限自檢：產品僅新增選擇器memo／選項與callback引用穩定性；保存、hydrate、lease、計分及CSS原碼未改。測試最後只加正式編譯／CPU量測模式，產品bytes未變；不重跑無變更的全部閘門。
- 無新SQL或正式資料migration。可沿原發布流程由使用者Push；本機commit不等於網站已更新，正式資料量、瀏覽器擴充套件及Windows原生IME體感仍須發布後確認。
