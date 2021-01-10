function NullHandler(): void {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type THandler = (ev: any) => void;

export abstract class SpeechRecognitionEventBase implements SpeechRecognition {
  private handlers: Map<string, THandler[]> = new Map();

  continuous = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  grammars = window.SpeechGrammarList ? new window.SpeechGrammarList() : (undefined as any);
  interimResults = false;
  lang: string = navigator.language;
  maxAlternatives = 1;
  onaudioend: (this: SpeechRecognition, ev: Event) => void = NullHandler;
  onaudiostart: (this: SpeechRecognition, ev: Event) => void = NullHandler;
  onend: (this: SpeechRecognition, ev: Event) => void = NullHandler;
  onerror: (this: SpeechRecognition, ev: Event) => void = NullHandler;
  onnomatch: (this: SpeechRecognition, ev: SpeechRecognitionEvent) => void = NullHandler;
  onresult: (this: SpeechRecognition, ev: SpeechRecognitionEvent) => void = NullHandler;
  onsoundend: (this: SpeechRecognition, ev: Event) => void = NullHandler;
  onsoundstart: (this: SpeechRecognition, ev: Event) => void = NullHandler;
  onspeechend: (this: SpeechRecognition, ev: Event) => void = NullHandler;
  onspeechstart: (this: SpeechRecognition, ev: Event) => void = NullHandler;
  onstart: (this: SpeechRecognition, ev: Event) => void = NullHandler;

  abstract stop(): void;
  abstract start(): void;
  abstract abort(): void;

  addEventListener<K extends keyof SpeechRecognitionEventMap>(
    type: K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (this: SpeechRecognition, ev: SpeechRecognitionEventMap[K]) => any
  ): void {
    const handlers = this.handlers.get(type);
    if (handlers !== undefined) {
      handlers.push(listener);
    } else {
      this.handlers.set(type, [listener]);
    }
  }

  removeEventListener<K extends keyof SpeechRecognitionEventMap>(
    type: K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (this: SpeechRecognition, ev: SpeechRecognitionEventMap[K]) => any
  ): void {
    const handlers = this.handlers.get(type);
    if (handlers !== undefined) {
      const pos = handlers.indexOf(listener);
      if (pos >= 0) handlers.splice(pos, 1);
    }
  }

  dispatchEvent(event: Event): boolean {
    const handlers = this.handlers.get(event.type.toLowerCase());
    if (handlers) {
      for (let i = 0; i < handlers.length; i += 1) {
        try {
          handlers[i](event);
        } catch {
          /* void */
        }
        if (event.defaultPrevented) return false;
      }
    }

    // @ts-ignore
    const handler = this[`on${event.type.toLowerCase()}`];
    if (handler && !event.defaultPrevented) {
      try {
        handler(event);
      } catch {
        /* void */
      }
    }
    return true;
  }
}
