# Compact editing toolbar — bounded implementation contract

## Approved outcome

- A compact, single-row toolbar attached above the active content editor, reserving its own narrow space rather than covering text. Only the focused editor/wrapper shows it; toolbar focus remains internal. Never appear in read-only browsing or merely selecting read-only text.
- Four text colors (black/red/blue/green), bold, ordered list, bullet list. Single-line content titles use colors/bold only. Selection changes that selection; collapsed caret changes subsequent typing. Enter continues lists, empty-item Enter exits, Shift+Enter breaks within an item.
- Laptop/desktop with mouse or trackpad is required. Touch-only phones/tablets may hide the toolbar, but use the same format-preserving editor and renderer; no conversion to a lossy textarea. Device support is pointer-based, not a width-only laptop exclusion.
- Preserve original navigation, density, labels, permissions, explicit Save/Cancel, record lease/CAS/operation-ACK, existing immutable history, frozen sources and existing metadata-only preservation rules. No autosave, no optimistic success, no automatic old-record conversion.

## Bounded field inventory

Required content groups (each applicable language):
1. Framework assessment: selfAssessment.en/zh, evidence.en/zh, remarks (TMSA and DRYBMS).
2. DRYBMS maturity note.
3. Improvements: bilingual title segments (inline styles only), content.en/zh, plan; the same component across main/create/full-edit/TMSA/DRYBMS inline entries.
4. Improvement newly appended event.content across progress/close/reopen; existing events remain immutable.
5. Inspection title (inline only), results[*].observation/recommendation.en/zh, findings[*].observation/recommendation.en/zh; source-linked action creation plan.
6. Management framework name (inline only), description, scopeLabel; chapter name (inline only), aim; item kpi/guidance; newly supplied supporting source note. Original immutable raw source/locator fields remain plain and unchanged.

Excluded: search/query, credentials/configuration, usernames/person and department identity names, organization/locator identifiers, sourceVersion, codes/IDs, files/raw source identifiers, dates, percentages, numbers, selectors and read-only credentials. Exclusions protect identity and literal-source semantics, not a reduction in narrative editors.

## Storage and shared API

No SQL or RPC shape change. Preserve existing string fields. Rich values retain visible plain text as a contiguous prefix and append a versioned, strictly validated formatting annotation containing only numeric ranges/list metadata and palette/bold values. Plain text remains available to existing server-side substring search, including phrases across style boundaries. There are no executable HTML attributes in persisted formatting data.

- Unmarked legacy values are literal text, including `<`, `>` and apparent HTML. Never interpret them as HTML.
- Empty formatting serializes as empty text, not an invisible nonempty marker.
- Unchanged fields are not emitted/normalized on mount, focus or blur. Metadata-only saves retain original bytes, including historical blank lines.
- Decoder must support multiple annotated fragments inside composed strings; formatting offsets are bound to the preceding text fragment length. Invalid annotation is not executed or silently used to erase source text.
- Browser/native shared exports in `src/richText.ts`:
  - `RichColor = 'black'|'red'|'blue'|'green'`; `RICH_COLORS` color map.
  - `RichRun {text:string;bold?:boolean;color?:RichColor}`.
  - `richTextToPlainText(value:string|undefined|null):string` (includes real list markers).
  - `richTextRuns(value:string):RichRun[]` (complete text, newlines and list markers, no annotations).
  - `isRichText(value:string):boolean`, `isRichTextEmpty(value:string|undefined|null):boolean`.
  - `sliceRichText(value:string,start:number,end?:number):string` (offsets into visible UTF-16 text; preserve styles).
  - `compactRichText(value:string):string` (remove only whitespace-only lines, preserve nonempty text/styles).
  - `encodeRichText(...)` and document/HTML conversion helpers may be chosen by the core implementer; document their public schema.
- `src/RichTextEditor.tsx` exports `RichTextEditor` with value/onChange(string), rows, disabled, readOnly, singleLine, compact (initial view projection only), lang, aria-label, placeholder; and `RichText` display with value, compact/sentence, inline, className. Plain display should preserve prior literal text and layout. No arbitrary persisted HTML injection.

## Consumer closure

- All changed fields must save/reopen/render correctly; search, required checks, picker/accessibility labels and audit text use plain derivatives. Historical comparisons must not mistake a style-only change for no change.
- PDFs preserve four colors, bold and list markers in every relevant builder and retain text extraction, existing CJK/fallback coverage, line breaks, page continuation and existing report structures. Existing business status colors remain independent.
- Excel preserves styled runs and list markers in original template/operational layouts and split continuation rows. No metadata markers in visible cells, labels, PDF metadata, filenames or search labels. Plain legacy output geometry remains unchanged where bytes are unformatted.
- Bilingual content must be decoded before transformations; concatenated values must not leak interior annotations.

## Verification and stopping boundary

- Establish behavioral RED before replacing the original textarea path (focus present field -> missing formatting toolbar).
- Focused core tests plus real Chromium editor interaction: caret typing, selection, future typing, colors/bold/lists, Enter/Shift+Enter, native undo/redo, plain paste, IME, disabled/readonly, wrapper focus, touch toolbar absence without format loss.
- Original mounted App + synthetic data + owned native PostgreSQL: representative complete save/readback/peer path for each record kind, shared entry coverage, untouched bytes, cancel zero writes, busy/lease restrictions and explicit ACK. Block external network in QA. This is NOT hosted Supabase/Pages acceptance.
- Actual PDF/XLSX files with visible styles and complete extracted text, a long continuation case, representative original plain-text report regressions; inspect laptop and touch screenshots, no new page errors/overflow.
- `npm test`, `npm run typecheck`, `npm run build`, affected native/browser/report checks and artifact hygiene. One finite in-scope review; only reproducible format loss, unsafe rendering, missed editor/consumer, save-policy regression or blocking layout/input bugs warrant fixes.
- Parent verifies and creates one local commit after gates. User Push/deploys. No production data reads/writes beyond public static version inspection; no hosted SQL; no file/folder deletion; no second clone or worktree.
