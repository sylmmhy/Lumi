import EventEmitter from "eventemitter3";

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Simple audio worklet processor source code as string
const audioProcessorSource = `
class AudioRecorderProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];

      // Convert Float32Array to Int16Array (PCM16)
      const pcm16 = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        const s = Math.max(-1, Math.min(1, channelData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      this.port.postMessage({ data: { int16arrayBuffer: pcm16.buffer } }, [pcm16.buffer]);
    }
    return true;
  }
}
registerProcessor('audio-recorder-worklet', AudioRecorderProcessor);
`;

const volMeterSource = `
class VolMeterProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      let sum = 0;
      for (let i = 0; i < channelData.length; i++) {
        sum += channelData[i] * channelData[i];
      }
      const volume = Math.sqrt(sum / channelData.length);
      this.port.postMessage({ volume });
    }
    return true;
  }
}
registerProcessor('vu-meter', VolMeterProcessor);
`;

function createWorkletFromSource(name: string, source: string): string {
  // name is used for clarity/debugging; void to satisfy noUnusedLocals
  void name;
  const blob = new Blob([source], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

export class AudioRecorder extends EventEmitter {
  stream: MediaStream | undefined;
  audioContext: AudioContext | undefined;
  source: MediaStreamAudioSourceNode | undefined;
  recording: boolean = false;
  recordingWorklet: AudioWorkletNode | undefined;
  vuWorklet: AudioWorkletNode | undefined;
  sampleRate: number;

  private starting: Promise<void> | null = null;

  constructor(sampleRate = 16000) {
    super();
    this.sampleRate = sampleRate;
  }

  async start() {
    // Check if getUserMedia is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const protocol = window.location.protocol;
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

      let errorMsg = "Microphone access not available. ";

      if (protocol === 'http:' && !isLocalhost) {
        errorMsg += "iOS requires HTTPS for microphone access. Please use https:// or localhost.";
      } else {
        errorMsg += "Your browser does not support getUserMedia.";
      }

      console.error('getUserMedia check failed:', {
        protocol,
        hostname: window.location.hostname,
        hasMediaDevices: !!navigator.mediaDevices,
        hasGetUserMedia: !!(navigator.mediaDevices?.getUserMedia)
      });

      throw new Error(errorMsg);
    }

    if (this.starting) {
      return this.starting;
    }

    this.starting = (async () => {
      try {
        if (import.meta.env.DEV) {
          console.log('Requesting microphone access...');
        }
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (import.meta.env.DEV) {
          console.log('Microphone access granted');
        }
        this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
        this.source = this.audioContext.createMediaStreamSource(this.stream);

        // Add audio recording worklet
        const workletName = "audio-recorder-worklet";
        const src = createWorkletFromSource(workletName, audioProcessorSource);

        await this.audioContext.audioWorklet.addModule(src);
        this.recordingWorklet = new AudioWorkletNode(
          this.audioContext,
          workletName
        );

        this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
          const arrayBuffer = ev.data.data.int16arrayBuffer;

          if (arrayBuffer) {
            const arrayBufferString = arrayBufferToBase64(arrayBuffer);
            this.emit("data", arrayBufferString);
          }
        };
        this.source.connect(this.recordingWorklet);

        // Add volume meter worklet
        const vuWorkletName = "vu-meter";
        await this.audioContext.audioWorklet.addModule(
          createWorkletFromSource(vuWorkletName, volMeterSource)
        );
        this.vuWorklet = new AudioWorkletNode(this.audioContext, vuWorkletName);
        this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
          this.emit("volume", ev.data.volume);
        };

        this.source.connect(this.vuWorklet);
        this.recording = true;
      } finally {
        // always clear starting so subsequent calls can proceed even after failure
        this.starting = null;
      }
    })();

    return this.starting;
  }

  stop() {
    const handleStop = () => {
      this.recording = false;
      this.source?.disconnect();
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = undefined;
      this.recordingWorklet = undefined;
      this.vuWorklet = undefined;
      // Don't close the audioContext - it may be reused
    };

    if (this.starting) {
      this.starting.then(handleStop);
      return;
    }
    handleStop();
  }
}
