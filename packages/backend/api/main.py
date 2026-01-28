from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "backend is running"}

@app.get("/health")
async def health():
    return {"ok": True}
