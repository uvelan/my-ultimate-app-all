'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Square, Loader2, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TTSButtonProps {
  questionId: string;
  field: string;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

const VOICES = [
  { id: 'en', label: 'English (US)' },
  { id: 'en-GB', label: 'English (UK)' },
  { id: 'en-AU', label: 'English (Australia)' },
  { id: 'en-IN', label: 'English (India)' },
];

export default function TTSButton({ questionId, field, onPlayStateChange }: TTSButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [voice, setVoice] = useState('en');
  const [speed, setSpeed] = useState(1);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const storedVoice = localStorage.getItem('interview-tts-voice');
    const storedSpeed = localStorage.getItem('interview-tts-speed');
    if (storedVoice) setVoice(storedVoice);
    if (storedSpeed) setSpeed(parseFloat(storedSpeed));
    
    // Cleanup audio on unmount
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src'); // Fully stop downloading
      }
    };
  }, []);

  // Update parent when play state changes
  useEffect(() => {
    if (onPlayStateChange) onPlayStateChange(isPlaying);
  }, [isPlaying, onPlayStateChange]);

  const handleVoiceChange = (v: string) => {
    setVoice(v);
    localStorage.setItem('interview-tts-voice', v);
    if (isPlaying) handleStop();
  };

  const handleSpeedChange = (s: number) => {
    setSpeed(s);
    localStorage.setItem('interview-tts-speed', s.toString());
    if (audioRef.current) {
      audioRef.current.playbackRate = s;
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
    audio.playbackRate = speed;
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
      audioRef.current.removeAttribute('src'); // Stops buffering
      audioRef.current.load(); // Forces reset
    }
    setIsPlaying(false);
    setIsLoading(false);
  };

  return (
    <div className="relative inline-flex items-center gap-2 ml-3">
      {isPlaying || isLoading ? (
        <button
          onClick={handleStop}
          className="flex items-center justify-center p-1.5 text-red-600 bg-red-100 rounded-lg hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 transition-colors"
          title="Stop Reading"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
          ) : (
            <Square className="w-4 h-4 fill-current" />
          )}
        </button>
      ) : (
        <button
          onClick={handlePlay}
          className="flex items-center justify-center p-1.5 text-blue-600 bg-blue-100 rounded-lg hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 transition-colors"
          title="Read out loud"
        >
          <Volume2 className="w-4 h-4" />
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
            className="absolute top-full right-0 mt-2 p-4 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl rounded-xl z-50"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-200">Audio Settings</span>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Voice Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Voice Accent</label>
                <select 
                  value={voice}
                  onChange={(e) => handleVoiceChange(e.target.value)}
                  className="w-full text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-2 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  {VOICES.map(v => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </div>
              
              {/* Speed Control */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase">Speed</label>
                  <span className="text-xs font-mono text-blue-600 dark:text-blue-400">{speed}x</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" 
                  max="2.0" 
                  step="0.1" 
                  value={speed}
                  onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                  className="w-full accent-blue-600"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
                  <span>0.5x</span>
                  <span>1.0x</span>
                  <span>2.0x</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
