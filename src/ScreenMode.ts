type Dimension = [number, number];

export interface ScreenGeometry {
  dots: Dimension;
  text: Dimension;
  characterBox: Dimension;
  font: string;
}

export interface ScreenMode {
  mode: number;
  geometry: ScreenGeometry[];
  colors: number;
  attributes: number;
  defaultFgColor: number;
  pages: number;
  bppPerPlane: number;
  planes: number;
}

export const SCREEN_MODES: ScreenMode[] = [
  {
    mode: 0,
    geometry: [
      {dots: [720, 400], text: [80, 25], characterBox: [9, 16], font: 'Web IBM VGA 9x16'},
      {dots: [720, 350], text: [80, 43], characterBox: [9, 8], font: 'Web IBM VGA 9x8'},
      {dots: [720, 400], text: [80, 50], characterBox: [9, 8], font: 'Web IBM VGA 9x8'},
      {dots: [360, 400], text: [40, 25], characterBox: [9, 16], font: 'Web IBM VGA 9x16'},
      {dots: [360, 350], text: [40, 43], characterBox: [9, 8], font: 'Web IBM VGA 9x8'},
      {dots: [360, 400], text: [40, 50], characterBox: [9, 8], font: 'Web IBM VGA 9x8'},
    ],
    colors: 64,
    attributes: 16,
    defaultFgColor: 7,
    pages: 8,
    bppPerPlane: 0,
    planes: 0,
  },
  {
    mode: 1,
    geometry: [
      {dots: [320, 200], text: [40, 25], characterBox: [8, 8], font: 'Web IBM EGA 8x8'},
    ],
    colors: 16,
    attributes: 4,
    defaultFgColor: 3,
    pages: 1,
    bppPerPlane: 2,
    planes: 1,
  },
  {
    mode: 2,
    geometry: [
      {dots: [640, 200], text: [80, 25], characterBox: [8, 8], font: 'Web IBM EGA 8x8'},
    ],
    colors: 16,
    attributes: 2,
    defaultFgColor: 1,
    pages: 1,
    bppPerPlane: 1,
    planes: 1,
  },
  {
    mode: 7,
    geometry: [
      {dots: [320, 200], text: [40, 25], characterBox: [8, 8], font: 'Web IBM EGA 8x8'},
    ],
    colors: 16,
    attributes: 16,
    defaultFgColor: 15,
    pages: 8,
    bppPerPlane: 1,
    planes: 4,
  },
  {
    mode: 8,
    geometry: [
      {dots: [640, 200], text: [80, 25], characterBox: [8, 8], font: 'Web IBM EGA 8x8'},
    ],
    colors: 16,
    attributes: 16,
    defaultFgColor: 15,
    pages: 4,
    bppPerPlane: 1,
    planes: 4,
  },
  {
    mode: 9,
    geometry: [
      {dots: [640, 350], text: [80, 25], characterBox: [8, 14], font: 'Web IBM VGA 8x14'},
      {dots: [640, 350], text: [80, 43], characterBox: [8, 8], font: 'Web IBM EGA 8x8'},
    ],
    colors: 64,
    attributes: 16,
    defaultFgColor: 15,
    pages: 2,
    bppPerPlane: 1,
    planes: 4,
  },
  {
    mode: 10,
    geometry: [
      {dots: [640, 350], text: [80, 25], characterBox: [8, 14], font: 'Web IBM VGA 8x14'},
      {dots: [640, 350], text: [80, 43], characterBox: [8, 8], font: 'Web IBM EGA 8x8'},
    ],
    colors: 9,
    attributes: 4,
    defaultFgColor: 3,
    pages: 2,
    bppPerPlane: 1,
    planes: 2,
  },
  {
    mode: 11,
    geometry: [
      {dots: [640, 480], text: [80, 30], characterBox: [8, 16], font: 'Web IBM VGA 8x16'},
      {dots: [640, 480], text: [80, 60], characterBox: [8, 8], font: 'Web IBM EGA 8x8'},
    ],
    colors: 262144,
    attributes: 2,
    defaultFgColor: 1,
    pages: 1,
    bppPerPlane: 1,
    planes: 1,
  },
  {
    mode: 12,
    geometry: [
      {dots: [640, 480], text: [80, 30], characterBox: [8, 16], font: 'Web IBM VGA 8x16'},
      {dots: [640, 480], text: [80, 60], characterBox: [8, 8], font: 'Web IBM EGA 8x8'},
    ],
    colors: 262144,
    attributes: 16,
    defaultFgColor: 15,
    pages: 1,
    bppPerPlane: 1,
    planes: 4,
  },
  {
    mode: 13,
    geometry: [
      {dots: [320, 200], text: [40, 25], characterBox: [8, 8], font: 'Web IBM EGA 8x8'},
    ],
    colors: 262144,
    attributes: 256,
    defaultFgColor: 15,
    pages: 1,
    bppPerPlane: 8,
    planes: 1,
  },
];