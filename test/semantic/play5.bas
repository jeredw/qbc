on play(5) gosub music
play on
play "mb cdefg cdefg"
for i = 1 to 11
  print i, play(0)
  play step  ' finish a note
next i
end

music:
  print "playing more music", play(0)
  play "cdefg"
  print "now pending", play(0)
  return