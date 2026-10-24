param([Parameter(Mandatory=$true)][string]$Receipt)
$ErrorActionPreference='Stop'
$inputReceipt=Get-Content -LiteralPath $Receipt -Raw -Encoding UTF8 | ConvertFrom-Json
$out=Join-Path (Split-Path $Receipt) ('native-'+[guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $out | Out-Null
$prior=@(Get-Process EXCEL -ErrorAction SilentlyContinue | ForEach-Object {$_.Id})
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class ExcelPid { [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId); }'
$excel=$null;$book=$null;$sheet=$null;$owned=$false;$excelPid=0
$result=[ordered]@{status='RUNNING';inputReceipt=$Receipt;preexistingExcelPids=$prior;artifacts=@();limitations=@('After user sorting, run native AutoFit; continuation reading order is Document no. then Part.');output=$out}
function Check($condition,$message){if(-not $condition){throw $message}}
function RowKey($sheet,$r){return ([string]$sheet.Cells.Item($r,1).Value2)+'-'+([string]$sheet.Cells.Item($r,11).Value2)}
function RowValues($sheet,$r){$v=@();for($c=1;$c -le 19;$c++){$v+=,$sheet.Cells.Item($r,$c).Value2};return (ConvertTo-Json -InputObject $v -Compress)}
try{
 $excel=New-Object -ComObject Excel.Application
 [uint32]$ep=0;[ExcelPid]::GetWindowThreadProcessId([IntPtr]$excel.Hwnd,[ref]$ep)|Out-Null;$excelPid=[int]$ep
 Check ($excelPid -gt 0 -and $prior -notcontains $excelPid) 'Cannot prove owned Excel'
 $owned=$true;$result.excelPid=$excelPid
 $excel.Visible=$false;$excel.DisplayAlerts=$false;$excel.EnableEvents=$false;$excel.AskToUpdateLinks=$false;$excel.AutomationSecurity=3
 foreach($artifact in $inputReceipt.artifacts){
  $hash=(Get-FileHash -LiteralPath $artifact.path -Algorithm SHA256).Hash.ToLower()
  Check ($hash -eq $artifact.sha256) 'Artifact hash mismatch'
  # Normal open (CorruptLoad=0), no repair, external links or macros.
  $missing=[Type]::Missing
  $copy=Join-Path $out ($artifact.id+'.xlsx');Copy-Item -LiteralPath $artifact.path -Destination $copy
  $book=$excel.Workbooks.Open($copy,0,$true)
  Check $book.ReadOnly 'Read-only open required'
  $sheet=$book.Worksheets.Item(1)
  $a=[ordered]@{id=$artifact.id;path=$artifact.path;sha256=$hash;readOnly=$book.ReadOnly;sheetCount=$book.Worksheets.Count;usedRange=$sheet.UsedRange.Address();checks=@();heightDeficits=@()}
  if($artifact.request.kind -eq 'improvements'){
   $last=$sheet.UsedRange.Rows.Count
   $header=[int]$sheet.AutoFilter.Range.Row;$first=$header+1;$range='A'+$header+':S'+$last;$a.headerRow=$header
   Check ($sheet.AutoFilter.Range.Address() -eq ('$A$'+$header+':$S$'+$last)) 'AutoFilter must include classification and related codes'
   $a.nativeFreezeRow=[int]$excel.ActiveWindow.SplitRow
   if($a.nativeFreezeRow -ne $header){
    $a.scopeBandHeight=[double]$sheet.Range('1:'+($header-1)).Height;$a.availableWindowHeight=[double]$excel.UsableHeight
    Check ($header -gt 2 -and $a.nativeFreezeRow -gt 0 -and $a.nativeFreezeRow -lt $header -and $a.scopeBandHeight -gt $a.availableWindowHeight) 'Unexpected native freeze mismatch'
    $a.nativeViewportLimitation='Oversized scope exceeds the Excel window; native freeze is clamped. Verify saved OOXML pane separately.'
   }
   Check ($sheet.Cells.Item(1,1).Font.Size -eq 18) 'Title font'
   Check ($sheet.Cells.Item(1,3).Font.Size -eq 12) 'Scope font'
   $scopeText='';for($r=1;$r -lt $header;$r++){$scopeText+=[string]$sheet.Cells.Item($r,3).Value2}
   Check ($scopeText -eq $artifact.scope) 'Complete canonical or explicitly synthetic stress scope'
   $rows=@{};$headers=RowValues $sheet $header
   for($r=$first;$r -le $last;$r++){
    $key=RowKey $sheet $r;$rows[$key]=RowValues $sheet $r
    for($c=1;$c -le 19;$c++){
     $cell=$sheet.Cells.Item($r,$c)
     Check (-not $cell.HasFormula) 'Unexpected formula'
     Check (-not $cell.MergeCells) 'Merged body cells'
     Check ($cell.Font.Size -eq 12) 'Body font size'
    }
    Check ($sheet.Cells.Item($r,3).Value2 -is [double]) 'Date must be numeric'
    Check ($sheet.Cells.Item($r,3).NumberFormat -eq 'yyyy-mm-dd') 'Date number format'
   }
   # Measure merged scope bands in an equal-width unmerged native probe.
   $probe=$book.Worksheets.Add();$probeCell=$probe.Cells.Item(1,1);$probeCell.Font.Name=$sheet.Cells.Item(1,3).Font.Name;$probeCell.Font.Size=12;$probeCell.Font.Bold=$false;$probeCell.WrapText=$true
   $a.scopeParts=@()
   for($r=1;$r -lt $header;$r++){
    $cell=$sheet.Cells.Item($r,3);$targetWidth=[double]$cell.MergeArea.Width
    for($n=0;$n -lt 3;$n++){$probe.Columns.Item(1).ColumnWidth=[double]$probe.Columns.Item(1).ColumnWidth*$targetWidth/[double]$probe.Columns.Item(1).Width}
    Check ([Math]::Abs([double]$probe.Columns.Item(1).Width-$targetWidth) -le 1) 'Scope measurement width mismatch'
    $probeCell.Value2=$cell.Value2;$probe.Rows.Item(1).AutoFit()|Out-Null
    $saved=[double]$sheet.Rows.Item($r).RowHeight;$needed=[double]$probe.Rows.Item(1).RowHeight
    Check ($needed -lt 409.5) 'Scope probe reached native cap'
    if($needed -gt $saved+0.8){$a.heightDeficits+=@{row=$r;kind='scope';saved=$saved;needed=$needed}}
    $a.scopeParts+=@{row=$r;text=[string]$cell.Value2;saved=$saved;nativeRequired=$needed;width=$targetWidth}
   }
   $probe.Delete();[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($probeCell);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($probe);$probe=$null;$probeCell=$null;$sheet.Activate()
   $a.filterRange=$sheet.AutoFilter.Range.Address();$a.printArea=$sheet.PageSetup.PrintArea
   $pdf=Join-Path $out ($artifact.id+'-original.pdf');$sheet.ExportAsFixedFormat(0,$pdf);$a.pdf=$pdf
   # Native AutoFit proves both narrow English headers and body height requirements.
   $originalHeader=[double]$sheet.Rows.Item($header).RowHeight;$sheet.Rows.Item($header).AutoFit()|Out-Null;$neededHeader=[double]$sheet.Rows.Item($header).RowHeight
   $a.headerHeight=@{saved=$originalHeader;nativeRequired=$neededHeader}
   if($neededHeader -gt $originalHeader+0.8){$a.heightDeficits+=@{row=$header;saved=$originalHeader;needed=$neededHeader}}
   $sheet.Rows.Item($header).RowHeight=$originalHeader
   for($r=$first;$r -le $last;$r++){
    $saved=[double]$sheet.Rows.Item($r).RowHeight;$sheet.Rows.Item($r).AutoFit()|Out-Null;$needed=[double]$sheet.Rows.Item($r).RowHeight
    if($needed -gt $saved+0.8){$a.heightDeficits+=@{row=$r;saved=$saved;needed=$needed}}
    Check ($needed -le 409.5) 'Native row limit exceeded';$sheet.Rows.Item($r).RowHeight=$saved
   }
   # Entire selected group remains filterable through numeric and last columns.
   foreach($column in @(1,18,19,3)){
    $criterion=$sheet.Cells.Item($first,$column).Value2
    if($column -eq 3){$sheet.Range($range).AutoFilter($column,('>='+[string]$criterion),1,('<'+[string]([double]$criterion+1)))|Out-Null}else{$sheet.Range($range).AutoFilter($column,$criterion)|Out-Null}
    $seen=0;$expected=0
    for($r=$first;$r -le $last;$r++){
     $match=$sheet.Cells.Item($r,$column).Value2 -eq $criterion
     if($match){$expected++};if(-not $sheet.Rows.Item($r).Hidden){$seen++;Check $match 'Filter included unrelated record'}
    }
    Check ($seen -eq $expected -and $seen -gt 0) ('Filter lost record on column '+$column)
    $sheet.ShowAllData();$a.checks+=('filter-column-'+$column)
   }
   foreach($order in @(1,2)){
    $sort=$sheet.Sort;$sort.SortFields.Clear();$sort.SortFields.Add($sheet.Range('A'+$first+':A'+$last),0,$order)|Out-Null;$sort.SortFields.Add($sheet.Range('K'+$first+':K'+$last),0,1)|Out-Null
    $sort.SetRange($sheet.Range($range));$sort.Header=1;Check ($sort.Header -eq 1) 'Sort header authority';$sort.Apply()
    Check ((RowValues $sheet $header) -eq $headers) 'Sort moved header'
    $seenKeys=@();$previous=$null
    for($r=$first;$r -le $last;$r++){
     $key=RowKey $sheet $r;$seenKeys+=$key;Check ($rows[$key] -eq (RowValues $sheet $r)) 'Sort separated metadata/narrative/R/S'
     $number=[double]$sheet.Cells.Item($r,1).Value2
     if($null -ne $previous){Check (($order -eq 1 -and $number -ge $previous) -or ($order -eq 2 -and $number -le $previous)) 'Wrong sort order'};$previous=$number
     $sheet.Rows.Item($r).AutoFit()|Out-Null;Check ($sheet.Rows.Item($r).RowHeight -le 409.5) 'Sorted AutoFit overflow'
    }
    Check (($seenKeys|Sort-Object -Unique).Count -eq $rows.Count) 'Sort changed row set';$a.checks+=('sort-'+$order+'-then-autofit')
   }
   $a.checks+=@('normal-open','true-dates','12pt-body','no-formulas','full-scope','unmerged-body')
  }else{$a.checks+=@('positive-control-normal-open')}
  $book.Close($false);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($sheet);[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($book);$sheet=$null;$book=$null
  $a.unchanged=((Get-FileHash -LiteralPath $artifact.path -Algorithm SHA256).Hash.ToLower() -eq $hash);Check $a.unchanged 'Original download changed'
  $result.artifacts+=,$a
 }
 $deficits=@($result.artifacts | ForEach-Object {$_.heightDeficits})
 Check ($deficits.Count -eq 0) ('Native clipped height candidates: '+($deficits|ConvertTo-Json -Compress))
 $result.status='PASS'
}catch{$result.status='FAIL';$result.error=$_.Exception.ToString()}
finally{
 if($null -ne $book){$book.Close($false)}
 if($owned -and $null -ne $excel){$excel.Quit()}
 foreach($obj in @($sheet,$book,$excel)){if($null -ne $obj){[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj)}}
 $sheet=$null;$book=$null;$excel=$null;[GC]::Collect();[GC]::WaitForPendingFinalizers()
 if($owned){$p=Get-Process -Id $excelPid -ErrorAction SilentlyContinue;if($null -ne $p -and -not $p.WaitForExit(10000)){Stop-Process -Id $excelPid;$result.forcedOwnedCleanup=$true};$result.ownedExcelStopped=($null -eq (Get-Process -Id $excelPid -ErrorAction SilentlyContinue))}
 $result|ConvertTo-Json -Depth 12|Set-Content -LiteralPath (Join-Path $out 'receipt.json') -Encoding UTF8
 Write-Output (Join-Path $out 'receipt.json')
 if($result.status -ne 'PASS'){exit 1}
}
