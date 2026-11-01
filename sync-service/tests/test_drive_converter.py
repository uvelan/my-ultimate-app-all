import importlib.util
import json
import shutil
import tempfile
import threading
import unittest
import wave
import zipfile
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'colab'
spec = importlib.util.spec_from_file_location('drive_converter', SOURCE / 'drive_converter.py')
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


class FakeRenderer:
    def render(self, chapter, voice, output, progress):
        if chapter['title'] == 'fail':
            raise RuntimeError('simulated GPU failure')
        with wave.open(str(output), 'wb') as audio:
            audio.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
            audio.writeframes(b'\0\0' * 240)
        progress(len(chapter['chunks']))
        return dict(title=chapter['title'], segments=[])


class DriveConverterTests(unittest.TestCase):
    def library_json(self, directory):
        rows = [dict(number=1, order=0, title='Chapter 1: Palaces', content=[{'type': 'paragraph', 'children': [{'text': 'One & two.'}]}], paragraphs=['One & two.', 'Three palaces.']),
                dict(number=2, order=1, title='Chapter 2: Next', content=['Chapter 2: Next', 'Next body.'], paragraphs=['Chapter 2: Next', 'Next body.'])]
        data = dict(schema='ultimate-library-book', version=1, metadata=dict(title='Exported JSON Book', description='Library backup'),
                    validation=dict(status='passed', chapterCount=2, paragraphCount=4), chapters=rows)
        path = Path(directory) / 'Library Book.json'
        path.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        return path

    def test_library_json_packages_are_deterministic_and_keep_existing_drive_compatibility(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = self.library_json(temporary)
            chapters = converter.load_chapters(source)
            folder, book = converter.prepare_book(source, chapters)
            self.assertEqual(book['title'], 'Exported JSON Book')
            self.assertRegex(book['bookId'], r'^epub-[a-f0-9]{64}$')
            self.assertEqual(book['source']['sha256'], converter.sha256(folder / 'source.epub'))
            self.assertEqual((folder / 'source.json').read_bytes(), source.read_bytes())
            self.assertEqual(chapters, converter.load_chapters(folder / 'source.epub'))
            self.assertEqual(chapters[0]['paragraphs'], ['Chapter 1: Palaces', 'One & two.', 'Three palaces.'])
            self.assertEqual(chapters[1]['paragraphs'], ['Chapter 2: Next', 'Next body.'])
            converter.convert(chapters[:1], folder, book=book, renderer_factory=FakeRenderer)
            keys = [converter.identity(c, 'af_bella', 'wav') for c in chapters]
            again, resumed = converter.prepare_book(source, chapters)
            self.assertEqual(again, folder)
            self.assertEqual([converter.identity(c, 'af_bella', 'wav') for c in chapters], keys)
            self.assertEqual(len(resumed['recordings']), 1)
            archive = converter.export_mobile_package(folder, resumed, chapters[:1])
            with zipfile.ZipFile(archive) as package:
                self.assertEqual(package.read('source.epub'), (folder / 'source.epub').read_bytes())

    def test_interactive_lists_and_selects_library_json_with_existing_batch_prompts(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temporary:
            self.library_json(temporary)
            with patch.object(converter, 'BOOK_DIRECTORY', temporary), \
                    patch('builtins.input', side_effect=['1', '1', '2', '']), \
                    patch.object(converter, 'convert_parallel', return_value={}) as convert:
                converter.interactive()
            self.assertEqual(len(convert.call_args.args[0]), 2)
            self.assertEqual(convert.call_args.kwargs['workers'], 2)
            self.assertEqual(convert.call_args.kwargs['book']['source']['inputFormat'], 'json')

    def test_library_json_rejects_bad_schema_and_validation_counts(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = self.library_json(temporary)
            data = json.loads(source.read_text())
            data['validation']['chapterCount'] = 99
            source.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'validation counts'):
                converter.prepare_book(source, converter.load_chapters(source))
            data['schema'] = 'unrelated-backup'
            source.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'updated library'):
                converter.prepare_book(source, converter.load_chapters(source))

    def test_corrupt_library_export_is_rejected_before_audio_generation(self):
        with self.assertRaisesRegex(ValueError, 'Re-export the original book'):
            converter.normalize_chapter({'number': 1, 'title': 'Chapter 1', 'paragraphs': ['[object Object]']}, 1, 'broken.epub')

    def test_atomic_metadata_write_creates_missing_output_parent(self):
        with tempfile.TemporaryDirectory() as temporary:
            target = Path(temporary) / 'missing' / 'book' / 'batch-state-af_bella-wav.json'
            converter.write_json_atomic(target, {'endChapterNumber': 10})
            self.assertEqual(json.loads(target.read_text())['endChapterNumber'], 10)
            self.assertEqual(list(target.parent.glob('*.part')), [])

    def test_atomic_copy_retries_transient_missing_folder(self):
        from unittest.mock import patch
        import errno
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / 'local.json'; source.write_text('verified data')
            target = Path(temporary) / 'drive' / 'metadata.json'
            original = converter.shutil.copyfile
            attempts = []
            def flaky(src, dst):
                attempts.append(dst)
                if len(attempts) == 1:
                    raise FileNotFoundError(errno.ENOENT, 'folder temporarily unavailable', str(dst))
                return original(src, dst)
            with patch.object(converter.shutil, 'copyfile', side_effect=flaky), patch.object(converter.time, 'sleep'):
                converter.atomic_copy(source, target)
            self.assertEqual(len(attempts), 2)
            self.assertEqual(target.read_text(), 'verified data')
            self.assertEqual(list(target.parent.glob('*.part')), [])

    def test_atomic_copy_refuses_unmounted_drive_without_creating_local_fallback(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / 'local.json'; source.write_text('data')
            with patch.object(converter.os.path, 'ismount', return_value=False), patch.object(Path, 'mkdir') as mkdir:
                with self.assertRaisesRegex(RuntimeError, 'Google Drive is not mounted'):
                    converter.atomic_copy(source, Path('/content/drive/MyDrive/Myepub/UltimateAudio/book/state.json'))
                mkdir.assert_not_called()

    def test_atomic_copy_failure_keeps_existing_published_metadata(self):
        from unittest.mock import patch
        import errno
        with tempfile.TemporaryDirectory() as temporary:
            source = Path(temporary) / 'local.json'; source.write_text('new data')
            target = Path(temporary) / 'saved.json'; target.write_text('existing verified data')
            with patch.object(converter.shutil, 'copyfile', side_effect=OSError(errno.EIO, 'Drive unavailable')) as copy, patch.object(converter.time, 'sleep'):
                with self.assertRaisesRegex(OSError, 'Remount Drive'):
                    converter.atomic_copy(source, target)
            self.assertEqual(copy.call_count, 3)
            self.assertEqual(target.read_text(), 'existing verified data')
            def corrupt(src, dst):
                Path(dst).write_text('corrupt data')
            with patch.object(converter.shutil, 'copyfile', side_effect=corrupt):
                with self.assertRaisesRegex(OSError, 'checksum'):
                    converter.atomic_copy(source, target)
            self.assertEqual(target.read_text(), 'existing verified data')
            self.assertEqual(list(target.parent.glob('*.part')), [])

    def test_interactive_custom_range_and_parallel_prompt(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temporary:
            self.epub(temporary)
            with patch.object(converter, 'BOOK_DIRECTORY', temporary), \
                    patch('builtins.input', side_effect=['1', '3', '2-2', '3']) as prompts, \
                    patch.object(converter, 'convert_parallel', return_value={}) as convert:
                converter.interactive()
            self.assertEqual([c['number'] for c in convert.call_args.args[0]], [2])
            self.assertEqual(convert.call_args.kwargs['workers'], 3)
            self.assertIn('Custom section range', prompts.call_args_list[2].args[0])
            self.assertIn('threads', prompts.call_args_list[3].args[0])
            state = next(Path(temporary).rglob('batch-state-af_bella-wav.json'))
            self.assertEqual(json.loads(state.read_text())['endChapterNumber'], 2)

    def test_batch_summary_tracks_saved_skipped_failed_audio_and_elapsed(self):
        from unittest.mock import patch
        import io
        with tempfile.TemporaryDirectory() as temporary:
            chapters = [self.chapter(), self.chapter(2, title='fail')]
            with patch('sys.stdout', new_callable=io.StringIO) as output:
                converter.convert(chapters, temporary, renderer_factory=FakeRenderer)
            summary = json.loads(next(Path(temporary).glob('batch-summary-*.json')).read_text())
            self.assertEqual([r['status'] for r in summary['chapters']], ['saved', 'failed'])
            self.assertAlmostEqual(summary['audioSeconds'], .01)
            self.assertGreaterEqual(summary['elapsedSeconds'], 0)
            self.assertIn('Total audio:', output.getvalue())
            self.assertIn('Threads: 1', output.getvalue())
            self.assertEqual(summary['chapterWorkers'], 1)
            converter.convert([chapters[0]], temporary, renderer_factory=lambda: self.fail('Must skip'))
            summaries = [json.loads(p.read_text()) for p in Path(temporary).glob('batch-summary-*.json')]
            skipped = next(s for s in summaries if s['skipped'] == 1)
            self.assertEqual(skipped['chapters'][0]['status'], 'already saved')
            self.assertAlmostEqual(skipped['audioSeconds'], .01)

    def test_cpu_pronunciation_backends_are_serialized_across_workers(self):
        from concurrent.futures import ThreadPoolExecutor
        import time
        active, peak = [0], [0]
        def phonemize(value):
            active[0] += 1
            peak[0] = max(peak[0], active[0])
            time.sleep(.01)
            active[0] -= 1
            return value
        functions = [converter.LockedG2P(phonemize), converter.LockedG2P(phonemize)]
        with ThreadPoolExecutor(max_workers=2) as executor:
            results = list(executor.map(lambda i: functions[i % 2](i), range(6)))
        self.assertEqual(results, list(range(6)))
        self.assertEqual(peak[0], 1)

    def test_two_chapter_workers_overlap_with_independent_models_and_safe_resume(self):
        barrier = threading.Barrier(2)
        second_done = threading.Event()
        models, finished = [], []
        lock = threading.Lock()
        class ParallelFake(FakeRenderer):
            def __init__(self):
                with lock:
                    models.append(id(self))
            def render(self, chapter, voice, output, progress):
                barrier.wait(5)
                result = super().render(chapter, voice, output, progress)
                if chapter['number'] == 1:
                    if not second_done.wait(5):
                        raise AssertionError('Second chapter did not render concurrently')
                with lock:
                    finished.append(chapter['number'])
                if chapter['number'] == 2:
                    second_done.set()
                return result
        with tempfile.TemporaryDirectory() as temporary:
            source = self.epub(temporary)
            chapters = converter.load_chapters(source)
            folder, book = converter.prepare_book(source, chapters)
            stats = converter.convert_parallel(chapters, folder, workers=2, book=book, renderer_factory=ParallelFake)
            self.assertEqual(stats, dict(ready=2, skipped=0, failed=0))
            self.assertEqual(len(set(models)), 2)
            summary = json.loads(next((folder / 'history').glob('batch-summary-*.json')).read_text())
            self.assertEqual(summary['chapterWorkers'], 2)
            self.assertEqual(finished, [2, 1])
            self.assertEqual(len(json.loads((folder / 'book.json').read_text())['recordings']), 2)
            stats = converter.convert_parallel(chapters, folder, workers=2, book=book,
                                               renderer_factory=lambda: self.fail('Verified audio must not load a model'))
            self.assertEqual(stats, dict(ready=0, skipped=2, failed=0))

    def test_parallel_failure_does_not_block_other_chapters(self):
        with tempfile.TemporaryDirectory() as temporary:
            chapters = [self.chapter(), self.chapter(2, title='fail'), self.chapter(3)]
            stats = converter.convert_parallel(chapters, temporary, workers=2, renderer_factory=FakeRenderer)
            self.assertEqual(stats, dict(ready=2, skipped=0, failed=1))
            self.assertFalse(converter.completed(Path(temporary), converter.identity(chapters[1], 'af_bella', 'wav'), 'wav'))
        for workers in (0, 9, True):
            with self.assertRaises(ValueError):
                converter.convert_parallel([], '.', workers=workers)

    def test_parallel_budget_saves_started_chapters_without_starting_more(self):
        barrier = threading.Barrier(2)
        now = [0]
        rendered = []
        class Timed(FakeRenderer):
            def render(self, chapter, voice, output, progress):
                barrier.wait(5)
                now[0] = 70
                rendered.append(chapter['number'])
                return super().render(chapter, voice, output, progress)
        with tempfile.TemporaryDirectory() as temporary:
            chapters = [self.chapter(i) for i in range(1, 4)]
            stats = converter.convert_parallel(chapters, temporary, workers=2, renderer_factory=Timed,
                                               max_minutes=1, clock=lambda: now[0])
            self.assertEqual(stats, dict(ready=2, skipped=0, failed=0, deferred=1))
            self.assertEqual(sorted(rendered), [1, 2])

    def test_parallel_save_overlaps_next_generation_without_overwriting_audio(self):
        from unittest.mock import patch
        saving = threading.Event()
        next_generation = threading.Event()
        original_copy = converter.atomic_copy
        class OverlapRenderer(FakeRenderer):
            def render(self, chapter, voice, output, progress):
                if chapter['number'] == 2:
                    if not saving.wait(3):
                        raise AssertionError('Previous Drive save never started')
                    next_generation.set()
                return super().render(chapter, voice, output, progress)
        def slow_copy(source, target):
            if str(target).endswith('.wav') and not saving.is_set():
                saving.set()
                if not next_generation.wait(3):
                    raise AssertionError('Drive save blocked next generation')
            return original_copy(source, target)
        with tempfile.TemporaryDirectory() as temporary, \
                patch.object(converter, 'atomic_copy', side_effect=slow_copy):
            chapters = [self.chapter(), self.chapter(2)]
            stats = converter.convert(chapters, temporary, renderer_factory=OverlapRenderer)
            self.assertEqual(stats, dict(ready=2, skipped=0, failed=0))
            self.assertTrue(next_generation.is_set())
            for chapter in chapters:
                key = converter.identity(chapter, 'af_bella', 'wav')
                self.assertTrue(converter.completed(Path(temporary), key, 'wav'))

    def test_background_save_failure_is_reported_and_cleanup_runs(self):
        notices = []
        def fail():
            raise OSError('Drive disconnected')
        with converter.BoundedPublisher() as publisher:
            publisher.submit(fail, lambda result: self.fail('must not report saved'),
                             lambda error: notices.append(str(error)), lambda: notices.append('cleaned'))
        self.assertEqual(notices, ['Drive disconnected', 'cleaned'])

    def epub(self, folder, encrypted=False):
        path = Path(folder) / 'Book.epub'
        with zipfile.ZipFile(path, 'w') as book:
            book.writestr('META-INF/container.xml', '''<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
            <rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>''')
            book.writestr('OPS/book.opf', '''<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
            <manifest>
              <item id="second" href="text/a.xhtml" media-type="application/xhtml+xml"/>
              <item id="first" href="text/z%20first.xhtml" media-type="application/xhtml+xml"/>
              <item id="nav" href="nav.xhtml" properties="nav" media-type="application/xhtml+xml"/>
              <item id="extra" href="extra.xhtml" media-type="application/xhtml+xml"/>
              <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
            </manifest>
            <spine><itemref idref="nav"/><itemref idref="cover"/><itemref idref="first"/>
              <itemref idref="extra" linear="no"/><itemref idref="second"/></spine></package>''')
            book.writestr('OPS/text/z first.xhtml', '''<html xmlns="http://www.w3.org/1999/xhtml">
              <head><title>Ignore metadata</title><style>bad style</style></head><body>
              <h1>Chapter <em>350</em></h1><p>Hello <b>bold</b> &amp; friends.</p>
              <div hidden="hidden"><p>Hidden</p></div><nav>Skip links</nav>
              <script>Bad script</script><p>Next<br/>line.</p></body></html>''')
            book.writestr('OPS/text/a.xhtml', '<html><body><h2>Chapter 351</h2><p>Second chapter.</p></body></html>')
            book.writestr('OPS/nav.xhtml', '<html><body>Contents links</body></html>')
            book.writestr('OPS/cover.xhtml', '<html><body><img src="cover.png"/></body></html>')
            # Non-linear resources deliberately absent: they must not be read.
            if encrypted:
                book.writestr('META-INF/encryption.xml', '''<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"
                  xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:CipherData>
                  <enc:CipherReference URI="OPS/text/z%20first.xhtml"/>
                  </enc:CipherData></enc:EncryptedData></encryption>''')
        return path

    def test_epub_spine_order_visible_text_and_range(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = self.epub(temporary)
            chapters = converter.load_chapters(path)
            self.assertEqual([c['title'] for c in chapters], ['Chapter 350', 'Chapter 351'])
            self.assertEqual([c['number'] for c in chapters], [1, 2])
            self.assertEqual(chapters[0]['paragraphs'], ['Chapter 350', 'Hello bold & friends.', 'Next', 'line.'])
            self.assertEqual(converter.select_chapters(chapters, '2')[0]['title'], 'Chapter 351')
            self.assertEqual(converter.load_chapters(Path(temporary)), chapters)
            shutil.copy(path, Path(temporary) / 'Another.epub')
            with self.assertRaisesRegex(ValueError, 'specific EPUB'):
                converter.load_chapters(Path(temporary))

    def test_epub_encrypted_text_and_invalid_resource(self):
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, 'encrypted'):
                converter.load_chapters(self.epub(temporary, encrypted=True))
        for href in ('https://example.com/a.xhtml', '../../a.xhtml', '/a.xhtml'):
            with self.assertRaises(ValueError):
                converter.epub_member('OPS', href)

    def test_free_gpu_memory_policy(self):
        gib = 1024**3
        self.assertFalse(converter.should_trim_cache(2*gib, 5*gib, 16*gib))
        self.assertTrue(converter.should_trim_cache(2*gib, 13*gib, 16*gib))
        self.assertTrue(converter.should_trim_cache(gib, 2*gib, 4*gib))
        self.assertFalse(converter.should_trim_cache(gib, gib + 32*1024**2, 4*gib))
        self.assertFalse(converter.should_trim_cache(13*gib, 13*gib, 16*gib))

    def test_gpu_monitor_reports_compute_separately_from_memory(self):
        monitor = converter.GpuSampler()
        monitor.record('90, 1800\n')
        monitor.record('70, 1900\n')
        self.assertEqual(monitor.summary()['gpuUtilAveragePercent'], 80)
        self.assertEqual(monitor.summary()['gpuUtilPeakPercent'], 90)
        self.assertEqual(monitor.latest['deviceMemoryUsedMiB'], 1900)
        with self.assertRaises(ValueError):
            monitor.record('N/A, 1800')
        self.assertEqual(monitor.summary()['gpuSamples'], 2)

    def test_missing_gpu_monitor_does_not_fail_conversion(self):
        from unittest.mock import patch
        with patch.object(converter.shutil, 'which', return_value=None):
            with converter.GpuSampler() as monitor:
                self.assertEqual(monitor.summary()['gpuSamples'], 0)
            self.assertIn('gpuMonitoringNotice', monitor.summary())

    def test_gpu_monitor_exits_on_probe_failure(self):
        from unittest.mock import patch
        import subprocess
        with patch.object(subprocess, 'run', side_effect=OSError('probe unavailable')):
            monitor = converter.GpuSampler()
            monitor.run()
            self.assertEqual(monitor.summary()['gpuSamples'], 0)
            self.assertIn('probe unavailable', monitor.summary()['gpuMonitoringNotice'])

    def test_portable_book_package_preserves_ranges_and_recovers_index(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = self.epub(temporary)
            chapters = converter.load_chapters(source)
            folder, book = converter.prepare_book(source, chapters)
            self.assertEqual(folder.parent.name, 'UltimateAudio')
            self.assertTrue(folder.name.startswith('Book-'))
            self.assertEqual(converter.sha256(folder / 'source.epub'), converter.sha256(source))
            first_id = book['chapters'][0]['chapterId']
            converter.convert(chapters[:1], folder, book=book, renderer_factory=FakeRenderer)
            folder2, book2 = converter.prepare_book(source, chapters)
            self.assertEqual(folder2, folder)
            converter.convert(chapters[1:], folder, book=book2, renderer_factory=FakeRenderer)
            catalog = json.loads((folder / 'book.json').read_text())
            self.assertEqual(len(catalog['recordings']), 2)
            self.assertEqual(catalog['chapters'][0]['chapterId'], first_id)
            for entry in catalog['recordings'].values():
                self.assertTrue((folder / entry['audioFile']).is_file())
                manifest = json.loads((folder / entry['manifestFile']).read_text())
                self.assertEqual(manifest['bookId'], catalog['bookId'])
                self.assertEqual(manifest['chapterId'], entry['chapterId'])
                self.assertEqual(manifest['textSha256'], entry['textSha256'])
                self.assertEqual(manifest['voice'], 'af_bella')
                self.assertEqual(manifest['format'], 'wav')
                self.assertEqual(manifest['chapterIndex'], manifest['chapterNumber'] - 1)
            # Crash after chapter publication but before catalog update: rebuild on resume.
            catalog['recordings'] = {}
            converter.write_json_atomic(folder / 'book.json', catalog)
            _, resumed = converter.prepare_book(source, chapters)
            stats = converter.convert(chapters, folder, book=resumed,
                                      renderer_factory=lambda: self.fail('no regeneration'))
            self.assertEqual(stats['skipped'], 2)
            self.assertEqual(len(json.loads((folder / 'book.json').read_text())['recordings']), 2)

    def test_mobile_zip_contains_only_selected_verified_recordings(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = self.epub(temporary)
            chapters = converter.load_chapters(source)
            folder, book = converter.prepare_book(source, chapters)
            converter.convert(chapters, folder, book=book, renderer_factory=FakeRenderer)
            archive = converter.export_mobile_package(folder, book, chapters[:1])
            with zipfile.ZipFile(archive) as zip:
                catalog = json.loads(zip.read('book.json'))
                self.assertEqual(len(catalog['recordings']), 1)
                record = next(iter(catalog['recordings'].values()))
                self.assertEqual(record['chapterNumber'], 1)
                self.assertEqual(zip.read(record['audioFile']), (folder / record['audioFile']).read_bytes())
                self.assertEqual(zip.read('source.epub'), source.read_bytes())
                self.assertTrue(all(not name.startswith('/') and '..' not in name.split('/') for name in zip.namelist()))

    def test_interactive_asks_book_resume_option_and_chapter_count(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temporary:
            source = self.epub(temporary)
            with patch.object(converter, 'BOOK_DIRECTORY', temporary), \
                    patch('builtins.input', side_effect=['1', '1', '2', '']) as prompts, \
                    patch.object(converter, 'convert_parallel', return_value={}) as convert:
                converter.interactive()
            self.assertEqual(prompts.call_count, 4)
            self.assertEqual([c['number'] for c in convert.call_args.args[0]], [1, 2])
            self.assertEqual(convert.call_args.args[2:4], ('af_bella', 'wav'))
            self.assertEqual(convert.call_args.kwargs['max_minutes'], 0)
            self.assertIn('book', convert.call_args.kwargs)
            self.assertEqual(convert.call_args.kwargs['workers'], 2)

    def test_interactive_parallel_override_and_invalid_input(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temporary:
            self.epub(temporary)
            for value in ('1', '3', '8', '0', '9', '2.5', 'two'):
                with self.subTest(workers=value), \
                        patch.object(converter, 'BOOK_DIRECTORY', temporary), \
                        patch('builtins.input', side_effect=['1', '1', '1', value]), \
                        patch.object(converter, 'convert_parallel', return_value={}) as convert:
                    if value in ('1', '3', '8'):
                        converter.interactive()
                        self.assertEqual(convert.call_args.kwargs['workers'], int(value))
                    else:
                        with self.assertRaisesRegex(ValueError, 'from 1 to 8'):
                            converter.interactive()
                        convert.assert_not_called()

    def test_book_picker_order_and_invalid_selection(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as temporary:
            source = self.epub(temporary)
            shutil.copy(source, Path(temporary) / 'A Book.epub')
            # A previous output's embedded source must not appear in the book list.
            nested = Path(temporary) / 'UltimateAudio'
            nested.mkdir()
            shutil.copy(source, nested / 'source.epub')
            with patch.object(converter, 'BOOK_DIRECTORY', temporary), \
                    patch('builtins.input', side_effect=['1', '1', '1', '']) as prompts, \
                    patch.object(converter, 'prepare_book', wraps=converter.prepare_book) as prepare, \
                    patch.object(converter, 'convert_parallel', return_value={}):
                converter.interactive()
                self.assertEqual(prepare.call_args.args[0].name, 'A Book.epub')
            with patch.object(converter, 'BOOK_DIRECTORY', temporary), \
                    patch('builtins.input', return_value='3'):
                with self.assertRaisesRegex(ValueError, 'from 1 to 2'):
                    converter.interactive()

    def test_resume_success_and_previous_requested_end_are_distinct_and_voice_scoped(self):
        with tempfile.TemporaryDirectory() as temporary:
            source = self.epub(temporary)
            chapters = [self.chapter(i) for i in range(1, 7)]
            folder, book = converter.prepare_book(source, chapters)
            converter.convert([chapters[2]], folder, book=book, renderer_factory=FakeRenderer)
            last, previous = converter.resume_positions(chapters, folder, book)
            self.assertEqual((last, previous), (2, None))
            selected = converter.next_batch(chapters, last, previous, '1', 2)
            self.assertEqual([c['number'] for c in selected], [4, 5])
            converter.save_batch_request(folder, book, chapters, selected, '1')
            # Only chapter 4 was saved before interruption; requested batch ended at 5.
            converter.convert(selected[:1], folder, book=book, renderer_factory=FakeRenderer)
            last, previous = converter.resume_positions(chapters, folder, book)
            self.assertEqual((last, previous), (3, 4))
            self.assertEqual([c['number'] for c in converter.next_batch(chapters, last, previous, '1', 2)], [5, 6])
            self.assertEqual([c['number'] for c in converter.next_batch(chapters, last, previous, '2', 2)], [6])
            self.assertEqual(converter.resume_positions(chapters, folder, book, voice='af_heart'), (-1, None))
            key = converter.identity(chapters[3], 'af_bella', 'wav')
            (folder / 'chapters' / f'{key}.wav').write_bytes(b'corrupted')
            self.assertEqual(converter.resume_positions(chapters, folder, book), (2, 4))
            # A completed pair without a catalog entry remains a recoverable success.
            book['recordings'] = {}
            converter.resume_positions(chapters, folder, book)
            self.assertEqual(len(book['recordings']), 1)

    def test_resume_count_bounds_invalid_modes_and_end_of_book(self):
        chapters = [self.chapter(i) for i in range(1, 4)]
        self.assertEqual(converter.next_batch(chapters, 2, 2, '1', 10), [])
        self.assertEqual(converter.next_batch(chapters, -1, None, '1', 10), chapters)
        for count in (0, -1, 1.5, True):
            with self.assertRaises(ValueError):
                converter.next_batch(chapters, -1, None, '1', count)
        with self.assertRaisesRegex(ValueError, 'No previous batch'):
            converter.next_batch(chapters, -1, None, '2', 1)
        with self.assertRaises(ValueError):
            converter.next_batch(chapters, -1, None, '3', 1)

    def test_session_budget_finishes_current_chapter_and_defers_rest(self):
        now = [0]
        class TimedRenderer(FakeRenderer):
            def render(self, *args):
                result = super().render(*args)
                now[0] += 70
                return result
        with tempfile.TemporaryDirectory() as temporary:
            chapters = [self.chapter(), self.chapter(2)]
            result = converter.convert(chapters, temporary, renderer_factory=TimedRenderer,
                                       max_minutes=1, clock=lambda: now[0])
            self.assertEqual(result, dict(ready=1, failed=0, skipped=0, deferred=1))
            folder = Path(temporary)
            self.assertTrue(converter.completed(folder, converter.identity(chapters[0], 'af_bella', 'wav'), 'wav'))
            self.assertFalse(converter.completed(folder, converter.identity(chapters[1], 'af_bella', 'wav'), 'wav'))
            result = converter.convert(chapters, temporary, renderer_factory=TimedRenderer)
            self.assertEqual(result, dict(ready=1, failed=0, skipped=1))

    def chapter(self, number=1, text='Hello world', title='Chapter'):
        return converter.normalize_chapter(dict(number=number, title=title, text=text), 1, 'test')

    def test_txt_natural_order_numbers_and_json(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            (folder / 'Chapter 10.txt').write_text('Ten', encoding='utf-8')
            (folder / 'Chapter 2.txt').write_text('Two', encoding='utf-8')
            chapters = converter.load_chapters(folder)
            self.assertEqual([c['number'] for c in chapters], [2, 10])
            (folder / 'book.json').write_text(json.dumps({'chapters': [dict(number=15, text='Fifteen')]}))
            self.assertEqual([c['number'] for c in converter.load_chapters(folder)], [2, 10, 15])
            self.assertEqual(converter.select_chapters(chapters, '2-9'), [chapters[0]])
            for selection in ('9-2', '0', 'bad', '100-200'):
                with self.assertRaises(ValueError):
                    converter.select_chapters(chapters, selection)
            (folder / 'Chapter 2 duplicate.txt').write_text('Duplicate')
            with self.assertRaisesRegex(ValueError, 'Duplicate'):
                converter.load_chapters(folder)

    def test_long_paragraph_split_and_explicit_chunks(self):
        chapter = self.chapter(text='longword' * 1200)
        self.assertTrue(all(0 < len(c) <= 4000 for c in chapter['chunks']))
        exported = converter.normalize_chapter(dict(text='Body', chunks=['Exact export.']), 1, 'test')
        self.assertEqual(exported['chunks'], ['Exact export.'])
        with self.assertRaises(ValueError):
            self.chapter(text=' ')

    def test_resume_corruption_changed_inputs_and_failure_isolation(self):
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            chapters = [self.chapter(), self.chapter(2, title='fail'), self.chapter(3)]
            result = converter.convert(chapters, folder, renderer_factory=FakeRenderer)
            self.assertEqual(result, dict(ready=2, skipped=0, failed=1))
            result = converter.convert([chapters[0]], folder, renderer_factory=lambda: self.fail('must skip model load'))
            self.assertEqual(result['skipped'], 1)
            key = converter.identity(chapters[0], 'af_bella', 'wav')
            (folder / f'{key}.wav').write_bytes(b'corrupted')
            self.assertEqual(converter.convert([chapters[0]], folder, renderer_factory=FakeRenderer)['ready'], 1)
            for changed in (self.chapter(text='Changed'), self.chapter(title='Changed')):
                self.assertNotEqual(converter.identity(changed, 'af_bella', 'wav'), key)
            self.assertNotEqual(converter.identity(chapters[0], 'af_heart', 'wav'), key)
            self.assertNotEqual(converter.identity(chapters[0], 'af_bella', 'mp3'), key)
            events = [json.loads(line)['event'] for p in folder.glob('history-*') for line in p.read_text().splitlines()]
            self.assertIn('chapter_failed', events)
            self.assertIn('batch_finished', events)
            self.assertFalse(list(folder.glob('*.part')))

    def test_notebook_embeds_current_source_and_compiles(self):
        notebook = json.loads((SOURCE / 'Drive_Chapter_Audio.ipynb').read_text(encoding='utf-8'))
        self.assertEqual(''.join(notebook['cells'][3]['source']), (SOURCE / 'drive_converter.py').read_text(encoding='utf-8'))
        for cell in notebook['cells']:
            if cell['cell_type'] == 'code':
                compile(''.join(cell['source']), '<notebook>', 'exec')

    @unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg is not installed')
    def test_mp3_encoding_and_manifest(self):
        with tempfile.TemporaryDirectory() as temporary:
            chapter = self.chapter()
            result = converter.convert([chapter], temporary, audio_format='mp3', renderer_factory=FakeRenderer)
            self.assertEqual(result, dict(ready=1, skipped=0, failed=0))
            key = converter.identity(chapter, 'af_bella', 'mp3')
            folder = Path(temporary)
            self.assertTrue(converter.completed(folder, key, 'mp3'))
            manifest = json.loads((folder / f'{key}.json').read_text())
            self.assertEqual(manifest['format'], 'mp3')
            self.assertGreater(manifest['bytes'], 0)

    def test_interruption_keeps_completed_chapters_and_logs(self):
        class InterruptRenderer(FakeRenderer):
            def render(self, chapter, voice, output, progress):
                if chapter['number'] == 2:
                    raise KeyboardInterrupt()
                return super().render(chapter, voice, output, progress)
        with tempfile.TemporaryDirectory() as temporary:
            chapters = [self.chapter(), self.chapter(2)]
            with self.assertRaises(KeyboardInterrupt):
                converter.convert(chapters, temporary, renderer_factory=InterruptRenderer)
            folder = Path(temporary)
            self.assertTrue(converter.completed(folder, converter.identity(chapters[0], 'af_bella', 'wav'), 'wav'))
            self.assertFalse(converter.completed(folder, converter.identity(chapters[1], 'af_bella', 'wav'), 'wav'))
            events = [json.loads(line)['event'] for p in folder.glob('history-*') for line in p.read_text().splitlines()]
            self.assertIn('batch_interrupted', events)


if __name__ == '__main__':
    unittest.main()
