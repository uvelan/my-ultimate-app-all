"""Standalone Drive chapter conversion. Embedded in Drive_Chapter_Audio.ipynb."""
from __future__ import annotations

import hashlib
import errno
import json
import os
import posixpath
import queue
import re
import shutil
import tempfile
import threading
import time
import uuid
import wave
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from html.parser import HTMLParser
from html import escape
from pathlib import Path
from urllib.parse import unquote, urlsplit

# Edit these defaults here; interactive use asks only for book selection and range.
BOOK_DIRECTORY = '/content/drive/MyDrive/Myepub/'
VOICE = 'af_bella'
AUDIO_FORMAT = 'wav'  # Native mobile sync currently validates WAV. MP3 is optional.
SESSION_MINUTES = 0  # 0: finish the requested range; optional voluntary time budget.
PARALLEL_DRIVE_SAVE = True  # One GPU generator + one bounded Drive-save worker.
CREATE_MOBILE_PACKAGE = False  # Direct Drive sync reads chapter files; set True for ZIP fallback.
CHAPTER_WORKERS = 2  # Concurrent chapters; use 1 for less memory, increase cautiously.
_phoneme_lock = threading.Lock()


class LockedG2P:
    """Serialize CPU pronunciation backends; GPU inference remains concurrent."""
    def __init__(self, delegate):
        self.delegate = delegate

    def __call__(self, *args, **kwargs):
        with _phoneme_lock:
            return self.delegate(*args, **kwargs)

    def __getattr__(self, name):
        return getattr(self.delegate, name)


def natural_key(value):
    return [int(s) if s.isdigit() else s.lower() for s in re.split(r'(\d+)', str(value))]


