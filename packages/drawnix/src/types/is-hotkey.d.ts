declare module 'is-hotkey' {
  export type Hotkey = string | string[];
  export interface Options {
    byKey?: boolean;
  }
  export function isHotkey(hotkey: Hotkey, options?: Options): (event: KeyboardEvent) => boolean;
  export default isHotkey;
}