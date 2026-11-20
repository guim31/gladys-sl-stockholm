// -----------------------------------------------------------------------------
// A failed action or scene action: Gladys shows in red what a handler throws
// (and in green what it returns). The message is the four-language object.
// -----------------------------------------------------------------------------

export class ActionFailure extends Error {
  /** @param {{ en: string, fr: string, de: string, es: string }} text */
  constructor(text) {
    super(text.en);
    this.message = text;
  }
}
