// ABSOLUTE of the contract block of gauntlet-build.js (#36): Unicode letter boundaries.
export const hasAbsolute = (text) => /(?<![\p{L}\p{N}_])(?:never|always|any|all|every|nunca|sempre|qualquer|todos|todas|nenhum|nenhuma)(?![\p{L}\p{N}_])/iu.test(text);
