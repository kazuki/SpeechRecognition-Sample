from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
import json
from typing import Any, Dict, List


class EOF(Exception):
    pass


@dataclass
class SpeechRecognitionAlternative:
    transcript: str
    confidence: float


@dataclass
class SpeechRecognitionResult:
    alternatives: List[SpeechRecognitionAlternative]
    is_final: bool


SpeechRecognitionResultList = List[SpeechRecognitionResult]


class Engine(ABC):
    @abstractmethod
    async def init(self, config: Dict[str, Any]) -> None:
        pass

    @abstractmethod
    async def write_ogg_opus_page(self, page: bytes) -> None:
        pass

    @abstractmethod
    async def get_result(self) -> SpeechRecognitionResultList:
        pass

    async def get_result_json(self) -> str:
        def remove_none(o):
            for k in [k for k, v in o.items() if v is None]:
                o.pop(k)
            return o
        obj = [remove_none(asdict(x)) for x in await self.get_result()]
        for x in obj:
            for y in x['alternatives']:
                remove_none(y)
        return json.dumps(
            obj, ensure_ascii=False, separators=(',', ':'), allow_nan=False)

    @abstractmethod
    async def done(self) -> None:
        pass

    @abstractmethod
    async def close(self) -> None:
        pass
