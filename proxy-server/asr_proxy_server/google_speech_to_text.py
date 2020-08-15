from dataclasses import dataclass
from typing import Any, Dict, Tuple, Sequence, List

from google.api_core import grpc_helpers_async  # type: ignore

from asr_proxy_server.engine_base import (
    Engine, EOF, SpeechRecognitionResult as SpeechRecognitionResultBase,
    SpeechRecognitionResultList, SpeechRecognitionAlternative)


@dataclass
class SpeechRecognitionResult(SpeechRecognitionResultBase):
    stability: float


class GoogleSpeechToTextV1(Engine):
    def __init__(self) -> None:
        import google.cloud.speech_v1 as V1  # type: ignore
        self._V = V1
        self._streaming_config_keys = [
            ('single_utterance', True),
            ('interim_results', False),
        ]
        self._recognition_config_keys = [
            ('language_code', 'ja-JP'),
            ('max_alternatives', 1),
            ('profanity_filter', False),
            ('enable_word_time_offsets', False),
            ('enable_automatic_punctuation', False),
            ('model', None),
            ('use_enhanced', None),
        ]
        self._finals: List[SpeechRecognitionResult] = []

    def _parse_config(self, keys: Sequence[Tuple[str, Any]],
                      config: Dict[str, Any]) -> Dict[str, Any]:
        ret = {}
        for key, default_value in keys:
            v = config.get(key, default_value)
            if v is not None:
                ret[key] = v
        return ret

    async def init(self, config: Dict[str, Any]) -> None:
        types = self._V.types
        SpeechGrpcTransport = (
            self._V.gapic.transports.speech_grpc_transport.SpeechGrpcTransport)

        streaming_config = self._parse_config(
            self._streaming_config_keys, config)
        recognition_config = self._parse_config(
            self._recognition_config_keys, config)
        recognition_config.update(dict(
            encoding=self._V.enums.RecognitionConfig.AudioEncoding.OGG_OPUS,
            sample_rate_hertz=48000,
        ))

        req = types.StreamingRecognizeRequest(
            streaming_config=types.StreamingRecognitionConfig(
                config=types.RecognitionConfig(**recognition_config),
                **streaming_config))
        self._ch = grpc_helpers_async.create_channel(
            self._V.SpeechClient.SERVICE_ADDRESS, credentials=None,
            scopes=SpeechGrpcTransport._OAUTH_SCOPES)
        transport = SpeechGrpcTransport(channel=self._ch)
        self._stream = transport.streaming_recognize()
        await self._ch.channel_ready()
        await self._stream.write(req)

    async def write_ogg_opus_page(self, data: bytes) -> None:
        await self._stream.write(
            self._V.types.StreamingRecognizeRequest(audio_content=data))

    async def done(self) -> None:
        await self._stream.done_writing()

    async def get_result(self) -> SpeechRecognitionResultList:
        resp = await self._stream.read()
        if 'EOF' in str(type(resp)):
            raise EOF()
        ret: SpeechRecognitionResultList = list(self._finals)
        for srr in resp.results:
            alternatives = [SpeechRecognitionAlternative(
                transcript=alt.transcript, confidence=alt.confidence,
            ) for alt in srr.alternatives]
            tmp = SpeechRecognitionResult(
                alternatives=alternatives, is_final=srr.is_final,
                stability=srr.stability)
            ret.append(tmp)
            if tmp.is_final:
                self._finals.append(tmp)
        return ret

    async def close(self) -> None:
        ch = getattr(self, '_ch', None)
        if ch:
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
