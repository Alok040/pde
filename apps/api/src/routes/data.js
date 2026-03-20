import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import { storeEncrypted, storeMedia, getByCid } from "../services/storage.js";
import { anonymize } from "../services/anonymize.js";
import { privacyReport, summarizeInsight } from "../services/ai.js";
import { canViewCid } from "../services/chain.js";
import { validateImageAgainstNudeNet, ImageValidationError } from "../services/imageValidation.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

router.post("/upload", requireAuth, async (req, res) => {
  try {
    const { category, payload } = req.body;
    const walletAddress = req.user?.sub;
    if (!walletAddress || !category || !payload) {
      return res.status(400).json({ error: "category, payload required" });
    }
    const report = privacyReport(category, payload);
    const anonymized = await anonymize(category, payload);
    const cid = await storeEncrypted(walletAddress, category, anonymized);
    const summary = summarizeInsight(category, anonymized);
    res.json({ cid, category, summary, privacy: report.pii });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/upload-media", requireAuth, upload.single("file"), async (req, res) => {
  try {
    const { category } = req.body;
    const walletAddress = req.user?.sub;
    if (!walletAddress || !category) {
      return res.status(400).json({ error: "category required" });
    }
    if (!req.file) {
      return res.status(400).json({ error: "file required" });
    }
    if (!/^image\/|^video\//.test(req.file.mimetype)) {
      return res.status(400).json({ error: "Only image/* and video/* are supported" });
    }

    // For images, run NudeNet + pHash dedup *before* storing media.
    const isImage = req.file.mimetype?.startsWith("image/");
    let phash = undefined;
    if (isImage) {
      try {
        const validation = await validateImageAgainstNudeNet(req.file);
        if (validation.verdict === "nsfw") {
          return res.status(422).json({ error: "NSFW content rejected" });
        }
        if (validation.verdict === "duplicate") {
          return res.status(409).json({ error: "Duplicate image rejected" });
        }
        if (validation.verdict === "safe") phash = validation.phash;
      } catch (e) {
        if (e instanceof ImageValidationError) {
          return res.status(e.statusCode || 400).json({ error: e.message });
        }
        return res.status(502).json({ error: "Image validation service error" });
      }
    }

    const cid = await storeMedia(walletAddress, category, req.file, { phash });
    res.json({
      cid,
      category,
      mime: req.file.mimetype,
      originalName: req.file.originalname,
      size: req.file.size,
      phash,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/media/:cid", requireAuth, async (req, res) => {
  try {
    const requesterAddress = req.user?.sub;
    const requestId = req.query.requestId;
    const record = await getByCid(req.params.cid);
    if (!record) return res.status(404).json({ error: "Not found" });
    if (!record.data || record.data.kind !== "media") return res.status(400).json({ error: "CID is not media" });

    // Owner can view their own media without a requestId.
    if (record.owner !== requesterAddress?.toLowerCase()) {
      const ok = await canViewCid({ requesterAddress, requestId, cid: req.params.cid });
      if (!ok.ok) return res.status(403).json({ error: "Forbidden", reason: ok.reason });
    }

    res.json({
      cid: req.params.cid,
      mime: record.data.mime,
      originalName: record.data.originalName,
      size: record.data.size,
      base64: record.data.base64,
      phash: record.data.phash,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/vault/:address", requireAuth, async (req, res) => {
  try {
    if (req.user?.sub?.toLowerCase() !== req.params.address.toLowerCase()) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const list = await getByCid.listByOwner(req.params.address);
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export { router as dataRouter };
