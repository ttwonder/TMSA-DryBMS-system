# 條目備註六欄 Excel 與 PDF 效能接續交付

## 交付範圍

本批接續 `e838b86f9ff1403462376c55255c82fc1a66f761`，完成先前暫停的 11 檔報告候選，另加入 QA 命令與本文件。使用原 App、真 ApiClient、獨立 native PostgreSQL 與合成測試資料驗證；不是正式 Supabase／Pages 驗收。原 `qa-evidence/remarks-export-followup/handback.json` 保留，不覆寫原暫停與失敗證據。

- 備註 Excel 實際只有六欄：對應章節、Item、備註狀態、涉及部門、追蹤人員、完整備註。沒有第七欄「段次」，也不是把它隱藏。
- 欄寬依使用者截圖相對分配為 `22 / 10 / 13 / 22 / 20 / 126`；全文欄最寬。保留凍結表頭、全資料範圍 AutoFilter、無合併資料列與完整文字／責任分工。
- 長文續列在正文開頭加入文件內 `[序/總數]` 標籤；整表按 Item、完整備註升冪可恢復續文順序。有相同 Item 代碼時須先辨別章節，不支援只排序單一欄而拆散資料，也不宣稱任意排序仍保有原業務順序。
- 一般責任欄於續列完整重複；極長責任文字同組分段保全。為避免 Excel 排序後長文落到短列被裁切，使用共同安全列高；代價是短文列留白。改善／全部進度報表及正式框架模板的欄位規則不變。
- PDF 僅減少相同文字的重複 fontkit shaping。每份文件、每個嵌入字型獨立快取，限定預設 features，限制項目數、總字元數及單筆長度；不跨文件持久保存資料，不近似字寬，不更改授權快照、字型、內容、字級或分頁。

## 最新實際驗證

證據根目錄：`qa-evidence/remarks-export-followup/resumed-e838b86/`。`commands.jsonl` 記錄真命令、時間、exit 與完整 log SHA-256；最終提交與 tree 綁定見同目錄 `delivery-receipt.json`。

| 驗證 | 結果與證據 |
|---|---|
| 最新工作樹單元測試 | 355 / 355；fail、skipped、cancelled 均 0 |
| TypeScript、production build、公開產物檢查 | 通過；公開產物未含 private narrative／模板 comments |
| 原 App + native PG 報告 runner | 12 個具名案例通過，包含正常／長文、冷／暖、診斷、雙語 XLSX 與 GM 拒絕，不把重複診斷當成額外業務流程 |
| 真下載實體檔檢查 | 11 檔通過：完整文字、責任關聯、格式、字型 outline、字級、幾何與前後一致性 |
| 原生 Microsoft Excel | 中文、英文下載以 `CorruptLoad=0`、唯讀開啟；篩選、跨項目排序、完整關聯、續文次序及列高通過，原檔與副本 bytes 不變 |
| 共享 PDF renderer | 備註、框架、改善、歷史四類代表檔產生及實體比較通過 |
| 畫面核對 | 原生 Excel 第一頁、PDF 首頁與密集續頁無觀察到裁切／重疊；PDF 輔助字不低於 14pt |
| 範圍保護 | 250 個本批範圍外 tracked 檔案 raw hashes 保持；未改 SQL／保存／人員／GM authority |

實際 receipt：

- 原 App：`qa-evidence/remarks-export-followup/candidate-2026-10-21T06-35-33.927Z/receipt.json`
- 真下載／原生 Excel：同目錄 `physical-bf318c11.json`
- 共享 PDF：`qa-evidence/remarks-export-followup/shared-candidate-2026-10-21T06-37-52.172Z/receipt.json`
- 共享實體比對：同目錄 `physical-9d553af2.json`

既有 Vite `INEFFECTIVE_DYNAMIC_IMPORT` 警告仍存在：reports 同時被 static/dynamic import；建置成功，不宣稱全站警告為零。沒有啟動與本次無關的全站 layout 重驗。

## 相同合成資料的時間比較

單位為秒，量測從點擊到實體檔案完成且 busy 清除；同一組 8 項資料，前後 fixture hash 相同。下列為單次冷／暖觀測，不是正式站 SLA 或多次平均值。

| 場景 | 修改前 | 最新候選 |
|---|---:|---:|
| 一般備註，首次 | 1.284 | 0.797 |
| 一般備註，重複 | 0.897 | 0.574 |
| 長文備註，首次 | 5.206 | 3.897 |
| 長文備註，重複 | 6.336 | 3.643 |

長文 PDF 為 23 頁；原授權資料、完整文字、字型與幾何前後比較通過。這證實本機的重複運算已減少及本次觀測加速，**不能據此宣稱已找到正式站全部延遲根因，或正式站已恢復正常速度**。

## 一次推送盤點與保留界線

- TMSA／DRYBMS 待改善三操作已於 `e838b86` 完成並獨立提交：已經完成作業、結案、完整編輯；本批不重做、不混改它們。
- 舊紀錄的框架 Excel 頁首計分說明移除、同步節流已有後續交付，不是本批未完成項目。
- 人員多部門／部門負責人及 018 換行修正版已分批提交；此次沒有新 SQL。
- 本批完成後由使用者一起 Push；助手不 Push、不部署、不執行正式 SQL、不重試正式匯出、不刷新或清除使用者草稿。
- 正式 018 的安裝／第三步 readback 尚未收到足以核對的原始結果。若已執行，回傳獨立 readback 的完整 24 keys／strict boolean true 結果即可，**不要為補證據重跑 018 或舊 migration**；若未執行，沿已交付的 127950c 修正版完整 SQL 頁處理。
- Push 後仍需區分遠端 ref、Pages 部署版本及正式 PDF 實際速度；本機 PASS 不替代這些正式驗收。

測試只停止自己建立的 Chrome／HTTP／PG／Excel；所有成功、失敗產物均保留，未改使用者 Excel 的 Trust Center，未處理既有使用者實例。
