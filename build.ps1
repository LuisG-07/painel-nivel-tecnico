# build.ps1 — generates dist\SkillMatrix_Pro.html (standalone)
# Usage: .\build.ps1   (from project root, in PowerShell)

$root = $PSScriptRoot
$dist = Join-Path $root "dist"
if (!(Test-Path $dist)) { New-Item -ItemType Directory -Path $dist | Out-Null }

$html = Get-Content (Join-Path $root "index.html") -Raw -Encoding UTF8

# Inline CSS
$css = Get-Content (Join-Path $root "css\main.css") -Raw -Encoding UTF8
$html = $html -replace '<link rel="stylesheet" href="css/main\.css">', "<style>`n$css`n</style>"

# Inline JS files
$jsFiles = @(
  "js\data\seed.js",
  "js\store\storage.js",
  "js\domain\scores.js",
  "js\ui\overview.js",
  "js\ui\evolution.js",
  "js\ui\training.js",
  "js\ui\modals.js",
  "js\integrations\zendesk_sync.js",
  "js\main.js"
)

foreach ($rel in $jsFiles) {
  $tag = '<script src="' + $rel.Replace('\','/') + '"></script>'
  $content = Get-Content (Join-Path $root $rel) -Raw -Encoding UTF8
  $replacement = "<script>`n$content`n</script>"
  $html = $html.Replace($tag, $replacement)
}

$outFile = Join-Path $dist "SkillMatrix_Pro.html"
[System.IO.File]::WriteAllText($outFile, $html, [System.Text.Encoding]::UTF8)

$sizeKB = [math]::Round((Get-Item $outFile).Length / 1024)
Write-Host "Build OK -> dist\SkillMatrix_Pro.html ($sizeKB KB)"
