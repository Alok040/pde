import os
import tempfile
from flask import Flask, request, jsonify
from PIL import Image
import imagehash
from nudenet import NudeDetector
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)

# DB config
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///./images.db'
db = SQLAlchemy(app)

# AI model
detector = NudeDetector()

# Thresholds (override via env vars)
NSFW_CONFIDENCE = float(os.getenv("NUDENET_NSWF_CONFIDENCE", "0.7"))
DEFAULT_DUPLICATE_DISTANCE = int(os.getenv("NUDENET_DUPLICATE_DISTANCE", "5"))

# DB Table
class ImageData(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    hash = db.Column(db.String(20), unique=True)
    status = db.Column(db.String(20))

# Create DB
with app.app_context():
    db.create_all()

@app.route("/")
def home():
    return "Server is working 🚀"

def is_nsfw(result):
    for item in result:
        if item["confidence"] > NSFW_CONFIDENCE:
            return True
    return False

@app.after_request
def add_cors_headers(response):
    """
    Optional CORS for browser testing.
    (Node->Flask server-to-server does not require CORS, but this makes direct calls easier.)
    """
    origin = os.getenv("NUDENET_CORS_ORIGIN", "*")
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    return response

@app.route("/check", methods=["POST", "OPTIONS"])
def check_image():
    if request.method == "OPTIONS":
        return ("", 204)

    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    file = request.files["image"]

    if file.filename == "":
        return jsonify({"error": "Empty file"}), 400

    # Unique temp file to avoid cross-request collisions
    original_ext = os.path.splitext(file.filename)[1].lower()
    if not original_ext or len(original_ext) > 6:
        original_ext = ".img"

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=original_ext, delete=False) as tmp:
            tmp_path = tmp.name
            file.save(tmp_path)

        # NSFW check (NudeDetector expects a file path)
        result = detector.detect(tmp_path)
        if is_nsfw(result):
            return jsonify({"status": "nsfw"})

        # Hashing
        img = Image.open(tmp_path)
        new_hash = imagehash.phash(img)

        # Duplicate check
        duplicate_distance = int(os.getenv("NUDENET_DUPLICATE_DISTANCE", str(DEFAULT_DUPLICATE_DISTANCE)))
        stored_hashes = ImageData.query.with_entities(ImageData.hash).all()

        for row in stored_hashes:
            stored_hash = imagehash.hex_to_hash(row[0])
            if new_hash - stored_hash <= duplicate_distance:
                # Return computed hash so caller can store/diagnose consistently
                return jsonify({"status": "duplicate", "hash": str(new_hash)})

        # Store in DB
        new_entry = ImageData(hash=str(new_hash), status="safe")
        db.session.add(new_entry)
        db.session.commit()

        return jsonify({"status": "safe", "hash": str(new_hash)})
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

if __name__ == "__main__":
    app.run(debug=True)