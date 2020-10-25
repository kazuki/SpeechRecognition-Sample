"""libogg python wrapper."""
import array
from ctypes import (
    CDLL, POINTER, Structure, c_int, c_int64, c_long, c_uint8, cast)
from ctypes.util import find_library
import math
from typing import Optional

libogg = CDLL(find_library('ogg'))

c_uint8_p = POINTER(c_uint8)
c_int64_p = POINTER(c_int64)
c_int_p = POINTER(c_int)


class ogg_page(Structure):
    _fields_ = [
        ('header', c_uint8_p),
        ('header_len', c_long),
        ('body', c_uint8_p),
        ('body_len', c_long)
    ]


class ogg_packet(Structure):
    _fields_ = [
        ('packet', c_uint8_p),
        ('bytes', c_long),
        ('b_o_s', c_long),
        ('e_o_s', c_long),
        ('granulepos', c_int64),
        ('packetno', c_int64)
    ]


class ogg_stream_state(Structure):
    _fields_ = [
        ('body_data', c_uint8_p),
        ('body_storage', c_long),
        ('body_fill', c_long),
        ('body_returned', c_long),
        ('lacing_vals', c_int_p),
        ('granule_vals', c_int64_p),
        ('lacing_storage', c_long),
        ('lacing_fill', c_long),
        ('lacing_packet', c_long),
        ('lacing_returned', c_long),
        ('header', c_uint8 * 282),
        ('header_fill', c_int),
        ('e_o_s', c_int),
        ('b_o_s', c_int),
        ('serialno', c_long),
        ('pageno', c_long),
        ('packetno', c_int64),
        ('granulepos', c_int64),
    ]


ogg_stream_state_p = POINTER(ogg_stream_state)
ogg_packet_p = POINTER(ogg_packet)
ogg_page_p = POINTER(ogg_page)

libogg.ogg_stream_init.restype = c_int
libogg.ogg_stream_init.argtypes = [ogg_stream_state_p, c_int]
libogg.ogg_stream_clear.restype = c_int
libogg.ogg_stream_clear.argtypes = [ogg_stream_state_p]
libogg.ogg_stream_packetin.restype = c_int
libogg.ogg_stream_packetin.argtypes = [ogg_stream_state_p, ogg_packet_p]
libogg.ogg_stream_pageout.restype = c_int
libogg.ogg_stream_pageout.argtypes = [ogg_stream_state_p, ogg_page_p]
libogg.ogg_stream_flush.restype = c_int
libogg.ogg_stream_flush.argtypes = [ogg_stream_state_p, ogg_page_p]


class Ogg(object):
    def __init__(self, serialno: int) -> None:
        self._packetno = 0
        self._state = ogg_stream_state()
        self._packet = ogg_packet()
        self._packet_buf = array.array('B', [0] * (2**14))
        self._page = ogg_page()
        self._cache = bytearray(2**16)
        if libogg.ogg_stream_init(self._state, serialno) != 0:
            raise RuntimeError('ogg_stream_init failed')
        self._packet.packet = cast(
            self._packet_buf.buffer_info()[0], c_uint8_p)  # type: ignore

    def __del__(self) -> None:
        libogg.ogg_stream_clear(self._state)

    def packetin(self, packet: bytes, granulepos: int,
                 *, b_o_s: bool = False, e_o_s: bool = False) -> None:
        for i, b in enumerate(packet):
            self._packet_buf[i] = b
        self._packet.bytes = len(packet)
        self._packet.b_o_s = 1 if b_o_s else 0
        self._packet.e_o_s = 1 if e_o_s else 0
        self._packet.granulepos = granulepos
        self._packet.packetno = self._packetno
        self._packetno += 1
        if libogg.ogg_stream_packetin(self._state, self._packet) != 0:
            raise RuntimeError('ogg_stream_packetin failed')

    def pageout(self) -> Optional[bytes]:
        if libogg.ogg_stream_pageout(self._state, self._page) == 0:
            return None
        return self._copy_page()

    def flush(self) -> Optional[bytes]:
        if libogg.ogg_stream_flush(self._state, self._page) == 0:
            return None
        return self._copy_page()

    def _copy_page(self) -> bytes:
        total_len = self._page.header_len + self._page.body_len
        if len(self._cache) < total_len:
            self._cache = bytearray(2**math.ceil(math.log2(total_len)))
        for i in range(self._page.header_len):
            self._cache[i] = self._page.header[i]
        for i in range(self._page.body_len):
            self._cache[self._page.header_len + i] = self._page.body[i]
        return memoryview(self._cache)[0:total_len].tobytes()
