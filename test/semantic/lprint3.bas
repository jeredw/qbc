boldon$ = chr$(27) + "E"
boldoff$ = chr$(27) + "F"
italon$ = chr$(27) + "4"
italoff$ = chr$(27) + "5"
lprint boldon$ + italon$ + "hello" +_
       italoff$ + " world" + boldoff$ +_
       " how are you?" +_
       italon$ + " ciao" + italoff$