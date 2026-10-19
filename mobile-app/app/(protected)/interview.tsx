import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SidebarToggle } from '@/src/components/ui/Sidebar';
import { interviewService, InterviewPage, InterviewQuestion } from '@/src/services/interview.service';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from 'expo-audio';

type Tab = 'Explore' | 'Goals' | 'Flashcards' | 'Mock interviews' | 'Manage' | 'AI jobs';
const tabs: Tab[] = ['Explore', 'Goals', 'Flashcards', 'Mock interviews', 'Manage', 'AI jobs'];
const emptyQuestion = { title: '', topic: 'general', difficulty: 'Medium', estimatedTime: '10', frequency: '50', companies: '', tags: '', problemStatement: '', expectation: '', explanation: '', bestAnswer: '', alternativeAnswer: '', realWorldUsage: '', commonMistakes: '', followUpQuestions: '', language: '', code: '', mcqs: '' };
const errorText = (error: any) => error.response?.data?.error || error.message || 'Please try again.';
const lines = (value: string) => value.split('\n').map(item => item.trim()).filter(Boolean);
const csv = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);
const textContent = (value: unknown) => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : '';

function Button({ label, onPress, disabled = false, secondary = false, danger = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean; danger?: boolean }) {
    return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, danger && s.danger, disabled && { opacity: 0.4 }]}><Text style={s.buttonText}>{label}</Text></TouchableOpacity>;
}
function Field({ label, value, onChange, multiline = false, numeric = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; numeric?: boolean }) {
    return <View style={{ marginBottom: 12 }}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} style={[s.input, multiline && { minHeight: 110, textAlignVertical: 'top' }]} value={value} onChangeText={onChange} multiline={multiline} keyboardType={numeric ? 'number-pad' : 'default'} placeholderTextColor="#777" autoCapitalize={numeric ? 'none' : 'sentences'} /></View>;
}
function Section({ title, content }: { title: string; content: unknown }) {
    const value = Array.isArray(content) ? content.map(String).join('\n\n') : textContent(content);
    return value ? <View style={{ marginBottom: 20 }}><Text style={s.heading}>{title}</Text><Text selectable style={s.body}>{value}</Text></View> : null;
}

