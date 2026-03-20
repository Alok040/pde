// Mock IPFS/Filecoin storage for hackathon. Replace with actual IPFS (Pinata, web3.storage) for production.
const store = new Map(); // cid -> { owner, category, data, createdAt }
const ownerIndex = new Map(); // owner -> [cid, ...]

export async function storeEncrypted(owner, category, data) {
  const cid = `ipfs://${Buffer.from(`${owner}-${category}-${Date.now()}`).toString("base64url").slice(0, 46)}`;
  const entry = { owner: owner.toLowerCase(), category, data, createdAt: new Date().toISOString() };
  store.set(cid, entry);
  const list = ownerIndex.get(owner.toLowerCase()) || [];
  list.push(cid);
  ownerIndex.set(owner.toLowerCase(), list);
  return cid;
}

export async function getByCid(cid) {
  return store.get(cid) || null;
}

getByCid.listByOwner = async (address) => {
  const cids = ownerIndex.get(address.toLowerCase()) || [];
  return cids.map((cid) => ({ cid, ...store.get(cid) }));
};

export async function storeMedia(owner, category, file, { phash } = {}) {
  const cid = `ipfs://${Buffer.from(`${owner}-${category}-${Date.now()}-${file.originalname}`).toString("base64url").slice(0, 46)}`;
  const entry = {
    owner: owner.toLowerCase(),
    category,
    data: {
      kind: "media",
      mime: file.mimetype,
      originalName: file.originalname,
      size: file.size,
      base64: file.buffer.toString("base64"),
      phash,
    },
    createdAt: new Date().toISOString(),
  };

  store.set(cid, entry);
  const list = ownerIndex.get(owner.toLowerCase()) || [];
  list.push(cid);
  ownerIndex.set(owner.toLowerCase(), list);
  return cid;
}
