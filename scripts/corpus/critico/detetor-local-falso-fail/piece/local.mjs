// Simplified from the LOCAL detector of check.cjs at the base of #41: the base name of a file that looks like a stored contract.
const NAME = /^(?:\d+|[A-Z]\d{2,}|issues?|contracts?)$/i;
export const isLocalContract = (path) => NAME.test(path.split('/').pop().replace(/\.[^.]+$/, ''));
