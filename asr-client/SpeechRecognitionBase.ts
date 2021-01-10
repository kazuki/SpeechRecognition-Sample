import 'audioworklet-polyfill';
import { SpeechRecognitionEventBase } from './SpeechRecognitionEventBase';
import { IPacketMessage } from './vad-encoder.worklet';

const WEBSOCKET_PATH = `${window.location.protocol === 'http:' ? 'ws' : 'wss'}://${
  window.location.host
}/ws`;
const WASM_PATH = '/opus.wasm';
const WORKLET_PATH = '/vad-encoder.worklet.js';
const PREATTACK_DURATION = 0.5; // [s]
const ATTACK_THRESHOLD = 0.8; // VAD prob
const RELEASE_THRESHOLD = ATTACK_THRESHOLD; // VAD prob
const ATTACK_TIME_THRESHOLD = 0.2; // [s]
const RELEASE_TIME_THRESHOLD = 1; // [s]

type TCleanupFuncs = Array<() => void>;

export abstract class SpeechRecognitionBase extends SpeechRecognitionEventBase {
  private wasmModule: Promise<WebAssembly.Module>;
  private session: IRecognitionState | boolean = false;

  constructor() {
    super();
    // WASMバイナリはサイズが大きいので先にFetch&Compileしておく
    if (WebAssembly.compileStreaming) {
      this.wasmModule = WebAssembly.compileStreaming(fetch(WASM_PATH));
    } else {
      // Fallback (Safari)
      this.wasmModule = fetch(WASM_PATH)
        .then((resp) => resp.arrayBuffer())
        .then((buf) => WebAssembly.compile(buf));
    }
  }

  // エンジン固有の設定を返却する
  protected abstract getEngineConfig(): any; // eslint-disable-line

  start(): void {
    // 既存セッションが既に停止中/停止済の場合は新しいセッションを開始する
    if (
      typeof this.session !== 'boolean' &&
      this.session &&
      (this.session.state === State.Stopping || this.session.state === State.Stopped)
    ) {
      this.session = false;
    }

    // セッション開始中(this.session = true)または認識中の場合はエラーとする
    if (this.session) {
      throw new Error('already started');
    }

    this.session = true;
    createSession(this, this.wasmModule, this.getEngineConfig()).then((x) => {
      this.session = x;
    });
  }

  stop(): void {
    if (!this.session || typeof this.session === 'boolean') return;
    if (this.session.stop) this.session.stop();
    this.session = false;
  }

  abort(): void {
    if (!this.session || typeof this.session === 'boolean') return;
    if (this.session.abort) this.session.abort();
    this.session = false;
  }
}

const enum State {
  Preparing = 0,
  Running = 1,
  Stopping = 2,
  Stopped = 3,
}

interface IRecognitionState {
  state: State;
  recognizing?: boolean;
  abort?: (e?: Error) => void;
  stop?: () => void;
  cleanup_funcs: TCleanupFuncs;
  owner: SpeechRecognitionBase;
}

interface IServerResultAlternative {
  transcript: string;
  confidence: number;
}

interface IServerResult {
  is_final: boolean;
  alternatives: IServerResultAlternative[];
}

function createSession(
  sr: SpeechRecognitionBase,
  wasmModule: Promise<WebAssembly.Module>,
  engineConfig: any // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<IRecognitionState> {
  const state: IRecognitionState = {
    state: State.Preparing,
    cleanup_funcs: [],
    owner: sr,
  };
  const context = createAudioContext(state);
  const workletPromise = createWorkletNode(state, wasmModule, context);
  const srcNodePromise = openAudioInputDevice(state, context);
  const wsPromise = connectWebSocket(state);
  const cleanup = () => {
    if (state.state === State.Preparing || state.state === State.Running)
      state.state = State.Stopping;
    state.cleanup_funcs.forEach((f) => {
      try {
        f();
      } catch {
        /* void */
      }
    });
    state.cleanup_funcs = [];
    if (state.state === State.Stopping) {
      state.state = State.Stopped;
      sr.dispatchEvent(new Event('end'));
    }
  };
  state.stop = () => {
    cleanup();
  };
  state.abort = state.stop;
  return Promise.all([workletPromise, srcNodePromise, wsPromise])
    .then(([workletNode, srcNode, ws]) => {
      // eslint-disable-next-line no-param-reassign
      workletNode.port.onmessage = (m) => {
        const cfg = m.data;
        cfg['engine-config'] = engineConfig;
        ws.send(JSON.stringify(cfg));
        // eslint-disable-next-line no-param-reassign
        workletNode.port.onmessage = createMainHandler(state, ws);
        sr.dispatchEvent(new Event('audiostart'));
      };
      srcNode.connect(workletNode);
      workletNode.connect(context.createMediaStreamDestination());
      context.resume();
      state.state = State.Running;
      // eslint-disable-next-line no-param-reassign
      ws.onmessage = (e) => {
        const evt = new Event('result');
        const resp = JSON.parse(e.data);
        // @ts-ignore
        evt.results = createResultList(resp.map((x) => createResult(x)));
        sr.dispatchEvent(evt);
        if (!state.recognizing) {
          if (resp.length === 0) {
            state.stop!();
          } else {
            const lastResult = resp[resp.length - 1];
            if (lastResult['is_final']) {
              state.stop!();
            }
          }
        }
      };
      sr.dispatchEvent(new Event('start'));
      return state;
    })
    .catch(() => {
      // すべてのPromiseの解決を待ってからクリーンアップ処理を行う。
      //
      // 型情報不足によりallSettledが見つからないとTSCがエラーを出力するので
      // 一度anyにキャストする。大抵のブラウザは対応しているため問題ない。
      // https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Global_Objects/Promise/allSettled
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (Promise as any).allSettled([workletPromise, srcNodePromise, wsPromise]).then(() => {
        cleanup();
        return state;
      });
    });
}

