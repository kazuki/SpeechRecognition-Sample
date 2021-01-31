import { SpeechRecognitionBase } from './SpeechRecognitionBase';

export class GoogleSpeechToText extends SpeechRecognitionBase {
  enableAutomaticPunctuation = true;
  singleUtterance = false;

  protected getEngineConfig(): any { // eslint-disable-line
    return {
      lang: this.lang,
      continuous: this.continuous,
      max_alternatives: this.maxAlternatives,
      enable_automatic_punctuation: this.enableAutomaticPunctuation,
      single_utterance: this.singleUtterance,
      interim_results: this.interimResults,
    };
  }
}
