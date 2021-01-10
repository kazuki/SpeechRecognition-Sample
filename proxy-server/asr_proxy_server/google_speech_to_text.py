from asyncio import Queue
from dataclasses import dataclass
from typing import Any, AsyncIterator, Dict, Optional, Sequence, Tuple, Union

from asr_proxy_server.engine_base import (
    Engine, SpeechRecognitionAlternative, SpeechRecognitionConfig,
    SpeechRecognitionDone)
from asr_proxy_server.engine_base import SpeechRecognitionResultList
from asr_proxy_server.engine_base import \
    SpeechRecognitionResult as SpeechRecognitionResultBase


@dataclass
class SpeechRecognitionResult(SpeechRecognitionResultBase):
    stability: float


class GoogleSpeechToTextV1(Engine):
    def __init__(self) -> None:
        import google.cloud.speech_v1 as V1  # type: ignore
        self._V = V1
        self._streaming_config_keys = [
            ('single_utterance', None),
            ('interim_results', None),
        ]
        self._recognition_config_keys = [
            ('language_code', None),
            ('max_alternatives', None),
            ('profanity_filter', False),
            ('enable_word_time_offsets', False),
            ('enable_automatic_punctuation', False),
            ('model', None),
            ('use_enhanced', None),
        ]
        self._queue: Queue[Optional[V1.StreamingRecognizeRequest]] = Queue()
        self._client: Optional[V1.services.speech.SpeechAsyncClient] = None
        self._stream: Optional[Any] = None
        self._resp_iter: Optional[AsyncIterator[Any]] = None
        self._done_flag = False

    def _parse_config(self, keys: Sequence[Tuple[str, Any]],
                      config: Dict[str, Any]) -> Dict[str, Any]:
        ret = {}
        for key, default_value in keys:
            v = config.get(key, default_value)
            if v is not None:
                ret[key] = v
        return ret

    async def init(self, config: SpeechRecognitionConfig) -> None:
        self._client = self._V.services.speech.SpeechAsyncClient()
        types = self._V.types
        streaming_config = {
            'single_utterance': not config.continuous,
            'interim_results': config.interim_results,
        }
        recognition_config = {
            'language_code': config.lang,
            'max_alternatives': config.max_alternatives,
        }
        streaming_config.update(self._parse_config(
            self._streaming_config_keys, config.engine))
        recognition_config.update(self._parse_config(
            self._recognition_config_keys, config.engine))
        recognition_config.update(dict(
            encoding=types.RecognitionConfig.AudioEncoding.OGG_OPUS,
            sample_rate_hertz=48000,
        ))
        self._queue.put_nowait(types.StreamingRecognizeRequest(
            streaming_config=types.StreamingRecognitionConfig(
                config=types.RecognitionConfig(**recognition_config),
                **streaming_config)))

        async def queue_to_iter() -> AsyncIterator[Any]:
            while True:
                q = await self._queue.get()
                if q is None:
                    return
                yield q
        self._stream = await self._client.streaming_recognize(queue_to_iter())
        self._resp_iter = self._stream.__aiter__()

    async def write_ogg_opus_page(self, data: bytes) -> None:
        if self._done_flag:
            return
        self._queue.put_nowait(
            self._V.types.StreamingRecognizeRequest(audio_content=data))

    async def done(self) -> None:
        if self._done_flag:
            return
        self._done_flag = True
        self._queue.put_nowait(None)

    async def get_result(self) -> Union[
            SpeechRecognitionResultList, SpeechRecognitionDone]:
        if self._resp_iter is None:
            raise Exception()
        try:
            resp = await self._resp_iter.__anext__()
        except StopAsyncIteration:
            return SpeechRecognitionDone()

        ret: SpeechRecognitionResultList = []
        for srr in resp.results:
            alternatives = [SpeechRecognitionAlternative(
                transcript=alt.transcript, confidence=alt.confidence,
            ) for alt in srr.alternatives]
            tmp = SpeechRecognitionResult(
                alternatives=alternatives, is_final=srr.is_final,
                stability=srr.stability)
            ret.append(tmp)
        return ret

    async def close(self) -> None:
        if not (self._client and hasattr(self._client, '_client')
                and hasattr(self._client._client, '_transport')):
            return
        ch = self._client._client._transport.grpc_channel
        await ch.close()


class GoogleSpeechToTextV1p1beta1(GoogleSpeechToTextV1):
    def __init__(self) -> None:
        import google.cloud.speech_v1p1beta1 as V  # type: ignore
        super().__init__()
        self._V = V
        # self._streaming_config_keys is same as V1
        self._recognition_config_keys += [
            ('enable_word_confidence', False),
        ]
