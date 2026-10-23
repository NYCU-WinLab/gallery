# The gallery's embedding service: EmbeddingGemma 2 (text and image, no
# audio) on CPU, one request at a time. Python because sentence-transformers
# is the only library that runs this model's vision encoder today. It also
# finds faces (faces.py).
#
# POST /embed {"kind": "query" | "document", "items": [{"text": ...} | {"image_b64": ...}]}
#   -> {"vectors": [[768 floats], ...]}
# POST /faces {"image_b64": ...}
#   -> {"width": px, "height": px, "faces": [{"box": [x1, y1, x2, y2], "score": 0-1, "vector": [512 floats]}]}
# GET / -> {"ok": true} once EmbeddingGemma is loaded; "faces" says whether
#   the face models are too.
import base64
import io
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import torch
from PIL import Image, ImageOps
from sentence_transformers import SentenceTransformer

from faces import Faces

MODEL = "google/embeddinggemma-2"
REVISION = "914f7f89142e33e77833254d9c9b90c3cef7303b"
# The model card's prompts: queries and untitled documents.
QUERY = "task: search result | query: "
DOCUMENT = "title: none | text: "
# Bigger images cost more vision tokens for no gain on a photo wall.
MAX_SIDE = 896

THREADS = int(os.environ.get("EMBED_THREADS", "2"))
torch.set_num_threads(THREADS)
model = SentenceTransformer(
    MODEL,
    revision=REVISION,
    device="cpu",
    # float16 overflows in this model; bfloat16 is slow on most CPUs.
    model_kwargs={"dtype": torch.float32},
    config_kwargs={"audio_config": None},
)
# Searches must not wait behind a photo: on a CPU without AVX one image
# takes over 30 seconds. Text and images queue separately and may run at
# once (inference only reads the weights).
text_lock = threading.Lock()
image_lock = threading.Lock()
face_lock = threading.Lock()
faces = None


def load_faces():
    """In the background, so a slow first download of the face models never
    holds up search. Retries every minute until it works."""
    global faces
    folder = os.path.join(os.environ.get("HF_HOME", "/models"), "faces")
    while faces is None:
        try:
            faces = Faces(folder, THREADS)
        except Exception as error:  # noqa: BLE001 - logged, then retried
            print(f"faces: {error}", flush=True)
            time.sleep(60)


threading.Thread(target=load_faces, daemon=True).start()


def encode(kind, items):
    vectors = []
    for item in items:
        if "image_b64" in item:
            image = Image.open(io.BytesIO(base64.b64decode(item["image_b64"])))
            image = image.convert("RGB")
            image.thumbnail((MAX_SIDE, MAX_SIDE))
            source, lock = {"image": image}, image_lock
        else:
            source = (QUERY if kind == "query" else DOCUMENT) + item["text"]
            lock = text_lock
        with lock, torch.inference_mode():
            vector = model.encode(
                source, prompt="", normalize_embeddings=True, show_progress_bar=False
            )
        vectors.append([round(float(x), 6) for x in vector])
    return vectors


def find_faces(image_b64):
    if faces is None:
        raise RuntimeError("face models are still loading")
    image = Image.open(io.BytesIO(base64.b64decode(image_b64)))
    image = ImageOps.exif_transpose(image).convert("RGB")
    # The models take blue, green, red.
    bgr = np.ascontiguousarray(np.asarray(image)[:, :, ::-1])
    with face_lock:
        found = faces.find(bgr)
    for face in found:
        face["box"] = [round(x, 1) for x in face["box"]]
        face["score"] = round(face["score"], 4)
        face["vector"] = [round(x, 6) for x in face["vector"]]
    return {"width": image.width, "height": image.height, "faces": found}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.reply(200, {"ok": True, "model": MODEL, "revision": REVISION, "faces": faces is not None})

    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            if self.path == "/faces":
                self.reply(200, find_faces(body["image_b64"]))
            else:
                self.reply(200, {"vectors": encode(body.get("kind", "document"), body["items"])})
        except Exception as error:  # noqa: BLE001 - every failure goes back as JSON
            self.reply(500, {"error": str(error)})

    def reply(self, code, payload):
        data = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


print("ready", flush=True)
ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
