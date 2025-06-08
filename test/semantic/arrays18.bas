' Arrays in static procedures are static by default.
sub foo static
  dim a$(10)
  redim a$(20)  ' Fails with "Array already dimensioned"
end sub

foo