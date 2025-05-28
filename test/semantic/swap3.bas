type card
  suit as string * 9
  value as integer
end type

dim hand(2) as card
hand(1).value = 2
hand(1).suit = "clubs"
hand(2).value = 4
hand(2).suit = "diamonds"
print hand(1).value; hand(1).suit;
print hand(2).value; hand(2).suit
swap hand(1), hand(2)
print "<->"
print hand(1).value; hand(1).suit;
print hand(2).value; hand(2).suit