# services/cv/main.py
from fastapi import FastAPI, UploadFile, File, HTTPException
from centering import measure_centering

app = FastAPI(title="CardEdge CV Service")


@app.post("/centering")
async def analyze_centering(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")
    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:  # 20 MB max
        raise HTTPException(status_code=413, detail="Image too large")
    return measure_centering(contents)


@app.get("/health")
def health():
    return {"status": "ok"}
