// critKey of gauntlet-build.js (#51): C01, c1 and C001 are the criterion C1.
export const critKey = (c) => { const s = String(c).trim().toUpperCase(), m = /^C0*(\d+)$/.exec(s); return m ? 'C' + m[1] : s; };