class ChapterHTML(HTMLParser):
    """Extract visible body prose without losing inline word boundaries."""
    blocks = {'p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'h4',
              'blockquote', 'li', 'br', 'hr', 'tr', 'dt', 'dd'}
    ignored = {'script', 'style', 'nav', 'noscript', 'svg', 'audio', 'video'}
    void = {'br', 'hr', 'img', 'meta', 'link', 'input', 'source', 'wbr', 'area', 'embed', 'col', 'param', 'track', 'base'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.body = False
        self.hidden = []
        self.parts = []
        self.heading = None
        self.heading_parts = []
        self.title = ''

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'body':
            self.body = True
        if not self.body:
            return
        if self.hidden:
            if tag not in self.void:
                self.hidden.append(tag)
            return
        if (tag in self.ignored or 'hidden' in attrs or attrs.get('aria-hidden') == 'true'):
            if tag not in self.void:
                self.hidden.append(tag)
            return
        if tag in self.blocks:
            self.parts.append('\n')
        if tag in ('h1', 'h2') and not self.title and self.heading is None:
            self.heading = tag
            self.heading_parts = []

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.void:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if self.hidden:
            if tag in self.hidden:
                # Recover from optional/mismatched end tags in HTML EPUBs.
                index = len(self.hidden) - 1 - self.hidden[::-1].index(tag)
                del self.hidden[index:]
            return
        if tag == self.heading:
            self.title = ' '.join(''.join(self.heading_parts).split())
            self.heading = None
        if self.body and tag in self.blocks:
            self.parts.append('\n')
        if tag == 'body':
            self.body = False

    def handle_data(self, data):
        if self.body and not self.hidden:
            self.parts.append(data)
            if self.heading:
                self.heading_parts.append(data)

    def paragraphs(self):
        return [' '.join(p.split()) for p in ''.join(self.parts).splitlines() if p.strip()]


def epub_member(base, href):
    url = urlsplit(href)
    if url.scheme or url.netloc:
        raise ValueError('EPUB references an external chapter instead of embedded text')
    path = posixpath.normpath(posixpath.join(base, unquote(url.path)))
    if path.startswith(('/', '../')) or path == '..' or '\\' in path:
        raise ValueError('Invalid EPUB resource path')
    return path


def load_epub(source):
    # Drive-mounted ZIP random reads are slow. Stage the book once on runtime disk.
    with tempfile.TemporaryDirectory(prefix='epub-input-') as temporary:
        staged = Path(temporary) / 'book.epub'
        shutil.copyfile(source, staged)
        return read_epub(staged)


def read_epub(source):
    """Use OPF spine order, not ZIP order or alphabetical filenames."""
    chapters = []
    with zipfile.ZipFile(source) as book:
        read_bytes = 0
        def read(name):
            nonlocal read_bytes
            info = book.getinfo(name)
            read_bytes += info.file_size
            if info.file_size > 8 * 1024**2 or read_bytes > 64 * 1024**2:
                raise ValueError('EPUB text exceeds the supported size limit')
            return book.read(name)
        container = ET.fromstring(read('META-INF/container.xml'))
        roots = container.findall('.//{*}rootfile')
        if not roots:
            raise ValueError('EPUB has no package document')
        package_path = epub_member('', roots[0].get('full-path', ''))
        package = ET.fromstring(read(package_path))
        base = posixpath.dirname(package_path)
        manifest = {item.get('id'): item for item in package.findall('./{*}manifest/{*}item')}
        auxiliary = {epub_member(base, entry.get('href', ''))
                     for entry in package.findall('./{*}guide/{*}reference')
                     if entry.get('type') in ('toc', 'cover')}
        encrypted = set()
        if 'META-INF/encryption.xml' in book.namelist():
            encryption = ET.fromstring(read('META-INF/encryption.xml'))
            encrypted = {epub_member('', entry.get('URI', ''))
                         for entry in encryption.findall('.//{*}CipherReference')}
        seen = set()
        for reference in package.findall('./{*}spine/{*}itemref'):
            if reference.get('linear', 'yes') == 'no':
                continue
            item = manifest.get(reference.get('idref'))
            if item is None:
                raise ValueError('EPUB spine references a missing manifest item')
            if ('nav' in item.get('properties', '').split()
                    or item.get('media-type') not in ('application/xhtml+xml', 'text/html')):
                continue
            name = epub_member(base, item.get('href', ''))
            if name in seen or name in auxiliary:
                continue
            seen.add(name)
            if name in encrypted:
                raise ValueError('EPUB chapter text is encrypted; use an unencrypted EPUB')
            raw = read(name)
            encoding = 'utf-16' if raw.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig'
            parser = ChapterHTML()
            parser.feed(raw.decode(encoding))
            parser.close()
            paragraphs = parser.paragraphs()
            if not paragraphs:
                continue  # Covers and image-only documents have no narratable body.
            number = len(chapters) + 1
            chapter = normalize_chapter(dict(number=number, title=parser.title or f'Section {number}',
                                            paragraphs=paragraphs), number, str(source))
            chapter['epubDocument'] = name
            chapters.append(chapter)
    if not chapters:
        raise ValueError('EPUB has no readable text chapters in its primary reading order')
    return chapters


def chunk_text(paragraphs, title):
    body = ' '.join(paragraphs)
    entries = paragraphs if body.lower().startswith(title.lower()) else [title + '.', *paragraphs]
    chunks, buffer = [], ''
    for paragraph in entries:
        rest = paragraph.strip()
        while rest:
            end = min(len(rest), 4000)
            if end < len(rest):
                sentences = [m.end() for m in re.finditer(r'''[.!?]["'\u201d\u2019)]*\s+''', rest[:end])]
                boundary = sentences[-1] if sentences else rest.rfind(' ', 0, end)
                if boundary > end / 2:
                    end = boundary
            part, rest = rest[:end].strip(), rest[end:].lstrip()
            length = len(buffer) + bool(buffer) + len(part)
            if buffer and (length > 4000 or (length > 1000 and len(buffer) >= 500)):
                chunks.append(buffer)
                buffer = ''
            buffer = (buffer + ' ' + part).strip()
            if len(buffer) >= 1000:
                chunks.append(buffer)
                buffer = ''
    if buffer:
        chunks.append(buffer)
    return chunks


def normalize_chapter(item, position, source):
    if not isinstance(item, dict):
        raise ValueError(f'{source}: chapter {position} must be an object')
    number = item.get('number', item.get('chapterNumber', position))
    if isinstance(number, bool) or not str(number).isdigit() or int(number) < 1:
        raise ValueError(f'{source}: invalid chapter number {number!r}')
    title = str(item.get('title') or f'Chapter {number}').strip()
    paragraphs = item.get('paragraphs', item.get('text', item.get('content')))
    if isinstance(paragraphs, str):
        paragraphs = re.split(r'\n\s*\n', paragraphs)
    if not isinstance(paragraphs, list) or not paragraphs or any(not isinstance(p, str) for p in paragraphs):
        raise ValueError(f'{source}: chapter {number} needs text or a list of plain-text paragraphs')
    paragraphs = [' '.join(p.split()) for p in paragraphs if p.strip()]
    if not paragraphs:
        raise ValueError(f'{source}: chapter {number} has no text')
    if any(p == '[object Object]' for p in paragraphs):
        raise ValueError(f'{source}: chapter {number} contains corrupt [object Object] placeholders. Re-export the original book from the updated library before generating audio.')
    # Preserve exported local-sync chunks when supplied.
    chunks = item.get('chunks', chunk_text(paragraphs, title))
    if (not isinstance(chunks, list) or not chunks
            or any(not isinstance(c, str) or not c.strip() or len(c) > 4000 for c in chunks)
            or sum(map(len, chunks)) > 250000):
        raise ValueError(f'{source}: invalid/oversized narration chunks')
    return dict(number=int(number), title=title, paragraphs=paragraphs, chunks=chunks)


def load_chapters(source):
    source = Path(source)
    if source.suffix.lower() == '.epub' and source.is_file():
        return load_epub(source)
    files = sorted(source.iterdir(), key=lambda p: natural_key(p.name)) if source.is_dir() else [source]
    epubs = [p for p in files if p.is_file() and p.suffix.lower() == '.epub']
    if epubs:
        if len(epubs) != 1 or any(p.suffix.lower() in ('.txt', '.json') for p in files if p.is_file()):
            raise ValueError('Enter the path to one specific EPUB file, rather than a folder with multiple books/formats')
        return load_epub(epubs[0])
    chapters = []
    for path in files:
        if not path.is_file() or path.suffix.lower() not in ('.txt', '.json'):
            continue
        if path.suffix.lower() == '.txt':
            match = re.search(r'\d+', path.stem)
            rows = [dict(number=int(match[0]) if match else len(chapters) + 1,
                         title=path.stem, text=path.read_text(encoding='utf-8-sig'))]
        else:
            data = json.loads(path.read_text(encoding='utf-8-sig'))
            rows = data.get('chapters', [data]) if isinstance(data, dict) else data
            if not isinstance(rows, list):
                raise ValueError(f'{path.name}: expected a chapter list')
        for item in rows:
            chapters.append(normalize_chapter(item, len(chapters) + 1, path.name))
    if not chapters:
        raise ValueError('No EPUB/TXT/JSON chapters found. See the notebook input examples.')
    numbers = [c['number'] for c in chapters]
    if len(set(numbers)) != len(numbers):
        raise ValueError('Duplicate chapter numbers. Use a separate input folder for each book.')
    return sorted(chapters, key=lambda c: c['number'])


def select_chapters(chapters, selection):
    selection = selection.strip().lower()
    if selection == 'all':
        return chapters[:]
    match = re.fullmatch(r'(\d+)(?:\s*-\s*(\d+))?', selection)
    if not match:
        raise ValueError('Enter all, a chapter number, or an inclusive range such as 350-365')
    start, end = int(match[1]), int(match[2] or match[1])
    if start < 1 or end < start:
        raise ValueError('Invalid chapter range')
    selected = [c for c in chapters if start <= c['number'] <= end]
    if not selected:
        raise ValueError('No chapters found in that range')
    return selected


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def identity(chapter, voice, audio_format):
    payload = dict(chapter=chapter, voice=voice, format=audio_format,
                   model='hexgrad/Kokoro-82M', kokoro='0.9.4', speed=1, sampleRate=24000,
                   mp3Bitrate='128k' if audio_format == 'mp3' else None, schema=1)
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def ensure_output_parent(target):
    target = Path(target)
    mount = Path('/content/drive').absolute()
    if target.absolute().is_relative_to(mount) and not os.path.ismount(mount):
        raise RuntimeError('Google Drive is not mounted. Rerun the Drive mount cell, then rerun interactive(). No local fallback copy was saved.')
    target.parent.mkdir(parents=True, exist_ok=True)


def atomic_copy(source, target):
    target = Path(target)
    transient = {errno.ENOENT, errno.EIO, errno.ESTALE, errno.ENOTCONN, errno.EAGAIN, errno.EBUSY}
    for attempt in range(3):
        pending = target.with_name(target.name + '.' + uuid.uuid4().hex + '.part')
        try:
            ensure_output_parent(target)
            shutil.copyfile(source, pending)
            if sha256(source) != sha256(pending):
                raise IOError('Drive copy failed checksum verification')
            os.replace(pending, target)
            return
        except OSError as error:
            if error.errno not in transient or not Path(source).is_file():
                raise
            if attempt == 2:
                raise OSError(f'Could not save {target.name}. The output folder or Drive connection is unavailable. Remount Drive and rerun the batch; existing completed chapters are preserved.') from error
            time.sleep(.25 * (attempt + 1))
        finally:
            try:
                pending.unlink(missing_ok=True)
            except OSError:
                pass  # A disconnected Drive must not mask the original write error.


def completed(folder, key, audio_format):
    audio, manifest = folder / f'{key}.{audio_format}', folder / f'{key}.json'
    try:
        data = json.loads(manifest.read_text(encoding='utf-8'))
        return (data['identity'] == key and data['bytes'] == audio.stat().st_size
                and data['sha256'] == sha256(audio))
    except (OSError, ValueError, KeyError, TypeError):
        return False


def write_json_atomic(target, data):
    with tempfile.TemporaryDirectory(prefix='audio-metadata-') as temporary:
        local = Path(temporary) / 'metadata.json'
        local.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        atomic_copy(local, target)


def text_digest(paragraphs):
    # Portable text matching, independent of mobile account/database IDs.
    return hashlib.sha256(' '.join(' '.join(paragraphs).split()).encode('utf-8')).hexdigest()


def chapter_reference(book_id, chapter):
    locator = chapter.get('epubDocument', str(chapter['number']))
    return hashlib.sha256((book_id + ':' + locator).encode()).hexdigest()[:32]


def json_body_paragraphs(chapter):
    paragraphs = chapter['paragraphs']
    title = ' '.join(chapter['title'].split())
    if paragraphs and paragraphs[0].rstrip(' .:') == title.rstrip(' .:'):
        return paragraphs[1:]
    return paragraphs


def library_json_epub(source, chapters, target):
    """Deterministic EPUB bridge: existing mobile/Drive packages keep their schema."""
    data = json.loads(Path(source).read_text(encoding='utf-8-sig'))
    if (not isinstance(data, dict) or data.get('schema') != 'ultimate-library-book'
            or type(data.get('version')) is not int or data['version'] != 1):
        raise ValueError('Choose a JSON book exported by the updated library (ultimate-library-book version 1).')
    metadata, raw = data.get('metadata'), data.get('chapters')
    if not isinstance(metadata, dict) or not isinstance(metadata.get('title'), str) or not metadata['title'].strip():
        raise ValueError('Library JSON is missing its book title')
    if not isinstance(raw, list) or not raw or len(raw) != len(chapters):
        raise ValueError('Library JSON chapter count is invalid')
    for index, item in enumerate(raw):
        if (not isinstance(item, dict) or type(item.get('number')) is not int or type(item.get('order')) is not int
                or item.get('number') != index + 1 or item.get('order') != index
                or not isinstance(item.get('title'), str) or not item['title'].strip()
                or not isinstance(item.get('paragraphs'), list) or not item['paragraphs']
                or any(not isinstance(p, str) or not p.strip() for p in item['paragraphs'])):
            raise ValueError(f'Library JSON chapter {index + 1} has invalid order, title, or paragraphs')
    validation = data.get('validation', {})
    if (not isinstance(validation, dict) or validation.get('status') != 'passed'
            or type(validation.get('chapterCount')) is not int or type(validation.get('paragraphCount')) is not int
            or validation.get('chapterCount') != len(raw)
            or validation.get('paragraphCount') != sum(len(c['paragraphs']) for c in raw)):
        raise ValueError('Library JSON validation counts do not match its chapters')
    title = metadata['title'].strip()
    description = metadata.get('description', '')
    if not isinstance(description, str):
        raise ValueError('Library JSON description must be text')
    semantic = hashlib.sha256(json.dumps(dict(title=title, description=description, chapters=chapters),
                                         ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    manifest = ['<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>']
    spine, links, documents = [], [], []
    for index, chapter in enumerate(chapters):
        filename = f'chapter-{index + 1:06d}.xhtml'
        manifest.append(f'<item id="c{index}" href="{filename}" media-type="application/xhtml+xml"/>')
        spine.append(f'<itemref idref="c{index}"/>')
        links.append(f'<li><a href="{filename}">{escape(chapter["title"])}</a></li>')
        body = ''.join(f'<p>{escape(p)}</p>' for p in json_body_paragraphs(chapter))
        documents.append((f'OEBPS/{filename}', f'<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>{escape(chapter["title"])}</title></head><body><h1>{escape(chapter["title"])}</h1>{body}</body></html>'))
    package = f'''<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">urn:sha256:{semantic}</dc:identifier><dc:title>{escape(title)}</dc:title><dc:language>en</dc:language><dc:description>{escape(description)}</dc:description><meta property="dcterms:modified">1980-01-01T00:00:00Z</meta></metadata><manifest>{''.join(manifest)}</manifest><spine>{''.join(spine)}</spine></package>'''
    container = '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
    navigation = f'<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol>{"".join(links)}</ol></nav></body></html>'
    with zipfile.ZipFile(target, 'w') as archive:
        for name, contents in [('mimetype', 'application/epub+zip'), ('META-INF/container.xml', container),
                               ('OEBPS/content.opf', package), ('OEBPS/nav.xhtml', navigation), *documents]:
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_STORED  # Reproducible across zlib/runtime versions.
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, contents.encode('utf-8'))
    return title


def prepare_book(source, chapters):
    source = Path(source).resolve()
    if source.suffix.lower() != '.json':
        return prepare_epub_book(source, chapters)
    with tempfile.TemporaryDirectory(prefix='library-json-') as temporary:
        canonical = Path(temporary) / 'book.epub'
        source_chapters = load_chapters(source)
        title = library_json_epub(source, source_chapters, canonical)
        canonical_chapters = read_epub(canonical)
        if len(canonical_chapters) != len(source_chapters):
            raise ValueError('JSON-to-EPUB chapter round-trip failed')
        for original, converted in zip(source_chapters, canonical_chapters):
            normalized_title = ' '.join(original['title'].split())
            expected = [normalized_title, *json_body_paragraphs(original)]
            if converted['title'] != normalized_title or converted['paragraphs'] != expected:
                raise ValueError(f'JSON-to-EPUB text round-trip failed for chapter {original["number"]}')
        chapters[:] = canonical_chapters
        folder, catalog = prepare_epub_book(canonical, chapters, source.parent, source.stem, title)
        original_json = folder / 'source.json'
        checksum = sha256(source)
        if not original_json.exists() or sha256(original_json) != checksum:
            atomic_copy(source, original_json)
        catalog['source'].update(inputFormat='json', originalFile='source.json', originalSha256=checksum)
        write_json_atomic(folder / 'book.json', catalog)
        return folder, catalog


def prepare_epub_book(source, chapters, output_parent=None, output_stem=None, book_title=None):
    source = Path(source).resolve()
    if not source.is_file() or source.suffix.lower() != '.epub':
        raise ValueError('Enter the full path to an EPUB book in Drive')
    checksum = sha256(source)
    title = book_title or source.stem
    slug = re.sub(r'[^\w .-]', '_', output_stem or source.stem, flags=re.UNICODE).strip(' .')[:90] or 'Book'
    folder = (output_parent or source.parent) / 'UltimateAudio' / f'{slug}-{checksum[:12]}'
    ensure_output_parent(folder / 'book.json')
    book_id = 'epub-' + checksum
    catalog = dict(schema='ultimate-drive-audio', schemaVersion=1, bookId=book_id, title=title,
                   source=dict(file='source.epub', sha256=checksum, bytes=source.stat().st_size),
                   chapterNumbering='one-based retained EPUB spine documents',
                   chapters=[dict(chapterId=chapter_reference(book_id, chapter),
                                  chapterIndex=index, chapterNumber=chapter['number'], title=chapter['title'],
                                  epubDocument=chapter.get('epubDocument'),
                                  textSha256=text_digest(chapter['paragraphs']))
                             for index, chapter in enumerate(chapters)], recordings={})
    index = folder / 'book.json'
    if index.exists():
        previous = json.loads(index.read_text(encoding='utf-8'))
        if previous.get('schema') != catalog['schema'] or previous.get('bookId') != book_id:
            raise ValueError('Output folder has a different book identity; refusing to mix books')
        catalog['recordings'] = previous.get('recordings', {})
    original = folder / 'source.epub'
    if not original.exists() or sha256(original) != checksum:
        atomic_copy(source, original)
    write_json_atomic(index, catalog)
    return folder, catalog


def register_recording(folder, catalog, chapter, key, manifest):
    references = {entry['chapterNumber']: entry for entry in catalog['chapters']}
    reference = references[chapter['number']]
    catalog['recordings'][key] = dict(identity=key, chapterId=reference['chapterId'],
        chapterIndex=reference['chapterIndex'], chapterNumber=chapter['number'], title=chapter['title'],
        textSha256=reference['textSha256'], voice=manifest['voice'], format=manifest['format'],
        provider='kokoro', model=manifest['model'], sampleRate=manifest['sampleRate'],
        audioFile=f"chapters/{key}.{manifest['format']}", manifestFile=f'chapters/{key}.json',
        bytes=manifest['bytes'], sha256=manifest['sha256'])
    catalog['updatedAt'] = datetime.now(timezone.utc).isoformat()
    write_json_atomic(folder / 'book.json', catalog)


def batch_state_file(folder, voice, audio_format):
    if voice not in ('af_bella', 'af_heart') or audio_format not in ('wav', 'mp3'):
        raise ValueError('Choose Bella/Heart and WAV/MP3')
    return Path(folder) / f'batch-state-{voice}-{audio_format}.json'


def resume_positions(chapters, folder, book, voice=VOICE, audio_format=AUDIO_FORMAT):
    """Success is a verified published pair; batch end is the previous request."""
    from tqdm.auto import tqdm
    artifacts = Path(folder) / 'chapters'
    names = {path.stem for path in artifacts.iterdir() if path.suffix == '.json'} if artifacts.is_dir() else set()
    last = -1
    for index in tqdm(range(len(chapters) - 1, -1, -1), desc='Finding last verified chapter', leave=False):
        chapter = chapters[index]
        key = identity(chapter, voice, audio_format)
        if key not in names or not completed(artifacts, key, audio_format):
            continue
        manifest = json.loads((artifacts / f'{key}.json').read_text(encoding='utf-8'))
        if manifest.get('voice') != voice or manifest.get('format') != audio_format or manifest.get('bookId') != book['bookId']:
            continue
        # Recover a complete pair whose catalog update was interrupted.
        register_recording(Path(folder), book, chapter, key, manifest)
        last = index
        break
    previous = None
    state_file = batch_state_file(folder, voice, audio_format)
    if state_file.is_file():
        try:
            state = json.loads(state_file.read_text(encoding='utf-8'))
            end = state.get('endIndex')
            if (state.get('version') == 1 and state.get('bookId') == book['bookId']
                    and state.get('voice') == voice and state.get('format') == audio_format
                    and isinstance(end, int) and not isinstance(end, bool) and 0 <= end < len(chapters)
                    and state.get('endChapterNumber') == chapters[end]['number']):
                previous = end
        except (OSError, ValueError, TypeError):
            pass
    return last, previous


def next_batch(chapters, last_success, previous_end, mode, count):
    if isinstance(count, bool) or not isinstance(count, int) or count < 1:
        raise ValueError('Enter a positive whole number of chapters')
    if mode not in ('1', '2'):
        raise ValueError('Choose 1 for last successful or 2 for previous batch end')
    if mode == '2' and previous_end is None:
        raise ValueError('No previous batch found for this voice/format. Choose option 1.')
    end = last_success if mode == '1' else previous_end
    return chapters[end + 1:end + 1 + count]


def save_batch_request(folder, book, chapters, selected, mode, voice=VOICE, audio_format=AUDIO_FORMAT):
    if not selected:
        return
    positions = {chapter['number']: index for index, chapter in enumerate(chapters)}
    write_json_atomic(batch_state_file(folder, voice, audio_format), dict(version=1, bookId=book['bookId'],
        voice=voice, format=audio_format, startMode=mode, requestedAt=datetime.now(timezone.utc).isoformat(),
        startIndex=positions[selected[0]['number']], endIndex=positions[selected[-1]['number']],
        startChapterNumber=selected[0]['number'], endChapterNumber=selected[-1]['number'], count=len(selected)))


def export_mobile_package(folder, catalog, chapters, voice=VOICE, audio_format=AUDIO_FORMAT):
    """One user-selected ZIP for Android's Google Drive document provider."""
    folder = Path(folder)
    selected = {identity(chapter, voice, audio_format) for chapter in chapters}
    recordings = {key: record for key, record in catalog['recordings'].items()
                  if key in selected and completed(folder / 'chapters', key, record['format'])}
    if not recordings:
        print('No completed chapters to export for mobile.')
        return None
    package = dict(catalog, recordings=recordings)
    files = ['source.epub']
    for key, record in recordings.items():
        if record['audioFile'] != f'chapters/{key}.{record["format"]}' or record['manifestFile'] != f'chapters/{key}.json':
            raise ValueError('Invalid mobile package paths')
        files.extend([record['audioFile'], record['manifestFile']])
    if sum((folder / path).stat().st_size for path in files) > 3_800_000_000:
        raise ValueError('Mobile package exceeds 3.8 GB. Select a smaller chapter range and rerun; audio is already saved.')
    exports = folder / 'exports'
    exports.mkdir(exist_ok=True)
    target = exports / f'mobile-audio-{chapters[0]["number"]}-{chapters[-1]["number"]}-{voice}.zip'
    with tempfile.TemporaryDirectory(prefix='mobile-audio-package-') as temporary:
        archive = Path(temporary) / 'package.zip'
        # Store WAV bytes unchanged; avoid expensive recompression on a free runtime.
        with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_STORED, allowZip64=True) as zip:
            zip.writestr('book.json', json.dumps(package, ensure_ascii=False))
            for path in files:
                zip.write(folder / path, path)
        atomic_copy(archive, target)
    print('Mobile import package:', target)
    return target


class GpuSampler:
    """Best-effort device-wide utilization; never block inference on monitoring."""
    def __init__(self, interval=2):
        self.interval = interval
        self.stop = threading.Event()
        self.thread = None
        self.lock = threading.Lock()
        self.count = 0
        self.total = 0.0
        self.peak = 0.0
        self.latest = None
        self.error = None

    def record(self, output):
        # Query one device. Unsupported/N/A fields do not become false zero readings.
        fields = output.strip().split(',')
        if len(fields) != 2:
            raise ValueError('Unexpected nvidia-smi utilization response')
        utilization, memory = map(float, fields)
        if not 0 <= utilization <= 100 or memory < 0:
            raise ValueError('Invalid GPU telemetry')
        with self.lock:
            self.count += 1
            self.total += utilization
            self.peak = max(self.peak, utilization)
            self.latest = dict(gpuUtilPercent=utilization, deviceMemoryUsedMiB=memory)

    def run(self):
        import subprocess
        while not self.stop.is_set():
            try:
                result = subprocess.run(['nvidia-smi', '--id=0',
                    '--query-gpu=utilization.gpu,memory.used', '--format=csv,noheader,nounits'],
                    capture_output=True, text=True, check=True, timeout=2)
                self.record(result.stdout)
            except Exception as error:
                self.error = str(error)
                return  # Monitoring failures must not fail narration or retry forever.
            if self.stop.wait(self.interval):
                return

    def __enter__(self):
        if shutil.which('nvidia-smi'):
            self.thread = threading.Thread(target=self.run, daemon=True, name='colab-gpu-monitor')
            self.thread.start()
        else:
            self.error = 'nvidia-smi unavailable'
        return self

    def __exit__(self, *args):
        self.stop.set()
        if self.thread:
            self.thread.join(2.5)

    def summary(self):
        with self.lock:
            result = dict(gpuSamples=self.count, gpuSamplingIntervalSeconds=self.interval)
            if self.count:
                result.update(gpuUtilAveragePercent=round(self.total / self.count, 1),
                              gpuUtilPeakPercent=self.peak)
            if self.error:
                result['gpuMonitoringNotice'] = self.error
            return result


class Renderer:
    def __init__(self):
        import torch
        from kokoro import KPipeline
        if not torch.cuda.is_available():
            raise RuntimeError('Select Runtime > Change runtime type > GPU, then rerun.')
        self.torch = torch
        # Variable text/audio shapes make exhaustive cuDNN autotuning wasteful.
        torch.backends.cudnn.benchmark = False
        self.pipeline = KPipeline(lang_code='a', device='cuda', repo_id='hexgrad/Kokoro-82M')
        self.pipeline.g2p = LockedG2P(self.pipeline.g2p)
        self.total_memory = torch.cuda.get_device_properties(0).total_memory
        self.last_metrics = {}
        self.live_metrics = None
        self.concurrent = False
        self.stream = torch.cuda.Stream()
        self.stream.wait_stream(torch.cuda.current_stream())
        print('GPU:', torch.cuda.get_device_name(0), f'({self.total_memory / 1024**3:.1f} GiB)')

    def trim_cache(self):
        cuda = self.torch.cuda
        if should_trim_cache(cuda.memory_allocated(), cuda.memory_reserved(), self.total_memory):
            cuda.empty_cache()

    def render(self, chapter, voice, output, progress):
        import numpy as np
        frames, segments = 0, []
        self.live_metrics = None
        if not self.concurrent:
            self.torch.cuda.reset_peak_memory_stats()
        started = time.monotonic()
        with self.torch.cuda.stream(self.stream), GpuSampler() as monitor, wave.open(str(output), 'wb') as stream, self.torch.inference_mode():
            stream.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
            for index, text in enumerate(chapter['chunks']):
                start = frames
                for result in self.pipeline(text, voice=voice, speed=1):
                    if result.audio is None:
                        continue
                    samples = result.audio
                    if hasattr(samples, 'detach'):
                        samples = samples.detach().cpu().numpy()
                    samples = np.asarray(samples, dtype=np.float32).reshape(-1)
                    if not samples.size or not np.isfinite(samples).all():
                        raise RuntimeError('Model returned invalid audio')
                    stream.writeframesraw((np.clip(samples, -1, 1) * 32767).astype('<i2').tobytes())
                    frames += samples.size
                    if frames * 2 + 44 > 200_000_000:
                        raise RuntimeError('Chapter exceeds the 200 MB WAV limit')
                if frames == start:
                    raise RuntimeError('A passage produced no audio')
                segments.append(dict(text=text, start=start / 24000, end=frames / 24000))
                self.trim_cache()
                self.live_metrics = monitor.latest
                progress(index + 1)
            render_finished = time.monotonic()
        # Retain reusable allocations on roomy Colab GPUs, including between chapters.
        self.trim_cache()
        elapsed = render_finished - started
        self.last_metrics = dict(generationSeconds=round(elapsed, 2), audioSeconds=round(frames / 24000, 2),
            audioSecondsPerSecond=round(frames / 24000 / max(elapsed, .001), 2),
            peakAllocatedMiB=round(self.torch.cuda.max_memory_allocated() / 1024**2, 1),
            reservedMiB=round(self.torch.cuda.memory_reserved() / 1024**2, 1))
        self.last_metrics.update(monitor.summary())
        if self.concurrent:
            self.last_metrics['gpuMetricsScope'] = 'device-wide across concurrent workers'
        return dict(version=1, title=chapter['title'], paragraphs=chapter['paragraphs'], segments=segments)


def should_trim_cache(allocated, reserved, total):
    return reserved - allocated >= 256 * 1024**2 and (total <= 6 * 1024**3 or reserved >= total * .75)


@lru_cache(maxsize=1)
def runtime_renderer():
    # Reuse weights and downloaded voices when converting another range in this runtime.
    return Renderer()


class BoundedPublisher:
    """At most one save in flight; callbacks run on the calling thread."""
    def __init__(self, enabled=True):
        self.enabled = enabled
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='drive-save')
        self.pending = None

    def submit(self, operation, success, failure, cleanup):
        self.drain()  # Backpressure: never accumulate unsaved chapters in RAM/disk.
        self.pending = (self.executor.submit(operation), success, failure, cleanup)
        if not self.enabled:
            self.drain()

    def drain(self):
        if self.pending is None:
            return
        future, success, failure, cleanup = self.pending
        self.pending = None
        try:
            success(future.result())
        except Exception as error:
            failure(error)
        finally:
            cleanup()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        try:
            self.drain()  # Also finish verified publication on interrupt/budget stop.
        finally:
            self.executor.shutdown(wait=True)


