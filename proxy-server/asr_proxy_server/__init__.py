import json
from typing import Any

from fastapi import FastAPI, WebSocket

from asr_proxy_server.asr_endpoint import asr_endpoint
from asr_proxy_server.engine_base import (
    SpeechRecognitionDone, SpeechRecognitionError)

app = FastAPI()


@app.websocket('/ws')
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    try:
        init_msg = await ws.receive_json()
        async for resp in asr_endpoint(init_msg, ws.receive_bytes):
            if isinstance(resp, SpeechRecognitionDone):
                await ws.send_text(_json_dumps(resp.to_dict()))
            elif isinstance(resp, SpeechRecognitionError):
                await ws.send_text(_json_dumps(resp.to_dict()))
            else:
                await ws.send_text(_json_dumps([r.to_dict() for r in resp]))
    finally:
        await ws.close()


def _json_dumps(o: Any) -> str:
    return json.dumps(
        o, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
