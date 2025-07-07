' Test bsaving an array of records.
screen 13
type hue
  red as integer
  green as integer
  blue as integer
end type
dim colors(255) as hue
for i = 0 to 255
  colors(i).red = i mod 64
  colors(i).green = (255 - i) mod 64
  colors(i).blue = i \ 4
next i

def seg = varseg(colors(0))
bsave "test.pal", varptr(colors(0)), 1536
def seg

for i = 0 to 255
  value& = colors(i).green
  value& = 256 * value& + colors(i).blue
  value& = 256 * value& + colors(i).red
  palette i, value&
  line (i, 0)-(i, 199), i
next i