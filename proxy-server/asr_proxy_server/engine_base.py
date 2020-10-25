"""ASR Engine base class definitions."""
from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Union


@dataclass
class SpeechRecognitionConfig:
    lang: str
    continuous: bool
    interim_results: bool
    max_alternatives: int
    engine: Dict[str, Any]

    @staticmethod
    def parse(cfg: Dict[str, Any]) -> 'SpeechRecognitionConfig':
        return SpeechRecognitionConfig(
            lang=cfg.pop('lang', 'en-US'),
            continuous=cfg.pop('continuous', False),
            interim_results=cfg.pop('interim_results', False),
            max_alternatives=cfg.pop('max_alternatives', 1),
            engine=cfg,
        )


@dataclass
class SpeechRecognitionAlternative:
    transcript: str
    confidence: float


@dataclass
class SpeechRecognitionResult:
    alternatives: List[SpeechRecognitionAlternative]
    is_final: bool

    def to_dict(self) -> Dict[str, Any]:
        def remove_none(o):
            for k in [k for k, v in o.items() if v is None]:
                o.pop(k)
            return o
        obj = remove_none(asdict(self))
        for alt in obj['alternatives']:
            remove_none(alt)
        return obj


SpeechRecognitionResultList = List[SpeechRecognitionResult]


class SpeechRecognitionErrorCode(str, Enum):
    NoSpeech = 'no-speech'
    Aborted = 'aborted'
    AudioCapture = 'audio-capture'
    Network = 'network'
    NotAllowed = 'not-allowed'
    ServiceNotAllowed = 'service-not-allowed'
    BadGrammar = 'bad-grammar'
    LanguageNotSupported = 'language-not-supported'


@dataclass
class SpeechRecognitionError(Exception):
    error: SpeechRecognitionErrorCode
    message: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        ret = asdict(self)
        ret['type'] = 'error'
        return ret


class SpeechRecognitionDone:
    def to_dict(self) -> Dict[str, Any]:
        return {'type': 'done'}


class Engine(ABC):
    @abstractmethod
    async def init(self, config: SpeechRecognitionConfig) -> None:
        pass

    @abstractmethod
    async def write_ogg_opus_page(self, page: bytes) -> None:
        pass

    @abstractmethod
    async def get_result(self) -> Union[
            SpeechRecognitionResultList, SpeechRecognitionDone]:
        pass

    @abstractmethod
    async def done(self) -> None:
        pass

    @abstractmethod
    async def close(self) -> None:
        pass
