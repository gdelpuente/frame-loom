function features(image, rect, scale, threshold) {
  const width = Math.ceil(rect.w / scale), height = Math.ceil(rect.h / scale);
  const data = new Uint8Array(width * height * 2);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let alpha = 0, light = 0, count = 0;
    for (let yy = y * scale; yy < Math.min((y + 1) * scale, rect.h); yy++) {
      for (let xx = x * scale; xx < Math.min((x + 1) * scale, rect.w); xx++) {
        const i = ((rect.y + yy) * image.width + rect.x + xx) * 4;
        const a = image.data[i + 3] >= threshold ? image.data[i + 3] : 0;
        alpha += a;
        light += (image.data[i] * 77 + image.data[i + 1] * 150 + image.data[i + 2] * 29) * a / (256 * 255);
        count++;
      }
    }
    const i = (y * width + x) * 2;
    data[i] = Math.round(alpha / count);
    data[i + 1] = Math.round(light / count);
  }
  return { width, height, data };
}

function difference(ref, frame, dx, dy) {
  let cost = 0;
  const left = Math.min(0, dx), top = Math.min(0, dy);
  const right = Math.max(ref.width, dx + frame.width), bottom = Math.max(ref.height, dy + frame.height);
  for (let y = top; y < bottom; y++) {
    const ry = y >= 0 && y < ref.height, fy = y >= dy && y < dy + frame.height;
    for (let x = left; x < right; x++) {
      const ri = ry && x >= 0 && x < ref.width ? (y * ref.width + x) * 2 : -1;
      const fi = fy && x >= dx && x < dx + frame.width ? ((y - dy) * frame.width + x - dx) * 2 : -1;
      const a = (ri < 0 ? 0 : ref.data[ri]) - (fi < 0 ? 0 : frame.data[fi]);
      const l = (ri < 0 ? 0 : ref.data[ri + 1]) - (fi < 0 ? 0 : frame.data[fi + 1]);
      cost += Math.min(Math.abs(a), 80) + Math.min(Math.abs(l), 80);
    }
  }
  return cost;
}

export function matchTranslation(image, reference, frame, axis, threshold, cache) {
  const maxX = Math.min(64, Math.max(8, Math.floor(Math.max(reference.w, frame.w) / 8)));
  const maxY = axis === 'x' ? 0 : Math.min(64, Math.max(8, Math.floor(Math.max(reference.h, frame.h) / 8)));
  let bestX = 0, bestY = 0;
  for (const scale of [8, 2, 1]) {
    if (!cache.has(scale)) cache.set(scale, features(image, reference, scale, threshold));
    const ref = cache.get(scale), candidate = features(image, frame, scale, threshold);
    const limitX = Math.floor(maxX / scale), limitY = Math.floor(maxY / scale);
    const centerX = Math.round(bestX / scale), centerY = Math.round(bestY / scale);
    const radius = scale === 8 ? Math.max(limitX, limitY) : scale === 2 ? 4 : 2;
    let bestCost = Infinity, chosenX = 0, chosenY = 0;
    for (let y = Math.max(-limitY, centerY - radius); y <= Math.min(limitY, centerY + radius); y++) {
      for (let x = Math.max(-limitX, centerX - radius); x <= Math.min(limitX, centerX + radius); x++) {
        const cost = difference(ref, candidate, x, y);
        if (cost < bestCost || (cost === bestCost && x * x + y * y < chosenX * chosenX + chosenY * chosenY)) {
          bestCost = cost; chosenX = x; chosenY = y;
        }
      }
    }
    bestX = chosenX * scale; bestY = chosenY * scale;
  }
  return { x: bestX, y: bestY };
}