class ParallelRenderer:
    """Independent pipelines/streams; bounded local lookahead; one parent publisher."""
    def __init__(self, chapters, voice, workers, renderer_factory=Renderer, deadline=None, clock=time.monotonic):
        self.voice, self.factory = voice, renderer_factory
        self.executor = ThreadPoolExecutor(max_workers=workers, thread_name_prefix='chapter')
        self.local = threading.local()
        self.loading = threading.Lock()
        self.stop = threading.Event()
        self.messages = queue.Queue()
        self.temporary = tempfile.TemporaryDirectory(prefix='parallel-chapters-')
        self.todo = iter(chapters)
        self.tasks, self.bars = {}, {}
        self.last_metrics, self.live_metrics = {}, None
        self.workers = workers
        self.deadline, self.clock = deadline, clock

    def generate(self, chapter, path, position):
        if self.stop.is_set():
            raise RuntimeError('Conversion stopped')
        model = getattr(self.local, 'model', None)
        load_started = time.monotonic()
        if model is None:
            # Prevent duplicate simultaneous model/tokenizer downloads/startup races.
            with self.loading:
                if self.stop.is_set():
                    raise RuntimeError('Conversion stopped')
                model = self.factory()
                model.concurrent = True
                self.local.model = model
        load_seconds = time.monotonic() - load_started
        def progress(done):
            if self.stop.is_set():
                raise RuntimeError('Conversion stopped')
            self.messages.put((chapter['number'], done, getattr(model, 'live_metrics', None)))
        try:
            sync = model.render(chapter, self.voice, path, progress)
            metrics = dict(getattr(model, 'last_metrics', {}))
            metrics.update(workerModelLoadSeconds=round(load_seconds, 2), chapterWorkers=self.workers)
            return path, sync, metrics
        except Exception as error:
            if 'out of memory' in str(error).lower():
                raise RuntimeError('GPU memory exhausted. Set CHAPTER_WORKERS = 1 and rerun; verified chapters will be skipped.') from error
            raise

    def schedule(self, position):
        from tqdm.auto import tqdm
        if self.stop.is_set() or (self.deadline is not None and self.clock() >= self.deadline):
            return
        chapter = next(self.todo, None)
        if chapter is None:
            return
        number = chapter['number']
        path = Path(self.temporary.name) / f'{number}.wav'
        self.bars[number] = tqdm(total=len(chapter['chunks']), position=position, leave=False,
                                 desc=f"Slot {position}: {chapter['title'][:42]}", unit='passage')
        self.tasks[number] = (self.executor.submit(self.generate, chapter, path, position), position)

    def pump(self, current, callback):
        while True:
            try:
                number, done, metrics = self.messages.get_nowait()
            except queue.Empty:
                return
            bar = self.bars.get(number)
            if bar:
                bar.update(max(0, done - bar.n))
                if metrics:
                    bar.set_postfix(gpu=f"{metrics['gpuUtilPercent']:.0f}%", refresh=False)
            if number == current:
                self.live_metrics = metrics
                callback(done)

    def render(self, chapter, voice, output, progress):
        number = chapter['number']
        if number not in self.tasks:
            raise RuntimeError('Input/completed output changed while conversion started. Rerun the range.')
        future, position = self.tasks[number]
        try:
            while not future.done():
                self.pump(number, progress)
                self.stop.wait(.1)
            self.pump(number, progress)
            path, sync, self.last_metrics = future.result()
            shutil.move(str(path), output)
            progress(len(chapter['chunks']))
            return sync
        except KeyboardInterrupt:
            self.stop.set()
            raise
        finally:
            self.tasks.pop(number, None)
            self.bars.pop(number).close()
            self.schedule(position)

    def __enter__(self):
        for position in range(1, self.workers + 1):
            self.schedule(position)
        return self

    def __exit__(self, *args):
        self.stop.set()
        for future, position in self.tasks.values():
            future.cancel()
        self.executor.shutdown(wait=True, cancel_futures=True)
        for bar in self.bars.values():
            bar.close()
        self.temporary.cleanup()


