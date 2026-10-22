# 改善來源與章節關聯：本機交付

## 使用上的改變

- 來源新增「船舶安全會議」「公司安全會議」「研討會」「外部法規規則影響」，四者皆可獨立建立，關聯章節／小項目選填。
- 「非外部／自行提出」的系統來源名稱統一為「內部管理需求」。保留 `non_external` 身分，不逐筆回填或替換使用者正文；舊記錄沿共用名稱顯示，因此不改ID、內容、版本、進度與歷史。
- 關聯改為體系→大章節→小項目，可多選、跨體系、只選大章節。體系只控制瀏覽，勾章節不會展開成全部小項目，也不冒加Item星號。
- 清單／報告篩選、總覽與實際輸出沿相同章節關聯；同一集合不重複計數。外部檢查來源繼續沿凍結finding限制，與「外部法規規則影響」不同。
- 保存仍走原明確保存／取消、record lease／CAS／operation ACK。舊client省略chapterIds保留原值，明確[]才清除。

## 驗證界線與證據

全部為**真實UI＋合成資料＋owned本機PostgreSQL**，不是正式Supabase／Pages驗收。使用者所述17筆尚未連正式資料庫查核；本機另建17筆舊來源資料驗證名稱投影及資料零改寫。

| 層次 | 結果／收據 |
|---|---|
| 單元、型別、production build | 423/423；typecheck/build exit 0。`qa-evidence/additional-improvement-sources/aggregate-gates.json` |
| 020原生SQL | 57/57；獨立readback 23項。`qa-evidence/improvement-chapter-links/sql/run-2026-10-22T20-54-07.252Z/receipt.json` |
| 021原生SQL | 70/70；獨立readback 23項。`qa-evidence/additional-improvement-sources/sql/run-2026-10-22T21-06-04.854Z/receipt.json` |
| 階層元件 | 30/30；包含多選／保留／停用與範圍外值、disabled、雙語／三主題／1440與390。`qa-evidence/improvement-reference-picker/2026-10-22T20-53-33.773Z/receipt.json` |
| 原App來源與下載 | 32/32，包含四個來源的新增／另一瀏覽器編輯／來源鎖定／可清最後關聯／篩選，以及17筆舊來源顯示與零寫入。`qa-evidence/safety-meeting-sources/ui-2026-10-22T21-22-50.382Z/receipt.json` |
| 來源實際下載檔 | 5 PDF文字／render及5 Excel native正常唯讀開啟（四新來源＋一筆明選舊來源），來源名稱與精確篩選內容通過，檔案hash未變。相同目錄 `artifact-verification.json`；owned Excel正常Quit並已停止 |
| 原App章節整合及實檔 | 19/19；章節-only／混合多選／取消零寫入／owner-admin重開／首browser不重載看見保存／篩選統計／external凍結範圍／390px英文。`qa-evidence/improvement-chapter-links/ui-2026-10-22T21-18-39.876Z/receipt.json`；`pdf-verification.json`核對改善PDF與3頁總覽PDF，XLSX章節標籤及授權快照均實檔核對；同目錄 `artifact-verification.json` 另證明章節XLSX可由native Excel正常唯讀開啟、三個章節完整、原檔未改 |
| 最終候選審查／提交 | 依 `qa-evidence/additional-improvement-sources/candidate.json` 的精確tree及審查收據核對後本機提交；commit與審查結論另列交付回覆，不代表Push／正式安裝 |

保留原先RED及測試工具故障證據；測試fixture缺chapters欄與平行Vite測試佔用預設port的修復僅在測試層，未更動產品保存流程。建置仍有既有reports.ts靜態／動態import混用提示，不影響build通過；未藉本批重構分包。

## 可重跑命令

```text
npm test
npm run typecheck
npm run build
npm run qa:improvement-reference-picker
npm run qa:improvement-chapter-links-sql
npm run qa:additional-improvement-sources-sql
npm run qa:improvement-chapter-links
npm run qa:additional-improvement-sources
```

`qa:additional-improvement-sources`共用原來源runner，涵蓋四項追加來源。所有QA只使用合成資料及owned localhost；不讀private-seed、不接正式雲端。

## 正式更新交接（尚未執行）

1. 先核對正式已安裝版本，不假設目前已到018／019；未知前置版本先停下核對，不能盲跑。
2. 若未裝019，先執行 `supabase/migrations/019_safety_meeting_sources.sql`，再獨立執行 `supabase/safety-meeting-sources-readback.sql`，應回 `PASS_SAFETY_MEETING_SOURCES_INSTALL_ONLY`。
3. 接著執行 `supabase/migrations/020_improvement_chapter_links.sql`，再獨立執行 `supabase/improvement-chapter-links-readback.sql`，應回 `PASS_IMPROVEMENT_CHAPTER_LINKS_INSTALL_ONLY`。
4. 接著執行 `supabase/migrations/021_additional_improvement_sources.sql`，再獨立執行 `supabase/additional-improvement-sources-readback.sql`，應回 `PASS_ADDITIONAL_IMPROVEMENT_SOURCES_INSTALL_ONLY`。
5. 每一步必須確認status及所有checks=true，才進下一步。後續migration會合法更動前一readback的函式hash；不要為舊hash失配而重跑舊SQL。這些readback只核對安裝與權限，不等於正式功能驗收。
6. SQL與readback完成後，才由使用者Push／發布前端，並核對正式版本、新來源及既有記錄的新名稱。

001–019及舊readback均未改；020／021不回填業務、歷史或audit資料。正式SQL提供時應用經commit blob核對的唯讀交接，不代貼、不代Run。本批未Push／部署／執行正式SQL。
