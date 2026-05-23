'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Square, Loader2, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface TTSButtonProps {
  containerId: string;
  onPlayStateChange?: (isPlaying: boolean) => void;
}

export default function TTSButton({ containerId, onPlayStateChange }: TTSButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState('');
  const [speed, setSpeed] = useState(1);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Markdown strip helper is no longer needed since we read DOM directly

  useEffect(() => {
    const storedVoice = localStorage.getItem('interview-tts-voice');
    const storedSpeed = localStorage.getItem('interview-tts-speed');
    if (storedSpeed) setSpeed(parseFloat(storedSpeed));

    const loadVoices = () => {
      let availableVoices = window.speechSynthesis.getVoices();
      if (availableVoices.length > 0) {
        // Prefer English voices
        availableVoices = availableVoices.filter(v => v.lang.startsWith('en'));
        setVoices(availableVoices);
        if (storedVoice && availableVoices.find(v => v.voiceURI === storedVoice)) {
          setSelectedVoiceURI(storedVoice);
        } else {
          setSelectedVoiceURI(availableVoices[0]?.voiceURI || '');
        }
      }
    };

    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Update parent when play state changes
  useEffect(() => {
    if (onPlayStateChange) onPlayStateChange(isPlaying);
  }, [isPlaying, onPlayStateChange]);

  const handleVoiceChange = (v: string) => {
    setSelectedVoiceURI(v);
    localStorage.setItem('interview-tts-voice', v);
    if (isPlaying) handleStop();
  };

  const handleSpeedChange = (s: number) => {
    setSpeed(s);
    localStorage.setItem('interview-tts-speed', s.toString());
    if (isPlaying) {
      handleStop();
    }
  };

  const handlePlay = () => {
    if (isPlaying) {
      handleStop();
      return;
    }

    const container = document.getElementById(containerId);
    if (!container) return;

    // Traverse the DOM to extract clean text and map character indices to text nodes
    let cleanText = "";
    const indexMap: number[] = [];
    const textNodes: Text[] = [];
    let domIndex = 0;

    function traverse(node: Node) {
      if (node.nodeName === 'PRE') return; // Optionally skip code blocks
      if (node.nodeType === Node.TEXT_NODE) {
        const textContent = node.textContent || '';
        textNodes.push(node as Text);
        for (let i = 0; i < textContent.length; i++) {
          indexMap.push(domIndex + i);
          cleanText += textContent[i];
        }
        domIndex += textContent.length;
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          traverse(node.childNodes[i]);
        }
      }
    }

    traverse(container);
    if (!cleanText.trim()) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    if (selectedVoiceURI) {
      const v = voices.find(voice => voice.voiceURI === selectedVoiceURI);
      if (v) utterance.voice = v;
    }
    utterance.rate = speed;

    utterance.onstart = () => setIsPlaying(true);
    
    const cleanupHighlight = () => {
      if ('highlights' in CSS) {
        (CSS as any).highlights.delete('tts-reading');
      } else {
        window.getSelection()?.removeAllRanges();
      }
    };

    utterance.onend = () => {
      setIsPlaying(false);
      cleanupHighlight();
      if (onPlayStateChange) onPlayStateChange(false);
    };
    utterance.onerror = () => {
      setIsPlaying(false);
      cleanupHighlight();
    };

    utterance.onboundary = (event) => {
      if (event.name === 'sentence' || event.name === 'word') {
        const charIndex = event.charIndex;
        
        // Find rough sentence boundaries
        let start = charIndex;
        while (start > 0 && !/[.!?\n]/.test(cleanText[start - 1])) start--;
        while (start < cleanText.length && /\s/.test(cleanText[start])) start++;
        
        let end = charIndex;
        while (end < cleanText.length && !/[.!?\n]/.test(cleanText[end])) end++;
        if (end < cleanText.length) end++; // include punctuation

        const domStart = indexMap[start];
        const domEnd = indexMap[Math.min(end, indexMap.length - 1)];

        if (domStart !== undefined && domEnd !== undefined) {
          let currentIdx = 0;
          let startNode, endNode;
          let startOffset = 0, endOffset = 0;

          for (let node of textNodes) {
            const nodeLen = node.textContent?.length || 0;
            if (!startNode && currentIdx + nodeLen > domStart) {
              startNode = node;
              startOffset = domStart - currentIdx;
            }
            if (startNode && currentIdx + nodeLen >= domEnd) {
              endNode = node;
              endOffset = domEnd - currentIdx;
              break;
            }
            currentIdx += nodeLen;
          }

          if (startNode && endNode) {
            try {
              const range = document.createRange();
              range.setStart(startNode, startOffset);
              range.setEnd(endNode, endOffset);
              
              if ('highlights' in CSS) {
                const highlight = new (window as any).Highlight(range);
                (CSS as any).highlights.set('tts-reading', highlight);
              } else {
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
              }

              // Auto-scroll to the highlighted sentence
              const element = startNode.parentElement;
              if (element) {
                const rect = element.getBoundingClientRect();
                const isInView = rect.top >= 0 && rect.bottom <= window.innerHeight;
                if (!isInView) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }
            } catch (err) {
              console.warn("TTS Highlight Range Error:", err);
            }
          }
        }
      }
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    if ('highlights' in CSS) {
      (CSS as any).highlights.delete('tts-reading');
    } else {
      window.getSelection()?.removeAllRanges();
    }
    setIsPlaying(false);
    if (onPlayStateChange) onPlayStateChange(false);
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
                  value={selectedVoiceURI}
                  onChange={(e) => handleVoiceChange(e.target.value)}
                  className="w-full text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-2 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  {voices.map(v => (
                    <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>
                  ))}
                  {voices.length === 0 && <option value="">Loading voices...</option>}
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
      <style dangerouslySetInnerHTML={{ __html: `
        ::highlight(tts-reading) {
          background-color: rgba(250, 204, 21, 0.4);
          color: inherit;
          border-radius: 4px;
        }
      `}} />
    </div>
  );
}
