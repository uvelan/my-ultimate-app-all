"""Rebuild the self-contained notebook after editing drive_converter.py."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def cell(kind, source):
    import hashlib
    result = dict(cell_type=kind, id=hashlib.sha256(source.encode()).hexdigest()[:12],
                  metadata={}, source=source.splitlines(keepends=True))
    if kind == 'code':
        result.update(execution_count=None, outputs=[])
    return result


def notebook():
    return dict(nbformat=4, nbformat_minor=5,
        metadata=dict(colab=dict(name='Drive Chapter Audio', provenance=[]),
                      kernelspec=dict(name='python3', display_name='Python 3'), accelerator='GPU'),
        cells=[
            cell('markdown', (ROOT / 'README.md').read_text(encoding='utf-8')),
            cell('code', (ROOT / 'colab_setup.py').read_text(encoding='utf-8')),
            cell('code', '''from google.colab import drive
drive.mount('/content/drive')
print('Books will be listed from /content/drive/MyDrive/Myepub/')
print('Output: /content/drive/MyDrive/Myepub/UltimateAudio/<book-name>-<source-hash>/')
'''),
            cell('code', (ROOT / 'drive_converter.py').read_text(encoding='utf-8')),
            cell('code', '# Manual batch: choose the book and settings.\ninteractive()\n'),
            cell('code', '# Quick resume: run this cell on its own after setup.\ncontinue_last_book()\n')])


if __name__ == '__main__':
    (ROOT / 'Drive_Chapter_Audio.ipynb').write_text(
        json.dumps(notebook(), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
