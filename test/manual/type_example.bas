TYPE Card
    Suit AS STRING * 9
    Value AS INTEGER
END TYPE
DIM Deck(1 TO 52) AS Card
Deck(1).Suit = "Club"
Deck(1).Value = 2
PRINT Deck(1).Suit, Deck(1).Value
