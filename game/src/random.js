// Deterministic randomness for Veyra.
//
// mulberry32: small, fast, and repeatable — the same seed always rebuilds
// the same city, the same traffic and the same mission rolls.
export function createRng(seed) {
  let state = seed >>> 0;

  function next() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    // Float in [0, 1).
    next,

    // Float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },

    // Integer in [min, max], both ends inclusive.
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },

    // One random element of the array.
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },

    // True with probability p.
    chance(p) {
      return next() < p;
    },

    // Fisher-Yates on a copy; the input array is never mutated.
    shuffle(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },
  };
}

// FNV-1a hash of a string, returned as a stable unsigned 32-bit seed.
// Useful for seeding an RNG from a name, e.g. hashSeed('Veyra').
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
