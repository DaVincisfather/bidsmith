# scripts/measure-overflow.ps1
# Opens a pptx via PowerPoint COM and reports, per text-bearing shape, the shape
# height vs the laid-out text height (overflow signal for non-autofit boxes), then
# SaveAs-es a recalculated copy where PowerPoint has materialized normAutofit
# fontScale into the XML (overflow signal for autofit boxes — parsed on the TS side).
# Part of the budget-calibration loop (notes/2026-07-14-budget-calibration-loop-design.md).
#
# Enriched into a general shape measurer for the shared measurement core: adds
# per-shape position/size, BoundWidth, wrap/autosize/font-size, plus slide
# dimensions. Backward-compatible — existing fields unchanged.
# See notes/2026-07-14-measure-core-design.md.
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
        elseif ($s.HasTable) { $out += ,$s }
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
        $slideWidthPt = [math]::Round($pres.PageSetup.SlideWidth, 2)
        $slideHeightPt = [math]::Round($pres.PageSetup.SlideHeight, 2)
        foreach ($slide in $pres.Slides) {
            foreach ($shape in (Get-TextShapes $slide.Shapes)) {
                if ($shape.HasTable) {
                    # Table frame measured as a single entry (no per-cell measurement — v2).
                    $table = $shape.Table
                    $boundHeight = 0
                    for ($r = 1; $r -le $table.Rows.Count; $r++) {
                        $boundHeight += $table.Rows.Item($r).Height
                    }
                    $cellTexts = @()
                    for ($r = 1; $r -le $table.Rows.Count; $r++) {
                        for ($c = 1; $c -le $table.Columns.Count; $c++) {
                            $cellTexts += $table.Cell($r, $c).Shape.TextFrame.TextRange.Text
                        }
                    }
                    $allText = [string]::Join('', $cellTexts)
                    $firstText = $(if ($cellTexts.Count -gt 0) { $cellTexts[0] } else { '' })
                    $rows += [pscustomobject]@{
                        slide          = $slide.SlideIndex
                        name           = $shape.Name
                        topPt          = [math]::Round($shape.Top, 2)
                        leftPt         = [math]::Round($shape.Left, 2)
                        widthPt        = [math]::Round($shape.Width, 2)
                        heightPt       = [math]::Round($shape.Height, 2)
                        boundHeightPt  = [math]::Round($boundHeight, 2)
                        boundWidthPt   = [math]::Round($shape.Width, 2)
                        marginTopPt    = 0
                        marginBottomPt = 0
                        marginLeftPt   = 0
                        marginRightPt  = 0
                        wordWrap       = $true
                        autoSize       = 0
                        fontSizePt     = $null
                        textPrefix     = $firstText.Substring(0, [math]::Min(128, $firstText.Length))
                        textLength     = $allText.Length
                    }
                    continue
                }
                $tf = $shape.TextFrame2
                $text = $tf.TextRange.Text
                try {
                    $boundHeight = [math]::Round($tf.TextRange.BoundHeight, 2)
                } catch {
                    Write-Warning "Skipping shape '$($shape.Name)' on slide $($slide.SlideIndex): BoundHeight threw ($($_.Exception.Message))"
                    continue
                }
                try {
                    $boundWidth = [math]::Round($tf.TextRange.BoundWidth, 2)
                } catch {
                    # Same degenerate-shape class as BoundHeight; keep the shape but
                    # mark width unknown (-1) so TS-side width checks skip it.
                    $boundWidth = -1
                }
                # Font.Size returns a negative sentinel for mixed-size runs — map to null.
                $fsRaw = $tf.TextRange.Font.Size
                $fontSize = $(if ($fsRaw -gt 0) { [math]::Round($fsRaw, 1) } else { $null })
                $rows += [pscustomobject]@{
                    slide          = $slide.SlideIndex
                    name           = $shape.Name
                    topPt          = [math]::Round($shape.Top, 2)
                    leftPt         = [math]::Round($shape.Left, 2)
                    widthPt        = [math]::Round($shape.Width, 2)
                    heightPt       = [math]::Round($shape.Height, 2)
                    boundHeightPt  = $boundHeight
                    boundWidthPt   = $boundWidth
                    marginTopPt    = [math]::Round($tf.MarginTop, 2)
                    marginBottomPt = [math]::Round($tf.MarginBottom, 2)
                    marginLeftPt   = [math]::Round($tf.MarginLeft, 2)
                    marginRightPt  = [math]::Round($tf.MarginRight, 2)
                    wordWrap       = [bool]($tf.WordWrap -ne 0)   # msoTrue = -1
                    autoSize       = [int]$tf.AutoSize            # 0 none / 1 spAuto / 2 norm
                    fontSizePt     = $fontSize
                    textPrefix     = $text.Substring(0, [math]::Min(128, $text.Length))
                    textLength     = $text.Length
                }
            }
        }
        # SaveAs (ppSaveAsOpenXMLPresentation = 24) forces a layout pass; PowerPoint
        # writes normAutofit fontScale for every shrunk box into the saved XML.
        $pres.SaveAs($absRecalc, 24)

        [pscustomobject]@{
            slideCount    = $slideCount
            slideWidthPt  = $slideWidthPt
            slideHeightPt = $slideHeightPt
            shapes        = @($rows)
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
