// bad-words 3.0.4 ships no types (Zach added it Oct 23 for the Ask chat's hidden words)
declare module "bad-words" {
  export default class Filter {
    constructor(options?: { list?: string[]; exclude?: string[]; placeHolder?: string; emptyList?: boolean });
    isProfane(text: string): boolean;
    clean(text: string): string;
    addWords(...words: string[]): void;
    removeWords(...words: string[]): void;
  }
}
