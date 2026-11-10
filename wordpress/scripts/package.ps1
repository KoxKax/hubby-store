$ErrorActionPreference = 'Stop'
$wordpressRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $wordpressRoot 'dist'
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
# Only distributable source folders. Excludes local auto-setup, development
# authentication, snapshots, dependencies, database and hosting credentials.
Compress-Archive -LiteralPath (Join-Path $wordpressRoot 'themes/hubby') -DestinationPath (Join-Path $outputDirectory 'hubby-theme-0.1.0.zip') -Force
Compress-Archive -LiteralPath (Join-Path $wordpressRoot 'plugins/hubby-suppliers') -DestinationPath (Join-Path $outputDirectory 'hubby-suppliers-0.3.0.zip') -Force
Get-ChildItem -LiteralPath $outputDirectory -Filter '*.zip' | Select-Object Name, Length
