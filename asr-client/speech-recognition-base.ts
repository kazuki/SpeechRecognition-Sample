import 'audioworklet-polyfill';

export class SpeechRecognitionBase implements SpeechRecognition {
  continuous = false;
  grammars: SpeechGrammarList = new SpeechGrammarList();
  interimResults = false;
  lang: string = navigator.language;
  maxAlternatives = 1;
  onaudioend: (this: SpeechRecognition, ev: Event) => any = this.null_handler;
  onaudiostart: (this: SpeechRecognition, ev: Event) => any = this.null_handler;
  onend: (this: SpeechRecognition, ev: Event) => any = this.null_handler;
  onerror: (this: SpeechRecognition, ev: Event) => any = this.null_handler;
  onnomatch: (this: SpeechRecognition, ev: SpeechRecognitionEvent) => any = this.null_handler;
  onresult: (this: SpeechRecognition, ev: SpeechRecognitionEvent) => any = this.null_handler;
  onsoundend: (this: SpeechRecognition, ev: Event) => any = this.null_handler;
  onsoundstart: (this: SpeechRecognition, ev: Event) => any = this.null_handler;
  onspeechend: (this: SpeechRecognition, ev: Event) => any = this.null_handler;
  onspeechstart: (this: SpeechRecognition, ev: Event) => any = this.null_handler;
  onstart: (this: SpeechRecognition, ev: Event) => any = this.null_handler;
  private state: State = State.Stopped;
  private cleanup_functions: Array<() => void> = [];
  private wasm_module: Promise<WebAssembly.Module>;

  constructor() {
    //if ('compileStreaming' in WebAssembly) {
    if (WebAssembly.compileStreaming) {
      this.wasm_module = WebAssembly.compileStreaming(fetch('opus.wasm'));
    } else {
      // Fallback (Safari)
      this.wasm_module = fetch('opus.wasm').then((resp) => {
        return resp.arrayBuffer();
      }).then((buf) => {
        return WebAssembly.compile(buf);
      });
    }
  }

