(() => {
  document.querySelectorAll("[data-order-video]").forEach(async (block) => {
    const api = (block.dataset.apiUrl || "").replace(/\/$/, "");
    const token = new URLSearchParams(location.search).get("token");
    const player = block.querySelector("[data-order-video-player]");
    if (!api || !token || !player) return;
    try {
      const response = await fetch(`${api}/api/customisation/${encodeURIComponent(token)}/video`);
      const payload = await response.json();
      if (!payload.ok || !payload.video?.url) return;
      player.src = payload.video.url;
      player.setAttribute("aria-label", payload.video.title || "Your Meaningful Plushie video");
      block.hidden = false;
    } catch {
      // Keep the page clean when an order does not have a video mapping yet.
    }
  });
})();
