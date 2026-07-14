# scripts/measure-overflow.ps1
# Opens a pptx via PowerPoint COM and reports, per text-bearing shape, the shape
# height vs the laid-out text height (overflow signal for non-autofit boxes), then
# SaveAs-es a recalculated copy where PowerPoint has materialized normAutofit
# fontScale into the XML (overflow signal for autofit boxes — parsed on the TS side).
# Part of the budget-calibration loop (notes/2026-07-14-budget-calibration-loop-design.md).
#
# Usage:
#   pwsh -File scripts/measure-overflow.ps1 -Pptx deck.pptx -OutJson m.json -RecalcOut recalc.pptx
param(
    [Parameter(Mandatory = $true)] [string]$Pptx,
    [Parameter(Mandatory = $true)] [string]$OutJson,
    [Parameter(Mandatory = $true)] [string]$RecalcOut
)
$ErrorActionPreference = "Stop"

$absPptx = [System.IO.Path]::GetFullPath($Pptx)
if (-not (Test-Path -LiteralPath $absPptx)) { throw "PPTX not found: $absPptx" }
$absJson   = [System.IO.Path]::GetFullPath($OutJson)
$absRecalc = [System.IO.Path]::GetFullPath($RecalcOut)
if (Test-Path -LiteralPath $absRecalc) { Remove-Item -Force -LiteralPath $absRecalc }
foreach ($dir in @((Split-Path -Parent $absJson), (Split-Path -Parent $absRecalc))) {
    if ($dir) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
}

# Flatten groups in document order: COM's Slide.Shapes does NOT descend into
# msoGroup (type 6), but Claude-Design-built templates (Radrum) group freely.
function Get-TextShapes($shapes) {
    $out = @()
    foreach ($s in $shapes) {
        if ($s.Type -eq 6) { $out += Get-TextShapes $s.GroupItems }
        elseif ($s.HasTextFrame -and $s.TextFrame2.HasText) { $out += ,$s }
    }
    return $out
}

$pp = New-Object -ComObject PowerPoint.Application
try {
    # msoFalse=0 window, open read-write (SaveAs needs it): WithWindow:=msoFalse
    $pres = $pp.Presentations.Open($absPptx, 0, 0, 0)
    try {
        $rows = @()
        $slideCount = $pres.Slides.Count
        foreach ($slide in $pres.Slides) {
            foreach ($shape in (Get-TextShapes $slide.Shapes)) {
                $tf = $shape.TextFrame2
                $text = $tf.TextRange.Text
                try {
                    $boundHeight = [math]::Round($tf.TextRange.BoundHeight, 2)
                } catch {
                    Write-Warning "Skipping shape '$($shape.Name)' on slide $($slide.SlideIndex): BoundHeight threw ($($_.Exception.Message))"
                    continue
                }
                $rows += [pscustomobject]@{
                    slide          = $slide.SlideIndex
                    name           = $shape.Name
                    heightPt       = [math]::Round($shape.Height, 2)
                    boundHeightPt  = $boundHeight
                    marginTopPt    = [math]::Round($tf.MarginTop, 2)
                    marginBottomPt = [math]::Round($tf.MarginBottom, 2)
                    textPrefix     = $text.Substring(0, [math]::Min(64, $text.Length))
                }
            }
        }
        # SaveAs (ppSaveAsOpenXMLPresentation = 24) forces a layout pass; PowerPoint
        # writes normAutofit fontScale for every shrunk box into the saved XML.
        $pres.SaveAs($absRecalc, 24)

        [pscustomobject]@{
            slideCount = $slideCount
            shapes     = @($rows)
        } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $absJson -Encoding utf8
        Write-Host "Measured $($rows.Count) text shapes -> $absJson"
    } finally {
        try { $pres.Close() } catch {}
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres)
    }
}
finally {
    $pp.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($pp)
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
