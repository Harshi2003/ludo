# Dataset sources and notices

Reviewed on 2026-10-24. No dataset package, complete repository, bulk dataset, runtime API call, or new dependency is included. Only the 50 curated local question objects in `prompts.ts` are bundled.

## Used: itsbrunodev/party-game-sentences

- Repository: https://github.com/itsbrunodev/party-game-sentences
- License inspected: https://github.com/itsbrunodev/party-game-sentences/blob/master/LICENSE
- License: MIT, Copyright (c) 2023 brunolepis.
- Truth/Dare raw format inspected: one JSON object with `truth` and `dare` arrays of strings (`src/json/truth-or-dare.json`).
- NHIE raw format inspected: JSON array of sentence fragments; this mode adds the “Never have I ever” prefix (`src/json/never-have-i-ever.json`).
- WYR raw format inspected: JSON array of two-element string arrays (`src/json/would-you-rather.json`).
- Files inspected on the repository's master branch through GitHub's file/raw views. This is a dated source review, not a claim that a particular commit was pinned.
- Used: 10 Truth, 10 adapted Dare, 10 prefixed NHIE, and 10 adapted WYR entries. Each local entry records its source file and zero-based source array locator. Most Likely To consists of 10 locally authored questions from the previous mode, not third-party material.
- Editorial filtering was manual, not an automatic import. Excluded forced eating/drinking, stunts, blindfold tasks, stranger contact, private-message disclosure, unwanted touching, explicit sexual content, offensive impersonation, and repetitive variants. Selected dares were shortened, made specific, and adapted for a seated/local setting where appropriate. Participation can always be skipped.

### MIT License

Copyright (c) 2023 brunolepis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Reviewed, not used: rjgrl/truth-or-dare-bot

https://github.com/rjgrl/truth-or-dare-bot

The README declares MIT and documents category JSON entries with numeric `id`, `question`, `category`, `rating` (PG/PG13/R/NSFW), and `enabled` fields. The original category files and standalone license text could not be fetched through the available source tools. No questions or code from this repository are copied; its README declaration is not treated as a verified full license notice for redistribution.

## Reviewed, not used: jonasknobloch/nhie

https://github.com/jonasknobloch/nhie

GitHub identifies the repository as MIT. The README documents the v2 API response as `{ ID, statement, category }`, with `harmless`, `delicate`, and `offensive` category filters and a `statement_id` history parameter. The original dataset and full license file could not be fetched through the available source tools. No material or live API dependency from this repository is included. Its API example is not represented as an inspected bulk dataset.
