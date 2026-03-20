"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { ArrowLeft, Upload, FileJson, FolderUp, X, Image as ImageIcon, Video } from "lucide-react";
import { useApiAuth } from "@/lib/useApiAuth";
import { withAuthHeaders } from "@/lib/apiAuth";
import { useToast } from "@/app/toast";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const CATEGORIES = ["HEALTH", "SHOPPING", "FITNESS", "LOCATION", "SOCIAL"];
const ACCEPT = ".json,.csv,.txt,application/json,text/csv,text/plain";
const ACCEPT_MEDIA = "image/*,video/*";

function parseCSV(text: string): { rows: Record<string, string>[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = values[i] ?? ""));
    return obj;
  });
  return { rows };
}

export default function VaultPage() {
  const { address, isConnected } = useAccount();
  const { token, ensureAuth, authenticating, authError } = useApiAuth();
  const toast = useToast();
  const [category, setCategory] = useState("FITNESS");
  const [payload, setPayload] = useState('{"activityLevel":"moderate","weeklySessions":3}');
  const [uploaded, setUploaded] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingVault, setLoadingVault] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"structured" | "media">("structured");

  useEffect(() => {
    if (!mediaFile) {
      setMediaPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(mediaFile);
    setMediaPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [mediaFile]);

  async function refreshVault() {
    if (!address) return;
    const t = token ?? (await ensureAuth());
    if (!t) return;
    setLoadingVault(true);
    try {
      const res = await fetch(`${API}/api/data/vault/${address}`, {
        headers: withAuthHeaders(t),
      });
      const data = await res.json();
      if (Array.isArray(data)) setUploaded(data.reverse());
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingVault(false);
    }
  }

  useEffect(() => {
    if (address) void refreshVault();
  }, [address]);

  function parseFile(content: string, name: string): object {
    const ext = name.split(".").pop()?.toLowerCase();
    if (ext === "json") return JSON.parse(content);
    if (ext === "csv") return parseCSV(content);
    return { text: content };
  }

  function onFile(file: File) {
    const name = file.name;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result as string;
        const parsed = parseFile(text, name);
        setPayload(JSON.stringify(parsed, null, 2));
        setFileName(name);
      } catch (e) {
        console.error(e);
        setPayload(JSON.stringify({ text: (reader.result as string).slice(0, 5000) }));
        setFileName(name);
      }
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file && /\.(json|csv|txt)$/i.test(file.name)) onFile(file);
  }

  function handleBrowse() {
    fileInputRef.current?.click();
  }

  async function handleUpload() {
    if (!address) return;
    const t = token ?? (await ensureAuth());
    if (!t) return;
    setLoading(true);
    try {
      const payloadObj = JSON.parse(payload);
      const res = await fetch(`${API}/api/data/upload`, {
        method: "POST",
        headers: withAuthHeaders(t, { "Content-Type": "application/json" }),
        body: JSON.stringify({
          category,
          payload: payloadObj,
        }),
      });
      const data = await res.json();
      if (data.cid) {
        toast.push({
          kind: "success",
          title: "Stored securely",
          message: data?.summary?.headline || `CID: ${String(data.cid).slice(0, 24)}...`,
        });
        await refreshVault();
        setFileName(null);
      } else {
        toast.push({ kind: "error", title: "Upload failed", message: data?.error || "No CID returned" });
      }
    } catch (e) {
      console.error(e);
      toast.push({ kind: "error", title: "Upload failed", message: "Check API is running and you are signed in." });
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadMedia() {
    if (!address || !mediaFile) return;
    const t = token ?? (await ensureAuth());
    if (!t) return;
    setLoading(true);
    try {
      const form = new FormData();
      form.append("category", category);
      form.append("file", mediaFile);

      const res = await fetch(`${API}/api/data/upload-media`, {
        method: "POST",
        headers: withAuthHeaders(t),
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const status = res.status;
        const message = data?.error || (status === 409 ? "Duplicate image rejected" : status === 422 ? "NSFW content rejected" : "Upload rejected");
        const title = status === 409 ? "Duplicate image" : status === 422 ? "NSFW content" : "Upload rejected";
        toast.push({ kind: "error", title, message });
        return;
      }
      if (data.cid) {
        toast.push({
          kind: "success",
          title: "Media stored",
          message: `CID: ${String(data.cid).slice(0, 24)}...`,
        });
        setMediaFile(null);
        await refreshVault();
      } else {
        toast.push({ kind: "error", title: "Upload failed", message: data?.error || "No CID returned" });
      }
    } catch (e) {
      console.error(e);
      toast.push({ kind: "error", title: "Upload failed", message: "Check API is running and you are signed in." });
    } finally {
      setLoading(false);
    }
  }

  const mediaKind = useMemo(() => {
    if (!mediaFile) return null;
    if (mediaFile.type.startsWith("image/")) return "image";
    if (mediaFile.type.startsWith("video/")) return "video";
    return "unknown";
  }, [mediaFile]);

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Connect wallet first.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/dashboard" className="text-slate-600 hover:text-slate-900 flex items-center gap-1 font-medium transition">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-6 text-slate-800 animate-fade-in-up">Data Vault</h1>
        <p className="text-slate-600 mb-8">
          Data is encrypted and stored in a decentralized way. AI will anonymize it before any company sees it.
        </p>
        {(authenticating || authError) && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
            {authenticating ? "Signing you in to the API…" : `API auth error: ${authError}`}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 mb-8 shadow-sm hover-lift transition-shadow">
          <h2 className="font-semibold mb-4 flex items-center gap-2 text-slate-800">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center">
              <Upload className="w-4 h-4 text-white" />
            </span>
            Upload data
          </h2>

          <div className="flex flex-wrap gap-2 mb-6">
            <button
              type="button"
              onClick={() => setMode("structured")}
              className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                mode === "structured" ? "bg-cyan-500 text-white shadow shadow-cyan-500/30" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              JSON / CSV / TXT
            </button>
            <button
              type="button"
              onClick={() => setMode("media")}
              className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                mode === "media" ? "bg-cyan-500 text-white shadow shadow-cyan-500/30" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Images / Videos
            </button>
          </div>

          {/* Upload from computer / drive */}
          {mode === "structured" ? (
            <div className="mb-6">
              <label className="block text-sm text-slate-600 mb-2">From your computer</label>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                className="hidden"
                aria-label="Choose file from computer"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = "";
                }}
              />
              <div
                role="button"
                tabIndex={0}
                aria-label="Upload file: drag and drop or click to browse"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={handleBrowse}
                onKeyDown={(e) => e.key === "Enter" && handleBrowse()}
                className={`
                  border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
                  ${dragActive ? "border-cyan-500 bg-cyan-50" : "border-slate-300 hover:border-cyan-400 hover:bg-slate-50"}
                `}
              >
                <FolderUp className="w-10 h-10 mx-auto text-slate-400 mb-2" />
                <p className="text-slate-600 text-sm">{dragActive ? "Drop file here" : "Drag & drop a file here, or click to browse"}</p>
                <p className="text-slate-500 text-xs mt-1">JSON, CSV or TXT (max 5MB)</p>
              </div>
              {fileName && (
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-cyan-600 truncate font-medium">Added: {fileName}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFileName(null);
                    }}
                    className="text-slate-500 hover:text-slate-800 p-0.5 transition"
                    aria-label="Clear file"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="mb-6">
              <label className="block text-sm text-slate-600 mb-2">Choose an image or video</label>
              <input
                ref={mediaInputRef}
                type="file"
                accept={ACCEPT_MEDIA}
                className="hidden"
                aria-label="Choose image or video"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setMediaFile(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => mediaInputRef.current?.click()}
                className="w-full rounded-xl border-2 border-dashed border-slate-300 hover:border-cyan-400 bg-slate-50 hover:bg-white p-6 transition text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-white" />
                  </span>
                  <div>
                    <p className="text-slate-700 font-medium">Click to select media</p>
                    <p className="text-slate-500 text-sm">Supports images and videos (max 15MB)</p>
                  </div>
                </div>
              </button>

              {mediaFile && (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{mediaFile.name}</p>
                      <p className="text-xs text-slate-500">{mediaFile.type} • {(mediaFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMediaFile(null)}
                      className="text-slate-500 hover:text-slate-800 p-1"
                      aria-label="Remove media"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {mediaPreviewUrl && mediaKind === "image" && (
                    <img src={mediaPreviewUrl} alt="Selected upload preview" className="mt-3 w-full max-h-72 object-contain rounded-xl border border-slate-100" />
                  )}
                  {mediaPreviewUrl && mediaKind === "video" && (
                    <video src={mediaPreviewUrl} controls className="mt-3 w-full max-h-72 rounded-xl border border-slate-100" />
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-slate-800 focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition"
                aria-label="Data category"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            {mode === "structured" ? (
              <div>
                <label className="block text-sm text-slate-600 mb-1">Data (edit if needed)</label>
                <textarea
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  rows={6}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-slate-800 font-mono text-sm focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition"
                  placeholder="Paste JSON or upload a file above"
                />
              </div>
            ) : (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm text-slate-700 flex items-start gap-3">
                <span className="mt-0.5 text-cyan-600">
                  <Video className="w-5 h-5" />
                </span>
                <div>
                  <p className="font-medium">Media uploads</p>
                  <p className="text-slate-600 text-sm">
                    Images/videos are stored in your vault and referenced by CID. You can later use the CID to fulfill a marketplace request on-chain.
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={mode === "structured" ? handleUpload : handleUploadMedia}
              disabled={loading || (mode === "media" && !mediaFile)}
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-teal-600 text-white px-5 py-2.5 font-medium shadow-lg shadow-cyan-500/25 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all"
            >
              {loading ? "Uploading…" : mode === "structured" ? "Encrypt & Store" : "Store media"}
            </button>
          </div>
        </div>

        {uploaded.length > 0 && (
          <div className="animate-fade-in-up">
            <h2 className="font-semibold mb-3 text-slate-800">Stored items</h2>
            {loadingVault && <p className="text-sm text-slate-500 mb-2">Refreshing vault…</p>}
            <ul className="space-y-2">
              {uploaded.map((item) => (
                <li
                  key={item.cid}
                  className="flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-2.5 text-sm shadow-sm"
                >
                  {item?.data?.kind === "media" ? (
                    item.data.mime?.startsWith("image/") ? (
                      <ImageIcon className="w-4 h-4 text-cyan-500" />
                    ) : (
                      <Video className="w-4 h-4 text-cyan-500" />
                    )
                  ) : (
                    <FileJson className="w-4 h-4 text-cyan-500" />
                  )}
                  <span className="text-slate-600 truncate flex-1">{item.cid}</span>
                  <span className="text-cyan-600 font-medium">{item.category}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
