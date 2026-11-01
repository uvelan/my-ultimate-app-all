param([ValidateSet('auto','cuda','cpu')][string]$Device = 'auto', [int]$Port = 8766)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
& '.venv/Scripts/python.exe' -u -m ultimate_sync --device $Device --port $Port
if ($LASTEXITCODE) { throw "Sync service exited ($LASTEXITCODE). See .state/logs for details." }
