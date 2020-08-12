from datetime import datetime
import uuid
import wave

from fastapi import FastAPI, WebSocket
from starlette.websockets import WebSocketDisconnect

from asr_proxy_server.opus import OpusDecoder

app = FastAPI()


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    print('[WEBSOCKET] accepted')
    decoder = OpusDecoder(48000, 1)
    with wave.open('/tmp/' + str(uuid.uuid4()) + '.wav', mode='wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(48000)
        while True:
            try:
                packet = await ws.receive_bytes()
            except WebSocketDisconnect:
                return
            print('{}: {}'.format(datetime.now().isoformat(), len(packet)))
            samples = decoder.decode(packet)
            f.writeframesraw(samples)
    await ws.close()
