$ErrorActionPreference = 'Stop'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
$output = Join-Path (Split-Path $PSScriptRoot -Parent) 'Blaze.exe'
& $compiler /nologo /codepage:65001 /utf8output /target:winexe /optimize+ "/out:$output" "/win32icon:$PSScriptRoot\assets\icon.ico" /reference:System.Windows.Forms.dll "$PSScriptRoot\launcher.cs"
if ($LASTEXITCODE -ne 0) { throw 'Сборка Blaze.exe не удалась.' }
Write-Output "Готово: $output"
