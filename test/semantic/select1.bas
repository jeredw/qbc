foo$ = "hello"
select case foo$
case "apples" to "guava":
  print "nope"
case is >= "potato", is = "watermelon":
  print "nope"
case "zuchini"
  print "nope"
case else
  print "ok"
end select