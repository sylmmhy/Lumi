/**
 * VoiceConfirmButton Component
 * 
 * A press-and-hold microphone button for recording voice confirmations.
 * Uses Web Speech API for real-time transcription.
 * 
 * Features:
 * - Press and hold to record
 * - Visual pulse animation while recording
 * - Real-time voice activity detection
 * - Fallback to audio blob if Speech API unavailable
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useVoiceActivityDetection } from '../../hooks/useVoiceActivityDetection';

interface VoiceConfirmButtonProps {
    /** Called with the transcribed text when recording stops */
    onResult: (transcript: string) => void;
    /** Whether the button is disabled */
    disabled?: boolean;
    /** Custom className */
    className?: string;
}

/**
 * Voice confirmation button with press-to-record functionality
 */
export const VoiceConfirmButton: React.FC<VoiceConfirmButtonProps> = ({
    onResult,
    disabled = false,
    className = '',
}) => {
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);
    const [permissionDenied, setPermissionDenied] = useState(false);

    const mediaStreamRef = useRef<MediaStream | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const transcriptRef = useRef<string>('');

    // Voice activity detection for visual feedback
    const { isSpeaking, currentVolume } = useVoiceActivityDetection(
        // eslint-disable-next-line
        mediaStreamRef.current,
        { enabled: isRecording, threshold: 25 }
    );


    /**
     * Start recording audio and speech recognition
     */
    const startRecording = useCallback(async () => {
        if (disabled) return;

        try {
            // Request microphone permission
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;
            setPermissionDenied(false);

            // Initialize Speech Recognition (Web Speech API)
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.lang = 'zh-CN';
                recognition.interimResults = true;
                recognition.continuous = true;

                recognition.onresult = (event: SpeechRecognitionEvent) => {
                    let transcript = '';
                    for (let i = 0; i < event.results.length; i++) {
                        transcript += event.results[i][0].transcript;
                    }
                    transcriptRef.current = transcript;
                };

                recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
                    console.error('Speech recognition error:', event.error);
                };

                recognitionRef.current = recognition;
                recognition.start();
            }

            // Also record audio as fallback
            const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            chunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start(100);

            transcriptRef.current = '';
            setIsRecording(true);
        } catch (err) {
            console.error('Failed to start recording:', err);
            if ((err as Error).name === 'NotAllowedError') {
                setPermissionDenied(true);
            }
        }
    }, [disabled]);

    /**
     * Stop recording and process the result
     */
    const stopRecording = useCallback(() => {
        // Stop speech recognition
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }

        // Stop media recorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            mediaRecorderRef.current = null;
        }

        // Stop media stream
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }

        setIsRecording(false);

        // Return the transcript
        const transcript = transcriptRef.current.trim();
        if (transcript) {
            onResult(transcript);
        }
    }, [onResult]);

    // Handle pointer events for press-and-hold
    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault();
        startRecording();
    }, [startRecording]);

    const handlePointerUp = useCallback(() => {
        if (isRecording) {
            stopRecording();
        }
    }, [isRecording, stopRecording]);

    const handlePointerLeave = useCallback(() => {
        if (isRecording) {
            stopRecording();
        }
    }, [isRecording, stopRecording]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopRecording();
        };
    }, [stopRecording]);

    // Update recording duration
    useEffect(() => {
        if (isRecording) {
            durationIntervalRef.current = setInterval(() => {
                setRecordingDuration(prev => prev + 0.1);
            }, 100);
        } else {
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
            }
            setRecordingDuration(0);
        }

        return () => {
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
            }
        };
    }, [isRecording]);

    // Calculate pulse scale based on voice activity
    const pulseScale = isRecording ? 1 + (currentVolume / 255) * 0.3 : 1;

    return (
        <div className={`flex flex-col items-center ${className}`}>
            {/* Recording duration indicator */}
            {isRecording && (
                <div className="mb-4 text-gray-300 text-sm">
                    {recordingDuration.toFixed(1)}s
                    {isSpeaking && <span className="ml-2 text-yellow-400">●</span>}
                </div>
            )}

            {/* Main button */}
            <button
                type="button"
                disabled={disabled}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerLeave}
                onPointerCancel={handlePointerUp}
                className={`
          relative w-24 h-24 rounded-full
          flex items-center justify-center
          transition-all duration-150 ease-out
          touch-none select-none
          ${disabled
                        ? 'bg-gray-700 cursor-not-allowed'
                        : isRecording
                            ? 'bg-red-500 shadow-lg shadow-red-500/50'
                            : 'bg-yellow-400 hover:bg-yellow-300 active:scale-95'
                    }
        `}
                style={{
                    transform: isRecording ? `scale(${pulseScale})` : undefined,
                }}
            >
                {/* Pulse rings */}
                {isRecording && (
                    <>
                        <div className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-25" />
                        <div
                            className="absolute rounded-full bg-red-400/30"
                            style={{
                                width: `${110 + currentVolume * 0.5}%`,
                                height: `${110 + currentVolume * 0.5}%`,
                                transition: 'all 0.1s ease-out',
                            }}
                        />
                    </>
                )}

                {/* Microphone icon */}
                <svg
                    className={`w-10 h-10 ${disabled ? 'text-gray-500' : isRecording ? 'text-white' : 'text-gray-900'}`}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
            </button>

            {/* Hint text */}
            <p className={`mt-4 text-sm ${isRecording ? 'text-red-400' : 'text-gray-400'}`}>
                {permissionDenied
                    ? '请允许麦克风权限'
                    : isRecording
                        ? '松开结束录音'
                        : '按住说话'
                }
            </p>
        </div>
    );
};

// Extend Window interface for Speech Recognition
declare global {
    interface Window {
        SpeechRecognition: typeof SpeechRecognition;
        webkitSpeechRecognition: typeof SpeechRecognition;
    }
}

export default VoiceConfirmButton;
