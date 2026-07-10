from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import ALLOWED_ORIGINS
from app.routers import shows, venues, auth, me

app = FastAPI(title="Encore API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(shows.router)
app.include_router(venues.router)
app.include_router(auth.router)
app.include_router(me.router)


@app.get("/health")
def health():
    return {"status": "ok"}
