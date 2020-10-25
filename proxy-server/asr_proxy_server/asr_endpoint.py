"""ASR EndPoint"""
import asyncio
from asyncio import Task
import random
from typing import (
    Any, AsyncIterator, Awaitable, Callable, Dict, List, Optional, Set, Union)

# from asr_proxy_server.dummy_engine import DummyEngine as GoogleSpeechToTextV1
from asr_proxy_server.engine_base import (
    Engine, SpeechRecognitionConfig, SpeechRecognitionDone,
    SpeechRecognitionError, SpeechRecognitionResultList)
from asr_proxy_server.google_speech_to_text import GoogleSpeechToTextV1
from asr_proxy_server.libogg import Ogg
from asr_proxy_server.opus import (
    get_opus_framesize_from_toc, opus_comment_header_packet,
    opus_header_packet)


async def asr_endpoint(
        header: Dict[str, Any],
        receive_bytes: Callable[[], Awaitable[bytes]],
) -> AsyncIterator[Union[SpeechRecognitionResultList, SpeechRecognitionDone,
                         SpeechRecognitionError]]:
    # build ogg opus headers
    header_pages: List[bytes] = []
    granulepos = header['pre_skip']
    ogg = Ogg(random.randint(-2**31, 2**31-1))
    ogg.packetin(opus_header_packet(
        n_channels=1, pre_skip=granulepos, input_sample_rate=48000
    ), 0, b_o_s=True)
    header_pages.append(ogg.flush())  # type: ignore
    ogg.packetin(opus_comment_header_packet(
        header['version'] + ', WebAssembly'), 0)
    header_pages.append(ogg.flush())  # type: ignore

    # instantiate recognition engine
    engine: Engine = {
        'google-v1': GoogleSpeechToTextV1,
    }[header.get('engine', 'google-v1')]()
    await engine.init(SpeechRecognitionConfig.parse(
        header.get('engine-config', {})))

    print('[ASR:WebSocket] Initialized:', header)

    async def _process_opus_packet(packet: bytes) -> None:
        nonlocal header_pages, granulepos
        if header_pages:
            for hpage in header_pages:
                await engine.write_ogg_opus_page(hpage)
            header_pages.clear()
        granulepos += (
            get_opus_framesize_from_toc(packet[0]) * 48000 // 1000)
        ogg.packetin(packet, granulepos)
        while True:
            page = ogg.flush()
            if not page:
                break
            await engine.write_ogg_opus_page(page)

    try:
        ws_recv_task: Task = asyncio.create_task(receive_bytes())
        engine_recv_task: Optional[Task] = None
        tasks: Set[Task] = {ws_recv_task}

        while True:
            done, pending = await asyncio.wait(
                tasks, return_when=asyncio.FIRST_COMPLETED)
            tasks = pending  # type: ignore
            if ws_recv_task in done:
                try:
                    packet = ws_recv_task.result()
                except Exception:
                    packet = None
                if packet:
                    await _process_opus_packet(packet)
                    ws_recv_task = asyncio.create_task(receive_bytes())
                    tasks.add(ws_recv_task)
                else:
                    await engine.done()
            if engine_recv_task in done:
                try:
                    resp = engine_recv_task.result()
                except SpeechRecognitionError as e:
                    yield e
                    return
                yield resp
                if isinstance(resp, SpeechRecognitionDone):
                    return
                engine_recv_task = None
            if engine_recv_task is None:
                engine_recv_task = asyncio.create_task(engine.get_result())
                tasks.add(engine_recv_task)
    finally:
        await engine.close()