function createAudioContext(state: IRecognitionState): AudioContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const context = new (window.AudioContext || (window as any).webkitAudioContext)();
  state.cleanup_funcs.push(() => context.close());
  return context;
}

function createWorkletNode(
  state: IRecognitionState,
  wasmModule: Promise<WebAssembly.Module>,
  context: AudioContext
): Promise<AudioWorkletNode> {
  return Promise.all([wasmModule, context.audioWorklet.addModule(WORKLET_PATH)]).then(([m]) => {
    return new AudioWorkletNode(context, 'vad-encoder', {
      processorOptions: {
        sampleRate: context.sampleRate,
        module: m,
      },
    });
  });
}

function openAudioInputDevice(state: IRecognitionState, context: AudioContext): Promise<AudioNode> {
  const deviceConstraints = {
    audio: {
      channelCount: 1,
      noiseSuppression: false,
      autoGainControl: false,
      echoCancellation: false,
    },
    video: false,
  };
  return navigator.mediaDevices.getUserMedia(deviceConstraints).then((stream) => {
    const tracks = stream.getAudioTracks();
    if (tracks.length !== 1) throw new Error('Not found audio track');
    if (state.state !== State.Preparing) {
      tracks[0].stop();
      throw new Error('already stopped');
    }
    state.cleanup_funcs.push(() => {
      tracks[0].stop();
      state.owner.dispatchEvent(new Event('audioend'));
    });
    return context.createMediaStreamTrackSource
      ? context.createMediaStreamTrackSource(tracks[0])
      : context.createMediaStreamSource(stream);
  });
}

function connectWebSocket(state: IRecognitionState): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    const ws = new WebSocket(WEBSOCKET_PATH);
    state.cleanup_funcs.push(() => ws.close());
    ws.onopen = () => resolve(ws);
    ws.onerror = (e) => {
      if (state.state === State.Running) {
        if (state.abort) {
          state.abort(new Error('disconnected WebSocket connection'));
        }
        return;
      }
      reject(e);
    };
  });
}

function createMainHandler(state: IRecognitionState, ws: WebSocket) {
  let attackTime = 0;
  let releaseTime = 0;
  let firedSoundstart = false;
  const buffer: ArrayBuffer[] = [];
  return (m: MessageEvent): void => {
    const {
      opus_vad: opusVAD,
      packet: opusPacket,
      duration: opusDuration,
    } = m.data as IPacketMessage;

    if (state.recognizing) {
      if (!state.owner.continuous && opusVAD < RELEASE_THRESHOLD) {
        releaseTime += opusDuration;
        if (releaseTime >= RELEASE_TIME_THRESHOLD) {
          // eslint-disable-next-line no-param-reassign
          state.recognizing = false;
          attackTime = 0;
          releaseTime = 0;
          ws.send(new ArrayBuffer(0));
          state.owner.dispatchEvent(new Event('speechend'));
          state.owner.dispatchEvent(new Event('soundend'));
          return;
        }
      } else {
        releaseTime = 0;
      }
      ws.send(opusPacket);
    } else {
      while (PREATTACK_DURATION + attackTime < buffer.length * opusDuration) buffer.shift();
      buffer.push(opusPacket);
      if (opusVAD >= ATTACK_THRESHOLD) {
        if (!firedSoundstart) {
          firedSoundstart = true;
          state.owner.dispatchEvent(new Event('soundstart'));
        }
        attackTime += opusDuration;
        if (attackTime >= ATTACK_TIME_THRESHOLD) {
          // eslint-disable-next-line no-param-reassign
          state.recognizing = true;
          attackTime = 0;
          releaseTime = 0;
          buffer.forEach((x) => ws.send(x));
          buffer.splice(0, buffer.length);
          state.owner.dispatchEvent(new Event('speechstart'));
        }
      } else {
        attackTime = 0;
      }
    }
  };
}

/*
 * SpeechRecognitionResultと同じインタフェースを実現するために
 * Proxy (https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Global_Objects/Proxy)
 * を使ってitem(getter)を提供する。
 */
function createResult(sr: IServerResult): SpeechRecognitionResult {
  const handler = {
    get(target: IServerResult, prop: number | string) {
      if (prop === 'length') return sr.alternatives.length;
      if (prop === 'isFinal') return sr.is_final;
      const idx = parseInt(prop.toString(), 10);
      if (idx != null) return sr.alternatives[idx];
      return undefined;
    },
  };
  return new Proxy(sr as any, handler); // eslint-disable-line @typescript-eslint/no-explicit-any
}

function createResultList(results: SpeechRecognitionResult[]): SpeechRecognitionResultList {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (results as any) as SpeechRecognitionResultList;
}
