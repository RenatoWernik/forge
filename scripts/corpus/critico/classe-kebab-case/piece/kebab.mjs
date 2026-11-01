// The kebab-case pattern that the workflows use for ids and classes.
export const isKebab = (s) => typeof s === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
