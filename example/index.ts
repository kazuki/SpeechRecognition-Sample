import { AmiVoice } from 'asr-client';

const voice = new AmiVoice();
voice.addEventListener('start', (e) => {
  console.log('start:', e);
});
voice.onstart = (e) => {
  console.log('onstart:', e);
};
voice.start();
