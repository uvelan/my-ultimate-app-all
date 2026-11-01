"""Colab setup, embedded in the notebook; no repository imports required."""
import json
import os
import shutil
import subprocess
import sys
import tempfile
from importlib.metadata import PackageNotFoundError, distribution, version
from pathlib import Path

KOKORO_COMMIT = 'dfb907a02bba8152ca444717ca5d78747ccb4bec'
MISAKI_COMMIT = 'fba1236595f2d2bf21d414ba6e57d25256afada3'


def requirements_for(python_version):
    if not (3, 10) <= python_version < (3, 14):
        raise RuntimeError('This notebook supports Python 3.10–3.13.')
    if python_version >= (3, 13):
        # Released 0.9.4 metadata excludes 3.13; these upstream revisions support it.
        engines = [f'kokoro @ https://github.com/hexgrad/kokoro/archive/{KOKORO_COMMIT}.zip',
                   f'misaki[en] @ https://github.com/hexgrad/misaki/archive/{MISAKI_COMMIT}.zip']
        dependencies = ['spacy>=3.8.11,<3.9', 'transformers>=4.49,<5']
    else:
        engines = ['kokoro==0.9.4', 'misaki[en]==0.9.4']
        dependencies = ['spacy==3.8.7', 'transformers==4.49.0']
    return engines + dependencies + ['spacy-curated-transformers>=0.3.1,<2',
                                      'soundfile>=0.13,<0.14', 'tqdm>=4.66,<5']


def installed(requirement):
    from packaging.requirements import Requirement
    required = Requirement(requirement)
    try:
        package = distribution(required.name)
        if required.url:
            direct = json.loads(package.read_text('direct_url.json') or '{}')
            return direct.get('url') == required.url
        return package.version in required.specifier
    except (PackageNotFoundError, ValueError):
        return False


def run_logged(command, log_path):
    """Stream pip output explicitly: subprocess stderr can be hidden by Colab."""
    environment = dict(os.environ, PYTHONUNBUFFERED='1', PIP_PROGRESS_BAR='off')
    with Path(log_path).open('a', encoding='utf-8') as log:
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   text=True, encoding='utf-8', errors='replace', env=environment)
        for line in process.stdout:
            print(line, end='', flush=True)
            log.write(line)
            log.flush()
        code = process.wait()
    if code:
        raise RuntimeError(f'Setup command failed (exit {code}). Full output above and in {log_path}')


def setup():
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError('Select Runtime > Change runtime type > GPU, then rerun setup.')
    requirements = requirements_for(sys.version_info[:2])
    print('Python:', sys.version.split()[0], '| PyTorch:', torch.__version__,
          '| GPU:', torch.cuda.get_device_name(0), flush=True)
    root = Path('/content') if Path('/content').is_dir() else Path(tempfile.gettempdir())
    log_path = root / 'ultimate-colab-setup.log'
    print('Setup log:', log_path)
    tools = [name for name in ('espeak-ng', 'ffmpeg') if not shutil.which(name)]
    if tools:
        run_logged(['apt-get', '-qq', 'update'], log_path)
        run_logged(['apt-get', '-qq', '-y', 'install', *tools], log_path)
    if not all(installed(requirement) for requirement in requirements):
        # Keep the runtime's CUDA build and loaded NumPy ABI. Never replace GPU torch.
        with tempfile.TemporaryDirectory(prefix='colab-setup-') as temporary:
            constraints = Path(temporary) / 'constraints.txt'
            constraints.write_text(f'torch=={torch.__version__}\nnumpy=={version("numpy")}\n', encoding='utf-8')
            run_logged([sys.executable, '-m', 'pip', 'install', '--disable-pip-version-check',
                        '--constraint', str(constraints), *requirements], log_path)
    # A fresh interpreter detects dependency/ABI/import problems before conversion.
    run_logged([sys.executable, '-c',
        'import torch, spacy; from kokoro import KPipeline; from misaki import en; '
        'x=torch.ones((8,8),device="cuda"); (x@x).sum().item(); '
        'torch.cuda.synchronize(); print("Kokoro imports and CUDA probe passed")'], log_path)
    print('Setup complete. Continue with Drive mounting and conversion. '
          'If Colab requests a restart, restart and rerun setup.')


if __name__ == '__main__':
    setup()
