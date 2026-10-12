# 已確認的右側布局與驗證範圍

## 使用者確認

兩張原始附件分別標示待改善清單全文／窄輔助欄，以及TMSA／DRYBMS的右側內容排列。使用者在確認表單選擇：

1. 排列正確，底部用「涉及部門／執行跟進人」。
2. 增加／更新在目前條目頁開視窗，保存後仍留本頁。
3. 符合程度、完成更新、執行狀態及本章分數放在上方直接可見。

## 已採用的結構

- 頂部：章節、Item、Stage／級別、改善星號；右側狀態、Edit及本章分數。
- KPI：要求正文；右側評定／執行資訊，只有原編輯流程可改。
- 中段：桌面左Guidance、右Self Assessment＋Implementation / evidence；手機上下排列。
- 滿寬改善表格：保留同一筆改善ID／append-only進度；只列原本的未結案集合。來源及內容完整可讀，手機表內橫捲。
- 底部：原自評departmentIds與assigneeIds，顯示為涉及部門／執行跟進人。不是從改善清單回寫責任分工。
- 來源缺口、來源原文、部門匯入原始回覆、參考對照、DRYBMS百分比及原有上／下一項仍保留。

## 操作不變及新增入口

`Improvements`以可選inlineTarget重用既有詳情／完整編輯／進度視窗，未設定時仍是原獨立清單。新增預填所選Item及該Item既有部門，不把自評草稿抄入改善。保存仍經原ApiClient與useRecordEditor，伺服器ACK後才關閉；未取得鎖、失鎖、CAS或網路失敗仍保留視窗／草稿。取消不保存，dirty草稿沿用原放棄確認。

## 實際驗證層級

- `npm test`：計分、角色、格式輸出、顯示函式及原FrameworkPage的React SSR。SSR不是瀏覽器或雲端證明。
- `npm run build`：型別與正式bundle；既有大chunk提示不在此版面範圍改架構。
- `npm run qa:layout`：原始App＋匿名mock transport；桌面／390px、雙語、閱讀／編輯、長文及正常內容，測量兩欄、右侧板塊間距、全文與表頭、表內捲動及document overflow。此層拒絕全部業務寫入，不當DB或登入驗收。
- `npm run qa:browser`：原始App＋owned PostgreSQL＋loopback HTTP；多客戶端同Item互斥／異Item並行保存、取消、失鎖、Y/N／責任分工、改善新增／進度／結案／重開、授權輸出及歷史。新改善在SQL COMMIT後刻意保留ACK，驗證視窗不提前關；inline更新失鎖時驗證草稿仍在原條目、DB不變；正常增加／更新／取消後不跳頁。
- `node --experimental-strip-types scripts/verify-standard-text.mjs --seed <ignored private source>`：全部私有來源的非空白字元、ID及原檔完整性；只產出統計／雜湊，無正文或人員資料。

最終機械收據及截圖位於ignored `qa-evidence/`。本機測試資料、PostgreSQL和REST adapter均不是正式Supabase／GitHub Pages驗收。

## 交付邊界

本次不執行Push、正式部署或正式SQL，不重新匯入標準／自評／改善。新增的布局和inline入口沿用既有001–003 RPC，不依賴辦公室名冊遷入004。辦公室遷入／角色管理WIP保留，不混入本次版面提交；這些工作仍有自己的未完成驗證及正式SQL/readback交接。
