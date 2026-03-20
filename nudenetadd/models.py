from database import db
class ImageData(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    hash = db.Column(db.String(20), unique=True)
    status = db.Column(db.String(20))