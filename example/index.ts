import { GoogleSpeechToText } from 'asr-client';

let engine: GoogleSpeechToText | undefined;
const button = document.getElementById('button') as HTMLButtonElement;
const textarea = document.getElementById('output') as HTMLTextAreaElement;

button.addEventListener('click', () => {
  if (button.innerText === 'Start') {
    button.innerText = 'Stop';
    engine = new GoogleSpeechToText();
    engine.continuous = true;
    engine.interimResults = true;
    engine.lang = 'ja-JP';
    engine.onstart = (e) => console.log('start:', e);
    engine.onend = (e) => console.log('end:', e);
    engine.onaudiostart = (e) => console.log('audiostart:', e);
    engine.onaudioend = (e) => console.log('audioend:', e);
    engine.onsoundstart = (e) => console.log('soundstart:', e);
    engine.onsoundend = (e) => console.log('soundend:', e);
    engine.onspeechstart = (e) => console.log('speechstart:', e);
    engine.onspeechend = (e) => console.log('speechend:', e);
    engine.onresult = (e) => {
      let s = '';
      const { results } = e;
      (results as any).forEach((x: any) => {
        s += `${x['alternatives'][0]['transcript']}\n`;
      });
      textarea.value = s;
    };
    engine.start();
  } else {
    if (engine) engine.stop();
    engine = undefined;
    button.innerText = 'Start';
  }
});
