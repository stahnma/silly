# Assets

## `orly/animals/`

The 40 animal pictures (`1.png` to `40.png`) come from Charles Berlin's [O-RLY-Book-Generator](https://github.com/charleshberlin/O-RLY-Book-Generator), the generator behind the original O RLY covers. That project is MIT-licensed; its licence is in `orly/animals/LICENSE.txt`.

## `fonts/`

Free stand-ins for the original generator's commercial fonts:

| File                                      | Replaces                              | Licence                                          |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------ |
| `EBGaramond.ttf`, `EBGaramond-Italic.ttf` | Garamond Light, Garamond Light Italic | SIL Open Font License 1.1 (`EBGaramond-OFL.txt`) |
| `Arimo.ttf`                               | Helvetica Neue Medium, Helvetica Bold | SIL Open Font License 1.1 (`Arimo-OFL.txt`)      |

Both come from [google/fonts](https://github.com/google/fonts).

## `mustache/`

`face_detection_yunet_2026may.onnx` is YuNet from the [OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet), by Shiqi Yu et al. It's MIT-licensed; the licence is in `mustache/YUNET-LICENSE.txt`. The mustaches themselves are vector paths in `src/mustaches.js`.

## `rrif/`

`template.jpg` is the blank "Really? Right in front of my" template from [imgflip](https://imgflip.com/memegenerator/471686459/Really-right-in-front-of-my), with the held object erased. The character is from [Flork of Cows](https://knowyourmeme.com/memes/really-right-in-front-of-my-x) (Flork), and the meme's original picture is believed to come from Filipino Telegram communities in 2021. It isn't under a licence: it's used as a meme template, as it is all over the internet. If you run your own silly and that's a problem for you, leave out `rrif` in `src/server.js`.

## `site/fonts/`

The website's fonts, for the Neobrutalism design system from [Open Design](https://github.com/feimacode/open-design-agent-kit) (MIT):

| File                   | Font                                                                                                    | Licence                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `ArchivoBlack-*.woff2` | [Archivo Black](https://github.com/Omnibus-Type/ArchivoBlack), standing in for the system's Arial Black | SIL Open Font License 1.1 (`ArchivoBlack-OFL.txt`) |
| `Inter-*.woff2`        | [Inter](https://github.com/rsms/inter)                                                                  | SIL Open Font License 1.1 (`Inter-OFL.txt`)        |

Latin and Latin Extended subsets, from Google Fonts.

## `site/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`

The site icon: silly's own classic curly mustache (`src/mustaches.js`) on a vermilion tile, in the Neobrutalism style. Made by `node scripts/make-favicon.js`; run it again if the mustaches change.
