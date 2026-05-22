'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Loader2, Mic, Square, ChevronRight, CheckCircle2 } from 'lucide-react';
import InterviewTimer from '@/components/interview/InterviewTimer';
import { getQuestions } from '@/actions/interview';
import { submitMockInterview } from '@/actions/mock-interview';
import { useRouter } from 'next/navigation';

export default function MockInterviewStartPage() {
  const router = useRouter();
  
  const [isStarted, setIsStarted] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [sessionQuestions, setSessionQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [answers, setAnswers] = useState<{ questionId: string, transcript: string, audioBase64: string }[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    async function loadQuestions() {
      const data = await getQuestions();
      const randomThree = data.sort(() => 0.5 - Math.random()).slice(0, 3);
      setSessionQuestions(randomThree);
      setLoading(false);
    }
    loadQuestions();

    // Initialize SpeechRecognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        setTranscript(prev => prev + finalTranscript + interimTranscript);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const handleStart = () => {
    setIsStarted(true);
    setIsFinished(false);
    setCurrentIdx(0);
    setAnswers([]);
  };

  const startRecording = async () => {
    // Keep whatever user typed before recording
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(1000);
      setIsRecording(true);

      if (recognitionRef.current) {
        recognitionRef.current.start();
      }
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please ensure permissions are granted.');
    }
  };

  const stopRecording = () => {
    return new Promise<string>((resolve) => {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = () => {
            resolve(reader.result as string);
          };
          
          // Stop all tracks
          mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      } else {
        resolve('');
      }

      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    });
  };

  const handleNextQuestion = async () => {
    const base64Audio = await stopRecording();
    
    setAnswers(prev => [...prev, {
      questionId: sessionQuestions[currentIdx].id,
      transcript: transcript,
      audioBase64: base64Audio
    }]);

    setTranscript('');

    if (currentIdx < sessionQuestions.length - 1) {
      setCurrentIdx(prev => prev + 1);
    } else {
      setIsFinished(true);
    }
  };

  const handleTimeUp = async () => {
    if (isRecording) {
      await stopRecording();
    }
    setIsFinished(true);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await submitMockInterview(answers);
      if (res.success) {
        router.push('/interview/mock');
      } else {
        alert('Failed to submit interview.');
      }
    } catch (error) {
      console.error(error);
      alert('An error occurred during submission.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isStarted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md p-8 bg-white border border-gray-200 shadow-xl dark:bg-gray-900 dark:border-gray-800 rounded-3xl"
        >
          <div className="w-16 h-16 mx-auto mb-6 text-blue-600 bg-blue-100 rounded-2xl dark:bg-blue-900/30 flex items-center justify-center">
            {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : <Play className="w-8 h-8 fill-current" />}
          </div>
          <h1 className="mb-4 text-3xl font-bold text-gray-900 dark:text-white">Mock Interview</h1>
          <p className="mb-8 text-gray-500 dark:text-gray-400">
            {loading 
              ? "Loading questions from database..."
              : `You will face ${sessionQuestions.length} randomized questions. You have 30 minutes. You can speak out loud to record audio, or type your answers directly.`}
          </p>
          <button
            onClick={handleStart}
            disabled={loading || sessionQuestions.length === 0}
            className="w-full py-4 text-lg font-bold text-white transition-colors bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/30 disabled:opacity-50"
          >
            {loading ? "Please wait..." : "Start Session"}
          </button>
        </motion.div>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-lg p-8 w-full bg-white border border-gray-200 shadow-xl dark:bg-gray-900 dark:border-gray-800 rounded-3xl"
        >
          <div className="w-16 h-16 mx-auto mb-6 text-green-600 bg-green-100 rounded-2xl dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">Interview Complete!</h2>
          <p className="mb-8 text-xl text-gray-500 dark:text-gray-400">
            You have answered all {sessionQuestions.length} questions. Submit your responses to receive an AI-driven evaluation.
          </p>
          
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center justify-center w-full gap-2 py-4 text-lg font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : "Submit for Evaluation"}
          </button>
        </motion.div>
      </div>
    );
  }

  const currentQ = sessionQuestions[currentIdx];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between p-4 bg-white border border-gray-200 shadow-sm dark:bg-gray-900 dark:border-gray-800 rounded-2xl">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
            Question {currentIdx + 1} of {sessionQuestions.length}
          </p>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-xs font-semibold text-purple-600 bg-purple-100 rounded-full dark:bg-purple-900/30 dark:text-purple-400">
              {currentQ.difficulty}
            </span>
          </div>
        </div>
        <InterviewTimer durationMinutes={30} onTimeUp={handleTimeUp} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="p-8 bg-white border border-gray-200 shadow-md dark:bg-gray-900 dark:border-gray-800 rounded-3xl"
        >
          <h2 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white leading-tight">
            {currentQ.title}
          </h2>
          <div className="prose max-w-none dark:prose-invert mb-8">
            <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
              {currentQ.problemStatement}
            </p>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-100 dark:border-gray-800">
            <div className="mb-6">
              <label htmlFor="answer-input" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Your Answer (Speak or Type)
              </label>
              <textarea
                id="answer-input"
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={isRecording ? "Listening to your voice..." : "Type your answer here or click 'Start Recording' to speak..."}
                className="w-full p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl min-h-[150px] border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-y text-gray-800 dark:text-gray-200"
                disabled={isRecording}
              />
            </div>

            <div className="flex flex-col gap-4 sm:flex-row">
              {!isRecording ? (
                <button
                  onClick={startRecording}
                  className="flex-1 flex items-center justify-center gap-2 py-4 text-lg font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 dark:bg-blue-900/20 dark:border-blue-900/50 dark:text-blue-400 transition-colors"
                >
                  <Mic className="w-5 h-5" /> Start Recording
                </button>
              ) : (
                <button
                  onClick={stopRecording}
                  className="flex-1 flex items-center justify-center gap-2 py-4 text-lg font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 dark:bg-red-900/20 dark:border-red-900/50 dark:text-red-400 transition-colors animate-pulse"
                >
                  <Square className="w-5 h-5 fill-current" /> Stop Recording
                </button>
              )}
              
              <button
                onClick={handleNextQuestion}
                disabled={isRecording && !transcript}
                className="flex-1 flex items-center justify-center gap-2 py-4 text-lg font-semibold text-gray-700 bg-gray-100 border border-transparent rounded-xl hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {currentIdx < sessionQuestions.length - 1 ? 'Next Question' : 'Finish Interview'} <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
