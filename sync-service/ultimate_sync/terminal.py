"""A single in-place terminal status line; history remains ordinary append-only text."""
import shutil
import sys


def elapsed(seconds):
    seconds = max(0, int(seconds))
    hours, seconds = divmod(seconds, 3600)
    minutes, seconds = divmod(seconds, 60)
    return f'{hours}:{minutes:02}:{seconds:02}' if hours else f'{minutes:02}:{seconds:02}'


def bar(value, width):
    filled = round(max(0, min(1, value)) * width)
    return '[' + '#' * filled + '-' * (width - filled) + ']'


def generation_line(fields, width):
    chapter, batch = fields.get('progress', 0), fields.get('batch_progress', 0)
    number = fields.get('completed', 0) + fields.get('failed', 0) + 1
    total = fields.get('total', 1)
    chapter_time = elapsed(fields.get('chapter_elapsed_seconds', 0))
    batch_time = elapsed(fields.get('batch_elapsed_seconds', 0))
    label = 'Loading model' if fields.get('phase') == 'loading model' else 'Chapter'
    def detailed(size):
        return (f'Batch {bar(batch, size)} {batch:3.0%} {number}/{total} | '
                f'{label} {bar(chapter, size)} {chapter:3.0%} | '
                f'C {chapter_time} B {batch_time} | {fields.get("failed", 0)} failed')
    size = min(16, max(0, (width - len(detailed(0))) // 2))
    if size >= 3:
        return detailed(size)
    suffix = f' {batch:.0%} {number}/{total} | Ch {chapter:.0%} {chapter_time} | Total {batch_time} | F{fields.get("failed", 0)}'
    size = min(16, max(3, width - len('Batch ') - len(suffix) - 2))
    line = 'Batch ' + bar(batch, size) + suffix
    if len(line) > width:
        line = f'{bar(batch, 5)} B{batch:.0%} C{chapter:.0%} {chapter_time}/{batch_time}'
    return line[:width]


class TerminalProgress:
    def __init__(self, stream=None, columns=None):
        self.stream = stream if stream is not None else sys.stdout
        self.columns = columns or (lambda: shutil.get_terminal_size((100, 24)).columns)
        self.interactive = bool(getattr(self.stream, 'isatty', lambda: False)())
        self.active = None
        self.drawn_width = 0

    def _width(self):
        return max(1, self.columns() - 1)  # Never reach the wrap column.

    def _erase(self):
        if self.drawn_width:
            self.stream.write('\r' + ' ' * min(self.drawn_width, self._width()) + '\r')
            self.drawn_width = 0

    def _draw(self):
        if not self.interactive or not self.active:
            return
        mode, fields = self.active
        if mode == 'generation':
            line = generation_line(fields, self._width())
        else:
            line = (f'Sending {bar(fields.get("progress", 0), 12)} {fields.get("progress", 0):.0%} | '
                    f'{elapsed(fields.get("elapsed_seconds", 0))} elapsed')[:self._width()]
        self.stream.write('\r' + line.ljust(min(self.drawn_width, self._width())))
        self.drawn_width = len(line)
        self.stream.flush()

    def emit(self, event, line, fields):
        if event in ('chapter_started', 'chapter_progress'):
            if event == 'chapter_started':
                number = fields.get('completed', 0) + fields.get('failed', 0) + 1
                self._erase()
                self.active = None
                self.stream.write(f'Chapter {number}/{fields.get("total", 1)}: {fields.get("title", "Generating audio")}\n')
            self.active = ('generation', fields)
            self._draw()
            self.stream.flush()
            return
        if event == 'transfer_progress':
            if not self.active or self.active[0] != 'generation':
                self.active = ('transfer', fields)
                self._draw()
            return
        self._erase()
        if event in ('chapter_ready', 'chapter_failed', 'batch_finished', 'batch_paused', 'service_stopped'):
            self.active = None
        elif event in ('transfer_sent', 'transfer_interrupted') and self.active and self.active[0] == 'transfer':
            self.active = None
        self.stream.write(line + '\n')
        self._draw()
        self.stream.flush()
