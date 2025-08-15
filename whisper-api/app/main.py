from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from faster_whisper import WhisperModel
import os

app = FastAPI()
print("⚡ Inicializando modelo Whisper...")
model = WhisperModel("base", compute_type="int8")
print("✅ Modelo carregado com sucesso.")

class TranscriptionRequest(BaseModel):
    file: str
    language: str = "pt"
    include_timestamps: bool = False  # Parâmetro opcional

@app.post("/transcribe")
async def transcribe(req: TranscriptionRequest):
    print(f"⚡ Recebendo requisição: {req.file}")
    path = req.file

    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    segments, _ = model.transcribe(path, language=req.language)

    if req.include_timestamps:
        # Retorna lista de objetos com texto e tempos
        transcription = [
            {
                "start": segment.start,
                "end": segment.end,
                "text": segment.text.strip()
            }
            for segment in segments
        ]
    else:
        # Apenas o texto contínuo
        transcription = "".join(segment.text for segment in segments)

    return {"transcription": transcription}