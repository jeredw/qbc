' Bug: Test that strings are compared by ascii value.
select case "e"
case chr$(29) to chr$(255)
  print "ok"
case else
  print "nope"
end select