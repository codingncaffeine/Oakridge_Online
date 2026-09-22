// Sounds are imported for their URL: the build emits each one as a file of its own (see build.mjs).
declare module "*.mp3" {
  const url: string;
  export default url;
}