def convert_parallel(chapters, destination, voice='af_bella', audio_format='wav', workers=2,
                     renderer_factory=Renderer, **options):
    from tqdm.auto import tqdm
    if isinstance(workers, bool) or not isinstance(workers, int) or not 1 <= workers <= 8:
        raise ValueError('CHAPTER_WORKERS must be an integer from 1 to 8')
    if len({c['number'] for c in chapters}) != len(chapters):
        raise ValueError('Chapter numbers must be unique within a conversion')
    if voice not in ('af_bella', 'af_heart') or audio_format not in ('wav', 'mp3'):
        raise ValueError('Choose Bella/Heart and WAV/MP3')
    minutes = options.get('max_minutes', 0)
    if not isinstance(minutes, (int, float)) or not 0 <= minutes <= 1440:
        raise ValueError('Session budget must be 0–1440 minutes')
    if workers == 1:
        return convert(chapters, destination, voice, audio_format,
                       renderer_factory=runtime_renderer if renderer_factory is Renderer else renderer_factory, **options)
    artifacts = Path(destination) / 'chapters' if options.get('book') else Path(destination)
    pending = [chapter for chapter in tqdm(chapters, desc='Checking existing audio', unit='chapter', leave=False)
               if not completed(artifacts, identity(chapter, voice, audio_format), audio_format)]
    print(f'Concurrent chapter workers: {workers}. GPU speedup depends on the assigned runtime.')
    clock = options.get('clock', time.monotonic)
    deadline = clock() + minutes * 60 if minutes else None
    with ParallelRenderer(pending, voice, workers, renderer_factory, deadline, clock) as renderer:
        return convert(chapters, destination, voice, audio_format, renderer_factory=lambda: renderer,
                       show_passage=False, chapter_workers=workers, **options)


