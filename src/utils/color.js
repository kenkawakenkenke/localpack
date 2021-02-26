export const SANE = "\u001B[0m";

export const HIGH_INTENSITY = "\u001B[1m";
export const LOW_INTENSITY = "\u001B[2m";

export const ITALIC = "\u001B[3m";
export const UNDERLINE = "\u001B[4m";
export const BLINK = "\u001B[5m";
export const RAPID_BLINK = "\u001B[6m";
export const REVERSE_VIDEO = "\u001B[7m";
export const INVISIBLE_TEXT = "\u001B[8m";

export const BLACK = "\u001B[30m";
export const RED = "\u001B[31m";
export const GREEN = "\u001B[32m";
export const YELLOW = "\u001B[33m";
export const BLUE = "\u001B[34m";
export const MAGENTA = "\u001B[35m";
export const CYAN = "\u001B[36m";
export const WHITE = "\u001B[37m";

export const BACKGROUND_BLACK = "\u001B[40m";
export const BACKGROUND_RED = "\u001B[41m";
export const BACKGROUND_GREEN = "\u001B[42m";
export const BACKGROUND_YELLOW = "\u001B[43m";
export const BACKGROUND_BLUE = "\u001B[44m";
export const BACKGROUND_MAGENTA = "\u001B[45m";
export const BACKGROUND_CYAN = "\u001B[46m";
export const BACKGROUND_WHITE = "\u001B[47m";

export const color = (c, str) => c + str + SANE;

export const black = (str) => color(BLACK, str);
export const red = (str) => color(RED, str);
export const green = (str) => color(GREEN, str);
export const yellow = (str) => color(YELLOW, str);
export const blue = (str) => color(BLUE, str);
export const magenta = (str) => color(MAGENTA, str);
export const cyan = (str) => color(CYAN, str);
export const white = (str) => color(WHITE, str);

export const blackBackground = (str) => color(BACKGROUND_BLACK, str);
export const redBackground = (str) => color(BACKGROUND_RED, str);
export const greenBackground = (str) => color(BACKGROUND_GREEN, str);
export const yellowBackground = (str) => color(BACKGROUND_YELLOW, str);
export const blueBackground = (str) => color(BACKGROUND_BLUE, str);
export const magentaBackground = (str) => color(BACKGROUND_MAGENTA, str);
export const cyanBackground = (str) => color(BACKGROUND_CYAN, str);
export const whiteBackground = (str) => color(BACKGROUND_WHITE, str);

// export const colorMatch = (c, str, patternToColor) => {
//     let re = new RegExp(patternToColor, "g");
//     // https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Global_Objects/String/replace
//     return str.replace(re, color(c, "$&"))
// };

// function gradient(value, blueThresh, greenThresh, yellowThresh, redThresh) {
//     if (value >= redThresh) {
//         return RED;
//     }
//     if (value >= yellowThresh) {
//         return YELLOW;
//     }
//     if (value >= greenThresh) {
//         return GREEN;
//     }
//     if (value >= blueThresh) {
//         return BLUE;
//     }
//     return SANE;
// }
// export const colorWithGradient = (value, blueThresh, greenThresh, yellowThresh, redThresh) =>
//     color(gradient(value, blueThresh, greenThresh, yellowThresh, redThresh), value);
