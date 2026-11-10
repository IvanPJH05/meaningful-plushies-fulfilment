export const platforms = {
  tiktok: { name: "TikTok", limit: 2200, access: "Manual publishing" },
  instagram: { name: "Instagram Reels", limit: 2200, access: "Meta authorization required" },
  facebook: { name: "Facebook Reels", limit: 2200, access: "Meta authorization required" },
  youtube: { name: "YouTube Shorts", limit: 5000, access: "Google authorization required" },
  rednote: { name: "REDnote", limit: null, access: "Manual publishing" },
};

export function parseCsv(source) {
  const text = source.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else if (quoted || !field) quoted = !quoted;
      else field += char;
    } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      row.push(field); field = "";
      if (char !== ",") {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === "\r" && text[index + 1] === "\n") index++;
      }
    } else field += char;
  }
  if (quoted) throw new Error("A CSV field has an unclosed quote.");
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

export function malaysiaUtc(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return "";
  const timestamp = Date.parse(`${date}T${time}:00+08:00`);
  if (!Number.isFinite(timestamp) || new Date(timestamp + 28800000).toISOString().slice(0, 16) !== `${date}T${time}`) return "";
  return new Date(timestamp).toISOString();
}

export function matchCaptions(rows, posts) {
  const [header, ...entries] = rows;
  const names = header?.map(value => String(value).trim().toLowerCase()) || [];
  const index = names.indexOf("filename");
  if (index < 0) throw new Error("The first row needs a Filename column.");
  const normalize = value => String(value ?? "").trim().toLowerCase();
  const counts = new Map();
  for (const row of entries) {
    const key = normalize(row[index]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return entries.map((row, offset) => {
    const filename = String(row[index] ?? "").trim();
    const key = normalize(filename);
    const candidates = posts.filter(post => !post.archived && normalize(post.name) === key);
    const message = !key ? "Missing filename" : counts.get(key) > 1 ? "Duplicate filename in import" :
      candidates.length > 1 ? "Multiple videos share this filename" : !candidates.length ? "Video not uploaded" : "";
    const values = Object.fromEntries(names.map((name, col) => [name, String(row[col] ?? "")]));
    return { row: offset + 2, filename, message, id: candidates[0]?.id, values };
  });
}

export function planTargets(post, date, time, now = Date.now()) {
  const utc = malaysiaUtc(date, time);
  if (!utc || Date.parse(utc) <= now) throw new Error("Choose a future publishing time in Malaysia time.");
  if (!post.platforms.length) throw new Error("Select at least one platform.");
  return post.platforms.map(platform => {
    const caption = post.captions[platform] || post.caption;
    const limit = platforms[platform].limit;
    if (limit !== null && caption.length > limit) throw new Error(`${platforms[platform].name} caption exceeds the preview limit.`);
    return { id: `${post.id}:${platform}`, platform, caption, utc, status: "planned" };
  });
}

export function bulkDay(start, offset) {
  const time = Date.parse(`${start}T12:00:00Z`);
  return Number.isFinite(time) ? new Date(time + offset * 86400000).toISOString().slice(0, 10) : "";
}
