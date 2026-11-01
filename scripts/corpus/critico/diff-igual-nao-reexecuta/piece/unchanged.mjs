// The test of gauntlet-build.js (#51) that decides whether the diff is the one of the previous round.
const HASH = /^[0-9a-f]{64}$/;
export const unchanged = (prev, cur) => HASH.test(cur) && HASH.test(prev) && cur === prev;
