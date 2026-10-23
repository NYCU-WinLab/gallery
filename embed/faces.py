# Faces: find them in a photo (SCRFD) and turn each into a 512-number vector
# (ArcFace), so faces of one person land close together. Both models come
# from InsightFace's buffalo_l pack (non-commercial research use); this file
# runs them with onnxruntime directly, which keeps the image free of the
# insightface package and its build toolchain. Boxes and landmarks match
# insightface 0.7.3's FaceAnalysis.
import hashlib
import os
import shutil
import urllib.request
import zipfile

import cv2
import numpy as np
import onnxruntime as ort

PACK_URL = "https://github.com/deepinsight/insightface/releases/download/model-zoo/buffalo_l.zip"
MODELS = {
    "det_10g.onnx": "5838f7fe053675b1c7a08b633df49e7af5495cee0493c7dcf6697200b85b5b91",
    "w600k_r50.onnx": "4c06341c33c2ca1f86781dab0e829f88ad5b64be9fba56e56bc9ebdefc619e43",
}
DET_SIZE = 640
DET_THRESHOLD = 0.5
NMS_THRESHOLD = 0.4
# Where ArcFace expects the eyes, nose and mouth corners in its 112 x 112 input.
ARCFACE_POINTS = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float32,
)


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch_models(folder):
    """The two models, downloaded once (the pack is 280 MB) and checked."""
    os.makedirs(folder, exist_ok=True)
    paths = {name: os.path.join(folder, name) for name in MODELS}
    if all(os.path.exists(path) for path in paths.values()):
        return paths
    print("faces: downloading buffalo_l", flush=True)
    pack_path = os.path.join(folder, "buffalo_l.zip.part")
    # A stalled read fails instead of hanging forever.
    with urllib.request.urlopen(PACK_URL, timeout=60) as response, open(pack_path, "wb") as file:
        shutil.copyfileobj(response, file, 1 << 20)
    with zipfile.ZipFile(pack_path) as pack:
        for name, digest in MODELS.items():
            member = next(m for m in pack.namelist() if m.endswith(name))
            partial = paths[name] + ".part"
            with pack.open(member) as source, open(partial, "wb") as file:
                shutil.copyfileobj(source, file, 1 << 20)
            if sha256(partial) != digest:
                os.remove(partial)
                raise RuntimeError(f"faces: {name} does not match its checksum")
            os.replace(partial, paths[name])
    os.remove(pack_path)
    print("faces: models ready", flush=True)
    return paths


def nms(boxes, scores):
    x1, y1, x2, y2 = boxes.T
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        w = np.maximum(0.0, np.minimum(x2[i], x2[order[1:]]) - np.maximum(x1[i], x1[order[1:]]) + 1)
        h = np.maximum(0.0, np.minimum(y2[i], y2[order[1:]]) - np.maximum(y1[i], y1[order[1:]]) + 1)
        overlap = w * h / (areas[i] + areas[order[1:]] - w * h)
        order = order[np.where(overlap <= NMS_THRESHOLD)[0] + 1]
    return keep


def similarity(source, target):
    """Rotation, uniform scale and shift taking source points onto target
    (Umeyama), as a 2 x 3 matrix for cv2.warpAffine."""
    mean_s, mean_t = source.mean(0), target.mean(0)
    s, t = source - mean_s, target - mean_t
    u, d, vt = np.linalg.svd(t.T @ s / len(source))
    sign = np.eye(2)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        sign[1, 1] = -1
    rotation = u @ sign @ vt
    scale = np.trace(np.diag(d) @ sign) / s.var(0).sum()
    shift = mean_t - scale * rotation @ mean_s
    return np.hstack([scale * rotation, shift[:, None]]).astype(np.float32)


class Faces:
    def __init__(self, folder, threads):
        paths = fetch_models(folder)
        options = ort.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        providers = ["CPUExecutionProvider"]
        self.det = ort.InferenceSession(paths["det_10g.onnx"], options, providers=providers)
        self.rec = ort.InferenceSession(paths["w600k_r50.onnx"], options, providers=providers)
        self.det_outputs = [o.name for o in self.det.get_outputs()]
        self.anchors = {}

    def centers(self, stride):
        if stride not in self.anchors:
            side = DET_SIZE // stride
            grid = np.stack(np.mgrid[:side, :side][::-1], axis=-1).astype(np.float32)
            # Two anchors per cell.
            grid = (grid * stride).reshape(-1, 2)
            self.anchors[stride] = np.stack([grid] * 2, axis=1).reshape(-1, 2)
        return self.anchors[stride]

    def detect(self, bgr):
        height, width = bgr.shape[:2]
        # At least 1 pixel, so a very thin image still resizes.
        if height / width > 1:
            new_h, new_w = DET_SIZE, max(1, int(DET_SIZE * width / height))
        else:
            new_w, new_h = DET_SIZE, max(1, int(DET_SIZE * height / width))
        scale = new_h / height
        canvas = np.zeros((DET_SIZE, DET_SIZE, 3), dtype=np.uint8)
        canvas[:new_h, :new_w] = cv2.resize(bgr, (new_w, new_h))
        blob = cv2.dnn.blobFromImage(
            canvas, 1.0 / 128, (DET_SIZE, DET_SIZE), (127.5, 127.5, 127.5), swapRB=True
        )
        outputs = self.det.run(self.det_outputs, {self.det.get_inputs()[0].name: blob})
        all_scores, all_boxes, all_points = [], [], []
        for level, stride in enumerate((8, 16, 32)):
            scores = outputs[level].reshape(-1)
            distances = outputs[level + 3] * stride
            offsets = outputs[level + 6] * stride
            keep = np.where(scores >= DET_THRESHOLD)[0]
            c = self.centers(stride)
            boxes = np.stack(
                [
                    c[:, 0] - distances[:, 0],
                    c[:, 1] - distances[:, 1],
                    c[:, 0] + distances[:, 2],
                    c[:, 1] + distances[:, 3],
                ],
                axis=-1,
            )
            points = np.stack(
                [c[:, i % 2] + offsets[:, i] for i in range(10)], axis=-1
            ).reshape(-1, 5, 2)
            all_scores.append(scores[keep])
            all_boxes.append(boxes[keep])
            all_points.append(points[keep])
        scores = np.concatenate(all_scores)
        boxes = np.concatenate(all_boxes) / scale
        points = np.concatenate(all_points) / scale
        keep = nms(boxes, scores)
        return boxes[keep], points[keep], scores[keep]

    def find(self, bgr):
        """Every face: its box in pixels, detection score and unit vector."""
        boxes, points, scores = self.detect(bgr)
        if len(boxes) == 0:
            return []
        crops = [
            cv2.warpAffine(bgr, similarity(p.astype(np.float32), ARCFACE_POINTS), (112, 112), borderValue=0.0)
            for p in points
        ]
        # The model takes one face at a time.
        name = self.rec.get_inputs()[0].name
        vectors = np.concatenate(
            [
                self.rec.run(
                    None,
                    {
                        name: cv2.dnn.blobFromImage(
                            crop, 1.0 / 127.5, (112, 112), (127.5, 127.5, 127.5), swapRB=True
                        )
                    },
                )[0]
                for crop in crops
            ]
        )
        vectors /= np.linalg.norm(vectors, axis=1, keepdims=True)
        return [
            {"box": box.tolist(), "score": float(score), "vector": vector.tolist()}
            for box, score, vector in zip(boxes, scores, vectors)
        ]
