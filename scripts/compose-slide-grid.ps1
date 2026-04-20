# Compose slide PNGs into a single grid image for one-shot visual review.
#
# Reads tmp/slides-png/slide-NN.png and writes tmp/slides-png/composite.png
# at 480x270 per cell, default 6 cols x 3 rows = 2880x810 for a 17-18
# slide deck. One Read tool call sees the whole deck, saving ~25K tokens
# vs reading 18 individual PNGs.
#
# Each cell has a small slide-number label overlay (top-left) so you can
# quickly point at "slide 7" or "slide 13" when iterating.
#
# Usage:
#   pwsh -File scripts/compose-slide-grid.ps1
#   pwsh -File scripts/compose-slide-grid.ps1 -InputDir tmp/mockup-png

param(
    [string]$InputDir   = (Join-Path $PSScriptRoot "..\tmp\slides-png"),
    [string]$OutPath    = $null,
    [int]$Cols          = 6,
    [int]$CellWidth     = 480,
    [int]$CellHeight    = 270
)

if (-not $OutPath) {
    $OutPath = Join-Path $InputDir "composite.png"
}

if (-not (Test-Path $InputDir)) {
    Write-Error "Input dir not found: $InputDir"
    exit 1
}

Add-Type -AssemblyName System.Drawing

$slideFiles = Get-ChildItem -Path $InputDir -Filter "slide-*.png" | Sort-Object Name
if ($slideFiles.Count -eq 0) {
    Write-Error "No slide-*.png files in $InputDir"
    exit 1
}

$rows = [Math]::Ceiling($slideFiles.Count / $Cols)
$totalWidth  = $Cols * $CellWidth
$totalHeight = $rows * $CellHeight

$bitmap   = New-Object System.Drawing.Bitmap($totalWidth, $totalHeight)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::White)

# Slide-number label styling: dark text on semi-transparent white pill.
$labelFont      = New-Object System.Drawing.Font("Consolas", 14, [System.Drawing.FontStyle]::Bold)
$labelBrush     = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(230, 0, 0, 0))
$labelBackBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(200, 255, 255, 255))

try {
    for ($i = 0; $i -lt $slideFiles.Count; $i++) {
        $col = $i % $Cols
        $row = [Math]::Floor($i / $Cols)
        $x   = $col * $CellWidth
        $y   = $row * $CellHeight

        $img = [System.Drawing.Image]::FromFile($slideFiles[$i].FullName)
        try {
            $rect = New-Object System.Drawing.Rectangle($x, $y, $CellWidth, $CellHeight)
            $graphics.DrawImage($img, $rect)
        } finally {
            $img.Dispose()
        }

        # Strip leading zeros for the label ("07" -> "7"), but keep "0" for slide 0.
        $labelText = ($slideFiles[$i].BaseName -replace 'slide-', '').TrimStart('0')
        if ($labelText -eq '') { $labelText = '0' }

        $labelRect = New-Object System.Drawing.RectangleF(($x + 4), ($y + 4), 38, 24)
        $graphics.FillRectangle($labelBackBrush, $labelRect)
        $graphics.DrawString($labelText, $labelFont, $labelBrush, ($x + 8), ($y + 6))
    }

    $bitmap.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host ("Composite grid written: {0} ({1}x{2}, {3} slides, {4} cols x {5} rows)" `
        -f $OutPath, $totalWidth, $totalHeight, $slideFiles.Count, $Cols, $rows)
}
finally {
    $graphics.Dispose()
    $bitmap.Dispose()
    $labelFont.Dispose()
    $labelBrush.Dispose()
    $labelBackBrush.Dispose()
}
