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
  const isPlayingRef = useRef(false);

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

    let cleanText = "";
    const indexMap: number[] = [];
    const textNodes: Text[] = [];
    let domIndex = 0;

    function traverse(node: Node) {
      if (node.nodeName === 'PRE') return; // Skip code blocks
      
      // Force breaks for block-level elements so words don't merge
      const isBlock = ['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BR'].includes(node.nodeName);
      if (isBlock && cleanText.length > 0 && !/\s$/.test(cleanText)) {
        cleanText += ". "; 
        indexMap.push(domIndex > 0 ? domIndex - 1 : 0); 
        indexMap.push(domIndex > 0 ? domIndex - 1 : 0);
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const textContent = node.textContent || '';
        if (textContent) {
          textNodes.push(node as Text);
          for (let i = 0; i < textContent.length; i++) {
            indexMap.push(domIndex + i);
            cleanText += textContent[i];
          }
          domIndex += textContent.length;
        }
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          traverse(node.childNodes[i]);
        }
      }

      if (isBlock && cleanText.length > 0 && !/\s$/.test(cleanText)) {
        cleanText += ". ";
        indexMap.push(domIndex > 0 ? domIndex - 1 : 0);
        indexMap.push(domIndex > 0 ? domIndex - 1 : 0);
      }
    }

    traverse(container);
    if (!cleanText.trim()) return;

    window.speechSynthesis.cancel();
    isPlayingRef.current = true;
    setIsPlaying(true);

    // Chunking to avoid mobile character limits
    const sentences: { text: string, start: number, end: number }[] = [];
    const regex = /[^.!?\n]+[.!?\n]+/g;
    let match;
    let fallbackRegexMatched = false;
    
    while ((match = regex.exec(cleanText)) !== null) {
      fallbackRegexMatched = true;
      let startIdx = match.index;
      let endIdx = startIdx + match[0].length;
      
      while (startIdx < endIdx && /\s/.test(cleanText[startIdx])) startIdx++;
      
      const trimmedText = cleanText.substring(startIdx, endIdx).trimEnd();
      if (trimmedText) {
        const actualStart = indexMap[startIdx] !== undefined ? indexMap[startIdx] : 0;
        const lastCharIdx = startIdx + trimmedText.length - 1;
        const actualEnd = (indexMap[lastCharIdx] !== undefined ? indexMap[lastCharIdx] : domIndex) + 1;

        sentences.push({
          text: trimmedText,
          start: actualStart,
          end: actualEnd
        });
      }
    }
    
    if (!fallbackRegexMatched && cleanText.trim()) {
       sentences.push({
         text: cleanText.trim(),
         start: indexMap[0] || 0,
         end: domIndex
       });
    }

    let currentChunkIndex = 0;

    const clearOverlay = () => {
      const existing = document.getElementById('tts-overlay-container');
      if (existing) existing.remove();
      if ('highlights' in CSS) {
        (CSS as any).highlights.delete('tts-reading');
      } else {
        window.getSelection()?.removeAllRanges();
      }
    };

    const drawOverlay = (range: Range) => {
      clearOverlay();
      const rects = range.getClientRects();
      if (!rects.length) return;

      const overlayContainer = document.createElement('div');
      overlayContainer.id = 'tts-overlay-container';
      overlayContainer.style.position = 'absolute';
      overlayContainer.style.top = '0';
      overlayContainer.style.left = '0';
      overlayContainer.style.width = '100%';
      overlayContainer.style.height = '100%';
      overlayContainer.style.pointerEvents = 'none';
      overlayContainer.style.zIndex = '9999';
      
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        const highlight = document.createElement('div');
        highlight.style.position = 'absolute';
        highlight.style.top = `${rect.top + window.scrollY}px`;
        highlight.style.left = `${rect.left + window.scrollX}px`;
        highlight.style.width = `${rect.width}px`;
        highlight.style.height = `${rect.height}px`;
        highlight.style.backgroundColor = 'rgba(250, 204, 21, 0.4)'; // tailwind yellow-400
        highlight.style.borderRadius = '4px';
        highlight.style.mixBlendMode = 'multiply';
        overlayContainer.appendChild(highlight);
      }
      document.body.appendChild(overlayContainer);
    };

    const highlightChunk = (startIdx: number, endIdx: number) => {
      if (!isPlayingRef.current) return;
      const container = document.getElementById(containerId);
      if (!container) return;

      const liveTextNodes: Text[] = [];
      function liveTraverse(node: Node) {
        if (node.nodeName === 'PRE') return;
        if (node.nodeType === Node.TEXT_NODE) {
          const textContent = node.textContent || '';
          if (textContent) liveTextNodes.push(node as Text);
        } else {
          for (let i = 0; i < node.childNodes.length; i++) {
            liveTraverse(node.childNodes[i]);
          }
        }
      }
      liveTraverse(container);

      let currentIdx = 0;
      let startNode, endNode;
      let startOffset = 0, endOffset = 0;

      for (let node of liveTextNodes) {
        const nodeLen = node.textContent?.length || 0;
        if (!startNode && currentIdx + nodeLen > startIdx) {
          startNode = node;
          startOffset = startIdx - currentIdx;
        }
        if (startNode && currentIdx + nodeLen >= endIdx) {
          endNode = node;
          endOffset = endIdx - currentIdx;
          break;
        }
        currentIdx += nodeLen;
      }

      if (startNode && endNode) {
        try {
          const range = document.createRange();
          range.setStart(startNode, startOffset);
          range.setEnd(endNode, endOffset);
          
          const element = startNode.parentElement;
          if (element) {
            const rect = element.getBoundingClientRect();
            if (rect.top < 80 || rect.bottom > window.innerHeight - 80) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
          
          if ('highlights' in CSS) {
            const highlight = new (window as any).Highlight(range);
            (CSS as any).highlights.set('tts-reading', highlight);
          } else {
            drawOverlay(range);
          }
        } catch (err) {
          console.warn("TTS Highlight Range Error:", err);
        }
      }
    };

    const playNextChunk = () => {
      if (!isPlayingRef.current || currentChunkIndex >= sentences.length) {
        handleStop();
        return;
      }
      
      const chunk = sentences[currentChunkIndex];
      const utterance = new SpeechSynthesisUtterance(chunk.text);
      if (selectedVoiceURI) {
        const v = voices.find(voice => voice.voiceURI === selectedVoiceURI);
        if (v) utterance.voice = v;
      }
      utterance.rate = speed;

      utterance.onstart = () => {
        highlightChunk(chunk.start, chunk.end);
      };

      utterance.onend = () => {
        currentChunkIndex++;
        playNextChunk();
      };

      utterance.onerror = (e) => {
        console.warn("Utterance error", e);
        currentChunkIndex++;
        playNextChunk();
      };

      window.speechSynthesis.speak(utterance);
    };

    playNextChunk();
  };

  const handleStop = () => {
    window.speechSynthesis.cancel();
    isPlayingRef.current = false;
    setIsPlaying(false);
    
    const existing = document.getElementById('tts-overlay-container');
    if (existing) existing.remove();
    if ('highlights' in CSS) {
      (CSS as any).highlights.delete('tts-reading');
    } else {
      window.getSelection()?.removeAllRanges();
    }
    
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
