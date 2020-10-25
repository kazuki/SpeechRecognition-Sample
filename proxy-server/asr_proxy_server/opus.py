"""Ogg Opus utilities.

References:
* RFC7845 Ogg Encapsulation for the Opus Audio Codec
  https://tools.ietf.org/html/rfc7845.html
"""
import struct
from typing import Sequence

TOC_CONFIG_TABLE = [
    10, 20, 40, 60,  # SILK-only NB
    10, 20, 40, 60,  # SILK-only MB
    10, 20, 40, 60,  # SILK-only WB
    10, 20,  # Hybrid SWB
    10, 20,  # Hybrid SWB
    2.5, 5, 10, 20,  # CELT-only NB
    2.5, 5, 10, 20,  # CELT-only WB
    2.5, 5, 10, 20,  # CELT-only SWB
    2.5, 5, 10, 20,  # CELT-only FB
]


def get_opus_framesize_from_toc(toc: int) -> float:
    return TOC_CONFIG_TABLE[toc >> 3]


def opus_header_packet(
        *, n_channels: int, pre_skip: int, input_sample_rate: int,
        output_gain: int = 0) -> bytes:
    """Generate opus header packet for Ogg encapsulation

    Reference: "Identification Header", Section-5.1, RFC7845.
    """
    return (
        b'OpusHead' +  # Magic signature
        b'\x01' +  # Version
        struct.pack(
            '<BHIh', n_channels, pre_skip, input_sample_rate, output_gain) +
        b'\x00'  # Channel Mapping Family 0
    )


def opus_comment_header_packet(
        vendor: str, comments: Sequence[str] = []) -> bytes:
    """Generate opus comment header packet for Ogg encapsulation

    Reference: "Comment Header", Section-5.2, RFC7845.
    """
    vendor_utf8 = vendor.encode('utf8')
    ret = (
        b'OpusTags' + struct.pack('<I', len(vendor_utf8)) + vendor_utf8 +
        struct.pack('<I', len(comments)))
    for c in comments:
        in_utf8 = c.encode('utf8')
        ret += struct.pack('<I', len(in_utf8)) + in_utf8
    return ret
