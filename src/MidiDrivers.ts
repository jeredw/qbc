// Popular MIDI libraries look for these prefixes of SBMIDI.EXE and
// SBSIM.COM drivers in memory.
export const SBMIDI_SEGMENT = 0xff00;
export const SBSIM_SEGMENT = 0xff01;

export const SBSIM_BYTES: number[] = Array.from(
  atob('Lo8GhgEujwaEAS6PBoIBLoMOggEBLoM+bgEAdAa4AQDpwQCA/wV3GQr/dBtRUDPAis+A4X/509AuIwZ+AVhZdQa4AgDpnQD6LoweigEOH4wWjAGJJo4BjhaYAYsmmgFVi+xWVwZTo5ABiRaUAYkOkgG0Ys0hiR6WAbRQjMvNIccGbgEBAPv8MsD/HnYBi174U4b7A9sD2zL//g58AXULgQaYAQAAxgZ8ARSL81sy/x4H/5ywAXIFgyaCAf76xwZuAQAAULRQix6WAc0hWFsHX16L5V2LDpIBjhaMAYsmjgGOHooBLv82ggEu/zaEAS7/NoYBz1WL7IPsColG+Ile+g==')
).map((x) => x.charCodeAt(0));

export const SBMIDI_BYTES: number[] = Array.from(
  atob('nB4GUFNRUldWVYvsULgOEI7YjsBYg04YAcdGDP//gD5EAQB1O8YGRAEB+/wL23gVgfsNAHMlg2YY/tHj/5coAIlGDOsW99tLgfsDAHMNg2YY/tHj/5ciAIlGDMYGRAEAXV5fWllbWAcfnc+c+h4GULgOEI7YjsChkQEBBhwAcgawIOYg6wn/BhwAnP8eEgBTUVJXVlWL7PqAPkMBAHU2jBYgAIkmHgCM2I7QvEIBxgZDAQH7/IM+hQEAdAqAPhUDAHUD6I8E+osmHgCOFiAAxgZDAQD7XV5fWllbWAcfnc8eBlBTUVJXVlWcuA4QjtiOwORgCsB4EjxTdQ60As0WJA==')
).map((x) => x.charCodeAt(0));