  start(): void {
    if (this.state !== State.Stopped) throw new Error('start() must be after end event');
    this.state = State.Preparing;

    const ws_promise = new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(
        `${location.protocol === 'http:' ? 'ws' : 'wss'}://${location.host}/ws`
      );
      console.log(`${location.protocol === 'http:' ? 'ws' : 'wss'}://${location.host}/ws`);
      this.cleanup_functions.push(() => ws.close());
      ws.onopen = () => resolve(ws);
      ws.onerror = (e) => reject(e);
    });
    const context: AudioContext = new (window.AudioContext || ((window as any).webkitAudioContext))();
    this.cleanup_functions.push(() => context.close());
    const device_constraints = {
      audio: {
        channelCount: 1,
        noiseSuppression: false,
        autoGainControl: false,
        echoCancellation: false,
      },
      video: false,
    };
    const worklet_module = context.audioWorklet.addModule('vad-encoder.worklet.js');
    const track_promise = navigator.mediaDevices.getUserMedia(device_constraints).then((stream) => {
      const tracks = stream.getAudioTracks();
      if (tracks.length !== 1) throw new Error('Not found audio track');
      if (this.state === State.Stopping) {
        tracks[0].stop();
        throw new Error('already stopped');
      }
      this.cleanup_functions.push(() => {
        tracks[0].stop();
        this.dispatchEvent(new Event('audioend'));
      });
      return [stream, tracks[0]] as [MediaStream, MediaStreamTrack];
    });

    Promise.all([this.wasm_module, worklet_module, track_promise, ws_promise]).then(
      ([wasm_module, _, [stream, track], ws]) => {
        const src_node = context.createMediaStreamTrackSource
          ? context.createMediaStreamTrackSource(track)
          : context.createMediaStreamSource(stream);
        const worklet_node = new AudioWorkletNode(context, 'vad-encoder', {
          processorOptions: {
            sampleRate: context.sampleRate,
            module: wasm_module,
          },
        });
        const preattack_duration = 0.5; // [s]
        const attack_threshold = 0.8; // VAD prob
        const release_threshold = attack_threshold; // VAD prob
        const attack_time_threshold = 0.2; // [s]
        const release_time_threshold = 1; // [s]
        let attack_time = 0;
        let release_time = 0;
        let recognition_running = false;
        let fired_soundstart = false;
        const buffer: ArrayBuffer[] = [];
        const opus_packet_handler = (m: MessageEvent) => {
          const opus_vad = m.data.opus_vad as number;
          const opus_packet = m.data.packet as ArrayBuffer;
          const opus_duration = m.data.duration as number;
          console.log('[RECV-FROM-AudioWorklet]', opus_vad);
          if (recognition_running) {
            if (!this.continuous && opus_vad < release_threshold) {
              release_time += opus_duration;
              if (release_time >= release_time_threshold) {
                recognition_running = false;
                attack_time = release_time = 0;
                ws.send(new ArrayBuffer(0));
                this.dispatchEvent(new Event('speechend'));
                this.dispatchEvent(new Event('soundend'));
                return;
              }
            } else {
              release_time = 0;
            }
            ws.send(opus_packet);
          } else {
            while (preattack_duration + attack_time < buffer.length * opus_duration) buffer.shift();
            buffer.push(opus_packet);
            if (opus_vad >= attack_threshold) {
              if (!fired_soundstart) {
                fired_soundstart = true;
                this.dispatchEvent(new Event('soundstart'));
              }
              attack_time += opus_duration;
              if (attack_time >= attack_time_threshold) {
                recognition_running = true;
                attack_time = release_time = 0;
                buffer.forEach((x) => ws.send(x));
                buffer.splice(0, buffer.length);
                this.dispatchEvent(new Event('speechstart'));
              }
            } else {
              attack_time = 0;
            }
          }
        };
        worklet_node.port.onmessage = (m) => {
          const cfg = m.data;
          cfg['engine-config'] = {
            lang: this.lang,
            continuous: this.continuous,
            max_alternatives: this.maxAlternatives,
            enable_automatic_punctuation: true,
            single_utterance: false,
            interim_results: this.interimResults,
          };
          ws.send(JSON.stringify(cfg));
          worklet_node.port.onmessage = opus_packet_handler;
          this.dispatchEvent(new Event('audiostart'));
        };
        src_node.connect(worklet_node);
        worklet_node.connect(context.createMediaStreamDestination());
        context.resume();
        this.state = State.Running;
        ws.onmessage = (e) => {
          const evt = new Event('result');
          const resp = JSON.parse(e.data);
          // @ts-ignore
          evt.results = resp;
          this.dispatchEvent(evt);
          if (!recognition_running) {
            if (resp.length == 0) {
              this.stop();
            } else {
              const last_result = resp[resp.length - 1];
              if (last_result['is_final']) this.stop();
            }
          }
        };
        this.dispatchEvent(new Event('start'));
      },
      (_) => {
        console.log(_);
        this.abort();
      }
    );
  }

  stop(): void {
    if (this.state === State.Preparing) throw new Error('not implemented');
    if (this.state !== State.Running) throw new Error('recognition not running');
    this.cleanup();
  }

  abort(): void {
    if (this.state === State.Preparing) throw new Error('not implemented');
    if (this.state !== State.Running) throw new Error('recognition not running');
    this.cleanup();
  }

  private cleanup(): void {
    this.state = State.Stopping;
    this.cleanup_functions.forEach((f) => {
      try {
        f();
      } catch {}
    });
    this.cleanup_functions.splice(0, this.cleanup_functions.length);
    this.state = State.Stopped;
    this.dispatchEvent(new Event('end'));
  }

  addEventListener<
    K extends
      | 'audioend'
      | 'audiostart'
      | 'end'
      | 'error'
      | 'nomatch'
      | 'result'
      | 'soundend'
      | 'soundstart'
      | 'speechend'
      | 'speechstart'
      | 'start'
  >(
    type: K,
    listener: (this: SpeechRecognition, ev: SpeechRecognitionEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void;

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;

  addEventListener(type: any, listener: any, options?: any) {
    const key = (type as string).toLowerCase();
    const handlers = this.handlers.get(key);
    if (handlers !== undefined) {
      handlers.push(listener);
    } else {
      this.handlers.set(key, [listener]);
    }
  }

  removeEventListener<
    K extends
      | 'audioend'
      | 'audiostart'
      | 'end'
      | 'error'
      | 'nomatch'
      | 'result'
      | 'soundend'
      | 'soundstart'
      | 'speechend'
      | 'speechstart'
      | 'start'
  >(
    type: K,
    listener: (this: SpeechRecognition, ev: SpeechRecognitionEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void;

  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void;

  removeEventListener(type: any, listener: any, options?: any) {
    const key = (type as string).toLowerCase();
    const handlers = this.handlers.get(key);
    if (handlers !== undefined) {
      const pos = handlers.indexOf(listener);
      if (pos >= 0) handlers.splice(pos, 1);
    }
  }

  dispatchEvent(event: Event): boolean {
    const handlers = this.handlers.get(event.type.toLowerCase());
    if (handlers) {
      for (let i = 0; i < handlers.length; ++i) {
        try {
          handlers[i](event);
        } catch {}
        if (event.defaultPrevented) return false;
      }
    }

    // @ts-ignore
    const handler: any = this[`on${event.type.toLowerCase()}`];
    if (handler && !event.defaultPrevented) {
      try {
        handler(event);
      } catch {}
    }
    return true;
  }

  private null_handler(e: Event | SpeechRecognitionEvent): any {}

  private handlers: Map<string, Array<any>> = new Map();
}

if (!window.SpeechGrammarList) {
  // @ts-ignore
  window.SpeechGrammarList = window.webkitSpeechGrammarList;
}
if (!window.SpeechGrammarList) {
  class SpeechGrammarList extends Array<SpeechGrammar> {
    addFromString(string: string, weight?: number): void {}

    addFromURI(url: string, weight?: number): void {}

    item(index: number): SpeechGrammar {
      return this[index];
    }
  }
  window.SpeechGrammarList = SpeechGrammarList;
}

const enum State {
  Preparing = 0,
  Running = 1,
  Stopping = 2,
  Stopped = 3,
}
