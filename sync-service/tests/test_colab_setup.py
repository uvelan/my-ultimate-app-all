import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1] / 'colab'
spec = importlib.util.spec_from_file_location('colab_setup', ROOT / 'colab_setup.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class SetupTests(unittest.TestCase):
    def test_python313_uses_immutable_upstream_sources(self):
        requirements = setup.requirements_for((3, 13))
        self.assertIn(f'kokoro @ https://github.com/hexgrad/kokoro/archive/{setup.KOKORO_COMMIT}.zip', requirements)
        self.assertIn(f'misaki[en] @ https://github.com/hexgrad/misaki/archive/{setup.MISAKI_COMMIT}.zip', requirements)
        self.assertIn('spacy>=3.8.11,<3.9', requirements)
        self.assertFalse(any(r.startswith('torch') for r in requirements))
        self.assertIn('kokoro==0.9.4', setup.requirements_for((3, 12)))
        for python in ((3, 9), (3, 14)):
            with self.assertRaises(RuntimeError):
                setup.requirements_for(python)

    def test_failed_installer_exposes_and_saves_original_error(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()) as output:
            log = Path(directory) / 'install.log'
            with self.assertRaisesRegex(RuntimeError, 'exit 1'):
                setup.run_logged([sys.executable, '-c',
                                  'import sys; print("original resolver error", file=sys.stderr); sys.exit(1)'], log)
            self.assertIn('original resolver error', output.getvalue())
            self.assertIn('original resolver error', log.read_text())

    def test_source_install_check_requires_exact_revision(self):
        class Distribution:
            version = '0.9.4'
            def read_text(self, name):
                return json.dumps(dict(url='https://example.com/old.zip'))
        with patch.object(setup, 'distribution', return_value=Distribution()):
            self.assertFalse(setup.installed(setup.requirements_for((3, 13))[0]))
            self.assertTrue(setup.installed('kokoro==0.9.4'))

    def test_notebook_embeds_current_setup(self):
        notebook = json.loads((ROOT / 'Drive_Chapter_Audio.ipynb').read_text(encoding='utf-8'))
        self.assertEqual(''.join(notebook['cells'][1]['source']), (ROOT / 'colab_setup.py').read_text(encoding='utf-8'))
