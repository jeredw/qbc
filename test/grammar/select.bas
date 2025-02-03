select case i
case else
  print "huh"
case is >= 5
case 2, 3, 4
case 2 to 4, 5 to 7
end select
select case i
end select
select case i: end select
select case i: case 4: print "hi": end select

select case i: rem hooray
: : rem yep
case 4: print "hi": case 5: print "bye"
end select

select case i
case else
  if foo then
  end if
end select

'select case i
'case else
'  if foo then
'  case 42
'  end if
'end select
select case i
case 20
  select case j
    case 42
    case else
  end select
case else
  select case k
  end select
end select
select case foo
  case is = 4
    print "ok"
bar: case 2 to 3
    print "great"
10 case else
  print "wow"
end select
