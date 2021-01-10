import { SpeechRecognitionBase } from './SpeechRecognitionBase';

export class GoogleSpeechToText extends SpeechRecognitionBase {
  protected getEngineConfig(): any { // eslint-disable-line
    return {
      lang: this.lang,
      continuous: this.continuous,
      max_alternatives: this.maxAlternatives,
      enable_automatic_punctuation: true,
      single_utterance: false,
      interim_results: this.interimResults,
    };
  }
}
