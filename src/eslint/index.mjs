import { noComments } from "./no-comments.mjs";

export { noComments };

export const plugin = { meta: { name: "dev-kit" }, rules: { "no-comments": noComments } };

export default plugin;
