# SpeechRecognition Samples

This library is [SpeechRecognition API (Web Speech API)](https://developer.mozilla.org/docs/Web/API/SpeechRecognition) compatible implementation for various cloud-based speech recognition engines.

I plan to support the following real-time speech recognition engines.

* [Google Speech-to-Text](https://cloud.google.com/speech-to-text) (implemented)
* [AmiVoice Cloud Platform](https://acp.amivoice.com/main/)
* [Microsoft Azure Speech to Text](https://azure.microsoft.com/ja-jp/services/cognitive-services/speech-to-text/)

## Using APIs / Libraries

* [MediaDevices.getUserMedia](https://developer.mozilla.org/docs/Web/API/MediaDevices/getUserMedia): To capture audio from a microphone
* [WebAudio API](https://developer.mozilla.org/docs/Web/API/Web_Audio_API), [AudioWorklet](https://developer.mozilla.org/docs/Web/API/AudioWorklet): To process VAD(Voice activity detection) and encoding in other thread
* [WebAssembly](https://developer.mozilla.org/docs/WebAssembly): To use libopus in web browser
* [Opus](https://www.opus-codec.org/): Low-latency, high quality, royalty-free audio codec
* [SpeexDSP](https://github.com/xiph/speexdsp): Resampler
* [WebSocket](https://developer.mozilla.org/docs/Web/API/WebSockets_API): To communicate in realtine between client and server
* [FastAPI](https://fastapi.tiangolo.com/): Server-side Python async web framework

## Features

* Using [Google python-speech](https://github.com/googleapis/python-speech) with gRPC AsyncIO API
* Flushing Ogg pages every Opus packet for low latency (but more overheads for size)
* Using opus's integrated VAD implementation (with patch to export VAD probability)
* WebAssembly executes in AudioWorklet

## License

WebAssembly file and opus patch file is under [The 3-Clause BSD License](https://opensource.org/licenses/BSD-3-Clause).

All others is under the [AGPL](https://opensource.org/licenses/AGPL-3.0). If you want to other license, please contact me.