def convert(chapters, destination, voice='af_bella', audio_format='wav', renderer_factory=runtime_renderer,
            max_minutes=0, clock=time.monotonic, book=None, show_passage=True, chapter_workers=1,
            parallel_save=None):
    from tqdm.auto import tqdm
    if voice not in ('af_bella', 'af_heart') or audio_format not in ('wav', 'mp3'):
        raise ValueError('Choose Bella/Heart and WAV/MP3')
    if not isinstance(max_minutes, (int, float)) or not 0 <= max_minutes <= 1440:
        raise ValueError('Session budget must be 0–1440 minutes (0 means unlimited)')
    folder = Path(destination)
    folder.mkdir(parents=True, exist_ok=True)
    artifacts = folder / 'chapters' if book else folder
    history_folder = folder / 'history' if book else folder
    artifacts.mkdir(exist_ok=True)
    history_folder.mkdir(exist_ok=True)
    # A separate history file per run avoids interleaved writes across notebooks.
    run_id = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
    history = history_folder / f'history-{run_id}.jsonl'
    stats = dict(ready=0, skipped=0, failed=0)
    summary_rows = {c['number']: dict(chapter=c['number'], title=c['title'], status='not processed',
                                    audioSeconds=0, elapsedSeconds=0) for c in chapters}
    renderer = None  # Do not load a GPU model if everything is already saved.
    batch_start = clock()
    def log(event, **fields):
        with history.open('a', encoding='utf-8') as stream:
            stream.write(json.dumps(dict(time=datetime.now(timezone.utc).isoformat(), event=event, **fields)) + '\n')
    log('batch_started', total=len(chapters), voice=voice, format=audio_format)
    try:
        with tempfile.TemporaryDirectory(prefix='drive-audio-') as temporary:
            local = Path(temporary)
            with BoundedPublisher(PARALLEL_DRIVE_SAVE if parallel_save is None else parallel_save) as publisher, \
                    tqdm(total=len(chapters), desc='Chapters prepared', unit='chapter', position=0) as batch:
                for chapter_index, chapter in enumerate(chapters):
                    if max_minutes and (clock() - batch_start >= max_minutes * 60 or (
                            isinstance(renderer, ParallelRenderer) and renderer.deadline is not None and clock() >= renderer.deadline)) and not (
                            isinstance(renderer, ParallelRenderer) and (chapter['number'] in renderer.tasks
                                or completed(artifacts, identity(chapter, voice, audio_format), audio_format))):
                        stats['deferred'] = len(chapters) - chapter_index
                        log('session_budget_reached', **stats)
                        tqdm.write('Session budget reached. Completed files are saved; rerun to continue.')
                        break
                    key = identity(chapter, voice, audio_format)
                    started = clock()
                    try:
                        if completed(artifacts, key, audio_format):
                            publisher.drain()
                            saved = json.loads((artifacts / f'{key}.json').read_text(encoding='utf-8'))
                            duration = saved.get('audioSeconds', saved.get('performance', {}).get('audioSeconds', 0))
                            if not duration and audio_format == 'wav':
                                with wave.open(str(artifacts / f'{key}.wav'), 'rb') as audio:
                                    duration = audio.getnframes() / audio.getframerate()
                            summary_rows[chapter['number']].update(status='already saved', audioSeconds=duration,
                                                                   elapsedSeconds=round(clock() - started, 2))
                            if book:
                                register_recording(folder, book, chapter, key, saved)
                            stats['skipped'] += 1
                            log('skipped', chapter=chapter['number'], identity=key)
                            continue
                        if book and key in book['recordings']:
                            del book['recordings'][key]
                            write_json_atomic(folder / 'book.json', book)
                        log('chapter_started', chapter=chapter['number'], identity=key)
                        load_started = clock()
                        if renderer is None:
                            renderer = renderer_factory()
                        load_seconds = clock() - load_started
                        chapter_local = local / key
                        chapter_local.mkdir(exist_ok=True)
                        wav = chapter_local / 'chapter.wav'
                        with tqdm(total=len(chapter['chunks']), desc=f"{chapter['number']}: {chapter['title'][:45]}",
                                  unit='passage', leave=False, disable=not show_passage) as passages:
                            def progress(done):
                                passages.update(done - passages.n)
                                live = getattr(renderer, 'live_metrics', None)
                                if live:
                                    passages.set_postfix(gpu=f"{live['gpuUtilPercent']:.0f}%",
                                                         vram=f"{live['deviceMemoryUsedMiB']:.0f}MiB", refresh=False)
                            sync = renderer.render(chapter, voice, wav, progress)
                        generation_metrics = dict(getattr(renderer, 'last_metrics', {}))
                        generation_metrics['modelLoadSeconds'] = round(load_seconds, 2)
                        processing_started = clock()
                        with wave.open(str(wav), 'rb') as check:
                            if (check.getframerate(), check.getnchannels(), check.getsampwidth()) != (24000, 1, 2) or not check.getnframes():
                                raise ValueError('Generated WAV is invalid')
                            audio_seconds = check.getnframes() / check.getframerate()
                        artifact = wav
                        if audio_format == 'mp3':
                            import subprocess
                            artifact = chapter_local / 'chapter.mp3'
                            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-codec:a',
                                            'libmp3lame', '-b:a', '128k', str(artifact)], check=True)
                        generation_metrics['validationEncodingSeconds'] = round(clock() - processing_started, 2)
                        manifest = dict(identity=key, chapterNumber=chapter['number'], voice=voice,
                                        model='kokoro-v1.0', format=audio_format, sampleRate=24000,
                                        bytes=artifact.stat().st_size, sha256=sha256(artifact), sync=sync,
                                        elapsedSeconds=round(clock() - started, 2), audioSeconds=audio_seconds,
                                        performance=generation_metrics)
                        if book:
                            reference = next(c for c in book['chapters'] if c['chapterNumber'] == chapter['number'])
                            manifest.update(schema='ultimate-drive-chapter', schemaVersion=1,
                                bookId=book['bookId'], chapterId=reference['chapterId'], chapterIndex=reference['chapterIndex'],
                                textSha256=reference['textSha256'], epubDocument=chapter.get('epubDocument'),
                                provider='kokoro', chunkTarget=1000, speed=1,
                                audioFile=f'chapters/{key}.{audio_format}')
                        meta = chapter_local / 'chapter.json'
                        meta.write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
                        # Bind every callback argument: generation advances while this copies.
                        def publish(artifact=artifact, meta=meta, key=key):
                            publish_started = clock()
                            atomic_copy(artifact, artifacts / f'{key}.{audio_format}')
                            atomic_copy(meta, artifacts / f'{key}.json')
                            return round(clock() - publish_started, 2)
                        def saved(publication_seconds, chapter=chapter, key=key, manifest=manifest,
                                  generation_metrics=generation_metrics, started=started):
                            # Only the main thread updates the shared book index/history/stats.
                            if book:
                                register_recording(folder, book, chapter, key, manifest)
                            stats['ready'] += 1
                            summary_rows[chapter['number']].update(status='saved', audioSeconds=manifest['audioSeconds'],
                                elapsedSeconds=round(clock() - started, 2))
                            log('chapter_ready', chapter=chapter['number'], identity=key,
                                elapsedSeconds=round(clock() - started, 2), bytes=manifest['bytes'],
                                drivePublicationSeconds=publication_seconds, performance=generation_metrics)
                            speed = generation_metrics.get('audioSecondsPerSecond')
                            utilization = generation_metrics.get('gpuUtilAveragePercent')
                            if speed is not None:
                                gpu = f'{utilization:.0f}%' if utilization is not None else 'unavailable'
                                tqdm.write(f"Chapter {chapter['number']} saved | {speed:.1f}x audio speed | "
                                           f"GPU average {gpu} | Drive save {publication_seconds:.1f}s")
                        def save_failed(error, chapter=chapter, key=key, started=started):
                            stats['failed'] += 1
                            summary_rows[chapter['number']].update(status='failed', elapsedSeconds=round(clock() - started, 2))
                            log('chapter_failed', chapter=chapter['number'], identity=key, phase='drive-save',
                                error=str(error), elapsedSeconds=round(clock() - started, 2))
                            tqdm.write(f"Chapter {chapter['number']} Drive save failed: {error}")
                        publisher.submit(publish, saved, save_failed,
                                         lambda path=chapter_local: shutil.rmtree(path, ignore_errors=True))
                    except Exception as error:
                        stats['failed'] += 1
                        summary_rows[chapter['number']].update(status='failed', elapsedSeconds=round(clock() - started, 2))
                        log('chapter_failed', chapter=chapter['number'], error=str(error),
                            elapsedSeconds=round(clock() - started, 2))
                        tqdm.write(f"Chapter {chapter['number']} failed: {error}")
                    finally:
                        batch.update(1)
                        batch.set_postfix(stats)
    except KeyboardInterrupt:
        log('batch_interrupted', **stats)
        raise
    finally:
        elapsed = round(clock() - batch_start, 2)
        rows = list(summary_rows.values())
        summary = dict(voice=voice, format=audio_format, chapterWorkers=chapter_workers, elapsedSeconds=elapsed,
                       audioSeconds=sum(r['audioSeconds'] for r in rows), chapters=rows, **stats)
        summary_path = history_folder / f'batch-summary-{run_id}.json'
        write_json_atomic(summary_path, summary)
        log('batch_finished', elapsedSeconds=elapsed, audioSeconds=summary['audioSeconds'],
            summaryFile=summary_path.name, **stats)
        def duration(seconds):
            return f'{seconds / 60:.2f} min' if seconds >= 60 else f'{seconds:.2f} s'
        print('\nBatch summary\nSection | Status | Audio duration | Processing elapsed | Title')
        for row in rows:
            print(f"{row['chapter']} | {row['status']} | {duration(row['audioSeconds'])} | "
                  f"{duration(row['elapsedSeconds'])} | {row['title']}")
        print(f"Total audio: {duration(summary['audioSeconds'])} | Batch elapsed: {duration(elapsed)} | "
              f"Threads: {chapter_workers}")
        print('Chapter processing times can overlap with parallel generation and Drive saving.')
        print('Summary:', summary_path)
    print(stats, '\nHistory:', history)
    return stats


