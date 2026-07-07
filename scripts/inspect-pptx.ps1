# PPTX inspection harness: any .pptx -> per-slide PNGs + composite grid + text-volume report.
#
# Purpose: visual + quantitative gate before accepting/shipping a deck. Born from the
# 2026-07-07 smoke lesson: spot-checking single slides missed a deck-wide overflow
# catastrophe twice — judging a deck requires ALL slides plus a chars-per-slide count.
#
# Usage:
#   pwsh -File scripts/inspect-pptx.ps1 -Pptx path\to\deck.pptx
#   pwsh -File scripts/inspect-pptx.ps1 -Pptx deck.pptx -OutDir tmp\inspect\mydeck
#
# Outputs (under -OutDir, default tmp/inspect/<pptx-basename>/):
#   slide-NN.png    one PNG per slide (PowerPoint COM, background render)
#   composite.png   grid of all slides for one-glance review
#   report.txt      per-slide text volume + flags (also printed to stdout)
#
# Volume thresholds (chars of visible text per slide, sum of all textboxes):
#   > 1500  WARN  (dense for a consulting slide)
#   > 3000  FAIL  (near-certain overflow / unreadable)
# The report is a heuristic gate, not a verdict — always look at composite.png too.
#
# Requires: desktop PowerPoint installed (COM). Text stats need no PowerPoint —
# they are parsed straight from the pptx XML, so they still print if COM fails.

param(
    [Parameter(Mandatory = $true)]
    [string]$Pptx,
    [string]$OutDir = "",
    [int]$Width  = 1920,
    [int]$Height = 1080,
    [int]$Cols   = 4,
    [int]$WarnChars = 1500,
    [int]$FailChars = 3000,
    # Skip the COM render (stats + report only) — for CI-ish or PowerPoint-less runs.
    [switch]$NoRender
)

$ErrorActionPreference = "Stop"

$absPptx = [System.IO.Path]::GetFullPath($Pptx)
if (-not (Test-Path -LiteralPath $absPptx)) { throw "PPTX not found: $absPptx" }

if ($OutDir -eq "") {
    $base = [System.IO.Path]::GetFileNameWithoutExtension($absPptx)
    $OutDir = Join-Path $PSScriptRoot "..\tmp\inspect\$base"
}
if (Test-Path $OutDir) { Remove-Item -Recurse -Force $OutDir }
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
$absOut = [System.IO.Path]::GetFullPath($OutDir)

# ---------------------------------------------------------------------------
# 1) Text-volume stats straight from the pptx XML (no PowerPoint needed).
#    A pptx is a zip; visible text lives in ppt/slides/slideN.xml as <a:t> runs,
#    one <p:txBody> per shape with text.
#    IMPORTANT: only slides referenced by presentation.xml's sldIdLst count —
#    pptx-automizer leaves the source template's slide XMLs as orphans in the
#    zip, so globbing ppt/slides/*.xml double-counts (empty template + filled
#    copy). Slide numbers below are PRESENTATION order (matches what
#    PowerPoint renders), not the XML file names.
# ---------------------------------------------------------------------------
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($absPptx)
$stats = @()
try {
    function Read-Entry([object]$z, [string]$name) {
        $e = $z.GetEntry($name)
        if ($null -eq $e) { throw "Missing $name in pptx" }
        $r = New-Object System.IO.StreamReader($e.Open())
        try { return $r.ReadToEnd() } finally { $r.Dispose() }
    }
    $presXml = Read-Entry $zip "ppt/presentation.xml"
    $relsXml = Read-Entry $zip "ppt/_rels/presentation.xml.rels"

    # rels: Id -> slides/slideN.xml (only slide relationships)
    $relTarget = @{}
    foreach ($m in [regex]::Matches($relsXml, '<Relationship[^>]*Id="([^"]+)"[^>]*Target="(slides/[^"]+)"[^>]*/>')) {
        $relTarget[$m.Groups[1].Value] = "ppt/" + $m.Groups[2].Value
    }
    # sldIdLst: presentation order of r:id references
    $ordered = @()
    $sldIdLst = [regex]::Match($presXml, '<p:sldIdLst>(.*?)</p:sldIdLst>', 'Singleline').Groups[1].Value
    foreach ($m in [regex]::Matches($sldIdLst, 'r:id="([^"]+)"')) {
        $rid = $m.Groups[1].Value
        if ($relTarget.ContainsKey($rid)) { $ordered += $relTarget[$rid] }
    }
    if ($ordered.Count -eq 0) { throw "No slides found via presentation.xml sldIdLst" }

    for ($i = 0; $i -lt $ordered.Count; $i++) {
        $xml = Read-Entry $zip $ordered[$i]
        $runs  = [regex]::Matches($xml, '<a:t>([^<]*)</a:t>')
        $chars = ($runs | ForEach-Object { $_.Groups[1].Value.Length } | Measure-Object -Sum).Sum
        if ($null -eq $chars) { $chars = 0 }
        $boxes = ([regex]::Matches($xml, '<p:txBody>')).Count
        $stats += [pscustomobject]@{ Slide = ($i + 1); Textboxes = $boxes; Chars = [int]$chars }
    }
}
finally { $zip.Dispose() }

