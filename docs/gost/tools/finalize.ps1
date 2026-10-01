# Завершение сборки документов средствами Microsoft Word.
#
# python-docx записывает оглавление и число листов как поля, но рассчитать их
# может только текстовый процессор. Скрипт открывает каждый .docx из out/,
# обновляет содержание и поля, сохраняет файл и выгружает PDF рядом с ним.
#
#   powershell -ExecutionPolicy Bypass -File docs\gost\tools\finalize.ps1
#   powershell -ExecutionPolicy Bypass -File docs\gost\tools\finalize.ps1 -Filter "03_*"
#
# Требуется установленный Microsoft Word (Windows).

param(
    [string]$Filter = "*.docx"
)

$ErrorActionPreference = "Stop"
$out = Join-Path (Split-Path -Parent $PSScriptRoot) "out"
$files = Get-ChildItem -Path $out -Filter $Filter | Where-Object { $_.Extension -eq ".docx" -and -not $_.Name.StartsWith("~$") }
if (-not $files) {
    Write-Host "В каталоге $out нет документов для обработки"
    exit 1
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0          # wdAlertsNone
$wdFormatPDF = 17
$wdExportOptimizeForPrint = 0

try {
    foreach ($f in $files) {
        Write-Host ("  " + $f.Name)
        $doc = $word.Documents.Open($f.FullName, $false, $false, $false)
        # Два прохода: после построения содержания меняется число страниц,
        # и номера в содержании нужно пересчитать ещё раз
        for ($pass = 0; $pass -lt 2; $pass++) {
            foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
            $doc.Fields.Update() | Out-Null
            foreach ($section in $doc.Sections) {
                foreach ($hf in @($section.Headers, $section.Footers)) {
                    foreach ($item in $hf) { $item.Range.Fields.Update() | Out-Null }
                }
            }
        }
        $doc.Save()
        $pdf = [System.IO.Path]::ChangeExtension($f.FullName, ".pdf")
        $doc.ExportAsFixedFormat($pdf, $wdFormatPDF, $false, $wdExportOptimizeForPrint)
        $doc.Close($false)
    }
}
finally {
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
Write-Host "Готово: содержание обновлено, PDF выгружены в $out"
