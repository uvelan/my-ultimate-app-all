param([string]$Python = 'python', [string]$TorchVersion = '2.6.0', [string]$CudaIndex = 'cu124')
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (!(Test-Path -LiteralPath '.venv/Scripts/python.exe')) { & $Python -m venv .venv; if ($LASTEXITCODE) { throw 'Python 3.10–3.12 is recommended.' } }
$runtime = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
# CUDA 12.4 / Torch 2.6 retains support for the GTX 1050 Ti (Pascal).
# Override these parameters for a newer GPU rather than silently selecting CPU wheels.
& $runtime -m pip install --upgrade pip
& $runtime -m pip install "torch==$TorchVersion" --index-url "https://download.pytorch.org/whl/$CudaIndex"
if ($LASTEXITCODE) { throw 'CUDA PyTorch installation failed.' }
& $runtime -m pip install -r requirements.txt
if ($LASTEXITCODE) { throw 'Service dependencies could not be installed.' }
& $runtime -c "import torch; print('CUDA available:', torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU only')"