# ---------------------------------------------------------------------------
# 2) Render slides to PNG via PowerPoint COM (reuses render-and-verify's pattern).
# ---------------------------------------------------------------------------
$rendered = $false
if (-not $NoRender) {
    $ppt = New-Object -ComObject PowerPoint.Application
    try {
        Write-Host "Rendering: $absPptx"
        $pres = $ppt.Presentations.Open($absPptx, $true, $false, $false)
        try {
            $pres.Export($absOut, "PNG", $Width, $Height)
        } finally {
            $pres.Close()
            [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) | Out-Null
        }
    }
    finally {
        $ppt.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
    }
    # SlideN.PNG / BildN.PNG -> slide-NN.png (locale-stable, sorts numerically).
    Get-ChildItem -Path $absOut -Filter "*.PNG" | ForEach-Object {
        if ($_.BaseName -match '^[A-Za-zÀ-ÿ]+(\d+)$') {
            Rename-Item -Path $_.FullName -NewName ("slide-{0:D2}.png" -f [int]$Matches[1])
        }
    }
    $rendered = (Get-ChildItem -Path $absOut -Filter "slide-*.png").Count -gt 0

    if ($rendered) {
        & (Join-Path $PSScriptRoot "compose-slide-grid.ps1") -InputDir $absOut -Cols $Cols
    }
}

# ---------------------------------------------------------------------------
# 3) Report.
# ---------------------------------------------------------------------------
$lines = @()
$lines += "PPTX inspection report — $absPptx"
$lines += ("{0} slides | thresholds: WARN >{1}, FAIL >{2} chars/slide" -f $stats.Count, $WarnChars, $FailChars)
$lines += ""
$lines += "Slide  Textboxes  Chars   Status"
$warn = 0; $fail = 0
foreach ($s in $stats) {
    $status = "ok"
    if ($s.Chars -gt $FailChars)     { $status = "FAIL"; $fail++ }
    elseif ($s.Chars -gt $WarnChars) { $status = "WARN"; $warn++ }
    $lines += ("{0,5}  {1,9}  {2,5}   {3}" -f $s.Slide, $s.Textboxes, $s.Chars, $status)
}
$totalChars = ($stats | Measure-Object -Property Chars -Sum).Sum
$lines += ""
$lines += ("TOTAL: {0} chars across deck | {1} WARN, {2} FAIL" -f $totalChars, $warn, $fail)
$verdict = if ($fail -gt 0) { "FAIL" } elseif ($warn -gt 0) { "WARN" } else { "PASS" }
$lines += "VERDICT: $verdict"
if ($rendered) { $lines += "Visuals: $absOut\composite.png (grid) + slide-NN.png" }

$report = $lines -join [Environment]::NewLine
$report | Set-Content -Path (Join-Path $absOut "report.txt") -Encoding utf8
Write-Host ""
Write-Host $report

# Non-zero exit on FAIL so the harness can gate scripts/CI.
if ($fail -gt 0) { exit 2 } elseif ($warn -gt 0) { exit 1 } else { exit 0 }
