function makeMask(length, seed=1) {
  const m = new Float32Array(length);
  let s = seed;
  for (let i=0;i<length;i++){
    s = (s * 1664525 + 1013904223) % 4294967296;
    m[i] = ((s & 0xffff) / 0xffff) * 4 - 2; // [-2,2]
  }
  return m;
}

export const MASKS = {
  Light: makeMask(4096, 11),
  Balanced: makeMask(4096, 22),
  Strong: makeMask(4096, 33)
};
