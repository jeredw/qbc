const chart = `
                Regular ASCII Chart (character codes 0 - 127)
  000 \x00 (nul)   016 ► (dle)   032 \x20    048 0   064 @   080 P   096 \`  112 p
  001 ☺    (soh)   017 ◄ (dc1)   033 !       049 1   065 A   081 Q   097 a   113 q
  002 ☻    (stx)   018 ↕ (dc2)   034 "       050 2   066 B   082 R   098 b   114 r
  003 ♥    (etx)   019 ‼ (dc3)   035 #       051 3   067 C   083 S   099 c   115 s
  004 ♦    (eot)   020 ¶ (dc4)   036 $       052 4   068 D   084 T   100 d   116 t
  005 ♣    (enq)   021 § (nak)   037 %       053 5   069 E   085 U   101 e   117 u
  006 ♠    (ack)   022 ▬ (syn)   038 &       054 6   070 F   086 V   102 f   118 v
  007 •    (bel)   023 ↨ (etb)   039 '       055 7   071 G   087 W   103 g   119 w
  008 ◘    (bs)    024 ↑ (can)   040 (       056 8   072 H   088 X   104 h   120 x
  009 ○    (tab)   025 ↓ (em)    041 )       057 9   073 I   089 Y   105 i   121 y
  010 ◙    (lf)    026 → (eof)   042 *       058 :   074 J   090 Z   106 j   122 z
  011 ♂    (vt)    027 ← (esc)   043 +       059 ;   075 K   091 [   107 k   123 {
  012 ♀    (np)    028 ∟ (fs)    044 ,       060 <   076 L   092 \\  108 l   124 |
  013 ♪    (cr)    029 ↔ (gs)    045 -       061 =   077 M   093 ]   109 m   125 }
  014 ♫    (so)    030 ▲ (rs)    046 .       062 >   078 N   094 ^   110 n   126 ~
  015 ☼    (si)    031 ▼ (us)    047 /       063 ?   079 O   095 _   111 o   127 ⌂

               Extended ASCII Chart (character codes xxx - 255)
    128 Ç   143 Å   158 ₧   172 ¼   186 ║   200 ╚   214 ╓   228 Σ   242 ≥
    129 ü   144 É   159 ƒ   173 ¡   187 ╗   201 ╔   215 ╫   229 σ   243 ≤
    130 é   145 æ   160 á   174 «   188 ╝   202 ╩   216 ╪   230 µ   244 ⌠
    131 â   146 Æ   161 í   175 »   189 ╜   203 ╦   217 ┘   231 τ   245 ⌡
    132 ä   147 ô   162 ó   176 ░   190 ╛   204 ╠   218 ┌   232 Φ   246 ÷
    133 à   148 ö   163 ú   177 ▒   191 ┐   205 ═   219 █   233 Θ   247 ≈
    134 å   149 ò   164 ñ   178 ▓   192 └   206 ╬   220 ▄   234 Ω   248 °
    135 ç   150 û   165 Ñ   179 │   193 ┴   207 ╧   221 ▌   235 δ   249 ∙
    136 ê   151 ù   166 ª   180 ┤   194 ┬   208 ╨   222 ▐   236 ∞   250 ·
    137 ë   152 ÿ   167 º   181 ╡   195 ├   209 ╤   223 ▀   237 φ   251 √
    138 è   153 Ö   168 ¿   182 ╢   196 ─   210 ╥   224 α   238 ε   252 ⁿ
    139 ï   154 Ü   169 ⌐   183 ╖   197 ┼   211 ╙   225 ß   239 ∩   253 ²
    140 î   155 ¢   170 ¬   184 ╕   198 ╞   212 ╘   226 Γ   240 ≡   254 ■
    141 ì   156 £   171 ½   185 ╣   199 ╟   213 ╒   227 π   241 ±   255 \xa0
    142 Ä   157 ¥`;
export const [asciiToChar, charToAscii] = (() => {
  const asciiToChar: Map<number, string> = new Map();
  const charToAscii: Map<string, number> = new Map();
  for (const line of chart.split('\n')) {
    const entries = line.match(/(\d\d\d) (.)/g) ?? [];
    for (const entry of entries) {
      const code = parseInt(entry, 10);
      let char = entry.at(-1);
      if (!char) {
        throw new Error("error defining ascii chart");
      }
      asciiToChar.set(code, char);
      charToAscii.set(char, code);
    }
  }
  charToAscii.set('\r', 13);
  charToAscii.set('\n', 10);
  charToAscii.set('\t', 9);
  charToAscii.set('\x1a', 26);
  return [asciiToChar, charToAscii];
})();

export const BS = '◘';
export const TAB = '○';
export const CR = '♪';
export const LF = '◙';
export const EOF = '→';
export const NUL = '\x00';

export function asciiToString(codes: number[]): string {
  return codes.map((code) => {
    const char = asciiToChar.get(code);
    if (char === undefined) {
      throw new Error("unknown character code in string");
    }
    return char;
  }).join('');
}

export function stringToAscii(str: string): number[] {
  return str.split('').map(lookupCharacter);
}

// Compares strings s and t using ASCII and returns
// negative if s < t
// zero     if s = t
// positive if s > t
export function compareAscii(s: string, t: string): number {
  if (s == t) return 0;
  const length = Math.min(s.length, t.length);
  for (let i = 0; i < length; i++) {
    const sc = lookupCharacter(s[i]);
    const tc = lookupCharacter(t[i]);
    const diff = sc - tc;
    if (diff !== 0) {
      return diff;
    }
  }
  if (s.length > t.length) {
    return 1;
  }
  return -1;
}

export function trim(s: string) {
  // Trim whitespace characters including the code points we use for cr, nl, tab.
  return s.replace(/^[ \r\n\t♪◙○]+/, '').replace(/[ \r\n\t♪◙○]+$/, '');
}

export function showControlChar(ch: string) {
  switch (ch) {
    case '•': return '♫';  // bell
    case '◘': return '■';  // backspace
    case '○': return '→';  // tab
    case '◙': return '<';  // line feed
    case '♂': return '⌂';  // vertical tab
    case '♀': return '▬';  // form feed
    case '♪': return '←';  // newline
    case '∟': return '►';  // file separator
    case '↔': return '◄';  // group separator
    case '▲': return '↑';  // record separator
    case '▼': return '↓';  // unit separator
    default: return ch;
  }
}

function lookupCharacter(c: string): number {
  const code = charToAscii.get(c);
  if (code === undefined) {
    throw new Error("unknown character code in string");
  }
  return code;
}