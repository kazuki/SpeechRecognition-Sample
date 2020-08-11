export class SpeechRecognitionBase implements SpeechRecognition {
  continuous: boolean = false;
  grammars: SpeechGrammarList = new SpeechGrammarList();
  interimResults: boolean = false;
  lang: string = navigator.language;
  maxAlternatives: number = 1;

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
    this.wasm_module = WebAssembly.compileStreaming(fetch('opus.wasm'));
    this.wasm_module.then(x => {
      console.log(x);
    });
  }

  start(): void {
    if (this.state !== State.Stopped)
      throw new Error('start() must be after end event');
    this.state = State.Preparing;

    const context = new AudioContext({
      sampleRate: 48000,
    });
    this.cleanup_functions.push(() => context.close());
    const device_constraints = {
      audio: {
        channelCount: 1,
        sampleRate: 48000,
        noiseSuppression: false,
        autoGainControl: true,
        echoCancellation: false,
      },
      video: false,
    };
    const worklet_module = context.audioWorklet.addModule('vad-encoder.worklet.js');
    const track_promise = navigator.mediaDevices.getUserMedia(device_constraints).then(stream => {
      const tracks = stream.getAudioTracks();
      if (tracks.length !== 1)
        throw new Error('Not found audio track');
      if (this.state === State.Stopping) {
        tracks[0].stop();
        throw new Error('already stopped');
      }
      this.cleanup_functions.push(() => tracks[0].stop());
      return [stream, tracks[0]] as [MediaStream, MediaStreamTrack];
    });

    Promise.all([
      this.wasm_module, worklet_module, track_promise,
    ]).then(([
      wasm_module, _, [stream, track],
    ]) => {
      const src_node =
        context.createMediaStreamTrackSource ?
        context.createMediaStreamTrackSource(track) :
        context.createMediaStreamSource(stream);
      const worklet_node = new AudioWorkletNode(context, 'vad-encoder', {
        processorOptions: {
          sampleRate: context.sampleRate,
          module: wasm_module,
        }
      });
      worklet_node.port.onmessage = (m) => {
        const opus_vad = m.data.opus_vad as number;
        if (opus_vad > 0.5)
          console.log(opus_vad.toPrecision(3));
      };
      src_node.connect(worklet_node);
      window.setTimeout(() => {
        this.stop();
      }, 1000);
      context.resume();
      this.state = State.Running;
    });
  }
  stop(): void {
    if (this.state === State.Preparing)
      throw new Error('not implemented');
    if (this.state !== State.Running)
      throw new Error('recognition not running');
    this.state = State.Stopping;
    this.cleanup_functions.forEach(f => {
      try {
        f();
      } catch {}
    });
    this.cleanup_functions.splice(0, this.cleanup_functions.length);
  }
  abort(): void {
    throw new Error("Method not implemented.");
  }
  
  addEventListener<K extends "audioend" | "audiostart" | "end" | "error" | "nomatch" | "result" | "soundend" | "soundstart" | "speechend" | "speechstart" | "start">(type: K, listener: (this: SpeechRecognition, ev: SpeechRecognitionEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
  addEventListener(type: any, listener: any, options?: any) {
    const key = (type as string).toLowerCase();
    const handlers = this.handlers.get(key);
    if (handlers !== undefined) {
      handlers.push(listener);
    } else {
      this.handlers.set(key, [listener]);
    }
  }
  removeEventListener<K extends "audioend" | "audiostart" | "end" | "error" | "nomatch" | "result" | "soundend" | "soundstart" | "speechend" | "speechstart" | "start">(type: K, listener: (this: SpeechRecognition, ev: SpeechRecognitionEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
  removeEventListener(type: any, listener: any, options?: any) {
    const key = (type as string).toLowerCase();
    const handlers = this.handlers.get(key);
    if (handlers !== undefined) {
      const pos = handlers.indexOf(listener);
      if (pos >= 0)
        handlers.splice(pos, 1);
    }
  }
  dispatchEvent(event: Event): boolean {
    const handlers = this.handlers.get(event.type.toLowerCase());
    if (handlers) {
      for (let i = 0; i < handlers.length; ++i) {
        try {
          handlers[i](event);
        } catch {}
        if (event.defaultPrevented)
          return false;
      }
    }

    // @ts-ignore
    const handler: any = this['on' + event.type.toLowerCase()];
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
    addFromString(string: string, weight?: number): void {
    }
    addFromURI(url: string, weight?: number): void {
    }
    item(index: number): SpeechGrammar {
      return this[index];
    }
  }
  window.SpeechGrammarList = SpeechGrammarList;
}

enum State {
  Preparing = 0,
  Running = 1,
  Stopping = 2,
  Stopped = 3,
}
