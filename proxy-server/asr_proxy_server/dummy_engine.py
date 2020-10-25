from asyncio import Queue
from typing import Union

from asr_proxy_server.engine_base import (
    Engine, SpeechRecognitionAlternative, SpeechRecognitionConfig,
    SpeechRecognitionDone, SpeechRecognitionError, SpeechRecognitionResult,
    SpeechRecognitionResultList)


class DummyEngine(Engine):
    def __init__(self) -> None:
        self._n_pages = 0
        self._queue: Queue[Union[
            SpeechRecognitionResultList, SpeechRecognitionDone,
            SpeechRecognitionError]] = Queue()

    async def init(self, config: SpeechRecognitionConfig) -> None:
        print('[INIT]', config)

    async def write_ogg_opus_page(self, data: bytes) -> None:
        self._n_pages += 1
        if self._n_pages % 30:
            self._queue.put_nowait([SpeechRecognitionResult(
                is_final=False,
                alternatives=[SpeechRecognitionAlternative(
                    transcript='あ' * (self._n_pages // 30),
                    confidence=0.98)])])

    async def done(self) -> None:
        print('[DONE]')
        self._queue.put_nowait([SpeechRecognitionResult(
            is_final=True,
            alternatives=[SpeechRecognitionAlternative(
                transcript='あ' * (self._n_pages // 30),
                confidence=0.98)])])

    async def get_result(self) -> Union[
            SpeechRecognitionResultList, SpeechRecognitionDone]:
        ret = await self._queue.get()
        if isinstance(ret, SpeechRecognitionError):
            raise ret
        return ret

    async def close(self) -> None:
        print('[CLOSE]')
