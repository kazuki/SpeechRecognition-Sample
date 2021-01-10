import { SpeechRecognitionBase } from './SpeechRecognitionBase';

export class AmiVoice extends SpeechRecognitionBase {
  // WebSocket I/F Spec: https://acp.amivoice.com/main/manual/i-f%e4%bb%95%e6%a7%98websocket%e9%9f%b3%e5%a3%b0%e8%aa%8d%e8%ad%98api%e6%a6%82%e8%a6%81/
  // AudioFormat: https://acp.amivoice.com/main/manual/%E9%9F%B3%E5%A3%B0%E3%83%95%E3%82%A9%E3%83%BC%E3%83%9E%E3%83%83%E3%83%88%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6/
  // Mono 16kHz, OggOpus, PCM(raw or RIFF),

  protected getEngineConfig(): any { // eslint-disable-line
    return {
      lang: this.lang,
      continuous: this.continuous,
      max_alternatives: this.maxAlternatives,
      interim_results: this.interimResults,
    };
  }
}
