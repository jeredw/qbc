' Test bloading an array of records.
screen 13
type hue
  red as integer
  green as integer
  blue as integer
end type
dim colors(255) as hue
def seg = varseg(colors(0))
bload "test.pal", varptr(colors(0))
def seg

for i = 0 to 255
  value& = colors(i).green
  value& = 256 * value& + colors(i).blue
  value& = 256 * value& + colors(i).red
  palette i, value&
  line (i, 0)-(i, 199), i
next i