export default function InterviewScreen() {
    const [tab, setTab] = useState<Tab>('Explore');
    const [overview, setOverview] = useState<any>({ topics: [], goals: [], completed: [], models: [] });
    const [items, setItems] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [topic, setTopic] = useState('');
    const [difficulty, setDifficulty] = useState('');
    const [query, setQuery] = useState('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [detail, setDetail] = useState<InterviewQuestion | null>(null);
    const [editor, setEditor] = useState<'question' | 'goal' | 'import' | 'ai' | 'model' | 'models' | null>(null);
    const [form, setForm] = useState<any>({});
    const [selected, setSelected] = useState<string[]>([]);
    const [cardIndex, setCardIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [knownCards, setKnownCards] = useState(0);
    const [session, setSession] = useState<any>(null);
    const [practice, setPractice] = useState<InterviewQuestion[]>([]);
    const [practiceIndex, setPracticeIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [recordings, setRecordings] = useState<Record<string, string>>({});
    const [recordingUris, setRecordingUris] = useState<Record<string, string>>({});
    const [attachingRecording, setAttachingRecording] = useState(false);
    const [transcribing, setTranscribing] = useState(false);
    const [transcriptionDraft, setTranscriptionDraft] = useState<{ questionId: string; text: string } | null>(null);
    const [deadline, setDeadline] = useState(0);
    const [secondsLeft, setSecondsLeft] = useState(0);
    const requestEpoch = useRef(0);
    const recordingQuestion = useRef<string | null>(null);
    const handledRecordingUris = useRef(new Set<string>());
    const transcriptionRequest = useRef<AbortController | null>(null);
    const mounted = useRef(true);
    const mediaEpoch = useRef(0);
    // Register before Expo's hooks: invalidate callbacks before their passive
    // cleanup releases the native player and recorder. Expo owns native release.
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            requestEpoch.current++;
            mediaEpoch.current++;
            recordingQuestion.current = null;
            transcriptionRequest.current?.abort();
        };
    }, []);
    const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 16000, sampleRate: 16000 }, status => {
        if (!mounted.current) return;
        if (status.isFinished && status.url && recordingQuestion.current) void attachRecording(status.url, recordingQuestion.current);
        if (status.hasError) Alert.alert('Recording interrupted', status.error || 'Please record again or type your answer.');
    });
    const recorderState = useAudioRecorderState(recorder);
    const resultPlayer = useAudioPlayer(null);
    const pauseResultPlayer = () => {
        if (mounted.current) resultPlayer.pause();
    };
    async function attachRecording(uri: string, questionId: string) {
        if (!mounted.current || recordingQuestion.current !== questionId || handledRecordingUris.current.has(uri)) return;
        const epoch = mediaEpoch.current;
        const current = () => mounted.current && mediaEpoch.current === epoch && recordingQuestion.current === questionId;
        handledRecordingUris.current.add(uri);
        setAttachingRecording(true);
        try {
            const info = await FileSystem.getInfoAsync(uri);
            if (!current()) return;
            if (!info.exists || info.size > 5 * 1024 * 1024) return Alert.alert('Recording too large', 'Keep each recording below 5 MB or submit your typed answer.');
            const bytes = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            if (current()) {
                setRecordings(current => ({ ...current, [questionId]: `data:audio/${Platform.OS === 'web' ? 'webm' : 'm4a'};base64,${bytes}` }));
                setRecordingUris(current => ({ ...current, [questionId]: uri }));
                setTranscriptionDraft(null);
            }
        } catch (err) { if (current()) Alert.alert('Unable to save recording', errorText(err)); }
        finally {
            if (current()) { setAttachingRecording(false); await setAudioModeAsync({ allowsRecording: false }).catch(() => {}); }
        }
    }
    const discardPractice = () => {
        if (!mounted.current) return;
        mediaEpoch.current++;
        recordingQuestion.current = null;
        transcriptionRequest.current?.abort(); pauseResultPlayer();
        if (recorderState.isRecording) void recorder.stop().catch(() => {});
        void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
        setPractice([]); setDeadline(0); setAnswers({}); setRecordings({}); setRecordingUris({}); setTranscriptionDraft(null);
        setBusy(false); setAttachingRecording(false); setTranscribing(false);
    };
    const models = overview.models.filter((model: any) => model.isActive);
    const chosenModel = form.model || models[0]?.modelId || 'gemini-2.5-flash';

    const load = useCallback(async () => {
        if (!mounted.current) return;
        const epoch = ++requestEpoch.current;
        setLoading(true); setError('');
        try {
            const resource = tab === 'Goals' ? 'goals' : tab === 'Mock interviews' ? 'sessions' : tab === 'AI jobs' ? 'jobs' : tab === 'Flashcards' ? 'deck' : 'questions';
            const [summary, result] = await Promise.all([
                interviewService.read('overview'),
                interviewService.read(resource, { topic: topic || undefined, difficulty: difficulty || undefined, search: search || undefined, page, limit: 10 }),
            ]);
            if (epoch !== requestEpoch.current) return;
            setOverview(summary);
            if (resource === 'questions') {
                const list = result as InterviewPage;
                setItems(list.items); setTotal(list.total); setTotalPages(list.totalPages);
            } else {
                setItems(result); setTotal(result.length); setTotalPages(1);
                if (tab === 'Flashcards') { setCardIndex(0); setFlipped(false); setKnownCards(0); }
            }
        } catch (err) { if (epoch === requestEpoch.current) setError(errorText(err)); }
        finally { if (epoch === requestEpoch.current) setLoading(false); }
    }, [tab, topic, difficulty, search, page]);
    useEffect(() => { void load(); return () => { requestEpoch.current++; }; }, [load]);
    useEffect(() => {
        if (!(tab === 'AI jobs' && items.some(item => item.status === 'PENDING') || tab === 'Mock interviews' && items.some(item => item.status === 'EVALUATING'))) return;
        const timer = setInterval(() => { void load(); }, 10000);
        return () => clearInterval(timer);
    }, [tab, items, load]);
    useEffect(() => {
        if (!deadline || !practice.length) return;
        const update = () => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
        update(); const timer = setInterval(update, 1000);
        return () => clearInterval(timer);
    }, [deadline, practice.length]);

    const run = async (operation: string, values: Record<string, unknown> = {}) => {
        if (!mounted.current) return null;
        setBusy(true);
        try { const result = await interviewService.act(operation, values); if (!mounted.current) return null; await load(); return result; }
        catch (err) { if (mounted.current) Alert.alert('Unable to complete action', errorText(err)); return null; }
        finally { if (mounted.current) setBusy(false); }
    };
    const confirm = (title: string, message: string, operation: string, values: Record<string, unknown>) => {
        Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void run(operation, values); } }]);
    };
    const showQuestion = async (id: string) => {
        setBusy(true);
        try { setDetail(await interviewService.read('question', { id })); }
        catch (err) { Alert.alert('Unable to open question', errorText(err)); }
        finally { setBusy(false); }
    };
    const editQuestion = (question?: InterviewQuestion) => {
        setForm(question ? {
            ...emptyQuestion, ...question, companies: question.companies.join(', '), tags: question.tags.join(', '),
            estimatedTime: String(question.estimatedTime), frequency: String(question.frequency || 50),
            commonMistakes: question.commonMistakes?.join('\n') || '', followUpQuestions: question.followUpQuestions?.join('\n') || '',
            language: question.codeSnippet?.language || '', code: question.codeSnippet?.code || '',
            mcqs: question.mcqs ? JSON.stringify(question.mcqs, null, 2) : '',
        } : { ...emptyQuestion });
        setDetail(null); setEditor('question');
    };
    const setValue = (key: string, value: string) => setForm((current: any) => ({ ...current, [key]: value }));
    const saveEditor = async () => {
        let result;
        try {
            if (editor === 'question') {
                if (!form.title.trim() || !form.topic.trim() || !form.problemStatement.trim()) return Alert.alert('Check details', 'Title, topic, and problem statement are required.');
                const data = { ...form, estimatedTime: Number(form.estimatedTime), frequency: Number(form.frequency),
                    companies: csv(form.companies), tags: csv(form.tags), commonMistakes: lines(form.commonMistakes), followUpQuestions: lines(form.followUpQuestions),
                    codeSnippet: form.code ? { language: form.language || 'text', code: form.code } : null, mcqs: form.mcqs.trim() ? JSON.parse(form.mcqs) : null,
                };
                result = form.mergeDeleteId ? await run('mergeQuestions', { keepId: form.id, deleteId: form.mergeDeleteId, data }) : await run('saveQuestion', { id: form.id, data });
            } else if (editor === 'goal') result = await run('saveGoal', { id: form.id, data: { title: form.title, targetCount: Number(form.targetCount), topic: form.topic || undefined, company: form.company || undefined, difficulty: form.difficulty || undefined } });
            else if (editor === 'import') result = await run('bulkUpload', { data: JSON.parse(form.json) });
            else if (editor === 'ai') result = await run('generate', { prompt: form.prompt, id: form.id, model: chosenModel });
            else if (editor === 'model') result = await run('saveModel', { id: form.id, data: { modelId: form.modelId, name: form.name, isActive: form.isActive ?? true } });
            if (result) { setEditor(null); if (form.mergeDeleteId) setSelected([]); if (editor === 'ai') { setTab('AI jobs'); setPage(1); } }
        } catch { Alert.alert('Check JSON', 'The code or question import JSON is invalid.'); }
    };
    const toggleComplete = async (id: string) => {
        setBusy(true);
        try {
            const result = await interviewService.act('toggleComplete', { id });
            setOverview((current: any) => ({ ...current, completed: result.completed
                ? Array.from(new Set([...current.completed, id])) : current.completed.filter((value: string) => value !== id) }));
        } catch (err) { Alert.alert('Unable to update progress', errorText(err)); }
        finally { setBusy(false); }
    };
    const mergeSelected = async () => {
        if (selected.length !== 2) return;
        setBusy(true);
        try {
            const [first, second] = await Promise.all(selected.map(id => interviewService.read<InterviewQuestion>('question', { id })));
            editQuestion(first);
            setForm((current: any) => ({ ...current, mergeDeleteId: second.id, mergeTitle: second.title,
                bestAnswer: [first.bestAnswer, second.bestAnswer].filter(Boolean).join('\n\n'),
                explanation: [first.explanation, second.explanation].filter(Boolean).join('\n\n'),
                companies: Array.from(new Set([...first.companies, ...second.companies])).join(', '),
                tags: Array.from(new Set([...first.tags, ...second.tags])).join(', '),
            }));
        } catch (err) { Alert.alert('Unable to merge', errorText(err)); }
        finally { setBusy(false); }
    };
    const chooseImport = async () => {
        try {
            const selectedFile = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
            if (selectedFile.canceled) return;
            const file = selectedFile.assets[0];
            if (file.size && file.size > 1_500_000) return Alert.alert('File too large', 'Import up to 200 questions in a smaller JSON file.');
            const json = await FileSystem.readAsStringAsync(file.uri);
            JSON.parse(json);
            setValue('json', json);
        } catch { Alert.alert('Unable to read file', 'Choose a valid JSON file containing question records.'); }
    };
    const openSession = async (id: string) => {
        setBusy(true);
        try { setSession(await interviewService.read('session', { id })); }
        catch (err) { Alert.alert('Unable to load results', errorText(err)); }
        finally { setBusy(false); }
    };
    const startPractice = async () => {
        setBusy(true);
        try {
            const questions = await interviewService.read<InterviewQuestion[]>('deck', { topic: topic || undefined, difficulty: difficulty || undefined, limit: 5 });
            if (!questions.length) return Alert.alert('No questions', 'Choose another topic or add questions first.');
            setPractice(questions); setPracticeIndex(0); setAnswers({}); setRecordings({}); setRecordingUris({}); setTranscriptionDraft(null); setDeadline(Date.now() + 30 * 60 * 1000);
        } catch (err) { Alert.alert('Unable to start', errorText(err)); }
        finally { setBusy(false); }
    };
    const submitPractice = async () => {
        const submitted = practice.filter(question => answers[question.id]?.trim()).map(question => ({ questionId: question.id, transcript: answers[question.id].trim(), audioBase64: recordings[question.id] || '' }));
        if (!submitted.length) return Alert.alert('Add an answer', 'Type at least one response before submitting.');
        if (JSON.stringify({ operation: 'submitMock', answers: submitted }).length > 4_000_000) return Alert.alert('Submission too large', 'Remove or shorten some recordings. Your typed answers can still be submitted.');
        const result = await run('submitMock', { answers: submitted });
        if (result) { discardPractice(); await openSession(result.sessionId); }
    };
    const recordAnswer = async () => {
        if (!mounted.current) return;
        const epoch = mediaEpoch.current;
        const current = () => mounted.current && mediaEpoch.current === epoch;
        const question = practice[practiceIndex];
        if (!question) return;
        setBusy(true);
        try {
            if (!recorderState.isRecording) {
                const permission = await requestRecordingPermissionsAsync();
                if (!current()) return;
                if (!permission.granted) return Alert.alert('Microphone permission', 'Allow microphone access to record an optional answer, or type your response instead.');
                await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
                if (!current()) return;
                pauseResultPlayer();
                recordingQuestion.current = question.id;
                await recorder.prepareToRecordAsync();
                if (!current()) return;
                recorder.record({ forDuration: 300 });
            } else {
                await recorder.stop();
                if (!current()) return;
                if (recorder.uri && recordingQuestion.current) await attachRecording(recorder.uri, recordingQuestion.current);
                if (current()) await setAudioModeAsync({ allowsRecording: false });
            }
        } catch (err) { if (current()) Alert.alert('Recording unavailable', errorText(err)); }
        finally { if (current()) setBusy(false); }
    };
    const transcribeAnswer = async () => {
        const questionId = practice[practiceIndex].id;
        const audioBase64 = recordings[questionId];
        if (!audioBase64) return;
        if (audioBase64.length > 4_000_000) return Alert.alert('Recording too large to transcribe', 'Use a shorter clip, or enter your transcript manually.');
        const controller = new AbortController();
        transcriptionRequest.current?.abort(); transcriptionRequest.current = controller;
        setTranscribing(true);
        try {
            const result = await interviewService.act<{ transcript: string }>('transcribe', { audioBase64 }, controller.signal);
            if (!controller.signal.aborted) setTranscriptionDraft({ questionId, text: result.transcript });
        } catch (err) { if (!controller.signal.aborted) Alert.alert('Unable to transcribe recording', errorText(err)); }
        finally { if (transcriptionRequest.current === controller) { transcriptionRequest.current = null; setTranscribing(false); } }
    };
    const currentCard = items[cardIndex] as InterviewQuestion | undefined;
    const practiceQuestion = practice[practiceIndex];
    const switchTab = (next: Tab) => { setTab(next); setPage(1); setSelected([]); setItems([]); };
    const questionEditorFields = [
        ['title', 'Title'], ['topic', 'Topic'], ['problemStatement', 'Problem statement'], ['expectation', 'What an interviewer expects'],
        ['explanation', 'Explanation'], ['bestAnswer', 'Best answer'], ['alternativeAnswer', 'Alternative answer'], ['realWorldUsage', 'Real-world usage'],
        ['commonMistakes', 'Common mistakes (one per line)'], ['followUpQuestions', 'Follow-up questions (one per line)'],
        ['companies', 'Companies (comma separated)'], ['tags', 'Tags (comma separated)'], ['language', 'Code language'], ['code', 'Code snippet'], ['mcqs', 'Multiple choice questions (JSON array)'],
    ];

    return <View style={s.screen}>
        <View style={s.header}><SidebarToggle /><Text style={[s.title, { marginLeft: 12 }]}>Interview preparation</Text></View>
        <ScrollView horizontal style={{ maxHeight: 54 }} contentContainerStyle={{ paddingHorizontal: 16 }} showsHorizontalScrollIndicator={false}>
            {tabs.map(name => <Button key={name} label={name} onPress={() => switchTab(name)} secondary={tab !== name} />)}
        </ScrollView>
        <ScrollView contentContainerStyle={s.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor="#a78bfa" />} keyboardShouldPersistTaps="handled">
            {busy && <ActivityIndicator color="#a78bfa" style={{ marginBottom: 10 }} />}
            {!!error && <View style={s.card}><Text accessibilityRole="alert" style={s.error}>{error}</Text><Button label="Retry" onPress={() => { void load(); }} /></View>}
            {['Explore', 'Manage', 'Flashcards', 'Mock interviews'].includes(tab) && <>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <Button label="All topics" secondary={!!topic} onPress={() => { setTopic(''); setPage(1); }} />
                    {overview.topics.map((item: any) => <Button key={item.id} label={`${item.name} (${item.count})`} secondary={topic !== item.id} onPress={() => { setTopic(item.id); setPage(1); }} />)}
                </ScrollView>
                <View style={s.row}>{['', 'Easy', 'Medium', 'Hard'].map(value => <Button key={value || 'all'} label={value || 'All levels'} secondary={difficulty !== value} onPress={() => { setDifficulty(value); setPage(1); }} />)}</View>
            </>}
            {(tab === 'Explore' || tab === 'Manage') && <>
                <Field label="Search questions" value={query} onChange={setQuery} />
                <Button label="Search" onPress={() => { setSearch(query.trim()); setPage(1); }} />
                {tab === 'Manage' && <>
                    <View style={s.row}><Button label="Add question" disabled={busy} onPress={() => editQuestion()} /><Button label="Import JSON" secondary onPress={() => { setForm({ json: '' }); setEditor('import'); }} /><Button label="Generate with AI" secondary onPress={() => { setForm({ prompt: '' }); setEditor('ai'); }} /></View>
                    <Button label="Sync interview preparation book" disabled={busy} secondary onPress={() => { void run('syncBook').then(result => { if (result) Alert.alert('Book updated', result.message || 'Your interview book is ready in the library.'); }); }} />
                    {!!selected.length && <Button label={`Delete ${selected.length} selected`} danger disabled={busy} onPress={() => {
                        Alert.alert('Delete selected questions?', 'These questions will be removed for everyone who uses this question library.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void run('bulkDelete', { ids: selected }).then(result => { if (result) setSelected([]); }); } }]);
                    }} />}
                    {selected.length === 2 && <Button label="Merge selected questions" secondary disabled={busy} onPress={() => { void mergeSelected(); }} />}
                </>}
                <Text style={s.muted}>{total} questions · {overview.completed.length} completed</Text>
                {items.map((question: InterviewQuestion) => <View key={question.id} style={s.card}>
                    <TouchableOpacity onPress={() => { void showQuestion(question.id); }}><Text style={s.heading}>{overview.completed.includes(question.id) ? '✓ ' : ''}{question.title}</Text><Text style={s.muted}>{question.topic} · {question.difficulty} · {question.estimatedTime} min</Text><Text style={s.muted}>{question.companies.join(', ')}</Text></TouchableOpacity>
                    <View style={s.row}><Button label="Open" secondary disabled={busy} onPress={() => { void showQuestion(question.id); }} />{tab === 'Manage' && <Button label={selected.includes(question.id) ? 'Selected' : 'Select'} secondary={!selected.includes(question.id)} onPress={() => setSelected(values => values.includes(question.id) ? values.filter(id => id !== question.id) : [...values, question.id])} />}</View>
                </View>)}
                {!loading && !items.length && <Text style={s.body}>No questions match these filters.</Text>}
                <View style={s.row}><Button label="Previous" disabled={page <= 1 || loading} secondary onPress={() => setPage(value => value - 1)} /><Text style={s.label}>Page {page} of {Math.max(1, totalPages)}</Text><Button label="Next" disabled={page >= totalPages || loading} secondary onPress={() => setPage(value => value + 1)} /></View>
            </>}
            {tab === 'Goals' && <>
                <Button label="Add study goal" onPress={() => { setForm({ title: '', targetCount: '10', topic: '', company: '', difficulty: '' }); setEditor('goal'); }} />
                {!items.length && !loading && <Text style={s.body}>Set a question target, then mark questions complete as you study.</Text>}
                {items.map(goal => <View key={goal.id} style={s.card}><Text style={s.heading}>{goal.title}</Text><Text style={s.body}>{goal.completedCount || 0} / {goal.targetCount} completed</Text><Text style={s.muted}>{[goal.topic, goal.company, goal.difficulty].filter(Boolean).join(' · ') || 'All questions'}</Text><View style={s.row}><Button label="Edit goal" secondary onPress={() => { setForm({ ...goal, targetCount: String(goal.targetCount) }); setEditor('goal'); }} /><Button label="Delete" danger onPress={() => confirm('Delete goal?', 'Your question progress will remain saved.', 'deleteGoal', { id: goal.id })} /></View></View>)}
            </>}
            {tab === 'Flashcards' && <>
                {currentCard ? <View style={s.card}>
                    <Text style={s.muted}>Card {cardIndex + 1} / {items.length} · {currentCard.topic}</Text>
                    <Text style={s.heading}>{currentCard.title}</Text>
                    <Text selectable style={[s.body, { marginVertical: 16 }]}>{textContent(flipped ? currentCard.bestAnswer || currentCard.explanation || 'No answer has been added yet.' : currentCard.problemStatement || currentCard.title)}</Text>
                    <Button label={flipped ? 'Show question' : 'Reveal answer'} secondary onPress={() => setFlipped(value => !value)} />
                    {flipped && <View style={s.row}><Button label="Review again" secondary onPress={() => { setCardIndex(value => value + 1); setFlipped(false); }} /><Button label="Knew it" onPress={() => { setKnownCards(value => value + 1); setCardIndex(value => value + 1); setFlipped(false); }} /></View>}
                    <Button label={overview.completed.includes(currentCard.id) ? 'Marked complete' : 'Mark complete'} secondary disabled={overview.completed.includes(currentCard.id) || busy} onPress={() => { void toggleComplete(currentCard.id); }} />
                </View> : <View style={s.card}><Text style={s.heading}>{items.length ? 'Deck complete' : 'No flashcards available'}</Text><Text style={s.body}>{items.length ? `${knownCards} of ${items.length} answers recalled. Start another deck to keep practicing.` : 'Add questions or try another topic.'}</Text><Button label="New deck" onPress={() => { void load(); }} /></View>}
            </>}
            {tab === 'Mock interviews' && <>
                <View style={s.card}><Text style={s.heading}>Practice five questions</Text><Text style={s.body}>A 30-minute session with AI feedback on your typed answers. Optional recordings are saved for review when you submit. You can use keyboard dictation to enter a transcript.</Text><Button label={practice.length ? 'Resume current practice' : 'Start practice'} disabled={busy} onPress={() => { if (!practice.length) void startPractice(); }} /></View>
                {items.map(item => <View key={item.id} style={s.card}><Text style={s.heading}>{new Date(item.createdAt).toLocaleDateString()} · {item.status}</Text><Text style={s.muted}>{item.answers.length} answers{item.status === 'COMPLETED' ? ` · Average ${Math.round(item.answers.reduce((sum: number, answer: any) => sum + (answer.aiScore || 0), 0) / Math.max(1, item.answers.length))}%` : ''}</Text><View style={s.row}><Button label="Results" secondary disabled={busy} onPress={() => { void openSession(item.id); }} /><Button label="Delete" danger onPress={() => confirm('Delete practice session?', 'This removes its answers and feedback.', 'deleteSession', { id: item.id })} /></View></View>)}
                {!items.length && !loading && <Text style={s.muted}>Your submitted sessions will appear here.</Text>}
            </>}
            {tab === 'AI jobs' && <>
                <Button label="Generate a question" onPress={() => { setForm({ prompt: '' }); setEditor('ai'); }} />
                {overview.canManageModels && <Button label="Manage AI models" secondary onPress={() => setEditor('models')} />}
                {items.map(job => <View key={job.id} style={s.card}><Text style={s.heading}>{job.prompt}</Text><Text style={s.muted}>{job.status} · {job.modelName}</Text>{!!job.errorReason && <Text style={s.error}>{job.errorReason}</Text>}<View style={s.row}>
                    {job.questionId && <Button label="Open question" secondary onPress={() => { void showQuestion(job.questionId); }} />}
                    {job.status === 'FAILED' && <Button label="Retry" disabled={busy} onPress={() => { setForm({ prompt: job.prompt, id: job.questionId || undefined, model: job.modelName }); setEditor('ai'); }} />}
                    {job.status === 'PENDING' && <Button label="Cancel job" secondary disabled={busy} onPress={() => { void run('cancelJob', { id: job.id }); }} />}
                    <Button label="Delete" danger disabled={busy} onPress={() => confirm('Delete job history?', 'This removes the job record; completed questions are kept.', 'deleteJob', { id: job.id })} />
                </View></View>)}
                {!items.length && !loading && <Text style={s.muted}>No AI generation jobs yet.</Text>}
            </>}
        </ScrollView>

        <Modal visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)}>
            <View style={s.modal}><Button label="Back to questions" secondary onPress={() => setDetail(null)} /><ScrollView contentContainerStyle={s.content}>
                <Text style={s.title}>{detail?.title}</Text><Text style={s.muted}>{detail?.topic} · {detail?.difficulty}</Text>
                <View style={s.row}><Button label={overview.completed.includes(detail?.id) ? 'Mark incomplete' : 'Mark complete'} disabled={busy} onPress={() => { if (detail) void toggleComplete(detail.id); }} /><Button label="Edit" secondary onPress={() => { if (detail) editQuestion(detail); }} /><Button label="Improve with AI" secondary onPress={() => { setForm({ prompt: `Improve this interview question: ${detail?.title}`, id: detail?.id }); setDetail(null); setEditor('ai'); }} /></View>
                {detail && <>
                    <Section title="Problem statement" content={detail.problemStatement} /><Section title="Expectation" content={detail.expectation} /><Section title="Explanation" content={detail.explanation} /><Section title="Best answer" content={detail.bestAnswer} /><Section title="Alternative answer" content={detail.alternativeAnswer} /><Section title="Common mistakes" content={detail.commonMistakes} /><Section title="Follow-up questions" content={detail.followUpQuestions} /><Section title="Real-world usage" content={detail.realWorldUsage} />
                    {detail.codeSnippet?.code && <View style={s.card}><Text style={s.heading}>{detail.codeSnippet.language || 'Code'}</Text><Text selectable style={[s.body, { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }]}>{detail.codeSnippet.code}</Text></View>}
                    {(Array.isArray(detail.mcqs) ? detail.mcqs : []).filter(mcq => mcq && typeof mcq === 'object' && !Array.isArray(mcq)).map((mcq, index) => <View key={index} style={s.card}><Text style={s.heading}>{textContent(mcq.question) || `Question ${index + 1}`}</Text>{(Array.isArray(mcq.options) ? mcq.options : []).map((option: any, optionIndex: number) => <Text key={optionIndex} style={s.body}>{optionIndex + 1}. {typeof option === 'string' ? option : JSON.stringify(option)}</Text>)}<Text style={s.muted}>Answer: {String(mcq.correctAnswer ?? mcq.answer ?? '')}</Text><Text style={s.body}>{textContent(mcq.explanation)}</Text></View>)}
                    <Button label="Delete question" danger disabled={busy} onPress={() => Alert.alert('Delete question?', 'This removes the shared question and its associated practice links.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { void run('deleteQuestion', { id: detail.id }).then(result => { if (result) setDetail(null); }); } }])} />
                </>}
            </ScrollView></View>
        </Modal>

        <Modal visible={!!editor} animationType="slide" onRequestClose={() => { if (!busy) setEditor(null); }}>
            <KeyboardAvoidingView style={s.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={s.row}><Button label="Cancel" secondary disabled={busy} onPress={() => setEditor(null)} /><Text style={s.heading}>{editor === 'question' ? form.mergeDeleteId ? 'Merge questions' : form.id ? 'Edit question' : 'New question' : editor === 'goal' ? 'Study goal' : editor === 'import' ? 'Import questions' : editor === 'models' ? 'AI models' : editor === 'model' ? 'Edit AI model' : 'Generate question'}</Text></View>
                <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
                    {editor === 'question' && <>
                        {!!form.mergeDeleteId && <Text style={s.error}>Review the combined content. Saving this merge deletes the duplicate “{form.mergeTitle}” and keeps the question below.</Text>}
                        {questionEditorFields.map(([key, label]) => <Field key={key} label={label} value={form[key] || ''} onChange={value => setValue(key, value)} multiline={!['title', 'topic', 'companies', 'tags', 'language'].includes(key)} />)}
                        <Text style={s.label}>Difficulty</Text><View style={s.row}>{['Easy', 'Medium', 'Hard'].map(value => <Button key={value} label={value} secondary={form.difficulty !== value} onPress={() => setValue('difficulty', value)} />)}</View>
                        <Field label="Estimated time (minutes)" value={form.estimatedTime || '10'} numeric onChange={value => setValue('estimatedTime', value)} /><Field label="Frequency (0–100)" value={form.frequency || '50'} numeric onChange={value => setValue('frequency', value)} />
                    </>}
                    {editor === 'goal' && <>{[['title', 'Goal title'], ['targetCount', 'Target questions'], ['topic', 'Topic (optional)'], ['company', 'Company (optional)'], ['difficulty', 'Difficulty (optional)']].map(([key, label]) => <Field key={key} label={label} value={form[key] || ''} onChange={value => setValue(key, value)} numeric={key === 'targetCount'} />)}</>}
                    {editor === 'import' && <><Text style={s.body}>Paste an array of up to 200 questions with title, topic, difficulty, and problemStatement. Matching titles update existing questions.</Text><Button label="Choose JSON file" secondary onPress={() => { void chooseImport(); }} /><Field label="Questions JSON" value={form.json || ''} onChange={value => setValue('json', value)} multiline /></>}
                    {editor === 'ai' && <><Field label="Question prompt" value={form.prompt || ''} onChange={value => setValue('prompt', value)} multiline /><Text style={s.label}>AI model</Text>{models.map((model: any) => <Button key={model.id} label={model.name} secondary={chosenModel !== model.modelId} onPress={() => setValue('model', model.modelId)} />)}{!models.length && <Text style={s.error}>No active AI models. Add or enable a model in settings.</Text>}</>}
                    {editor === 'models' && <><Button label="Add AI model" onPress={() => { setForm({ name: '', modelId: '', isActive: true }); setEditor('model'); }} />{overview.models.map((model: any) => <View key={model.id} style={s.card}><Text style={s.heading}>{model.name}</Text><Text style={s.muted}>{model.modelId} · {model.isActive ? 'Active' : 'Inactive'}</Text><View style={s.row}><Button label="Edit" secondary onPress={() => { setForm(model); setEditor('model'); }} /><Button label="Delete" danger disabled={busy} onPress={() => confirm('Delete AI model?', 'Existing generated questions and job history are kept.', 'deleteModel', { id: model.id })} /></View></View>)}</>}
                    {editor === 'model' && <><Field label="Display name" value={form.name || ''} onChange={value => setValue('name', value)} /><Field label="Model identifier" value={form.modelId || ''} onChange={value => setValue('modelId', value)} /><Button label={form.isActive ? 'Active' : 'Inactive'} secondary={!form.isActive} onPress={() => setForm((current: any) => ({ ...current, isActive: !current.isActive }))} /></>}
                    {editor !== 'models' && <Button label={busy ? 'Saving…' : form.mergeDeleteId ? 'Merge and delete duplicate' : editor === 'ai' ? 'Generate' : editor === 'import' ? 'Import' : 'Save'} disabled={busy || editor === 'ai' && !models.length} onPress={() => { void saveEditor(); }} />}
                </ScrollView>
            </KeyboardAvoidingView>
        </Modal>

        <Modal visible={!!practice.length} animationType="slide" onRequestClose={() => Alert.alert('Leave practice?', 'Your unsubmitted responses will be discarded.', [{ text: 'Continue practice' }, { text: 'Discard', style: 'destructive', onPress: discardPractice }])}>
            <KeyboardAvoidingView style={s.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
                    <Text style={s.title}>Mock interview</Text><Text style={secondsLeft ? s.muted : s.error}>{secondsLeft ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')} remaining` : 'Time is up. Review and submit your completed answers.'}</Text>
                    <Text style={s.muted}>Question {practiceIndex + 1} of {practice.length}</Text><Text style={s.heading}>{practiceQuestion?.title}</Text><Text style={s.body}>{textContent(practiceQuestion?.problemStatement)}</Text>
                    <Field label="Your answer" value={answers[practiceQuestion?.id] || ''} onChange={value => setAnswers(current => ({ ...current, [practiceQuestion.id]: value }))} multiline />
                    <Text style={s.muted}>Record up to 5 minutes (5 MB). Review playback locally, then choose Transcribe to send this recording for an editable transcript. Nothing is submitted for scoring until you press Submit.</Text>
                    <Button label={recorderState.isRecording ? `Stop recording (${Math.floor(recorderState.durationMillis / 1000)}s)` : attachingRecording ? 'Preparing recording…' : 'Record answer'} disabled={busy || attachingRecording || transcribing} secondary onPress={() => { void recordAnswer(); }} />
                    {!!recordings[practiceQuestion?.id] && <View style={s.row}><Text style={s.muted}>Recording attached</Text><Button label="Review recording" secondary disabled={recorderState.isRecording} onPress={() => { try { resultPlayer.replace(recordingUris[practiceQuestion.id] || recordings[practiceQuestion.id]); resultPlayer.play(); } catch { Alert.alert('Playback unavailable', 'Try recording this answer again.'); } }} /><Button label="Pause playback" secondary onPress={() => pauseResultPlayer()} /><Button label={transcribing ? 'Transcribing…' : 'Transcribe recording'} disabled={transcribing || busy || recorderState.isRecording || attachingRecording} onPress={() => { void transcribeAnswer(); }} /><Button label="Remove recording" secondary disabled={transcribing || busy} onPress={() => { pauseResultPlayer(); setTranscriptionDraft(null); setRecordings(current => { const next = { ...current }; delete next[practiceQuestion.id]; return next; }); setRecordingUris(current => { const next = { ...current }; delete next[practiceQuestion.id]; return next; }); }} /></View>}
                    {transcriptionDraft && practiceQuestion && transcriptionDraft.questionId === practiceQuestion.id && <View style={s.card}><Field label="Review transcription" value={transcriptionDraft.text} onChange={text => setTranscriptionDraft(current => current ? { ...current, text } : null)} multiline /><Text style={s.muted}>Correct any mistakes before using this as your answer.</Text><View style={s.row}><Button label="Use as my answer" onPress={() => { setAnswers(current => ({ ...current, [transcriptionDraft.questionId]: transcriptionDraft.text })); setTranscriptionDraft(null); }} /><Button label="Keep existing answer" secondary onPress={() => setTranscriptionDraft(null)} /></View></View>}
                    <View style={s.row}><Button label="Previous" secondary disabled={!practiceIndex || busy || recorderState.isRecording || attachingRecording || transcribing} onPress={() => { pauseResultPlayer(); setPracticeIndex(value => value - 1); }} /><Button label="Next" secondary disabled={practiceIndex >= practice.length - 1 || busy || recorderState.isRecording || attachingRecording || transcribing} onPress={() => { pauseResultPlayer(); setPracticeIndex(value => value + 1); }} /></View>
                    <Button label="Submit answered questions for AI feedback" disabled={busy || recorderState.isRecording || attachingRecording || transcribing} onPress={() => { void submitPractice(); }} />
                    <Button label="Discard practice" danger disabled={busy} onPress={() => Alert.alert('Discard practice?', 'These responses have not been submitted.', [{ text: 'Keep practicing' }, { text: 'Discard', style: 'destructive', onPress: discardPractice }])} />
                </ScrollView>
            </KeyboardAvoidingView>
        </Modal>

        <Modal visible={!!session} animationType="slide" onRequestClose={() => { pauseResultPlayer(); setSession(null); }}>
            <View style={s.modal}><Button label="Back to sessions" secondary onPress={() => { pauseResultPlayer(); setSession(null); }} /><ScrollView contentContainerStyle={s.content}>
                <Text style={s.title}>Session results</Text><Text style={s.muted}>{session?.status}</Text><Button label="Refresh results" secondary disabled={busy} onPress={() => { if (session) void openSession(session.id); }} />
                {session?.answers.map((answer: any) => <View key={answer.id} style={s.card}><Text style={s.heading}>{answer.question.title}</Text><Section title="Your response" content={answer.transcript} />{!!answer.audioBase64 && <View style={s.row}><Button label="Play recording" secondary onPress={() => { try { resultPlayer.replace(answer.audioBase64); resultPlayer.play(); } catch { Alert.alert('Playback unavailable', 'This recording could not be played.'); } }} /><Button label="Pause audio" secondary onPress={() => pauseResultPlayer()} /></View>}<Text style={s.body}>{answer.aiScore != null ? `Score: ${answer.aiScore}/100` : answer.status}</Text><Section title="AI feedback" content={answer.aiFeedback} />{!!answer.errorReason && <Text style={s.error}>{answer.errorReason}</Text>}{answer.status === 'FAILED' && <><Text style={s.label}>Retry model</Text>{models.map((model: any) => <Button key={model.id} label={model.name} secondary={chosenModel !== model.modelId} onPress={() => setValue('model', model.modelId)} />)}<Button label="Retry evaluation" disabled={busy || !models.length} onPress={() => { void run('retryAnswer', { id: answer.id, model: chosenModel }).then(result => { if (result && session) void openSession(session.id); }); }} /></>}</View>)}
            </ScrollView></View>
        </Modal>
    </View>;
}

const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#131117' }, modal: { flex: 1, backgroundColor: '#131117', paddingTop: 48, paddingHorizontal: 12 },
    header: { paddingTop: 48, paddingHorizontal: 20, paddingBottom: 16, flexDirection: 'row', alignItems: 'center' },
    title: { color: '#fff', fontWeight: '700', fontSize: 23, marginBottom: 10, flexShrink: 1 },
    heading: { color: '#f5f3ff', fontWeight: '700', fontSize: 18, marginBottom: 9 },
    label: { color: '#ddd6fe', fontSize: 14, marginBottom: 7 }, body: { color: '#e5e7eb', fontSize: 16, lineHeight: 25 },
    muted: { color: '#aaa2b7', fontSize: 13, lineHeight: 21, marginBottom: 8 }, error: { color: '#fca5a5', marginBottom: 10 },
    content: { padding: 16, paddingBottom: 48 }, card: { backgroundColor: '#211c29', padding: 17, borderRadius: 14, marginBottom: 15 },
    row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginVertical: 8 },
    button: { backgroundColor: '#7c3aed', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 9, marginRight: 8, marginBottom: 8 },
    secondary: { backgroundColor: '#332b3e' }, danger: { backgroundColor: '#7f1d1d' }, buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
    input: { backgroundColor: '#292330', borderWidth: 1, borderColor: '#4c405b', color: '#fff', borderRadius: 8, padding: 12, fontSize: 16 },
});
