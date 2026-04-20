# PPTX -> PNG export via PowerPoint COM.
#
# Renders one PNG per slide from the generated sample PPTX and, when
# needed, the source mockup so visual verification can compare rendered
# output against the design template.
#
# Usage:
#   pwsh -File scripts/render-and-verify.ps1                  # full deck
#   pwsh -File scripts/render-and-verify.ps1 -Slides "7,8"    # only those slides of sample
#   pwsh -File scripts/render-and-verify.ps1 -Force           # re-render mockup too
#
# Note: -Slides expects a comma-separated string ("7,8"). Quotes are recommended
# to avoid bash treating commas as token separators.
#
# Selective mode (-Slides):
#   - Renders only the listed slides of the sample (uses Slide.Export per index)
#   - Does NOT clear the sample-png dir, so other slides stay around for comparison
#   - Does NOT re-render the mockup (it never changes during dev iteration)
#
# Mockup caching:
#   - Mockup PNGs are reused if tmp/mockup-png/slide-01.png already exists
#   - Pass -Force to bust the cache (e.g., after editing the mockup template)
#
# Outputs:
#   tmp/slides-png/slide-NN.png  (rendered sample-bid.pptx)
#   tmp/mockup-png/slide-NN.png  (source anbudsmall-v2.pptx)

param(
    [string]$SamplePath  = (Join-Path $PSScriptRoot "..\tmp\sample-bid.pptx"),
    [string]$MockupPath  = (Join-Path $PSScriptRoot "..\templates\anbudsmall-v2.pptx"),
    [string]$SampleOut   = (Join-Path $PSScriptRoot "..\tmp\slides-png"),
    [string]$MockupOut   = (Join-Path $PSScriptRoot "..\tmp\mockup-png"),
    [int]$Width  = 1920,
    [int]$Height = 1080,
    # Comma-separated slide numbers, e.g. "7,8". Empty = render all.
    # String type avoids bash/pwsh comma-parsing surprises across shells.
    [string]$Slides = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# Parse the comma-separated $Slides string into [int[]]. Whitespace tolerated.
$slideNums = @()
if ($Slides -ne "") {
    $slideNums = $Slides -split ',' |
        Where-Object { $_.Trim() -ne "" } |
        ForEach-Object { [int]($_.Trim()) }
}

function Resolve-Full([string]$p) {
    return [System.IO.Path]::GetFullPath($p)
}

function Reset-Dir([string]$dir) {
    if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
    New-Item -ItemType Directory -Path $dir | Out-Null
}

function Ensure-Dir([string]$dir) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir | Out-Null
    }
}

function Export-AllSlides([object]$pres, [string]$absOut, [int]$w, [int]$h) {
    $count = $pres.Slides.Count
    Write-Host "Exporting all $count slide(s) -> $absOut"
    # Export() with "PNG" filter writes one file per slide as Slide1.PNG ... SlideN.PNG.
    $pres.Export($absOut, "PNG", $w, $h)

    # Rename SlideN.PNG / BildN.PNG -> slide-NN.png so files sort numerically and the
    # naming is stable across Office locale variants (en: Slide, sv: Bild, de: Folie, ...).
    Get-ChildItem -Path $absOut -Filter "*.PNG" | ForEach-Object {
        if ($_.BaseName -match '^[A-Za-zÀ-ÿ]+(\d+)$') {
            $n = [int]$Matches[1]
            $newName = "slide-{0:D2}.png" -f $n
            Rename-Item -Path $_.FullName -NewName $newName
        }
    }
}

function Export-SelectedSlides([object]$pres, [string]$absOut, [int]$w, [int]$h, [int[]]$slideNums) {
    Write-Host "Exporting slide(s) $($slideNums -join ', ') -> $absOut"
    foreach ($n in $slideNums) {
        if ($n -lt 1 -or $n -gt $pres.Slides.Count) {
            Write-Warning "Slide $n out of range (1..$($pres.Slides.Count)), skipping"
            continue
        }
        $outFile = Join-Path $absOut ("slide-{0:D2}.png" -f $n)
        $slide = $pres.Slides.Item($n)
        # Slide.Export writes a single PNG at the exact path we give it — no rename needed.
        $slide.Export($outFile, "PNG", $w, $h)
    }
}

function Export-Pptx {
    param(
        [object]$ppt,
        [string]$pptxPath,
        [string]$outDir,
        [int]$w,
        [int]$h,
        [int[]]$slideNums,
        [bool]$selective
    )
    $abs = Resolve-Full $pptxPath
    if (-not (Test-Path $abs)) { throw "PPTX not found: $abs" }

    if ($selective) {
        Ensure-Dir $outDir
    } else {
        Reset-Dir $outDir
    }
    $absOut = Resolve-Full $outDir

    Write-Host "Opening: $abs"
    # WithWindow=$false runs PowerPoint in the background — faster, no UI flash.
    $pres = $ppt.Presentations.Open($abs, $true, $false, $false)
    try {
        if ($selective -and $slideNums.Count -gt 0) {
            Export-SelectedSlides $pres $absOut $w $h $slideNums
        } else {
            Export-AllSlides $pres $absOut $w $h
        }
    }
    finally {
        $pres.Close()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($pres) | Out-Null
    }
}

$selective = $slideNums.Count -gt 0
# Cache: if mockup already rendered and -Force not passed, skip mockup re-render.
$mockupExists = Test-Path (Join-Path $MockupOut "slide-01.png")
$renderMockup = $Force -or -not $mockupExists

$ppt = New-Object -ComObject PowerPoint.Application
try {
    Export-Pptx -ppt $ppt -pptxPath $SamplePath -outDir $SampleOut `
                -w $Width -h $Height -slideNums $slideNums -selective $selective

    if ($renderMockup) {
        Export-Pptx -ppt $ppt -pptxPath $MockupPath -outDir $MockupOut `
                    -w $Width -h $Height -slideNums @() -selective $false
    } else {
        Write-Host "Skipping mockup re-render (cached). Pass -Force to re-render."
    }
}
finally {
    $ppt.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}

Write-Host ""
Write-Host "Done."
Write-Host "  Rendered: $(Resolve-Full $SampleOut)"
Write-Host "  Mockup:   $(Resolve-Full $MockupOut)"
