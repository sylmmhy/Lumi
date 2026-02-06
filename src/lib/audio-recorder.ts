import EventEmitter from "eventemitter3";
import { ensureAudioSessionReady } from "./native-audio-session";

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
    const recorderStartTime = performance.now();
    console.log('🎤 [AudioRecorder.start] ====== 开始 ======');

    // 在 iOS Native WebView 中，先等待音频会话就绪
    // 这是为了解决 CallKit 来电接听后音频会话冲突的问题
    const audioSessionStart = performance.now();
    console.log('🎤 [AudioRecorder.start] 步骤1: ensureAudioSessionReady() 开始...');
    await ensureAudioSessionReady();
    console.log(`🎤 [AudioRecorder.start] 步骤1: ensureAudioSessionReady() 完成 - 耗时: ${(performance.now() - audioSessionStart).toFixed(1)}ms`);

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
      console.log('🎤 [AudioRecorder.start] 已有 starting Promise，等待中...');
      return this.starting;
    }

    this.starting = (async () => {
      try {
        const getUserMediaStart = performance.now();
        console.log('🎤 [AudioRecorder.start] 步骤2: getUserMedia({audio: true}) 开始...');
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log(`🎤 [AudioRecorder.start] 步骤2: getUserMedia({audio: true}) 完成 - 耗时: ${(performance.now() - getUserMediaStart).toFixed(1)}ms`);

        const ctxCreateStart = performance.now();
        console.log('🎤 [AudioRecorder.start] 步骤3: 创建 AudioContext...');
        this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
        console.log(`🎤 [AudioRecorder.start] 步骤3: AudioContext 创建完成 - 耗时: ${(performance.now() - ctxCreateStart).toFixed(1)}ms, 状态: ${this.audioContext.state}`);

        // 修复 iOS WebView 中 AudioContext 可能处于 suspended 状态的问题
        if (this.audioContext.state === 'suspended') {
          const resumeStart = performance.now();
          console.log('🎤 [AudioRecorder.start] 步骤3b: AudioContext.resume() 开始...');
          await this.audioContext.resume();
          console.log(`🎤 [AudioRecorder.start] 步骤3b: AudioContext.resume() 完成 - 耗时: ${(performance.now() - resumeStart).toFixed(1)}ms, 状态: ${this.audioContext.state}`);
        }

        this.source = this.audioContext.createMediaStreamSource(this.stream);

        // Add audio recording worklet
        const workletName = "audio-recorder-worklet";
        const src = createWorkletFromSource(workletName, audioProcessorSource);

        const workletStart = performance.now();
        console.log('🎤 [AudioRecorder.start] 步骤4: 加载 audio worklet...');
        await this.audioContext.audioWorklet.addModule(src);
        console.log(`🎤 [AudioRecorder.start] 步骤4: audio worklet 加载完成 - 耗时: ${(performance.now() - workletStart).toFixed(1)}ms`);

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
        console.log(`🎤 [AudioRecorder.start] ====== 全部完成 - 总耗时: ${(performance.now() - recorderStartTime).toFixed(1)}ms ======`);
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
