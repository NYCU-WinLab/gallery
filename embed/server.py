# The gallery's embedding service: EmbeddingGemma 2 (text and image, no
# audio) on CPU, one request at a time. Python because sentence-transformers
# is the only library that runs this model's vision encoder today.
#
# POST /embed {"kind": "query" | "document", "items": [{"text": ...} | {"image_b64": ...}]}
#   -> {"vectors": [[768 floats], ...]}
# GET / -> {"ok": true} once the model is loaded.
import base64
import io
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import torch
from PIL import Image
from sentence_transformers import SentenceTransformer

MODEL = "google/embeddinggemma-2"
REVISION = "914f7f89142e33e77833254d9c9b90c3cef7303b"
# The model card's prompts: queries and untitled documents.
QUERY = "task: search result | query: "
DOCUMENT = "title: none | text: "
# Bigger images cost more vision tokens for no gain on a photo wall.
MAX_SIDE = 896

torch.set_num_threads(int(os.environ.get("EMBED_THREADS", "2")))
model = SentenceTransformer(
    MODEL,
    revision=REVISION,
    device="cpu",
    # float16 overflows in this model; bfloat16 is slow on most CPUs.
    model_kwargs={"dtype": torch.float32},
    config_kwargs={"audio_config": None},
)
lock = threading.Lock()


def encode(kind, items):
    vectors = []
    with lock:
        for item in items:
            if "image_b64" in item:
                image = Image.open(io.BytesIO(base64.b64decode(item["image_b64"])))
                image = image.convert("RGB")
                image.thumbnail((MAX_SIDE, MAX_SIDE))
                source = {"image": image}
            else:
                source = (QUERY if kind == "query" else DOCUMENT) + item["text"]
            vector = model.encode(
                source, prompt="", normalize_embeddings=True, show_progress_bar=False
            )
            vectors.append([round(float(x), 6) for x in vector])
    return vectors


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.reply(200, {"ok": True, "model": MODEL, "revision": REVISION})

    def do_POST(self):
        try:
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
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
