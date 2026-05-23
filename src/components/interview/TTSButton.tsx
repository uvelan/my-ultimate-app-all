'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Square, Loader2, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TTSButtonProps {
  questionId: string;
  field: string;
}

const VOICES = [
  { id: 'en', label: 'English (US)' },
  { id: 'en-GB', label: 'English (UK)' },
  { id: 'en-AU', label: 'English (Australia)' },
  { id: 'en-IN', label: 'English (India)' },
];

export default function TTSButton({ questionId, field }: TTSButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [voice, setVoice] = useState('en');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const storedVoice = localStorage.getItem('interview-tts-voice');
    if (storedVoice) setVoice(storedVoice);
    
    // Cleanup audio on unmount
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  const handleVoiceChange = (v: string) => {
    setVoice(v);
    localStorage.setItem('interview-tts-voice', v);
    // If playing, stop it so they can replay with new voice
    if (isPlaying) {
      handleStop();
    }
  };

  const handlePlay = () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }

    setIsLoading(true);
    
    // Construct URL
    const url = `/api/tts?questionId=${questionId}&questionField=${field}&voice=${voice}&grammarModel=OFF`;
    
    const audio = new Audio(url);
    audioRef.current = audio;

    audio.oncanplaythrough = () => {
      setIsLoading(false);
      setIsPlaying(true);
      audio.play().catch(e => {
        console.error("Audio playback failed", e);
        setIsPlaying(false);
      });
    };

    audio.onerror = (e) => {
      console.error("Audio failed to load", e);
      setIsLoading(false);
      setIsPlaying(false);
    };

    audio.onended = () => {
      setIsPlaying(false);
    };
    
    // Force load to trigger events
    audio.load();
  };

  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlaying(false);
  };

  return (
    <div className="relative inline-flex items-center gap-2 ml-3">
      {isPlaying ? (
        <button
          onClick={handleStop}
          className="flex items-center justify-center p-1.5 text-red-600 bg-red-100 rounded-lg hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 transition-colors"
          title="Stop Reading"
        >
          <Square className="w-4 h-4 fill-current" />
        </button>
      ) : (
        <button
          onClick={handlePlay}
          disabled={isLoading}
          className="flex items-center justify-center p-1.5 text-blue-600 bg-blue-100 rounded-lg hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors disabled:opacity-50"
          title="Read out loud"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>
      )}

      <button
        onClick={() => setShowSettings(!showSettings)}
        className="flex items-center justify-center p-1.5 text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 transition-colors"
        title="TTS Settings"
      >
        <Settings className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute top-full right-0 mt-2 p-3 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-xl z-50"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase">Voice Accent</span>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-1">
              {VOICES.map(v => (
                <button
                  key={v.id}
                  onClick={() => handleVoiceChange(v.id)}
                  className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${
                    voice === v.id
                      ? 'bg-blue-50 text-blue-700 font-medium dark:bg-blue-900/30 dark:text-blue-400'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