def last_run_file(directory):
    return Path(directory) / 'UltimateAudio' / 'last-run.json'


def run_saved_batch(source, chapters, destination, book, selected, mode, settings):
    voice, audio_format, workers = settings['voice'], settings['format'], settings['workers']
    if not selected:
        print('No chapters remain after this position for the selected voice/format.')
        return dict(ready=0, skipped=0, failed=0)
    print(f'Batch: sections {selected[0]["number"]}–{selected[-1]["number"]} | '
          f'{len(selected)} chapters | {workers} parallel workers')
    print('Saving to:', destination, '| Voice:', voice, '| Format:', audio_format)
    print('Selected:', '\n'.join(f"{c['number']}: {c['title']}" for c in selected))
    save_batch_request(destination, book, chapters, selected, mode, voice, audio_format)
    write_json_atomic(last_run_file(source.parent), dict(version=1, source=source.name,
        sourceSha256=book['source'].get('originalSha256', book['source']['sha256']), **settings))
    result = convert_parallel(selected, destination, voice, audio_format, workers=workers,
                              max_minutes=settings['maxMinutes'], book=book, parallel_save=settings['parallelSave'])
    if settings['createMobilePackage']:
        export_mobile_package(destination, book, selected, voice, audio_format)
    return result


def continue_last_book():
    """Resume the most recently submitted batch's book without any prompts."""
    directory = Path(BOOK_DIRECTORY)
    state_file = last_run_file(directory)
    if not state_file.is_file():
        raise ValueError('No saved last run. Use the manual batch cell once to save the book and settings.')
    try:
        state = json.loads(state_file.read_text(encoding='utf-8'))
        name = state['source']
        if state.get('version') != 1 or not isinstance(name, str) or Path(name).name != name:
            raise ValueError('Invalid saved book')
        source = directory / name
        settings = {key: state[key] for key in ('voice', 'format', 'workers', 'maxMinutes', 'parallelSave', 'createMobilePackage')}
        settings['count'] = state.get('count', 20)
        batch_state_file(directory, settings['voice'], settings['format'])
        if (type(settings['count']) is not int or settings['count'] < 1
                or type(settings['workers']) is not int or not 1 <= settings['workers'] <= 8
                or type(settings['maxMinutes']) not in (int, float) or not 0 <= settings['maxMinutes'] <= 1440
                or type(settings['parallelSave']) is not bool or type(settings['createMobilePackage']) is not bool):
            raise ValueError('Invalid saved settings')
        source_hash = state['sourceSha256']
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise ValueError('Could not read the saved last run. Use the manual batch cell to save fresh settings.') from error
    if not source.is_file() or not source.resolve().is_relative_to(directory.resolve()) or sha256(source) != source_hash:
        raise ValueError('The last book was moved or changed. Select it again in the manual batch cell.')
    chapters = load_chapters(source)
    destination, book = prepare_book(source, chapters)
    last, previous = resume_positions(chapters, destination, book, settings['voice'], settings['format'])
    selected = next_batch(chapters, last, previous, '1', settings['count'])
    print(f"Continuing {book['title']} after the last verified chapter.")
    return run_saved_batch(source, chapters, destination, book, selected, '1', settings)


