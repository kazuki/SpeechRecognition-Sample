import array
from ctypes import (
    CDLL, cast, POINTER, c_int, c_uint8, c_int16, c_int32, c_void_p)
from typing import Sequence

try:
    libopus = CDLL('libopus.so')
except OSError:
    libopus = CDLL('libopus.so.0')

c_uint8_p = POINTER(c_uint8)
c_int16_p = POINTER(c_int16)
c_int_p = POINTER(c_int)
libopus.opus_decoder_get_size.restype = c_int
libopus.opus_decoder_get_size.argtypes = [c_int]
libopus.opus_decoder_init.restype = c_int
libopus.opus_decoder_init.argtypes = [c_void_p, c_int32, c_int]
libopus.opus_decode.restype = c_int
libopus.opus_decode.argtypes = [
    c_void_p, c_uint8_p, c_int, c_int16_p, c_int, c_int]


class OpusDecoder(object):
    def __init__(self, fs: int, ch: int) -> None:
        self._fs, self._ch = fs, ch
        self._max_frame_size = int(fs * 0.120)
        self._pcm = array.array('h', [0] * (self._max_frame_size * ch))
        self._pcm_ref = cast(
            self._pcm.buffer_info()[0], c_int16_p)  # type: ignore
        self._handle_obj = array.array(
            'B', [0] * libopus.opus_decoder_get_size(ch))
        self._handle = cast(
            self._handle_obj.buffer_info()[0], c_void_p)  # type: ignore
        err = libopus.opus_decoder_init(self._handle, fs, ch)
        if err != 0:
            raise RuntimeError('Failed: decoder_create({})'.format(err))

    def decode(self, packet: bytes) -> Sequence[float]:
        packet_ptr = cast(packet, c_uint8_p)  # type: ignore
        samples = libopus.opus_decode(
            self._handle, packet_ptr, len(packet), self._pcm_ref,
            self._max_frame_size, 0)
        return self._pcm[0:samples]