def interactive():
    directory = Path(BOOK_DIRECTORY)
    if not directory.is_dir():
        raise ValueError(f'Book folder not found: {directory}. Mount Drive and create this folder first.')
    books = sorted((p for p in directory.iterdir() if p.is_file() and p.suffix.lower() in ('.epub', '.json')),
                   key=lambda p: natural_key(p.name))
    if not books:
        raise ValueError(f'No EPUB or library JSON books found in {directory}')
    print('Books in', directory)
    for index, path in enumerate(books, 1):
        print(f'{index:>3}: {path.stem} [{path.suffix[1:].upper()}]')
    choice = input('Select book number: ').strip()
    if not choice.isdigit() or not 1 <= int(choice) <= len(books):
        raise ValueError(f'Choose a book number from 1 to {len(books)}')
    source = books[int(choice) - 1]
    chapters = load_chapters(source)
    print(f"Found {len(chapters)} chapters ({chapters[0]['number']}–{chapters[-1]['number']}).")
    destination, book = prepare_book(source, chapters)
    last, previous = resume_positions(chapters, destination, book, VOICE, AUDIO_FORMAT)
    def label(position):
        return 'none' if position is None or position < 0 else f"section {chapters[position]['number']}: {chapters[position]['title']}"
    print('Last verified success:', label(last))
    print('Previous requested batch end:', label(previous))
    print('1: Continue after last successful chapter (default)')
    print('2: Continue after previous batch end (does not retry unfinished chapters in that batch)')
    print('3: Custom section range (for example 461-470, one section, or all)')
    mode = input('Start option [1]: ').strip() or '1'
    if mode == '3':
        print('Use section numbers (JSON chapter numbers / EPUB reading-order sections), which can differ from printed titles.')
        selected = select_chapters(chapters, input('Custom section range (e.g. 461-470, 461, all): '))
        count = len(selected)
    elif mode in ('1', '2'):
        raw_count = input('How many chapters to process? ').strip()
        if not re.fullmatch(r'[1-9][0-9]*', raw_count):
            raise ValueError('Enter a positive whole number of chapters')
        count = int(raw_count)
        selected = next_batch(chapters, last, previous, mode, count)
    else:
        raise ValueError('Choose start option 1, 2, or 3')
    if not selected:
        print('No chapters remain after this position for the selected voice/format.')
        return dict(ready=0, skipped=0, failed=0)
    raw_workers = input(f'Parallel chapter workers / threads [Enter for {CHAPTER_WORKERS}, 1–8]: ').strip()
    if raw_workers and not re.fullmatch(r'[1-8]', raw_workers):
        raise ValueError('Enter a parallel chapter count from 1 to 8')
    workers = int(raw_workers) if raw_workers else CHAPTER_WORKERS
    settings = dict(voice=VOICE, format=AUDIO_FORMAT, workers=workers, count=count,
                    maxMinutes=SESSION_MINUTES, parallelSave=PARALLEL_DRIVE_SAVE,
                    createMobilePackage=CREATE_MOBILE_PACKAGE)
    return run_saved_batch(source, chapters, destination, book, selected, mode, settings)
